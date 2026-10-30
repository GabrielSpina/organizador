"""Servidor local do organizador: entrega as telas de `web/` e a API dos chats.

Só atende em 127.0.0.1. Toda chamada que muda alguma coisa exige o cabeçalho
`X-Organizador`, que um site de fora não consegue mandar sem permissão
(CORS) — e este servidor não dá essa permissão a ninguém. Sem isso, qualquer
página aberta no navegador poderia mandar o Claude executar algo aqui.

Rodar:  python servidor.py   (ou o "Iniciar Organizador.bat")
"""
import json
import mimetypes
import re
import socket
import sys
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from organizador import chats, claude_cli, desktop, estado, grupos, medidas, pesos, semanas, shape_inteligencia
from organizador.caminhos import ARQUIVO_CHATS, PASTA_WEB, PORTA, RAIZ

CABECALHO_OBRIGATORIO = "X-Organizador"
HOSTS_ACEITOS = {f"127.0.0.1:{PORTA}", f"localhost:{PORTA}"}
_ROTAS: list[tuple[str, re.Pattern, callable]] = []


def rota(metodo: str, padrao: str):
    def registrar(funcao):
        _ROTAS.append((metodo, re.compile("^" + padrao + "$"), funcao))
        return funcao
    return registrar


class ErroDoUsuario(Exception):
    """Erro que a tela mostra como veio (pasta inexistente, chat ocupado...)."""


# --- estado das telas -------------------------------------------------------

@rota("GET", "/api/estado")
def obter_estado(_req, _corpo):
    return estado.tudo()


@rota("PUT", "/api/estado/(?P<chave>[^/]+)")
def definir_estado(_req, corpo, chave):
    estado.definir(unquote(chave), corpo.get("valor"))
    return {"ok": True}


@rota("POST", "/api/importar")
def importar_estado(_req, corpo):
    gravadas = estado.importar(corpo.get("valores") or {}, bool(corpo.get("sobrescrever")))
    return {"gravadas": gravadas}


# --- Shape: pesos -----------------------------------------------------------

@rota("GET", "/api/pesos")
def listar_pesos(_req, _corpo):
    return pesos.listar()


@rota("PUT", "/api/pesos/(?P<dia>\\d{4}-\\d{2}-\\d{2})")
def definir_peso(_req, corpo, dia):
    return pesos.definir(dia, corpo.get("peso_kg"))


@rota("DELETE", "/api/pesos/(?P<dia>\\d{4}-\\d{2}-\\d{2})")
def excluir_peso(_req, _corpo, dia):
    pesos.excluir(dia)
    return {"ok": True}


# --- Shape: registro semanal (sexta) — só leitura; quem grava é o registrar_semana.py ---

@rota("GET", "/api/semanas")
def listar_semanas(_req, _corpo):
    lista = semanas.listar()
    return {"semanas": lista, "analise": shape_inteligencia.analisar(lista, pesos.listar(), medidas.listar())}


@rota("GET", "/api/medidas")
def listar_medidas(_req, _corpo):
    """A circunferência da cintura por dia."""
    return medidas.listar()


@rota("PUT", "/api/medidas/(?P<dia>\\d{4}-\\d{2}-\\d{2})")
def definir_medidas(_req, corpo, dia):
    """Grava as medidas de um dia pela tela (o registrar_medidas.py continua valendo pelo chat).
    Campo em branco preserva o que já estava gravado naquele dia; o método repete o da medida anterior."""
    return medidas.definir(dia, {campo: corpo.get(campo) for campo in medidas.CAMPOS})


# --- Claude Code ------------------------------------------------------------

@rota("GET", "/api/claude/status")
def status_claude(_req, _corpo):
    return claude_cli.status()


@rota("POST", "/api/claude/login")
def login_claude(_req, _corpo):
    claude_cli.abrir_login()
    return {"ok": True}


# --- grupos -----------------------------------------------------------------

@rota("GET", "/api/grupos")
def listar_grupos(_req, _corpo):
    return grupos.listar(chats.listar())


