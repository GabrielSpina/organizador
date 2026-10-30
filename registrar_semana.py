"""Grava o registro de sexta da área Shape — usado pelo Claude, a partir do que chega no chat.

O analista não preenche tela: manda o print da balança e o relato da semana, e
o Claude monta um JSON e roda:

    python registrar_semana.py semana.json

Campos do JSON: `data` (AAAA-MM-DD) e os de `organizador/semanas.py`
(medidas, segmentos, protocolo, treino, dieta, treinos_academia, treinos_jiu,
comentario) — e, se vier, `cintura_cm`, que vai para as medidas na fita do
mesmo dia. O que faltar é completado assim:

- `protocolo` e `treino` ausentes repetem os do registro anterior (a semana
  costuma seguir a mesma) — e o script diz que repetiu;
- `treinos_academia` e `treinos_jiu` ausentes são contados no Concluídos
  (`ritmo.history.v1` do estado das telas), nos 7 dias que terminam na data.

No fim imprime a leitura das semanas (o que funcionou e o que não), para o
Claude responder no chat. Grava na nuvem (repositório privado organizador-dados,
clonado em Desktop\\organizador-dados): traz o que a página gravou, grava, recalcula
a leitura e envia — a página e o celular mostram na próxima abertura da aba.
Não precisa do servidor no ar. Com --local, grava nos Parquet de dados/.
"""
import json
import re
import sys
from datetime import date, timedelta

# Os dados moram na nuvem (repositório privado organizador-dados): liga ANTES de importar
# os módulos de dados. Com --local, grava nos Parquet de dados/ como antes da nuvem.
from organizador import nuvem

NA_NUVEM = "--local" not in sys.argv
if NA_NUVEM:
    nuvem.ativar()
    nuvem.puxar()

from organizador import estado, medidas, pesos, semanas, shape_inteligencia  # noqa: E402 — depois do ativar()

ACADEMIA = re.compile(r"gym|academia|muscula|treino", re.I)
JIU = re.compile(r"jiu", re.I)


def contar_no_concluidos(dia: str) -> dict:
    """Dias, nos 7 que terminam em `dia`, em que academia e jiu aparecem no Concluídos."""
    inicio = (date.fromisoformat(dia) - timedelta(days=6)).isoformat()
    historico = json.loads(estado.tudo().get("ritmo.history.v1") or "[]")
    da_semana = [h for h in historico if inicio <= (h.get("date") or "") <= dia]
    return {
        "treinos_academia": len({h["date"] for h in da_semana if ACADEMIA.search(h.get("name") or "")}),
        "treinos_jiu": len({h["date"] for h in da_semana if JIU.search(h.get("name") or "")}),
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    with open([a for a in sys.argv[1:] if a != "--local"][0], encoding="utf-8") as arquivo:
        dados = json.load(arquivo)
    dia = date.fromisoformat(dados.pop("data")).isoformat()

    anteriores = [s for s in semanas.listar() if s["data"] < dia]
    for campo in ("protocolo", "treino"):
        if campo not in dados and anteriores and anteriores[-1][campo]:
            dados[campo] = anteriores[-1][campo]
            print(f"{campo}: repetido do registro de {anteriores[-1]['data']}")
    contagem = contar_no_concluidos(dia)
    for campo, valor in contagem.items():
        if dados.get(campo) is None:
            dados[campo] = valor
            print(f"{campo}: {valor} (contado no Concluídos)")
        elif dados[campo] != valor:
            print(f"{campo}: {dados[campo]} informado — o Concluídos tem {valor}")

    if any(s["data"] == dia for s in semanas.listar()):
        print(f"Substituindo o registro que já existia em {dia}.")
    # A fita mora em medidas.py, por dia: se vier junto do registro de sexta, vai para lá.
    fita = {campo: dados.pop(campo) for campo in list(dados) if campo in (*medidas.CAMPOS, "metodo")}
    semanas.definir(dia, dados)
    print(f"Registro de {dia} gravado.")
    if any(fita.get(campo) is not None for campo in medidas.CAMPOS):
        medidas.definir(dia, fita)
        print(f"Medidas na fita de {dia} gravadas.")
    print()

    leitura = shape_inteligencia.analisar(semanas.listar(), pesos.listar(), medidas.listar())
    for dica in leitura["dicas"]:
        print(f"[{dica['tipo']}] {dica['titulo']}\n    {dica['texto']}")
    if NA_NUVEM:
        nuvem.regravar_analise()
        dia_br = date.fromisoformat(dia).strftime("%d/%m/%Y")
        enviado = nuvem.enviar(f"Shape: registro de sexta de {dia_br}")
        print("\nEnviado para a nuvem (a página e o celular já mostram)." if enviado else "\nNada mudou: nada a enviar.")


if __name__ == "__main__":
    main()
