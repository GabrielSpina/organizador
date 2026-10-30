"""O registro semanal da área Shape (toda sexta), em `dados/semanas.parquet`.

Uma linha por data: a bioimpedância da balança, o protocolo e o treino da
semana, como foi a dieta, quantas vezes treinou (academia e jiu) e um
comentário livre. A leitura das semanas — o que funcionou e o que não — fica
em `shape_inteligencia.py`; aqui fica só o que foi registrado.

A medida na fita (circunferência da cintura) mora em
`medidas.py`, por dia — não aqui.

Campo em branco é `None` (não medido), nunca zero.
"""
from datetime import date

from . import armazem
from .caminhos import PASTA_DADOS

ARQUIVO_SEMANAS = PASTA_DADOS / "semanas.parquet"

# Medidas da balança: campo -> (rótulo, mínimo, máximo). Fora do intervalo é erro de digitação.
MEDIDAS = {
    "peso_kg": ("Peso (kg)", 30, 300),
    "imc": ("IMC", 10, 80),
    "gordura_pct": ("Gordura corporal (%)", 2, 70),
    "taxa_muscular_pct": ("Taxa muscular (%)", 10, 95),
    "musculo_esqueletico_kg": ("Massa muscular esquelética (kg)", 5, 120),
    "agua_pct": ("Água (%)", 20, 80),
    "massa_ossea_kg": ("Massa óssea (kg)", 0.5, 10),
    "tmb_kcal": ("Metabolismo basal (kcal)", 500, 5000),
    "proteina_pct": ("Proteína (%)", 2, 40),
    "idade_corporal": ("Idade do corpo", 10, 100),
    "gordura_visceral": ("Gordura visceral (índice)", 1, 60),
    "gordura_subcutanea_pct": ("Gordura subcutânea (%)", 1, 70),
}
# Análise segmentar: gordura e músculo (kg) de cada parte do corpo.
SEGMENTOS = {
    "braco_d": "Braço direito", "braco_e": "Braço esquerdo", "tronco": "Tronco",
    "perna_d": "Perna direita", "perna_e": "Perna esquerda",
}
CAMPOS_SEGMENTOS = [f"{parte}_{tipo}_kg" for parte in SEGMENTOS for tipo in ("gordura", "musculo")]
TEXTOS = ["protocolo", "treino", "comentario"]
DIETA = {"seguiu": "Seguiu", "parcial": "Em parte", "nao_seguiu": "Não seguiu bem"}
CONTAGENS = ["treinos_academia", "treinos_jiu"]

COLUNAS = ["data", *MEDIDAS, *CAMPOS_SEGMENTOS, *TEXTOS, "dieta", *CONTAGENS, "atualizado_em"]


def listar() -> list[dict]:
    """Os registros em ordem de data. Coluna criada depois do registro vem como None (não medido)."""
    registros = [{coluna: r.get(coluna) for coluna in COLUNAS} for r in armazem.ler_registros(ARQUIVO_SEMANAS)]
    return sorted(registros, key=lambda s: s["data"])


def _numero(valor, rotulo: str, minimo=None, maximo=None):
    if valor is None or str(valor).strip() == "":
        return None
    try:
        numero = float(str(valor).replace(",", "."))
    except ValueError:
        raise ValueError(f"{rotulo}: valor inválido ({valor!r}).") from None
    if minimo is not None and not minimo <= numero <= maximo:
        raise ValueError(f"{rotulo}: {numero} está fora do esperado ({minimo} a {maximo}).")
    return round(numero, 2)


def definir(dia: str, dados: dict) -> dict:
    """Grava (ou corrige) o registro de uma data."""
    dia = date.fromisoformat(dia).isoformat()
    semana = {"data": dia}
    for campo, (rotulo, minimo, maximo) in MEDIDAS.items():
        semana[campo] = _numero(dados.get(campo), rotulo, minimo, maximo)
    for campo in CAMPOS_SEGMENTOS:
        semana[campo] = _numero(dados.get(campo), campo, 0, 100)
    for campo in TEXTOS:
        semana[campo] = (dados.get(campo) or "").strip() or None
    dieta = dados.get("dieta") or None
    if dieta is not None and dieta not in DIETA:
        raise ValueError(f"Dieta: opção desconhecida ({dieta!r}).")
    semana["dieta"] = dieta
    for campo in CONTAGENS:
        contagem = _numero(dados.get(campo), campo, 0, 21)
        semana[campo] = None if contagem is None else int(contagem)
    if semana["peso_kg"] is None:
        raise ValueError("O peso é obrigatório no registro semanal.")
    semana["atualizado_em"] = armazem.agora()
    with armazem.TRAVA:
        semanas = {s["data"]: s for s in listar()}
        semanas[dia] = semana
        armazem.gravar_registros(ARQUIVO_SEMANAS, list(semanas.values()), COLUNAS)
    return semana


def excluir(dia: str) -> None:
    with armazem.TRAVA:
        semanas = [s for s in listar() if s["data"] != dia]
        armazem.gravar_registros(ARQUIVO_SEMANAS, semanas, COLUNAS)
