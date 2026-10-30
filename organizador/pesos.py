"""Os pesos da área Shape: uma pesagem por dia, em `dados/pesos.parquet`.

A previsão (tendência, peso em 30 dias, data da meta) é calculada na tela,
a partir desta lista — aqui fica só o dado medido.
"""
from datetime import date

from . import armazem
from .caminhos import PASTA_DADOS

ARQUIVO_PESOS = PASTA_DADOS / "pesos.parquet"
COLUNAS = ["data", "peso_kg", "atualizado_em"]
PESO_MINIMO, PESO_MAXIMO = 30.0, 300.0


def listar() -> list[dict]:
    return sorted(armazem.ler_registros(ARQUIVO_PESOS), key=lambda p: p["data"])


def definir(dia: str, peso_kg) -> dict:
    """Grava (ou corrige) a pesagem de um dia."""
    dia = date.fromisoformat(dia).isoformat()
    try:
        peso = round(float(peso_kg), 2)
    except (TypeError, ValueError):
        raise ValueError("Peso inválido.") from None
    if not PESO_MINIMO <= peso <= PESO_MAXIMO:
        raise ValueError(f"Peso fora do intervalo esperado ({PESO_MINIMO:.0f} a {PESO_MAXIMO:.0f} kg).")
    with armazem.TRAVA:
        pesos = {p["data"]: p for p in listar()}
        pesos[dia] = {"data": dia, "peso_kg": peso, "atualizado_em": armazem.agora()}
        armazem.gravar_registros(ARQUIVO_PESOS, list(pesos.values()), COLUNAS)
    return pesos[dia]


def excluir(dia: str) -> None:
    with armazem.TRAVA:
        pesos = [p for p in listar() if p["data"] != dia]
        armazem.gravar_registros(ARQUIVO_PESOS, pesos, COLUNAS)
