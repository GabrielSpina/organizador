"""Recalcula a leitura "o que funcionou" (analise.json) a partir dos JSON da nuvem.

    python regravar_analise.py <pasta com pesos.json, medidas.json e semanas.json>

Quem roda é a automação do repositório organizador-dados, no próprio GitHub, toda vez
que um peso, uma medida ou um registro de sexta muda — inclusive quando a mudança vem
da página no celular. Só usa Python puro (o pandas fica de fora no formato JSON).
"""
import os
import sys
from pathlib import Path

pasta = Path(sys.argv[1]).resolve()
os.environ["ORGANIZADOR_DADOS"] = str(pasta)
os.environ["ORGANIZADOR_FORMATO"] = "json"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from organizador import nuvem  # noqa: E402 — depois de apontar a pasta

nuvem.regravar_analise()
print(f"analise.json recalculada em {pasta}")
