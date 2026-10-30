"""Leitura e gravação das tabelas: Parquet (o organizador local) ou JSON (a nuvem).

Cada tabela é um arquivo. A gravação é atômica (escreve num `.tmp` e troca),
para que um desligamento no meio nunca deixe um arquivo pela metade.

Formato: com `ORGANIZADOR_FORMATO=json` (ligado por `organizador.nuvem.ativar()`),
cada tabela vira `<nome>.json` — uma lista de registros, exatamente o que a página
da web (web/nuvem.js) lê e grava no repositório organizador-dados. Sem a variável,
continua o Parquet de sempre, em dados/. Os módulos não mudam: pedem
`pesos.parquet` e o armazém troca para `pesos.json` quando a nuvem está ligada.
"""
import json
import os
import threading
from datetime import date, datetime
from pathlib import Path

TRAVA = threading.RLock()


def agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def em_json() -> bool:
    return os.environ.get("ORGANIZADOR_FORMATO") == "json"


def _arquivo(caminho: Path) -> Path:
    return caminho.with_suffix(".json") if em_json() else caminho


def para_json(valor):
    """Tipos que o JSON não conhece (os do numpy, datas) viram os do Python."""
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    try:
        import numpy as np
    except ImportError:
        np = None
    if np is not None:
        if isinstance(valor, np.integer):
            return int(valor)
        if isinstance(valor, np.floating):
            return float(valor)
        if isinstance(valor, np.bool_):
            return bool(valor)
        if isinstance(valor, np.ndarray):
            return valor.tolist()
    raise TypeError(f"Tipo sem tradução para JSON: {type(valor)}")


def gravar_json(caminho: Path, dados) -> None:
    """Mesmo formato do nuvem.js e do exportar_para_nuvem.py: recuo 1, UTF-8, fim de linha LF."""
    caminho.parent.mkdir(parents=True, exist_ok=True)
    temporario = caminho.with_suffix(".tmp")
    texto = json.dumps(dados, ensure_ascii=False, indent=1, default=para_json) + "\n"
    with TRAVA:
        temporario.write_text(texto, encoding="utf-8", newline="\n")
        os.replace(temporario, caminho)


def ler_registros(caminho: Path) -> list[dict]:
    """Devolve as linhas como dicionários; ausente vira None, nunca zero."""
    caminho = _arquivo(caminho)
    with TRAVA:
        if not caminho.exists():
            return []
        if caminho.suffix == ".json":
            return json.loads(caminho.read_text(encoding="utf-8") or "[]")
        import pandas as pd
        tabela = pd.read_parquet(caminho)
    tabela = tabela.astype(object).where(pd.notna(tabela), None)
    return tabela.to_dict("records")


def gravar_registros(caminho: Path, registros: list[dict], colunas: list[str]) -> None:
    caminho = _arquivo(caminho)
    if caminho.suffix == ".json":
        gravar_json(caminho, [{coluna: r.get(coluna) for coluna in colunas} for r in registros])
        return
    import pandas as pd
    tabela = pd.DataFrame(registros, columns=colunas)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    temporario = caminho.with_suffix(".tmp")
    with TRAVA:
        tabela.to_parquet(temporario, index=False)
        os.replace(temporario, caminho)
