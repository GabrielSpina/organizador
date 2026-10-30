"""A leitura das semanas da área Shape: o que funcionou e o que não funcionou.

Cada registro de sexta fecha uma semana. O que mudou desde o registro anterior
(gordura em kg, músculo esquelético em kg, gordura visceral) é o RESULTADO
daquela semana; dieta, treinos, jiu e protocolo daquela semana são os FATORES.
A leitura junta as semanas pelo fator e compara a média dos resultados.

O placar de uma semana é o "saldo de composição": músculo ganho menos gordura
ganha, em kg por semana (positivo é bom). Tudo é normalizado para 7 dias,
porque nem todo registro cai exatamente na sexta.

Duas cautelas que a própria leitura escreve na tela:
- uma semana de cada lado é INDÍCIO, não padrão — a força só aparece com
  pelo menos duas semanas em cada grupo;
- a bioimpedância lê água como massa magra: semana em que a água mudou muito
  tem gordura/músculo distorcidos.
"""
from datetime import date, timedelta

from .semanas import DIETA

LIMIAR_MUDANCA_KG = 0.3       # abaixo disso, por semana, a balança não distingue de ruído
LIMIAR_DIFERENCA_SALDO = 0.2  # diferença entre grupos menor que isso não é "funcionou"
LIMIAR_AGUA_PP = 1.5          # variação de água que já distorce a bioimpedância
ACADEMIA_ALTA = 4             # treinos na semana a partir dos quais conta como "semana cheia"
VISCERAL_ALTA = 13            # a partir daqui a maioria das balanças marca excesso


# --- formatação -----------------------------------------------------------

def _num(valor, casas=1, sinal=False) -> str:
    if valor is None:
        return "—"
    texto = f"{valor:+,.{casas}f}" if sinal else f"{valor:,.{casas}f}"
    texto = texto.replace(",", "_").replace(".", ",").replace("_", ".")
    return texto.replace("-", "−")


