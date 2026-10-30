"""Grupos: os do Claude Desktop (lidos de lá) somados aos criados no organizador.

O organizador não cria nem renomeia grupo no Desktop. O que ele guarda sobre
um grupo do Desktop — a cor e a pasta de trabalho padrão dos chats novos —
fica em `dados/grupos.parquet`, numa linha com o mesmo id do grupo de lá.
"""
import uuid
from collections import Counter

from . import armazem, desktop
from .caminhos import ARQUIVO_GRUPOS

COLUNAS = ["id", "nome", "cor", "pasta_padrao", "origem", "criado_em"]
CORES = ["#549866", "#7da4d6", "#aa86dc", "#d98955", "#c8a34a", "#5aa3a3"]


def _locais() -> dict[str, dict]:
    return {g["id"]: g for g in armazem.ler_registros(ARQUIVO_GRUPOS)}


def _gravar(locais: dict[str, dict]) -> None:
    armazem.gravar_registros(ARQUIVO_GRUPOS, list(locais.values()), COLUNAS)


def listar(chats_organizador: list[dict]) -> list[dict]:
    locais = _locais()
    sessoes = desktop.sessoes()
    saida = []
    for posicao, grupo in enumerate(desktop.grupos()):
        local = locais.get(grupo["id"], {})
        pastas = Counter(s["pasta"] for s in sessoes if s["grupo_id"] == grupo["id"] and s["pasta"])
        saida.append({
            "id": grupo["id"], "nome": grupo["nome"], "origem": "desktop",
            "cor": local.get("cor") or CORES[posicao % len(CORES)],
            # Sem pasta escolhida, a sugestão é a pasta mais usada pelos chats do grupo.
            "pasta_padrao": local.get("pasta_padrao") or (pastas.most_common(1)[0][0] if pastas else None),
        })
    for grupo in locais.values():
        if grupo.get("origem") == "organizador":
            saida.append({k: grupo.get(k) for k in ("id", "nome", "cor", "pasta_padrao", "origem")})
    for grupo in saida:
        grupo["chats_desktop"] = sum(1 for s in sessoes if s["grupo_id"] == grupo["id"])
        grupo["chats_organizador"] = sum(1 for c in chats_organizador if c["grupo_id"] == grupo["id"])
    return saida


def criar(nome: str, cor: str | None, pasta_padrao: str | None) -> dict:
    nome = (nome or "").strip()
    if not nome:
        raise ValueError("O grupo precisa de um nome.")
    locais = _locais()
    grupo = {"id": "org-" + uuid.uuid4().hex[:12], "nome": nome, "cor": cor or CORES[len(locais) % len(CORES)],
             "pasta_padrao": (pasta_padrao or "").strip() or None, "origem": "organizador", "criado_em": armazem.agora()}
    locais[grupo["id"]] = grupo
    _gravar(locais)
    return grupo


def editar(grupo_id: str, dados: dict) -> None:
    locais = _locais()
    do_desktop = any(g["id"] == grupo_id for g in desktop.grupos())
    grupo = locais.get(grupo_id)
    if grupo is None:
        if not do_desktop:
            raise KeyError(grupo_id)
        grupo = {"id": grupo_id, "nome": None, "cor": None, "pasta_padrao": None, "origem": "desktop", "criado_em": armazem.agora()}
        locais[grupo_id] = grupo
    for campo in ("cor", "pasta_padrao"):
        if campo in dados:
            grupo[campo] = (dados[campo] or "").strip() or None
    if "nome" in dados and grupo["origem"] == "organizador":
        grupo["nome"] = (dados["nome"] or "").strip() or grupo["nome"]
    _gravar(locais)


def excluir(grupo_id: str) -> None:
    """Só grupos do organizador. Os chats dele ficam, sem grupo."""
    locais = _locais()
    grupo = locais.get(grupo_id)
    if not grupo or grupo["origem"] != "organizador":
        raise ValueError("Grupos do Claude Desktop são removidos no próprio Desktop.")
    del locais[grupo_id]
    _gravar(locais)
