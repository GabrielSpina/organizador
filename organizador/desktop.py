"""Os grupos e os chats do Claude Desktop — SÓ LEITURA.

O Desktop guarda os grupos do sidebar em `claude_desktop_config.json` e cada
sessão num `.json` em `claude-code-sessions/`. O organizador lê os dois para
mostrar tudo num lugar só, mas nunca escreve neles: mexer no arquivo de outro
programa enquanto ele está aberto é pedir para perder dado. Mudar um chat de
grupo, renomear ou arquivar continua sendo feito no próprio Desktop.
"""
import json
import os
from datetime import datetime, timezone

from . import mensagens
from pathlib import Path

from .caminhos import CONFIG_DESKTOP, PASTA_CLAUDE_DESKTOP, PROJETOS_CLAUDE, SESSOES_DESKTOP

LIMITE_MENSAGENS = 400
_cache_sessoes: dict[str, tuple[float, dict]] = {}


def _ms_para_iso(valor) -> str | None:
    if not isinstance(valor, (int, float)):
        return None
    return datetime.fromtimestamp(valor / 1000, tz=timezone.utc).astimezone().isoformat(timespec="seconds")


def _pasta_real(pasta: str | None) -> str | None:
    """As sessões gravam a pasta como o pacote a enxerga (`%APPDATA%/Claude/...`); de fora, o caminho é outro."""
    if not pasta or Path(pasta).exists():
        return pasta
    virtual = Path(os.environ.get("APPDATA", "")) / "Claude"
    try:
        return str(PASTA_CLAUDE_DESKTOP / Path(pasta).relative_to(virtual))
    except ValueError:
        return pasta


def _escopos() -> list[dict]:
    try:
        config = json.loads(CONFIG_DESKTOP.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    preferencias = config.get("preferences", {}).get("epitaxyPrefs", {})
    return list((preferencias.get("dframe-group-scopes") or {}).values())


def grupos() -> list[dict]:
    vistos, saida = set(), []
    for escopo in _escopos():
        for ordem, grupo in enumerate(escopo.get("groups") or []):
            if grupo.get("id") in vistos:
                continue
            vistos.add(grupo["id"])
            saida.append({"id": grupo["id"], "nome": grupo.get("name") or "(sem nome)", "ordem": ordem})
    return saida


def _grupo_por_sessao() -> dict[str, str]:
    atribuicoes = {}
    for escopo in _escopos():
        for chave, grupo_id in (escopo.get("assignments") or {}).items():
            atribuicoes[chave.split(":", 1)[-1]] = grupo_id
    return atribuicoes


def _ler_sessao(caminho) -> dict | None:
    """Lê o .json de uma sessão, reaproveitando o que não mudou desde a última vez."""
    try:
        modificado = os.path.getmtime(caminho)
    except OSError:
        return None
    guardado = _cache_sessoes.get(str(caminho))
    if guardado and guardado[0] == modificado:
        return guardado[1]
    try:
        bruto = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    sessao = {
        "id": bruto.get("sessionId"),
        "sessao_cli": bruto.get("cliSessionId"),
        "titulo": bruto.get("title") or "(sem título)",
        "pasta": _pasta_real(bruto.get("cwd")),
        "modelo": bruto.get("model"),
        "arquivado": bool(bruto.get("isArchived")),
        "criado_em": _ms_para_iso(bruto.get("createdAt")),
        "atualizado_em": _ms_para_iso(bruto.get("lastActivityAt")),
    }
    _cache_sessoes[str(caminho)] = (modificado, sessao)
    return sessao


def sessoes(incluir_arquivadas: bool = False) -> list[dict]:
    if not SESSOES_DESKTOP.exists():
        return []
    grupo_de = _grupo_por_sessao()
    saida = []
    for caminho in SESSOES_DESKTOP.glob("*/*/local_*.json"):
        sessao = _ler_sessao(caminho)
        if not sessao or not sessao["id"]:
            continue
        if sessao["arquivado"] and not incluir_arquivadas:
            continue
        saida.append({
            **sessao,
            "grupo_id": grupo_de.get(sessao["id"]),
            "origem": "desktop",
            "link": f"claude://claude.ai/epitaxy/{sessao['id']}",
        })
    saida.sort(key=lambda s: s["atualizado_em"] or "", reverse=True)
    return saida


def sessao(sessao_id: str) -> dict | None:
    return next((s for s in sessoes(incluir_arquivadas=True) if s["id"] == sessao_id), None)


def arquivo_transcricao(sessao_cli: str):
    if not sessao_cli:
        return None
    return next(PROJETOS_CLAUDE.glob(f"*/{sessao_cli}.jsonl"), None)


def transcricao(sessao_cli: str) -> list[dict]:
    """As mensagens de uma sessão, a partir da transcrição do Claude Code."""
    caminho = arquivo_transcricao(sessao_cli)
    if caminho is None:
        return []
    saida = []
    with open(caminho, encoding="utf-8", errors="replace") as arquivo:
        for linha in arquivo:
            try:
                evento = json.loads(linha)
            except ValueError:
                continue
            for papel, texto in mensagens.de_evento(evento):
                saida.append({"seq": len(saida), "papel": papel, "texto": texto, "criado_em": evento.get("timestamp")})
    return saida[-LIMITE_MENSAGENS:]