@rota("POST", "/api/grupos")
def criar_grupo(_req, corpo):
    return grupos.criar(corpo.get("nome"), corpo.get("cor"), corpo.get("pasta_padrao"))


@rota("PATCH", "/api/grupos/(?P<grupo_id>[^/]+)")
def editar_grupo(_req, corpo, grupo_id):
    grupos.editar(grupo_id, corpo)
    return {"ok": True}


@rota("DELETE", "/api/grupos/(?P<grupo_id>[^/]+)")
def excluir_grupo(_req, _corpo, grupo_id):
    grupos.excluir(grupo_id)
    for chat in chats.listar():
        if chat["grupo_id"] == grupo_id:
            chats.editar(chat["id"], {"grupo_id": None})
    return {"ok": True}


# --- chats do organizador ---------------------------------------------------

def _com_execucao(chat: dict) -> dict:
    return {**chat, "executando": chats.executando(chat["id"])}


@rota("GET", "/api/chats")
def listar_chats(_req, _corpo):
    return {
        "organizador": [_com_execucao(c) for c in chats.listar()],
        "desktop": desktop.sessoes(),
        "modos_permissao": chats.MODOS_PERMISSAO,
    }


@rota("POST", "/api/chats")
def criar_chat(_req, corpo):
    chat = chats.criar(corpo)
    if (corpo.get("mensagem") or "").strip():
        chats.enviar(chat["id"], corpo["mensagem"])
    return _com_execucao(chats.obter(chat["id"]))


@rota("GET", "/api/chats/(?P<chat_id>[0-9a-f-]{36})")
def obter_chat(_req, _corpo, chat_id):
    chat = chats.obter(chat_id)
    if not chat:
        raise KeyError(chat_id)
    return _com_execucao(chat)


@rota("PATCH", "/api/chats/(?P<chat_id>[0-9a-f-]{36})")
def editar_chat(_req, corpo, chat_id):
    return _com_execucao(chats.editar(chat_id, corpo))


@rota("DELETE", "/api/chats/(?P<chat_id>[0-9a-f-]{36})")
def excluir_chat(_req, _corpo, chat_id):
    chats.excluir(chat_id)
    return {"ok": True}


@rota("GET", "/api/chats/(?P<chat_id>[0-9a-f-]{36})/mensagens")
def mensagens_chat(req, _corpo, chat_id):
    desde = int(parse_qs(urlparse(req.path).query).get("desde", ["0"])[0])
    chat = chats.obter(chat_id)
    if not chat:
        raise KeyError(chat_id)
    return {"chat": _com_execucao(chat), "mensagens": chats.mensagens_desde(chat_id, desde)}


@rota("POST", "/api/chats/(?P<chat_id>[0-9a-f-]{36})/mensagens")
def enviar_mensagem(_req, corpo, chat_id):
    chats.enviar(chat_id, corpo.get("texto"))
    return {"ok": True}


@rota("POST", "/api/chats/(?P<chat_id>[0-9a-f-]{36})/rotina")
def rodar_rotina(_req, _corpo, chat_id):
    chats.rodar_rotina(chat_id)
    return {"ok": True}


@rota("POST", "/api/chats/(?P<chat_id>[0-9a-f-]{36})/parar")
def parar_chat(_req, _corpo, chat_id):
    return {"parado": chats.parar(chat_id)}


@rota("POST", "/api/chats/(?P<chat_id>[0-9a-f-]{36})/abrir")
def abrir_chat(_req, corpo, chat_id):
    chat = chats.obter(chat_id)
    if not chat or not chat["sessao_cli"] or not chat["turnos"]:
        raise ErroDoUsuario("Este chat ainda não tem conversa para abrir — mande a primeira mensagem.")
    if corpo.get("onde") == "terminal":
        claude_cli.abrir_no_terminal(chat["sessao_cli"], chat["pasta"])
    else:
        claude_cli.abrir_no_desktop(chat["sessao_cli"], chat["pasta"])
    return {"ok": True}