def _dia(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%d/%m")


# --- números de cada semana ------------------------------------------------

def _gordura_kg(semana):
    if semana["peso_kg"] is None or semana["gordura_pct"] is None:
        return None
    return semana["peso_kg"] * semana["gordura_pct"] / 100


def _media_diaria(pesos: list[dict], dia: str):
    """Média das pesagens diárias dos 7 dias que terminam em `dia` (menos ruído que uma pesagem só)."""
    fim = date.fromisoformat(dia)
    inicio = (fim - timedelta(days=6)).isoformat()
    valores = [p["peso_kg"] for p in pesos if inicio <= p["data"] <= dia]
    return sum(valores) / len(valores) if valores else None


def _diferenca(atual, anterior, dias):
    if atual is None or anterior is None:
        return None
    return (atual - anterior) * 7 / dias


def _classificar(d_gordura, d_musculo) -> tuple[str, str]:
    """Abaixo de LIMIAR_MUDANCA_KG por semana, gordura ou músculo contam como "não mudou":
    a balança mede de 0,1 em 0,1 kg e oscila com a água."""
    if d_gordura is None or d_musculo is None:
        return "sem-dado", "Sem bioimpedância completa"
    gordura = -1 if d_gordura <= -LIMIAR_MUDANCA_KG else 1 if d_gordura >= LIMIAR_MUDANCA_KG else 0
    musculo = -1 if d_musculo <= -LIMIAR_MUDANCA_KG else 1 if d_musculo >= LIMIAR_MUDANCA_KG else 0
    return {
        (-1, 1): ("bom", "Perdeu gordura e ganhou músculo"),
        (-1, 0): ("bom", "Perdeu gordura sem perder músculo"),
        (-1, -1): ("misto", "Perdeu gordura e músculo"),
        (0, 1): ("bom", "Ganhou músculo"),
        (0, 0): ("neutro", "Estável (variação dentro do ruído da balança)"),
        (0, -1): ("ruim", "Perdeu músculo"),
        (1, 1): ("misto", "Ganhou músculo e gordura"),
        (1, 0): ("ruim", "Ganhou gordura"),
        (1, -1): ("ruim", "Ganhou gordura e perdeu músculo"),
    }[(gordura, musculo)]


def _fita(medidas: list[dict], dia: str) -> dict:
    """A medida na fita mais recente dos 7 dias que terminam em `dia` (a fita não espera a sexta)."""
    inicio = (date.fromisoformat(dia) - timedelta(days=6)).isoformat()
    da_semana = [m for m in medidas if inicio <= m["data"] <= dia]
    return da_semana[-1] if da_semana else {}


def _diferenca_fita(atual: dict, anterior: dict, campo: str, dias: int):
    """Só compara medidas do MESMO método: a troca de método muda o número sem mudar o corpo."""
    if atual.get("metodo") != anterior.get("metodo"):
        return None
    return _diferenca(atual.get(campo), anterior.get(campo), dias)


def evolucao(semanas: list[dict], pesos: list[dict], medidas: list[dict] = ()) -> list[dict]:
    """Uma linha por registro, com a variação (por 7 dias) desde o registro anterior."""
    linhas, fitas = [], []
    for i, semana in enumerate(semanas):
        fita = _fita(list(medidas), semana["data"])
        fitas.append(fita)
        linha = {
            "data": semana["data"],
            "gordura_kg": _gordura_kg(semana),
            "massa_magra_kg": None if _gordura_kg(semana) is None else semana["peso_kg"] - _gordura_kg(semana),
            "media_diaria_kg": _media_diaria(pesos, semana["data"]),
            "cintura_cm": fita.get("cintura_cm"),
        }
        if i:
            anterior, ant = semanas[i - 1], linhas[i - 1]
            dias = (date.fromisoformat(semana["data"]) - date.fromisoformat(anterior["data"])).days
            linha.update({
                "dias": dias,
                "d_peso": _diferenca(semana["peso_kg"], anterior["peso_kg"], dias),
                "d_gordura_kg": _diferenca(linha["gordura_kg"], ant["gordura_kg"], dias),
                "d_musculo_kg": _diferenca(semana["musculo_esqueletico_kg"], anterior["musculo_esqueletico_kg"], dias),
                "d_visceral": _diferenca(semana["gordura_visceral"], anterior["gordura_visceral"], dias),
                "d_cintura_cm": _diferenca_fita(fita, fitas[i - 1], "cintura_cm", dias),
                "d_agua_pct": None if semana["agua_pct"] is None or anterior["agua_pct"] is None else semana["agua_pct"] - anterior["agua_pct"],
                "d_media_diaria": _diferenca(linha["media_diaria_kg"], ant["media_diaria_kg"], dias),
            })
            if linha["d_gordura_kg"] is not None and linha["d_musculo_kg"] is not None:
                linha["saldo"] = linha["d_musculo_kg"] - linha["d_gordura_kg"]
            linha["resultado"], linha["resultado_texto"] = _classificar(linha["d_gordura_kg"], linha["d_musculo_kg"])
        linhas.append(linha)
    return linhas


# --- fatores ---------------------------------------------------------------

def _fator_dieta(semana):
    return DIETA.get(semana["dieta"]) if semana["dieta"] else None


def _fator_jiu(semana):
    if semana["treinos_jiu"] is None:
        return None
    return "Com jiu" if semana["treinos_jiu"] >= 1 else "Sem jiu"


def _fator_academia(semana):
    if semana["treinos_academia"] is None:
        return None
    return f"Academia {ACADEMIA_ALTA}+ vezes" if semana["treinos_academia"] >= ACADEMIA_ALTA else f"Academia até {ACADEMIA_ALTA - 1} vezes"


def _fatores_protocolo(semanas):
    """O protocolo é texto livre: semanas com o mesmo texto (ignorando espaços e caixa) são o mesmo protocolo."""
    rotulos, primeira = {}, {}
    for semana in semanas:
        texto = " ".join((semana["protocolo"] or "").lower().split())
        if texto and texto not in primeira:
            primeira[texto] = semana["data"]
        rotulos[semana["data"]] = f"Protocolo iniciado em {_dia(primeira[texto])}" if texto else None
    return lambda semana: rotulos.get(semana["data"])


def _resumo_grupo(rotulo, linhas):
    media = lambda campo: sum(l[campo] for l in linhas) / len(linhas)
    return {"rotulo": rotulo, "n": len(linhas), "saldo": media("saldo"),
            "d_gordura_kg": media("d_gordura_kg"), "d_musculo_kg": media("d_musculo_kg")}


def _texto_grupo(g) -> str:
    semanas = "semana" if g["n"] == 1 else "semanas"
    return (f"{g['rotulo']}: gordura {_num(g['d_gordura_kg'], 2, True)} kg e músculo "
            f"{_num(g['d_musculo_kg'], 2, True)} kg por semana ({g['n']} {semanas})")


def _comparar(nome, fator, semanas, linhas) -> list[dict]:
    grupos: dict[str, list] = {}
    for semana, linha in zip(semanas, linhas):
        rotulo = fator(semana)
        if rotulo and linha.get("saldo") is not None:
            grupos.setdefault(rotulo, []).append(linha)
    if len(grupos) < 2:
        return []
    resumos = sorted((_resumo_grupo(r, l) for r, l in grupos.items()), key=lambda g: g["saldo"], reverse=True)
    melhor, pior = resumos[0], resumos[-1]
    detalhe = ". ".join(_texto_grupo(g) for g in resumos) + "."
    if melhor["saldo"] - pior["saldo"] < LIMIAR_DIFERENCA_SALDO:
        return [{"tipo": "info", "titulo": f"{nome}: sem diferença visível", "texto": detalhe}]
    forte = melhor["n"] >= 2 and pior["n"] >= 2
    forca = "Padrão" if forte else "Indício (ainda poucas semanas de cada lado)"
    return [
        {"tipo": "funcionou" if forte else "indicio", "titulo": f"{nome}: funcionou melhor — {melhor['rotulo']}",
         "texto": f"{forca}. {detalhe}"},
        {"tipo": "nao_funcionou" if forte else "indicio", "titulo": f"{nome}: funcionou pior — {pior['rotulo']}",
         "texto": f"Saldo de composição {_num(pior['saldo'], 2, True)} kg/semana contra {_num(melhor['saldo'], 2, True)}."},
    ]


def _descrever_semana(semana) -> str:
    partes = []
    if semana["dieta"]:
        partes.append(f"dieta: {DIETA[semana['dieta']].lower()}")
    if semana["treinos_academia"] is not None:
        partes.append(f"academia {semana['treinos_academia']}x")
    if semana["treinos_jiu"] is not None:
        partes.append(f"jiu {semana['treinos_jiu']}x")
    texto = ", ".join(partes)
    if semana["comentario"]:
        texto += f". Você anotou: “{semana['comentario']}”"
    return texto


# --- a leitura -------------------------------------------------------------

def _dicas_fita(medidas: list[dict]) -> list[dict]:
    """A série de cada medida na fita, só com o método mais recente."""
    if not medidas:
        return []
    metodo = medidas[-1]["metodo"]
    do_metodo = [m for m in medidas if m["metodo"] == metodo]
    dicas = []
    for campo, nome in [("cintura_cm", "Circunferência da cintura")]:
        serie = [m for m in do_metodo if m[campo] is not None]
        if len(serie) == 1:
            dicas.append({"tipo": "info", "titulo": f"{nome}: ponto de partida {_num(serie[0][campo])} cm",
                "texto": f"Medida em {_dia(serie[0]['data'])}. A fita não sofre com a água como a bioimpedância; "
                         "a comparação começa na próxima medida."})
        elif serie:
            primeira, ultima = serie[0], serie[-1]
            variacao = ultima[campo] - primeira[campo]
            dias = (date.fromisoformat(ultima["data"]) - date.fromisoformat(primeira["data"])).days
            tipo = "funcionou" if variacao <= -1 else "nao_funcionou" if variacao >= 1 else "info"
            pontos = " → ".join(f"{_num(m[campo])} ({_dia(m['data'])})" for m in serie[-6:])
            dicas.append({"tipo": tipo, "titulo": f"{nome}: {_num(variacao, 1, True)} cm em {dias} dias", "texto":
                f"{pontos}. A fita não sofre com a água como a bioimpedância: quando as duas discordarem sobre a "
                "gordura, a fita é a mais confiável."})
    if len(do_metodo) < len(medidas):
        dicas.append({"tipo": "info", "titulo": "Medidas de outro método ficaram fora",
            "texto": f"A partir de {_dia(do_metodo[0]['data'])} o método de medir mudou; as medidas anteriores não são "
                     "comparáveis com as novas e não entram nas contas."})
    return dicas


def analisar(semanas: list[dict], pesos: list[dict], medidas: list[dict] = ()) -> dict:
    medidas = list(medidas)
    linhas = evolucao(semanas, pesos, medidas)
    dicas: list[dict] = []
    if not semanas:
        return {"evolucao": linhas, "dicas": [{"tipo": "info", "titulo": "Nenhuma semana registrada",
                "texto": "Registre a bioimpedância de sexta para começar."}]}

    ultima, linha = semanas[-1], linhas[-1]
    if len(semanas) == 1:
        dicas.append({"tipo": "info", "titulo": f"Ponto de partida: {_dia(ultima['data'])}", "texto":
            f"Gordura {_num(linha['gordura_kg'])} kg ({_num(ultima['gordura_pct'])}%), músculo esquelético "
            f"{_num(ultima['musculo_esqueletico_kg'])} kg, gordura visceral {_num(ultima['gordura_visceral'], 0)}"
            + ". "
            "A comparação começa no próximo registro de sexta."})
    else:
        dicas.append({"tipo": {"bom": "funcionou", "ruim": "nao_funcionou"}.get(linha["resultado"], "info"),
            "titulo": f"Última semana ({_dia(ultima['data'])}): {linha['resultado_texto']}", "texto":
            f"Por semana: peso {_num(linha['d_peso'], 1, True)} kg, gordura {_num(linha['d_gordura_kg'], 2, True)} kg, "
            f"músculo {_num(linha['d_musculo_kg'], 2, True)} kg, visceral {_num(linha['d_visceral'], 1, True)}"
            + (f", cintura {_num(linha['d_cintura_cm'], 1, True)} cm" if linha.get("d_cintura_cm") is not None else "")
            + ". "
            f"Na semana: {_descrever_semana(ultima)}."})

    dicas += _dicas_fita(medidas)
    d_fita, nome_fita = linha.get("d_cintura_cm"), "a circunferência da cintura"
    d_gordura = linha.get("d_gordura_kg")
    if d_fita is not None and d_gordura is not None and d_fita <= -1 and d_gordura > -LIMIAR_MUDANCA_KG:
        dicas.append({"tipo": "indicio", "titulo": "A fita viu queda que a balança não viu", "texto":
            f"Na última semana {nome_fita} caiu {_num(-d_fita)} cm, mas a bioimpedância marcou a gordura "
            "como estável. Nessa discordância, a fita é a mais confiável."})

    for nome, fator in [("Dieta", _fator_dieta), ("Jiu", _fator_jiu), ("Academia", _fator_academia),
                        ("Protocolo", _fatores_protocolo(semanas))]:
        dicas += _comparar(nome, fator, semanas, linhas)

    com_saldo = [(s, l) for s, l in zip(semanas, linhas) if l.get("saldo") is not None]
    if len(com_saldo) >= 2:
        melhor = max(com_saldo, key=lambda par: par[1]["saldo"])
        pior = min(com_saldo, key=lambda par: par[1]["saldo"])
        for (semana, l), tipo, titulo in [(melhor, "funcionou", "Melhor semana"), (pior, "nao_funcionou", "Pior semana")]:
            dicas.append({"tipo": tipo, "titulo": f"{titulo}: {_dia(semana['data'])}", "texto":
                f"Gordura {_num(l['d_gordura_kg'], 2, True)} kg, músculo {_num(l['d_musculo_kg'], 2, True)} kg. "
                f"{_descrever_semana(semana)}."})
    if 2 <= len(com_saldo) < 6:
        dicas.append({"tipo": "info", "titulo": "Ainda poucas semanas", "texto":
            "Cada semana muda várias coisas ao mesmo tempo (dieta, treino, protocolo). Com mais semanas a "
            "comparação consegue separar um efeito do outro; por enquanto, leia como pista."})

    for semana, l in zip(semanas, linhas):
        if l.get("d_agua_pct") is not None and abs(l["d_agua_pct"]) >= LIMIAR_AGUA_PP:
            dicas.append({"tipo": "alerta", "titulo": f"Água mudou {_num(l['d_agua_pct'], 1, True)} pp em {_dia(semana['data'])}",
                "texto": "A bioimpedância lê água como massa magra: gordura e músculo dessa semana podem estar "
                         "distorcidos. Pese sempre no mesmo horário, em jejum e depois de ir ao banheiro."})
    if ultima["gordura_visceral"] is not None and ultima["gordura_visceral"] >= VISCERAL_ALTA:
        dicas.append({"tipo": "alerta", "titulo": f"Gordura visceral em {_num(ultima['gordura_visceral'], 0)}",
            "texto": f"A partir de {VISCERAL_ALTA} a maioria das balanças marca excesso. É o número com mais peso "
                     "para a saúde — vale ser o primeiro a acompanhar."})
    return {"evolucao": linhas, "dicas": dicas}
