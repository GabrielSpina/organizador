"""Os scripts do Claude (registro de sexta, medidas) gravando na nuvem.

Os dados moram no repositório PRIVADO GabrielSpina/organizador-dados, clonado em
`Desktop\\organizador-dados` (ou em ORGANIZADOR_NUVEM). Fluxo de cada script:

    from organizador import nuvem
    nuvem.ativar()          # ANTES de importar pesos, medidas, semanas, estado...
    nuvem.puxar()           # traz o que a página (celular, outro PC) gravou
    ...grava pelos módulos de sempre...
    nuvem.regravar_analise()
    nuvem.enviar("Shape: registro de 30/10/2026")

Este módulo não importa `caminhos`: `ativar()` precisa rodar antes dele, porque é
ele que aponta a pasta de dados para o clone e liga o formato JSON.
"""
import os
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA_NUVEM = Path(os.environ.get("ORGANIZADOR_NUVEM") or RAIZ.parent / "organizador-dados")


class NuvemIndisponivel(RuntimeError):
    """O clone do repositório de dados não existe, ou o git não conseguiu falar com o GitHub."""


def ativar() -> Path:
    if not (PASTA_NUVEM / ".git").exists():
        raise NuvemIndisponivel(
            f"Não achei o clone do repositório de dados em {PASTA_NUVEM}. "
            "Clone com: git clone https://github.com/GabrielSpina/organizador-dados.git")
    os.environ["ORGANIZADOR_DADOS"] = str(PASTA_NUVEM)
    os.environ["ORGANIZADOR_FORMATO"] = "json"
    return PASTA_NUVEM


def _git(*argumentos: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(PASTA_NUVEM), *argumentos], capture_output=True,
                          text=True, encoding="utf-8")


def puxar() -> None:
    r = _git("pull", "--rebase", "-q")
    if r.returncode:
        raise NuvemIndisponivel("Não consegui trazer os dados do GitHub:\n" + (r.stderr or r.stdout))


def regravar_analise() -> None:
    """A leitura "o que funcionou" das semanas, guardada pronta para a página mostrar."""
    from . import armazem, medidas, pesos, semanas, shape_inteligencia
    from .caminhos import PASTA_DADOS
    analise = shape_inteligencia.analisar(semanas.listar(), pesos.listar(), medidas.listar())
    armazem.gravar_json(PASTA_DADOS / "analise.json", analise)


def enviar(mensagem: str) -> bool:
    """Commit de tudo o que mudou no clone e envio. Devolve False quando não havia nada."""
    _git("add", "-A")
    if not _git("status", "--porcelain").stdout.strip():
        return False
    r = _git("commit", "-q", "-m", mensagem)
    if r.returncode:
        raise NuvemIndisponivel("O commit falhou:\n" + (r.stderr or r.stdout))
    for _ in range(3):
        r = _git("push", "-q")
        if not r.returncode:
            return True
        # Outra máquina (ou a automação da leitura) enviou no meio: traz e tenta de novo.
        _git("pull", "--rebase", "-q")
    raise NuvemIndisponivel("O envio ao GitHub falhou:\n" + (r.stderr or r.stdout))