# --- chats do Claude Desktop (só leitura) -----------------------------------

@rota("GET", "/api/desktop/(?P<sessao_id>local_[0-9a-f-]+)/mensagens")
def mensagens_desktop(_req, _corpo, sessao_id):
    sessao = desktop.sessao(sessao_id)
    if not sessao:
        raise KeyError(sessao_id)
    return {"chat": sessao, "mensagens": desktop.transcricao(sessao["sessao_cli"])}


@rota("POST", "/api/desktop/(?P<sessao_id>local_[0-9a-f-]+)/abrir")
def abrir_desktop(_req, _corpo, sessao_id):
    sessao = desktop.sessao(sessao_id)
    if not sessao:
        raise KeyError(sessao_id)
    claude_cli.abrir_link(sessao["link"])
    return {"ok": True}


@rota("POST", "/api/desktop/(?P<sessao_id>local_[0-9a-f-]+)/bifurcar")
def bifurcar_desktop(_req, corpo, sessao_id):
    """Um chat novo do organizador que começa com a conversa de um chat do Desktop."""
    sessao = desktop.sessao(sessao_id)
    if not sessao:
        raise KeyError(sessao_id)
    chat = chats.criar({
        "titulo": corpo.get("titulo") or f"{sessao['titulo']} (cópia)",
        "grupo_id": corpo.get("grupo_id", sessao["grupo_id"]),
        "pasta": sessao["pasta"], "modelo": corpo.get("modelo"),
        "modo_permissao": corpo.get("modo_permissao") or "auto",
        "origem": "bifurcado", "sessao_desktop_origem": sessao_id,
    })
    if (corpo.get("mensagem") or "").strip():
        chats.enviar(chat["id"], corpo["mensagem"])
    return _com_execucao(chats.obter(chat["id"]))


# --- o servidor -------------------------------------------------------------

def _injetar_estado(html: str) -> str:
    """Põe o estado salvo na página antes de qualquer script dela rodar."""
    dados = json.dumps(estado.tudo(), ensure_ascii=False).replace("</", "<\\/")
    bloco = f'<script>window.__ESTADO_ORGANIZADOR__={dados};</script><script src="/_persistencia.js"></script>'
    marca = re.search(r"<meta charset=[^>]*>", html, re.I) or re.search(r"<head[^>]*>", html, re.I)
    if marca:
        return html[: marca.end()] + bloco + html[marca.end():]
    return bloco + html


