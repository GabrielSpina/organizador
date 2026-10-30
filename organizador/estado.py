"""O estado das telas do organizador (cards, tags, projetos, histórico, agenda).

As telas foram escritas para o `localStorage` do navegador. Em vez de reescrevê-las,
o servidor entrega o estado salvo junto com a página e recebe de volta cada
`setItem` — então o `localStorage` vira só um espelho, e a verdade fica aqui,
em `dados/estado.parquet` (uma linha por chave).
"""
from . import armazem
from .caminhos import ARQUIVO_ESTADO

COLUNAS = ["chave", "valor", "atualizado_em"]
_memoria: dict[str, dict] | None = None


def _carregar() -> dict[str, dict]:
    global _memoria
    if _memoria is None:
        _memoria = {linha["chave"]: linha for linha in armazem.ler_registros(ARQUIVO_ESTADO)}
    return _memoria


def tudo() -> dict[str, str]:
    with armazem.TRAVA:
        return {chave: linha["valor"] for chave, linha in _carregar().items()}


def definir(chave: str, valor: str | None) -> None:
    """Grava uma chave; `None` apaga."""
    with armazem.TRAVA:
        memoria = _carregar()
        if valor is None:
            memoria.pop(chave, None)
        else:
            memoria[chave] = {"chave": chave, "valor": valor, "atualizado_em": armazem.agora()}
        armazem.gravar_registros(ARQUIVO_ESTADO, list(memoria.values()), COLUNAS)


def importar(valores: dict[str, str], sobrescrever: bool) -> list[str]:
    """Traz o estado do organizador antigo. Devolve as chaves gravadas."""
    gravadas = []
    with armazem.TRAVA:
        existentes = _carregar()
        for chave, valor in valores.items():
            if not isinstance(valor, str):
                continue
            if chave in existentes and not sobrescrever:
                continue
            existentes[chave] = {"chave": chave, "valor": valor, "atualizado_em": armazem.agora()}
            gravadas.append(chave)
        armazem.gravar_registros(ARQUIVO_ESTADO, list(existentes.values()), COLUNAS)
    return gravadas
