"""Publica a página de notícias na versão online (GitHub Pages).

    python C:\\Users\\gabriel.spina\\Desktop\\organizador\\publicar_noticias.py

Roda no fim de cada atualização das notícias (o chat "Noticias" chama). Envia SÓ o
web/noticias/index.html: qualquer outra mudança na pasta fica como está, para ser
publicada de propósito, e não de carona. O GitHub publica sozinho em 1 ou 2 minutos.
Funciona de qualquer pasta. Sem mudança na página, não faz nada.
"""
import subprocess
import sys
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PAGINA = "web/noticias/index.html"


def git(*argumentos: str, conferir: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(RAIZ), *argumentos], capture_output=True, text=True,
                          encoding="utf-8", check=conferir)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if not git("status", "--porcelain", "--", PAGINA).stdout.strip():
        print("A página de notícias não mudou desde a última publicação: nada a enviar.")
        return 0
    # Traz o que já está no GitHub antes, para o envio não ser recusado.
    puxar = git("pull", "--rebase", "--autostash", "-q", conferir=False)
    if puxar.returncode:
        print("Não consegui atualizar a cópia local com o GitHub:\n" + (puxar.stderr or puxar.stdout))
        return 1
    git("add", "--", PAGINA)
    momento = datetime.now().strftime("%d/%m/%Y %H:%M")
    git("commit", "-q", "-m", f"Notícias de {momento}", "--", PAGINA)
    enviar = git("push", "-q", conferir=False)
    if enviar.returncode:
        print("O commit foi feito, mas o envio ao GitHub falhou:\n" + (enviar.stderr or enviar.stdout))
        return 1
    print(f"Notícias de {momento} enviadas. A versão online atualiza em 1 a 2 minutos:")
    print("https://gabrielspina.github.io/organizador/noticias/index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
