# Organizador

O organizador pessoal (cards, tags, projetos, concluídos, notícias) trazido de
`Documents\ChatGPT\News` e transformado em **orquestrador dos chats do Claude**.

## Abrir

**Na web (de qualquer aparelho):** https://gabrielspina.github.io/organizador/
— publicado pelo GitHub Pages a partir da pasta `web/` (ver "Na nuvem", abaixo).

**No computador, com a aba Chats:** dois cliques em **`Iniciar Organizador.bat`**.
Ele sobe um servidor local em `http://127.0.0.1:8765/` e abre o navegador.

## Na nuvem

Dois repositórios no GitHub da conta GabrielSpina:

| Repositório | Visibilidade | O que tem |
|---|---|---|
| `organizador` (este) | **público** — o Pages grátis só publica repositório público | só código. Nenhum dado pessoal: o `.gitignore` deixa de fora `dados/`, as anotações do painel e as fotos originais |
| `organizador-dados` | **privado** | os dados, em JSON: `estado.json` (cards, tags, projetos, histórico…), `pesos.json`, `medidas.json`, `semanas.json`, `analise.json` |

- **Login, uma vez por máquina.** Sem a chave, a página pede uma *chave de acesso
  do GitHub* (um *fine-grained token* que só abre o `organizador-dados`, com
  *Contents: Read and write*). Ela fica guardada naquele navegador e a página
  entra direto nas próximas vezes. **Sair desta máquina** (no selo do canto)
  apaga a chave e os dados daquele navegador. Perdeu um aparelho: apague a chave
  dele no GitHub (*Settings → Developer settings → Fine-grained tokens*).
- **Como grava.** As telas continuam chamando `/api/...`, como no servidor local;
  o `web/nuvem.js` atende esses endereços no próprio navegador e grava os
  arquivos do repositório privado, juntando as mudanças de alguns segundos num
  commit. Se outra máquina gravou no meio, ele lê de novo e reaplica. O selo do
  canto diz se está tudo salvo. Cada mudança fica no histórico do repositório.
- **O que só existe no computador:** a aba **Chats** (roda o Claude instalado) e
  o **Painel** (anotações do trabalho, fora do git).
- **No computador com a chave:** o organizador local também passa a usar os dados
  da nuvem (e a aba Chats continua). Sem a chave, usa os Parquet de `dados/`,
  como antes.
- **Migração:** `python exportar_para_nuvem.py <clone do organizador-dados>`
  gera os JSON a partir dos Parquet.
- **O que o Claude grava pelo chat** (registro de sexta, medidas) também vai para a
  nuvem: `registrar_semana.py` e `registrar_medidas.py` trazem o clone
  `Desktop\organizador-dados` do GitHub, gravam nos JSON, recalculam o `analise.json`
  e enviam (`organizador/nuvem.py`). Com `--local`, gravam nos Parquet, como antes.
- **A leitura "o que funcionou"** é recalculada sozinha: a automação do
  `organizador-dados` (`.github/workflows/analise.yml`) roda o `regravar_analise.py`
  daqui toda vez que `pesos.json`, `medidas.json` ou `semanas.json` mudam — inclusive
  pelo celular. Leva cerca de 1 minuto.
- **A agenda da página de Notícias** também mora na nuvem (o `agenda.js` carrega o
  `nuvem.js` quando o navegador tem a chave).
- **No computador sem a chave**, a página avisa que mostra os dados antigos (os
  Parquet pararam em 30/10/2026) e oferece entrar.

## A aba 💬 Chats

- **Grupos**: os grupos do sidebar do Claude Desktop aparecem sozinhos (selo
  *Desktop*). Também dá para criar grupos só do organizador.
- **Chats do Desktop**: aparecem com a conversa, **só para leitura**. Botões:
  *Abrir no Claude Desktop* e *Continuar no organizador* (uma cópia que já
  começa com a conversa inteira; o original não muda).
- **Chats do organizador**: você cria o chat (título, grupo, pasta de trabalho,
  modelo, permissões) e conversa por aqui. Quem executa é o Claude Code,
  sem abrir janela; vários chats podem rodar ao mesmo tempo. *Abrir no Claude
  Desktop* / *Abrir no terminal* continuam a mesma conversa fora daqui.
- **Rotina**: um prompt salvo, que roda com um clique (▶ Rodar rotina). O chat
  **Notícias do dia** já vem cadastrado com o prompt de
  `web/noticias/PROMPT_ATUALIZACAO.md`.

### Primeira vez: login

O `claude.exe` que vem com o Claude Desktop precisa de um login próprio para
rodar fora do Desktop. A aba Chats mostra o aviso e o botão **Entrar no
Claude**, que abre a janela de login. É uma vez só.

## Onde fica cada coisa

| Caminho | O quê |
|---|---|
| `servidor.py` | servidor local: entrega as telas e a API |
| `organizador/` | o código Python (um módulo por assunto) |
| `web/` | as telas. `inicio.js` decide de onde vêm os dados e carrega as telas; `nuvem.js` é o modo nuvem (login + GitHub); `_persistencia.js` liga as telas ao servidor local |
| `dados/estado.parquet` | cards, tags, projetos, histórico e agenda de notícias (o que antes ficava no navegador) |
| `dados/grupos.parquet` | grupos do organizador + cor/pasta dos grupos do Desktop |
| `dados/chats.parquet` | um chat do organizador por linha |
| `dados/mensagens/<id>.parquet` | a conversa de cada chat |
| `dados/pesos.parquet` | Shape → Diário: uma pesagem por dia |
| `dados/semanas.parquet` | Shape → Semanal: bioimpedância, protocolo, treino, dieta, frequência e comentário de cada sexta. A tela só mostra; quem grava é o Claude, pelo chat, com `registrar_semana.py` |
| `dados/medidas.parquet` | Shape → Diário: circunferência da cintura por dia, com o método de medição. Quem grava é o Claude, com `registrar_medidas.py` |
| `organizador/shape_inteligencia.py` | a leitura das semanas: compara os resultados por fator (dieta, jiu, academia, protocolo) e diz o que funcionou |

O organizador **só lê** o Claude Desktop (`%APPDATA%\Claude`) — renomear,
mudar de grupo ou arquivar um chat do Desktop continua sendo feito lá.

## Trazer os dados do organizador antigo

Os dados antigos estão no navegador. Abra `exportar_organizador_antigo.html`
com dois cliques, no mesmo navegador de antes, baixe o arquivo e importe na
aba Chats (“Importar dados do organizador antigo”).

## Segurança

O servidor só atende em `127.0.0.1` e recusa qualquer chamada que mude algo
sem o cabeçalho `X-Organizador`. Isso impede que um site aberto no navegador
mande o Claude executar coisas aqui.
