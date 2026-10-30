"""Os chats do organizador: cadastro, conversa e execução.

Um chat do organizador é uma sessão do Claude Code rodada sem janela
(`claude -p --output-format stream-json`). Cada mensagem enviada é um turno:
o primeiro abre a sessão com `--session-id`, os seguintes a continuam com
`--resume`. Vários chats podem rodar ao mesmo tempo — é isso que faz do
organizador um orquestrador.

Onde fica cada coisa:
- `dados/chats.parquet`: uma linha por chat (título, grupo, pasta, modelo...);
- `dados/mensagens/<chat_id>.parquet`: a conversa, uma linha por mensagem.

A conversa completa (com o resultado de cada ferramenta) continua na
transcrição do próprio Claude Code; aqui fica o que interessa ler.
"""
import json
import subprocess
import threading
import time
import uuid
from pathlib import Path

from . import armazem, claude_cli, desktop, mensagens
from .caminhos import ARQUIVO_CHATS, PASTA_MENSAGENS

COLUNAS_CHAT = [
    "id", "titulo", "grupo_id", "pasta", "modelo", "esforco", "modo_permissao",
    "sessao_cli", "turnos", "origem", "sessao_desktop_origem",
    "prompt_rotina", "rotina_sessao_nova", "status", "ultimo_erro", "custo_usd",
    "criado_em", "atualizado_em",
]
COLUNAS_MENSAGEM = ["seq", "papel", "texto", "criado_em"]

MODOS_PERMISSAO = ["auto", "acceptEdits", "plan", "dontAsk", "bypassPermissions"]
INTERVALO_GRAVACAO = 2.0  # segundos entre gravações da conversa durante um turno

_chats: dict[str, dict] | None = None
_conversas: dict[str, list[dict]] = {}
_processos: dict[str, subprocess.Popen] = {}
_interrompidos: set[str] = set()


# --- cadastro -------------------------------------------------------------

def _carregar() -> dict[str, dict]:
    global _chats
    if _chats is None:
        _chats = {}
        for chat in armazem.ler_registros(ARQUIVO_CHATS):
            # Um chat que estava "executando" quando o servidor caiu não está mais.
            if chat.get("status") == "executando":
                chat["status"] = "interrompido"
            _chats[chat["id"]] = chat
    return _chats


def _gravar_cadastro() -> None:
    armazem.gravar_registros(ARQUIVO_CHATS, list(_carregar().values()), COLUNAS_CHAT)


def listar() -> list[dict]:
    with armazem.TRAVA:
        lista = [dict(c) for c in _carregar().values()]
    return sorted(lista, key=lambda c: c["atualizado_em"] or "", reverse=True)


def obter(chat_id: str) -> dict | None:
    with armazem.TRAVA:
        chat = _carregar().get(chat_id)
        return dict(chat) if chat else None


def _validar_pasta(pasta: str | None) -> str:
    if not pasta or not Path(pasta).is_dir():
        raise ValueError(f"A pasta de trabalho não existe: {pasta!r}")
    return str(Path(pasta))


def criar(dados: dict) -> dict:
    modo = dados.get("modo_permissao") or "auto"
    if modo not in MODOS_PERMISSAO:
        raise ValueError(f"Modo de permissão desconhecido: {modo}")
    chat = {coluna: None for coluna in COLUNAS_CHAT}
    chat.update({
        "id": str(uuid.uuid4()),
        "titulo": (dados.get("titulo") or "").strip() or "Chat sem título",
        "grupo_id": dados.get("grupo_id") or None,
        "pasta": _validar_pasta(dados.get("pasta")),
        "modelo": dados.get("modelo") or None,
        "esforco": dados.get("esforco") or None,
        "modo_permissao": modo,
        "turnos": 0,
        "origem": dados.get("origem") or "organizador",
        "sessao_desktop_origem": dados.get("sessao_desktop_origem"),
        "prompt_rotina": (dados.get("prompt_rotina") or "").strip() or None,
        "rotina_sessao_nova": bool(dados.get("rotina_sessao_nova")),
        "status": "ocioso",
        "custo_usd": 0.0,
        "criado_em": armazem.agora(),
        "atualizado_em": armazem.agora(),
    })
    with armazem.TRAVA:
        _carregar()[chat["id"]] = chat
        _gravar_cadastro()
    return dict(chat)


