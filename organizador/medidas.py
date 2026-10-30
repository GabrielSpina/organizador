"""A medida na fita da área Shape: a circunferência da cintura, em `dados/medidas.parquet`.

O analista chama de "linha de cintura"; é a mesma medida. Até 22/10/2026 havia dois
campos (abdominal e linha de cintura) — ficou um só, a pedido dele.

Uma linha por dia, como as pesagens — a fita não espera a sexta. Cada medida
guarda o MÉTODO usado: em 15/10/2026 o método mudou e os valores caíram só por
isso, então medidas de métodos diferentes nunca são comparadas entre si
(`shape_inteligencia` respeita isso).

Campo em branco é `None` (não medido), nunca zero.
"""
from datetime import date

from . import armazem
from .caminhos import PASTA_DADOS

ARQUIVO_MEDIDAS = PASTA_DADOS / "medidas.parquet"
CAMPOS = {"cintura_cm": "Circunferência da cintura (cm)"}
MINIMO_CM, MAXIMO_CM = 50.0, 200.0
METODO_PADRAO = "novo_metodo_padronizado"  # o adotado em 15/10/2026
COLUNAS = ["data", *CAMPOS, "metodo", "atualizado_em"]


def listar() -> list[dict]:
    registros = [{coluna: r.get(coluna) for coluna in COLUNAS} for r in armazem.ler_registros(ARQUIVO_MEDIDAS)]
    return sorted(registros, key=lambda m: m["data"])


def _cm(valor, rotulo: str):
    if valor is None or str(valor).strip() == "":
        return None
    try:
        numero = round(float(str(valor).replace(",", ".")), 1)
    except ValueError:
        raise ValueError(f"{rotulo}: valor inválido ({valor!r}).") from None
    if not MINIMO_CM <= numero <= MAXIMO_CM:
        raise ValueError(f"{rotulo}: {numero} cm está fora do esperado ({MINIMO_CM:.0f} a {MAXIMO_CM:.0f}).")
    return numero


def definir(dia: str, dados: dict) -> dict:
    """Grava (ou completa) as medidas de um dia. O método, se não vier, repete o da medida anterior."""
    dia = date.fromisoformat(dia).isoformat()
    novos = {campo: _cm(dados.get(campo), rotulo) for campo, rotulo in CAMPOS.items()}
    if all(valor is None for valor in novos.values()):
        raise ValueError("Nenhuma medida informada.")
    with armazem.TRAVA:
        medidas = {m["data"]: m for m in listar()}
        anteriores = [m for d, m in sorted(medidas.items()) if d < dia]
        metodo = dados.get("metodo") or (medidas.get(dia) or {}).get("metodo") \
            or (anteriores[-1]["metodo"] if anteriores else METODO_PADRAO)
        medida = dict(medidas.get(dia) or {"data": dia})
        for campo, valor in novos.items():
            if valor is not None:
                medida[campo] = valor
        medida.update({"metodo": metodo, "atualizado_em": armazem.agora()})
        medidas[dia] = {coluna: medida.get(coluna) for coluna in COLUNAS}
        armazem.gravar_registros(ARQUIVO_MEDIDAS, list(medidas.values()), COLUNAS)
    return medidas[dia]
