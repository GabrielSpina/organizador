"""Onde mora cada coisa do organizador.

Tudo o que o organizador guarda fica dentro de `dados/`, ao lado do código.
O Claude Desktop e o CLI do Claude Code moram fora daqui e são só LIDOS
(o Desktop) ou executados (o CLI) — o organizador nunca escreve neles.
"""
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA_WEB = RAIZ / "web"
# ORGANIZADOR_DADOS existe só para testar com uma cópia, sem tocar nos dados de verdade.
PASTA_DADOS = Path(os.environ.get("ORGANIZADOR_DADOS") or RAIZ / "dados")
PASTA_MENSAGENS = PASTA_DADOS / "mensagens"

ARQUIVO_ESTADO = PASTA_DADOS / "estado.parquet"
ARQUIVO_GRUPOS = PASTA_DADOS / "grupos.parquet"
ARQUIVO_CHATS = PASTA_DADOS / "chats.parquet"

def _pasta_claude_desktop() -> Path:
    """Onde o Claude Desktop guarda os dados dele. O lugar já mudou com atualização
    do app, então a pasta certa é achada pelo que tem dentro (`claude-code-sessions`),
    não por um caminho fixo. Em ordem:

    1. `%LOCALAPPDATA%\\Claude-Data\\claude_*` — desde 10/2026. A pasta do pacote
       ficou só com o aviso `.user-data-left.claude_*` e os dados vieram para cá;
    2. `%LOCALAPPDATA%\\Packages\\Claude_*\\LocalCache\\Roaming\\Claude` — o app
       empacotado (MSIX) de antes: só os processos de dentro do pacote veem isso em
       `%APPDATA%\\Claude`, e o organizador, rodando de fora, precisa do caminho real;
    3. `%APPDATA%\\Claude` — a instalação comum.
    Havendo mais de uma com sessões, vale a de configuração gravada por último."""
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    candidatas = [
        *local.glob("Claude-Data/claude_*"),
        *local.glob("Packages/Claude_*/LocalCache/Roaming/Claude"),
        Path(os.environ.get("APPDATA", "")) / "Claude",
    ]
    com_sessoes = [p for p in candidatas if (p / "claude-code-sessions").exists()]
    if not com_sessoes:
        return candidatas[-1]
    def gravada_em(pasta: Path) -> float:
        try:
            return (pasta / "claude_desktop_config.json").stat().st_mtime
        except OSError:
            return 0.0
    return max(com_sessoes, key=gravada_em)


# Claude Desktop (só leitura): grupos do sidebar e metadados das sessões.
PASTA_CLAUDE_DESKTOP = _pasta_claude_desktop()
CONFIG_DESKTOP = PASTA_CLAUDE_DESKTOP / "claude_desktop_config.json"
SESSOES_DESKTOP = PASTA_CLAUDE_DESKTOP / "claude-code-sessions"
VERSOES_CLI_DESKTOP = PASTA_CLAUDE_DESKTOP / "claude-code"

# Transcrições de todas as sessões do Claude Code (Desktop e CLI).
PROJETOS_CLAUDE = Path.home() / ".claude" / "projects"

PORTA = int(os.environ.get("ORGANIZADOR_PORTA", "8765"))
