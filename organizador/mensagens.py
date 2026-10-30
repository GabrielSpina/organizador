"""Traduz eventos do Claude Code em mensagens legíveis.

O mesmo formato aparece em dois lugares: na saída `stream-json` de um chat
que o organizador está executando e nas transcrições `.jsonl` que o Claude
Code grava em `~/.claude/projects`. Os dois passam por aqui.

Papéis: `usuario`, `assistente`, `ferramenta` (resumo de uma ação do Claude),
`erro` e `sistema` (avisos do próprio organizador).
"""
import json
import re

_LEMBRETE = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
_TAGS_DE_COMANDO = re.compile(r"</?(command-[a-z-]+|local-command-[a-z-]+)>")
_TAMANHO_RESUMO = 160


def _resumo_ferramenta(nome: str, entrada: dict) -> str:
    """Uma linha dizendo o que a ferramenta fez: o comando, o arquivo, a busca."""
    entrada = entrada or {}
    for campo in ("description", "command", "file_path", "pattern", "query", "url", "prompt"):
        valor = entrada.get(campo)
        if isinstance(valor, str) and valor.strip():
            texto = " ".join(valor.split())
            if len(texto) > _TAMANHO_RESUMO:
                texto = texto[: _TAMANHO_RESUMO - 1] + "…"
            return f"{nome} · {texto}"
    return nome


def _limpar_texto_usuario(texto: str) -> str:
    texto = _LEMBRETE.sub("", texto)
    texto = _TAGS_DE_COMANDO.sub("", texto)
    return texto.strip()


def de_evento(evento: dict) -> list[tuple[str, str]]:
    """Mensagens (papel, texto) contidas num evento; vazio se não houver nenhuma."""
    tipo = evento.get("type")
    if evento.get("isSidechain") or evento.get("isMeta"):
        return []
    mensagem = evento.get("message") or {}
    conteudo = mensagem.get("content")

    if tipo == "assistant":
        saida = []
        for bloco in conteudo or []:
            if bloco.get("type") == "text" and bloco.get("text", "").strip():
                saida.append(("assistente", bloco["text"].strip()))
            elif bloco.get("type") == "tool_use":
                saida.append(("ferramenta", _resumo_ferramenta(bloco.get("name", "?"), bloco.get("input"))))
        return saida

    if tipo == "user":
        if isinstance(conteudo, str):
            texto = _limpar_texto_usuario(conteudo)
            return [("usuario", texto)] if texto else []
        saida = []
        for bloco in conteudo or []:
            if bloco.get("type") == "text":
                texto = _limpar_texto_usuario(bloco.get("text", ""))
                if texto:
                    saida.append(("usuario", texto))
            elif bloco.get("type") == "tool_result" and bloco.get("is_error"):
                detalhe = bloco.get("content")
                if not isinstance(detalhe, str):
                    detalhe = json.dumps(detalhe, ensure_ascii=False)
                saida.append(("erro", "Ferramenta falhou: " + detalhe[:400]))
        return saida

    return []
