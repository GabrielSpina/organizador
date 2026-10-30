"""Leitura e gravação das tabelas em Parquet.

Cada tabela é um arquivo. A gravação é atômica (escreve num `.tmp` e troca),
para que um desligamento no meio nunca deixe um arquivo pela metade.
"""
import os
import threading
from datetime import datetime
from pathlib import Path

import pandas as pd

TRAVA = threading.RLock()


def agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def ler_registros(caminho: Path) -> list[dict]:
    """Devolve as linhas como dicionários; ausente vira None, nunca zero."""
    with TRAVA:
        if not caminho.exists():
            return []
        tabela = pd.read_parquet(caminho)
    tabela = tabela.astype(object).where(pd.notna(tabela), None)
    return tabela.to_dict("records")


def gravar_registros(caminho: Path, registros: list[dict], colunas: list[str]) -> None:
    tabela = pd.DataFrame(registros, columns=colunas)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    temporario = caminho.with_suffix(".tmp")
    with TRAVA:
        tabela.to_parquet(temporario, index=False)
        os.replace(temporario, caminho)