EDITAVEIS = {"titulo", "grupo_id", "pasta", "modelo", "esforco", "modo_permissao", "prompt_rotina", "rotina_sessao_nova"}


def editar(chat_id: str, dados: dict) -> dict:
    with armazem.TRAVA:
        chat = _carregar().get(chat_id)
        if not chat:
            raise KeyError(chat_id)
        for campo, valor in dados.items():
            if campo not in EDITAVEIS:
                continue
            if campo == "pasta":
                valor = _validar_pasta(valor)
            if campo == "modo_permissao" and valor not in MODOS_PERMISSAO:
                raise ValueError(f"Modo de permissão desconhecido: {valor}")
            if campo == "rotina_sessao_nova":
                valor = bool(valor)
            elif isinstance(valor, str):
                valor = valor.strip() or None
            chat[campo] = valor
        chat["atualizado_em"] = armazem.agora()
        _gravar_cadastro()
        return dict(chat)


def excluir(chat_id: str) -> None:
    """Tira o chat do organizador. A transcrição do Claude Code fica onde está."""
    parar(chat_id)
    with armazem.TRAVA:
        _carregar().pop(chat_id, None)
        _conversas.pop(chat_id, None)
        _gravar_cadastro()
        (PASTA_MENSAGENS / f"{chat_id}.parquet").unlink(missing_ok=True)


def _atualizar(chat_id: str, **campos) -> None:
    with armazem.TRAVA:
        chat = _carregar().get(chat_id)
        if not chat:
            return
        chat.update(campos)
        chat["atualizado_em"] = armazem.agora()
        _gravar_cadastro()


# --- conversa -------------------------------------------------------------

def _conversa(chat_id: str) -> list[dict]:
    if chat_id not in _conversas:
        _conversas[chat_id] = armazem.ler_registros(PASTA_MENSAGENS / f"{chat_id}.parquet")
    return _conversas[chat_id]


def _gravar_conversa(chat_id: str) -> None:
    with armazem.TRAVA:
        armazem.gravar_registros(PASTA_MENSAGENS / f"{chat_id}.parquet", list(_conversa(chat_id)), COLUNAS_MENSAGEM)


def _anotar(chat_id: str, papel: str, texto: str) -> None:
    with armazem.TRAVA:
        conversa = _conversa(chat_id)
        conversa.append({"seq": len(conversa), "papel": papel, "texto": texto, "criado_em": armazem.agora()})


def mensagens_desde(chat_id: str, desde: int = 0) -> list[dict]:
    with armazem.TRAVA:
        return [dict(m) for m in _conversa(chat_id)[desde:]]


# --- execução -------------------------------------------------------------

def executando(chat_id: str) -> bool:
    processo = _processos.get(chat_id)
    return processo is not None and processo.poll() is None


def enviar(chat_id: str, texto: str, sessao_nova: bool = False) -> None:
    """Manda uma mensagem e roda o turno em segundo plano."""
    texto = (texto or "").strip()
    if not texto:
        raise ValueError("Mensagem vazia")
    chat = obter(chat_id)
    if not chat:
        raise KeyError(chat_id)
    if executando(chat_id):
        raise RuntimeError("Este chat já está executando; espere terminar ou pare.")
    executavel = claude_cli.localizar()
    if not executavel:
        raise RuntimeError("claude.exe não encontrado")

    argumentos = [executavel, "-p", "--output-format", "stream-json", "--verbose",
                  "--permission-mode", chat["modo_permissao"] or "auto",
                  "--permission-prompts", "none", "--name", chat["titulo"]]
    if chat["modelo"]:
        argumentos += ["--model", chat["modelo"]]
    if chat["esforco"]:
        argumentos += ["--effort", chat["esforco"]]

    continuar = chat["sessao_cli"] and chat["turnos"] and not sessao_nova
    if continuar:
        argumentos += ["--resume", chat["sessao_cli"]]
    elif chat["sessao_desktop_origem"] and not chat["turnos"]:
        # Chat bifurcado de um chat do Desktop: começa com a conversa dele, em sessão própria.
        origem = desktop.sessao(chat["sessao_desktop_origem"])
        if not origem or not origem["sessao_cli"]:
            raise RuntimeError("O chat do Desktop de origem não foi encontrado.")
        argumentos += ["--resume", origem["sessao_cli"], "--fork-session"]
    else:
        nova = str(uuid.uuid4())
        argumentos += ["--session-id", nova]
        _atualizar(chat_id, sessao_cli=nova, turnos=0)
        if sessao_nova and chat["turnos"]:
            _anotar(chat_id, "sistema", "Nova sessão: o Claude começa sem a conversa anterior.")

    _anotar(chat_id, "usuario", texto)
    _gravar_conversa(chat_id)
    processo = subprocess.Popen(
        argumentos, cwd=chat["pasta"], env=claude_cli.ambiente(),
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=claude_cli.SEM_JANELA,
    )
    _processos[chat_id] = processo
    _atualizar(chat_id, status="executando", ultimo_erro=None)
    threading.Thread(target=_acompanhar, args=(chat_id, processo, texto), daemon=True).start()