class Atendente(BaseHTTPRequestHandler):
    server_version = "Organizador/1.0"

    def log_message(self, formato, *args):
        if "/mensagens" not in self.path and "/api/chats" != self.path:
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), formato % args))

    def _responder(self, codigo: int, corpo: bytes, tipo: str) -> None:
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def _json(self, codigo: int, dados) -> None:
        self._responder(codigo, json.dumps(dados, ensure_ascii=False, default=str).encode("utf-8"), "application/json; charset=utf-8")

    def _atender(self, metodo: str) -> None:
        if self.headers.get("Host") not in HOSTS_ACEITOS:
            return self._json(HTTPStatus.FORBIDDEN, {"erro": "Host não aceito"})
        caminho = urlparse(self.path).path
        if not caminho.startswith("/api/"):
            return self._estatico(caminho) if metodo == "GET" else self._json(HTTPStatus.METHOD_NOT_ALLOWED, {"erro": "método"})
        if metodo != "GET" and self.headers.get(CABECALHO_OBRIGATORIO) != "1":
            return self._json(HTTPStatus.FORBIDDEN, {"erro": "Falta o cabeçalho do organizador"})
        tamanho = int(self.headers.get("Content-Length") or 0)
        try:
            corpo = json.loads(self.rfile.read(tamanho) or b"{}") if tamanho else {}
        except ValueError:
            return self._json(HTTPStatus.BAD_REQUEST, {"erro": "JSON inválido"})
        for metodo_rota, padrao, funcao in _ROTAS:
            achado = padrao.match(caminho)
            if metodo_rota == metodo and achado:
                try:
                    return self._json(HTTPStatus.OK, funcao(self, corpo, **achado.groupdict()))
                except KeyError:
                    return self._json(HTTPStatus.NOT_FOUND, {"erro": "Não encontrado"})
                except (ValueError, RuntimeError, ErroDoUsuario) as erro:
                    return self._json(HTTPStatus.BAD_REQUEST, {"erro": str(erro)})
                except Exception as erro:  # noqa: BLE001 — a tela precisa saber que falhou
                    sys.stderr.write(f"ERRO em {metodo} {caminho}: {erro!r}\n")
                    return self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"erro": repr(erro)})
        return self._json(HTTPStatus.NOT_FOUND, {"erro": "Rota desconhecida"})

    def _estatico(self, caminho: str) -> None:
        if caminho in ("", "/"):
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/organizador.html")
            self.end_headers()
            return
        alvo = (PASTA_WEB / unquote(caminho).lstrip("/")).resolve()
        if alvo.is_dir():
            alvo = alvo / "index.html"
        if PASTA_WEB.resolve() not in alvo.parents or not alvo.is_file():
            return self._json(HTTPStatus.NOT_FOUND, {"erro": "Arquivo não encontrado"})
        tipo = mimetypes.guess_type(alvo.name)[0] or "application/octet-stream"
        if alvo.suffix == ".html":
            corpo = _injetar_estado(alvo.read_text(encoding="utf-8")).encode("utf-8")
            return self._responder(HTTPStatus.OK, corpo, "text/html; charset=utf-8")
        if tipo.startswith("text/") or tipo in ("application/javascript",):
            tipo += "; charset=utf-8"
        self._responder(HTTPStatus.OK, alvo.read_bytes(), tipo)

    def do_GET(self):
        self._atender("GET")

    def do_POST(self):
        self._atender("POST")

    def do_PUT(self):
        self._atender("PUT")

    def do_PATCH(self):
        self._atender("PATCH")

    def do_DELETE(self):
        self._atender("DELETE")


def semear_rotina_de_noticias() -> None:
    """Na primeira vez, cadastra o chat que atualiza a página de Notícias (sem rodar)."""
    if ARQUIVO_CHATS.exists():
        return
    prompt = (PASTA_WEB / "noticias" / "PROMPT_ATUALIZACAO.md").read_text(encoding="utf-8")
    prompt = prompt.split("\n", 1)[1].strip() if prompt.startswith("#") else prompt
    grupo = next((g for g in desktop.grupos() if g["nome"].lower() == "organizador"), None)
    if grupo:
        grupos.editar(grupo["id"], {"pasta_padrao": str(RAIZ)})
    chats.criar({
        "titulo": "Notícias do dia", "grupo_id": grupo["id"] if grupo else None,
        "pasta": str(PASTA_WEB / "noticias"), "modo_permissao": "auto",
        "prompt_rotina": prompt, "rotina_sessao_nova": True,
    })


class ServidorExclusivo(ThreadingHTTPServer):
    """Só um organizador por vez na porta.

    O padrão do Python (`allow_reuse_address`) no Windows deixa um SEGUNDO servidor
    ocupar a mesma porta sem erro — e cada um guarda o estado em memória, então um
    sobrescreve o outro em silêncio. Aconteceu em 06/10/2026. Com a porta exclusiva,
    o segundo falha ao abrir e avisa.
    """
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main() -> None:
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    endereco = f"http://127.0.0.1:{PORTA}/"
    try:
        servidor = ServidorExclusivo(("127.0.0.1", PORTA), Atendente)
    except OSError:
        print(f"O organizador já está aberto em {endereco} — use aquela janela.")
        if "--sem-navegador" not in sys.argv:
            webbrowser.open(endereco)
        return
    semear_rotina_de_noticias()
    print(f"Organizador em {endereco}  (Ctrl+C para parar)")
    if "--sem-navegador" not in sys.argv:
        webbrowser.open(endereco)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
