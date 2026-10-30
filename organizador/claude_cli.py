"""O executável do Claude Code: onde ele está, se está logado e como abrir janelas dele.

O Claude Desktop traz o próprio `claude.exe`, numa pasta por versão. O
organizador usa o mais novo. Fora do Desktop esse executável precisa de login
próprio — uma vez só, feito pela pessoa no navegador (`claude auth login`).
"""
import json
import os
import re
import shutil
import subprocess

from .caminhos import VERSOES_CLI_DESKTOP

SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)
JANELA_NOVA = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

# Variáveis que o Desktop injeta nos processos filhos dele. Se o servidor for
# aberto de dentro de uma sessão do Claude, elas fariam o chat novo se achar
# "filho" daquela sessão; por isso saem.
_PREFIXOS_HERDADOS = ("CLAUDE_", "CLAUDECODE")
_HERDADAS = {"ANTHROPIC_BASE_URL", "USE_LOCAL_OAUTH", "USE_STAGING_OAUTH"}


def _versao(caminho) -> tuple:
    nome = caminho.parent.parent.name
    return tuple(int(parte) for parte in re.findall(r"\d+", nome))


def localizar() -> str | None:
    candidatos = sorted(VERSOES_CLI_DESKTOP.glob("*/*/claude.exe"), key=_versao, reverse=True)
    if candidatos:
        return str(candidatos[0])
    return shutil.which("claude")


def ambiente() -> dict:
    return {
        chave: valor for chave, valor in os.environ.items()
        if not chave.startswith(_PREFIXOS_HERDADOS) and chave not in _HERDADAS
    }


def status() -> dict:
    executavel = localizar()
    if not executavel:
        return {"executavel": None, "logado": False, "metodo": None, "erro": "claude.exe não encontrado"}
    try:
        saida = subprocess.run(
            [executavel, "auth", "status"], capture_output=True, text=True, encoding="utf-8",
            timeout=30, env=ambiente(), creationflags=SEM_JANELA,
        )
        dados = json.loads(saida.stdout or "{}")
    except (OSError, ValueError, subprocess.TimeoutExpired) as erro:
        return {"executavel": executavel, "logado": False, "metodo": None, "erro": str(erro)}
    return {"executavel": executavel, "logado": bool(dados.get("loggedIn")), "metodo": dados.get("authMethod"), "erro": None}


def _janela(argumentos: list[str], pasta: str | None) -> None:
    """Abre um console visível. Se o comando falhar, a janela fica aberta para ler o erro."""
    executavel = localizar()
    if not executavel:
        raise RuntimeError("claude.exe não encontrado")
    comando = subprocess.list2cmdline([executavel, *argumentos])
    subprocess.Popen(
        ["cmd", "/c", f"{comando} || pause"], cwd=pasta or None,
        env=ambiente(), creationflags=JANELA_NOVA,
    )


def abrir_login() -> None:
    _janela(["auth", "login"], None)


def abrir_no_terminal(sessao_cli: str, pasta: str) -> None:
    _janela(["--resume", sessao_cli], pasta)


def abrir_no_desktop(sessao_cli: str, pasta: str) -> None:
    _janela(["--desktop", "--resume", sessao_cli], pasta)


def abrir_link(link: str) -> None:
    os.startfile(link)  # noqa: S606 — o link é sempre claude://, montado aqui