def rodar_rotina(chat_id: str) -> None:
    chat = obter(chat_id)
    if not chat or not chat["prompt_rotina"]:
        raise ValueError("Este chat não tem rotina cadastrada.")
    enviar(chat_id, chat["prompt_rotina"], sessao_nova=bool(chat["rotina_sessao_nova"]))


def parar(chat_id: str) -> bool:
    processo = _processos.get(chat_id)
    if processo is None or processo.poll() is not None:
        return False
    _interrompidos.add(chat_id)
    processo.terminate()
    _anotar(chat_id, "sistema", "Execução interrompida pelo organizador.")
    return True


def _acompanhar(chat_id: str, processo: subprocess.Popen, texto: str) -> None:
    """Lê a saída do turno, linha a linha, e transforma em mensagens."""
    erros: list[str] = []
    threading.Thread(target=lambda: erros.extend(
        processo.stderr.read().decode("utf-8", errors="replace").splitlines()[-20:]), daemon=True).start()
    try:
        processo.stdin.write(texto.encode("utf-8"))
        processo.stdin.close()
    except OSError:
        pass

    resultado = None
    ultima_gravacao = time.monotonic()
    for linha in processo.stdout:
        try:
            evento = json.loads(linha.decode("utf-8", errors="replace"))
        except ValueError:
            continue
        if evento.get("type") == "system" and evento.get("subtype") == "init" and evento.get("session_id"):
            _atualizar(chat_id, sessao_cli=evento["session_id"])
        elif evento.get("type") == "result":
            resultado = evento
        for papel, conteudo in mensagens.de_evento(evento):
            _anotar(chat_id, papel, conteudo)
        if time.monotonic() - ultima_gravacao > INTERVALO_GRAVACAO:
            _gravar_conversa(chat_id)
            ultima_gravacao = time.monotonic()
    codigo = processo.wait()

    chat = obter(chat_id) or {}
    custo = (chat.get("custo_usd") or 0.0) + float((resultado or {}).get("total_cost_usd") or 0.0)
    # A sessão só existe para ser continuada se o Claude chegou a gravar a transcrição dela.
    sessao_existe = desktop.arquivo_transcricao(chat.get("sessao_cli")) is not None
    turnos = (chat.get("turnos") or 0) + (1 if sessao_existe else 0)
    if chat_id in _interrompidos:
        _interrompidos.discard(chat_id)
        _atualizar(chat_id, status="interrompido", turnos=turnos, custo_usd=custo)
    elif resultado and not resultado.get("is_error"):
        _atualizar(chat_id, status="ocioso", turnos=turnos, custo_usd=custo)
    else:
        if resultado and resultado.get("result"):
            motivo = str(resultado["result"])
        elif erros:
            motivo = "\n".join(erros)
        else:
            motivo = f"O Claude encerrou com código {codigo}."
        if "Not logged in" in motivo:
            motivo = "O Claude Code deste computador não está logado. Use “Entrar no Claude” no topo da tela."
        _anotar(chat_id, "erro", motivo)
        _atualizar(chat_id, status="erro", ultimo_erro=motivo[:500], custo_usd=custo, turnos=turnos)
    _gravar_conversa(chat_id)
    _processos.pop(chat_id, None)
