"""Copia os dados do organizador local (Parquet em dados/) para os JSON do repositório privado.

    python exportar_para_nuvem.py <pasta do clone do organizador-dados>

Gera estado.json, pesos.json, medidas.json, semanas.json e analise.json — listas de
registros no mesmo formato dos Parquet, que é o que o web/nuvem.js lê e grava. Não faz
commit nem push: isso fica para quem roda (o Claude), depois de conferir.

Os chats (chats.parquet, mensagens/) e os grupos ficam só no computador: eles dependem
do Claude instalado aqui e não têm uso na versão da web.
"""
import datetime
import json
import sys
from pathlib import Path

from organizador import armazem, medidas, pesos, semanas, shape_inteligencia
from organizador.caminhos import ARQUIVO_ESTADO


def _para_json(valor):
    """Os Parquet devolvem tipos do numpy; o JSON só conhece os do Python."""
    import numpy as np
    if isinstance(valor, np.integer):
        return int(valor)
    if isinstance(valor, np.floating):
        return float(valor)
    if isinstance(valor, np.bool_):
        return bool(valor)
    if isinstance(valor, np.ndarray):
        return valor.tolist()
    if isinstance(valor, (datetime.date, datetime.datetime)):
        return valor.isoformat()
    raise TypeError(f"Tipo sem tradução para JSON: {type(valor)}")


def gravar(pasta: Path, nome: str, dados) -> None:
    texto = json.dumps(dados, ensure_ascii=False, indent=1, default=_para_json) + "\n"
    (pasta / nome).write_text(texto, encoding="utf-8", newline="\n")
    tamanho = len(dados) if isinstance(dados, list) else "objeto"
    print(f"{nome}: {tamanho} registro(s), {len(texto.encode('utf-8')):,} bytes".replace(",", "."))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    pasta = Path(sys.argv[1])
    if not pasta.is_dir():
        raise SystemExit(f"A pasta não existe: {pasta}")
    lista_semanas, lista_pesos, lista_medidas = semanas.listar(), pesos.listar(), medidas.listar()
    gravar(pasta, "estado.json", armazem.ler_registros(ARQUIVO_ESTADO))
    gravar(pasta, "pesos.json", lista_pesos)
    gravar(pasta, "medidas.json", lista_medidas)
    gravar(pasta, "semanas.json", lista_semanas)
    gravar(pasta, "analise.json", shape_inteligencia.analisar(lista_semanas, lista_pesos, lista_medidas))


if __name__ == "__main__":
    main()
