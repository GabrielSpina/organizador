"""Grava medidas na fita da área Shape (a circunferência da cintura) — usado pelo Claude.

O analista manda as medidas pelo chat; o Claude monta um JSON e roda:

    python registrar_medidas.py medidas.json

Formato: {"metodo": "...", "historico": [{"data": "AAAA-MM-DD",
"cintura_cm": 86.5}, ...]}.
`metodo` é opcional: sem ele, repete o da medida anterior. Trocar de método é
o que separa uma série da outra — medidas de métodos diferentes não se
comparam. Campo ausente num dia preserva o que já estava gravado.

No fim imprime a leitura das semanas, que já inclui a série da fita.
"""
import json
import sys

from organizador import medidas, pesos, semanas, shape_inteligencia


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    with open(sys.argv[1], encoding="utf-8") as arquivo:
        dados = json.load(arquivo)
    for linha in dados["historico"]:
        if dados.get("metodo") and "metodo" not in linha:
            linha["metodo"] = dados["metodo"]
        gravada = medidas.definir(linha["data"], linha)
        print(f"{gravada['data']}: cintura {gravada['cintura_cm']} cm ({gravada['metodo']})")
    print()
    for dica in shape_inteligencia.analisar(semanas.listar(), pesos.listar(), medidas.listar())["dicas"]:
        print(f"[{dica['tipo']}] {dica['titulo']}\n    {dica['texto']}")


if __name__ == "__main__":
    main()
