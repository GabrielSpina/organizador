// Aba Chats: orquestra os grupos e chats do Claude.
// Mostra os chats do Claude Desktop (só leitura) junto com os chats criados aqui,
// que o servidor executa pelo Claude Code e guarda em dados/*.parquet.
(()=>{
  // Os chats rodam o Claude instalado no computador: só existem no organizador local.
  if(!window.ORGANIZADOR?.servidorLocal)return;
  const api=async(metodo,caminho,corpo)=>{
    const resposta=await fetch(caminho,{method:metodo,headers:{'Content-Type':'application/json','X-Organizador':'1'},body:corpo===undefined?undefined:JSON.stringify(corpo)});
    const dados=await resposta.json().catch(()=>({}));
    if(!resposta.ok)throw new Error(dados.erro||('Erro '+resposta.status));
    return dados;
  };
  const MODELOS=[['','Padrão da conta'],['opus','Opus'],['sonnet','Sonnet'],['haiku','Haiku'],['fable','Fable']];
  const ESFORCOS=[['','Padrão'],['low','Baixo'],['medium','Médio'],['high','Alto'],['xhigh','Muito alto'],['max','Máximo']];
  const MODOS={auto:'Automático — o Claude decide o que é seguro fazer sozinho',acceptEdits:'Edita arquivos; comandos que pedem permissão são negados',plan:'Só lê e planeja; não altera nada',dontAsk:'Só usa o que já está liberado nas configurações',bypassPermissions:'Faz tudo sem perguntar (use só em pasta descartável)'};
  const STATUS={ocioso:'Pronto',executando:'Executando…',erro:'Erro',interrompido:'Interrompido'};
  let grupos=[],chatsOrg=[],chatsDesk=[],claude=null;
  let grupoSel='todos',chatSel=null,mensagens=[],busca='';
  let timerLista=null,timerConversa=null,carregando=false;

  const quando=iso=>{if(!iso)return '';const d=new Date(iso);if(isNaN(d))return '';const hoje=new Date();return d.toDateString()===hoje.toDateString()?d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})};
  const dinheiro=v=>v==null?'—':'US$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
  const grupoDe=id=>grupos.find(g=>g.id===id);
  function marcado(texto){
    let h=esc(texto||'');
    h=h.replace(/```([\s\S]*?)```/g,(_,c)=>`<pre>${c.replace(/^\w*\n/,'')}</pre>`);
    h=h.replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>');
    h=h.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,'$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return h;
  }

  // --- navegação -----------------------------------------------------------
  const navItem=document.createElement('div');
  navItem.className='nav';navItem.dataset.view='chats';navItem.textContent='💬 Chats';
  document.querySelector('.side .hint').before(navItem);
  const pagina=document.createElement('section');
  pagina.className='chats-page';pagina.hidden=true;
  pagina.innerHTML=`<div class="chats-login" hidden></div>
  <div class="chats-grid">
    <aside class="chats-col chats-grupos"><div class="chats-col-head"><h2>Grupos</h2><button type="button" class="chats-mini" data-acao="novo-grupo">＋ Grupo</button></div><div class="chats-grupo-lista"></div>
      <div class="chats-importar"><label class="chats-link">Importar dados do organizador antigo<input type="file" accept=".json,application/json" hidden></label></div></aside>
    <section class="chats-col chats-lista"><div class="chats-col-head"><h2 class="chats-lista-titulo">Todos os chats</h2><button type="button" class="add chats-novo" data-acao="novo-chat">＋ Novo chat</button></div><input class="chats-busca" type="search" placeholder="Buscar chat" aria-label="Buscar chat"><div class="chats-itens"></div></section>
    <section class="chats-col chats-conversa"><div class="chats-vazio">Escolha um chat ao lado, ou crie um novo.</div></section>
  </div>`;
  document.querySelector('.main').append(pagina);
  const $p=s=>pagina.querySelector(s);

  navItem.onclick=()=>{view='chats';nav();render();window.scrollTo({top:0})};
  const renderAntesDosChats=render;
  render=function(){
    renderAntesDosChats();
    const ativo=view==='chats';
    document.querySelector('.app').classList.toggle('chats-view',ativo);
    pagina.hidden=!ativo;
    if(ativo){
      document.querySelector('#title').textContent='Chats';
      document.querySelector('.head .muted').textContent='Os chats do Claude Desktop e os do organizador, por grupo. Os do organizador rodam daqui.';
      if(!timerLista){carregar();timerLista=setInterval(carregar,5000)}
    }else if(timerLista){clearInterval(timerLista);timerLista=null;pararConversa()}
  };

  // --- dados ---------------------------------------------------------------
  async function carregar(){
    if(carregando)return;carregando=true;
    try{
      const [g,c]=await Promise.all([api('GET','/api/grupos'),api('GET','/api/chats')]);
      grupos=g;chatsOrg=c.organizador;chatsDesk=c.desktop;
      if(!claude||!claude.logado)claude=await api('GET','/api/claude/status');
      desenharLogin();desenharGrupos();desenharLista();
      if(chatSel?.tipo==='org')atualizarCabecalho();
    }catch(erro){$p('.chats-login').hidden=false;$p('.chats-login').innerHTML=`<b>Sem conexão com o servidor do organizador.</b> Abra o “Iniciar Organizador.bat”. (${esc(erro.message)})`}
    finally{carregando=false}
  }
  function desenharLogin(){
    const caixa=$p('.chats-login');
    if(claude?.logado){caixa.hidden=true;return}
    caixa.hidden=false;
    caixa.innerHTML=claude?.executavel?`<b>O Claude Code deste computador ainda não está logado.</b> Os chats do Desktop aparecem, mas os do organizador só rodam depois que você entrar — uma vez só, pelo navegador. <button type="button" class="chats-mini" data-acao="login">Entrar no Claude</button>`:`<b>Não achei o Claude Code.</b> O organizador procura o claude.exe que vem com o Claude Desktop.`;
  }

  // --- grupos --------------------------------------------------------------
  function chatsDoGrupo(id){
    const filtro=c=>id==='todos'||(id==='sem-grupo'?!c.grupo_id||!grupoDe(c.grupo_id):c.grupo_id===id);
    const termo=busca.toLocaleLowerCase('pt-BR');
    const casa=c=>!termo||(c.titulo||'').toLocaleLowerCase('pt-BR').includes(termo);
    return [...chatsOrg.filter(filtro).filter(casa).map(c=>({...c,tipo:'org'})),...chatsDesk.filter(filtro).filter(casa).map(c=>({...c,tipo:'desk'}))]
      .sort((a,b)=>(b.executando?1:0)-(a.executando?1:0)||(b.atualizado_em||'').localeCompare(a.atualizado_em||''));
  }
  function desenharGrupos(){
    const semGrupo=chatsDoGrupo('sem-grupo').length;
    const linhas=[{id:'todos',nome:'Todos os chats',cor:'#8e929b',total:chatsOrg.length+chatsDesk.length},
      ...grupos.map(g=>({...g,total:g.chats_desktop+g.chats_organizador})),
      ...(semGrupo?[{id:'sem-grupo',nome:'Sem grupo',cor:'#c3c7cc',total:semGrupo}]:[])];
    $p('.chats-grupo-lista').innerHTML=linhas.map(g=>`<div class="chats-grupo ${g.id===grupoSel?'sel':''}" data-grupo="${esc(g.id)}" style="--cor:${esc(g.cor||'#8e929b')}"><span class="chats-ponto"></span><span class="chats-grupo-nome">${esc(g.nome)}</span>${g.origem==='desktop'?'<span class="chats-origem" title="Grupo do Claude Desktop">🖥</span>':''}<small>${g.total}</small>${g.origem?`<button type="button" class="chats-icone" data-editar-grupo="${esc(g.id)}" title="Editar grupo">✎</button>`:''}</div>`).join('');
    pagina.querySelectorAll('.chats-grupo').forEach(el=>el.onclick=e=>{if(e.target.closest('[data-editar-grupo]'))return;grupoSel=el.dataset.grupo;desenharGrupos();desenharLista()});
    pagina.querySelectorAll('[data-editar-grupo]').forEach(b=>b.onclick=()=>abrirGrupo(grupoDe(b.dataset.editarGrupo)));
  }

  // --- lista ---------------------------------------------------------------
  function desenharLista(){
    const g=grupoDe(grupoSel);
    $p('.chats-lista-titulo').textContent=grupoSel==='todos'?'Todos os chats':grupoSel==='sem-grupo'?'Sem grupo':g?.nome||'Chats';
    const itens=chatsDoGrupo(grupoSel);
    $p('.chats-itens').innerHTML=itens.length?itens.map(c=>{
      const sel=chatSel&&chatSel.id===c.id;
      const estado=c.tipo==='org'?(c.executando?'executando':c.status):null;
      return `<div class="chats-item ${sel?'sel':''} ${c.tipo}" data-chat="${esc(c.id)}" data-tipo="${c.tipo}"><div class="chats-item-topo"><b>${esc(c.titulo)}</b><small>${quando(c.atualizado_em)}</small></div><div class="chats-item-meta">${c.tipo==='desk'?'<span class="chats-selo">Desktop</span>':'<span class="chats-selo org">Organizador</span>'}${estado&&estado!=='ocioso'?`<span class="chats-status ${estado}">${STATUS[estado]||esc(estado)}</span>`:''}${c.prompt_rotina?'<span class="chats-selo rotina">Rotina</span>':''}${grupoSel==='todos'&&grupoDe(c.grupo_id)?`<span class="chats-grupo-tag" style="--cor:${esc(grupoDe(c.grupo_id).cor)}">${esc(grupoDe(c.grupo_id).nome)}</span>`:''}</div></div>`}).join(''):'<div class="chats-vazio pequeno">Nenhum chat aqui ainda.</div>';
    pagina.querySelectorAll('.chats-item').forEach(el=>el.onclick=()=>selecionar(el.dataset.tipo,el.dataset.chat));
  }
  $p('.chats-busca').oninput=e=>{busca=e.target.value;desenharLista()};

  // --- conversa ------------------------------------------------------------
  function pararConversa(){if(timerConversa){clearTimeout(timerConversa);timerConversa=null}}
  async function selecionar(tipo,id){
    pararConversa();chatSel={tipo,id};mensagens=[];desenharLista();
    const painel=$p('.chats-conversa');
    painel.innerHTML='<div class="chats-vazio">Carregando…</div>';
    try{
      if(tipo==='desk'){
        const r=await api('GET',`/api/desktop/${id}/mensagens`);
        if(chatSel?.id!==id)return;
        mensagens=r.mensagens;desenharConversa(r.chat);
      }else{
        await puxarMensagens(true);
      }
    }catch(erro){painel.innerHTML=`<div class="chats-vazio">Não consegui abrir: ${esc(erro.message)}</div>`}
  }
  async function puxarMensagens(primeira){
    const id=chatSel?.id;if(!id||chatSel.tipo!=='org')return;
    const r=await api('GET',`/api/chats/${id}/mensagens?desde=${primeira?0:mensagens.length}`);
    if(chatSel?.id!==id)return;
    const idx=chatsOrg.findIndex(c=>c.id===id);if(idx>=0)chatsOrg[idx]=r.chat;
    if(primeira){mensagens=r.mensagens;desenharConversa(r.chat)}
    else{if(r.mensagens.length){mensagens.push(...r.mensagens);acrescentar(r.mensagens)}atualizarCabecalho()}
    pararConversa();
    timerConversa=setTimeout(()=>puxarMensagens(false).catch(()=>{}),r.chat.executando?1200:6000);
  }
  function htmlMensagem(m){
    const classe={usuario:'eu',assistente:'claude',ferramenta:'acao',erro:'falha',sistema:'aviso'}[m.papel]||'aviso';
    if(m.papel==='ferramenta')return `<div class="msg acao">⚙ ${esc(m.texto)}</div>`;
    return `<div class="msg ${classe}"><div class="msg-corpo">${marcado(m.texto)}</div>${m.criado_em?`<small>${quando(m.criado_em)}</small>`:''}</div>`;
  }
  function chatAtual(){return chatSel?.tipo==='org'?chatsOrg.find(c=>c.id===chatSel.id):chatsDesk.find(c=>c.id===chatSel?.id)}
  function desenharConversa(chat){
    const painel=$p('.chats-conversa'),org=chatSel.tipo==='org';
    painel.innerHTML=`<div class="conv-cabeca"></div><div class="conv-mensagens">${mensagens.length?mensagens.map(htmlMensagem).join(''):'<div class="chats-vazio pequeno">Nenhuma mensagem ainda.</div>'}</div>${org?`<form class="conv-compor"><textarea rows="3" placeholder="Escreva para o Claude… (Ctrl+Enter envia)"></textarea><button class="add" type="submit">Enviar</button></form>`:`<div class="conv-nota">Este chat é do Claude Desktop: aqui ele é só leitura. Para conversar, abra no Desktop — ou continue numa cópia do organizador, que começa com toda esta conversa.</div>`}`;
    atualizarCabecalho(chat);
    const lista=painel.querySelector('.conv-mensagens');lista.scrollTop=lista.scrollHeight;
    if(org){
      const form=painel.querySelector('.conv-compor'),campo=form.querySelector('textarea');
      campo.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();form.requestSubmit()}};
      form.onsubmit=async e=>{
        e.preventDefault();const texto=campo.value.trim();if(!texto)return;
        try{await api('POST',`/api/chats/${chatSel.id}/mensagens`,{texto});campo.value='';await puxarMensagens(false)}
        catch(erro){toast(erro.message)}
      };
    }
  }
  function acrescentar(novas){
    const lista=$p('.conv-mensagens');if(!lista)return;
    const noFim=lista.scrollHeight-lista.scrollTop-lista.clientHeight<80;
    lista.querySelector('.chats-vazio')?.remove();
    lista.insertAdjacentHTML('beforeend',novas.map(htmlMensagem).join(''));
    if(noFim)lista.scrollTop=lista.scrollHeight;
  }
  function atualizarCabecalho(chatDado){
    const cabeca=$p('.conv-cabeca');if(!cabeca||!chatSel)return;
    const c=chatDado||chatAtual();if(!c)return;
    const org=chatSel.tipo==='org',g=grupoDe(c.grupo_id),estado=org?(c.executando?'executando':c.status):null;
    const meta=[g?esc(g.nome):'Sem grupo',`<span title="Pasta de trabalho">📁 ${esc(c.pasta||'—')}</span>`,c.modelo?esc(c.modelo):null,org?esc(c.modo_permissao):null,org?'Custo '+dinheiro(c.custo_usd):null].filter(Boolean).join(' · ');
    cabeca.innerHTML=`<div class="conv-titulo"><h2>${esc(c.titulo)}</h2>${org?`<span class="chats-status ${estado}">${STATUS[estado]||esc(estado||'')}</span>`:'<span class="chats-selo">Desktop</span>'}</div><div class="conv-meta">${meta}</div><div class="conv-acoes">${org?`
      ${c.prompt_rotina?`<button type="button" class="chats-mini forte" data-acao="rotina" ${c.executando?'disabled':''}>▶ Rodar rotina</button>`:''}
      ${c.executando?'<button type="button" class="chats-mini perigo" data-acao="parar">■ Parar</button>':''}
      <button type="button" class="chats-mini" data-acao="abrir-desktop" ${c.turnos?'':'disabled title="Mande a primeira mensagem antes"'}>Abrir no Claude Desktop</button>
      <button type="button" class="chats-mini" data-acao="abrir-terminal" ${c.turnos?'':'disabled'}>Abrir no terminal</button>
      <button type="button" class="chats-mini" data-acao="editar-chat">Editar</button>
      <button type="button" class="chats-mini perigo" data-acao="excluir-chat">Excluir</button>`:`
      <button type="button" class="chats-mini forte" data-acao="abrir-link">Abrir no Claude Desktop</button>
      <button type="button" class="chats-mini" data-acao="bifurcar">Continuar no organizador</button>
      <button type="button" class="chats-mini" data-acao="recarregar">Atualizar</button>`}</div>${org&&c.status==='erro'&&c.ultimo_erro?`<div class="conv-erro">${esc(c.ultimo_erro)}</div>`:''}`;
  }

  // --- formulários ---------------------------------------------------------
  const fundo=document.createElement('div');fundo.className='chats-modal-fundo';
  document.body.append(fundo);
  fundo.onclick=e=>{if(e.target===fundo)fecharModal()};
  function fecharModal(){fundo.classList.remove('show');fundo.innerHTML=''}
  const opcoes=(lista,valor)=>lista.map(([v,t])=>`<option value="${esc(v)}" ${v===(valor||'')?'selected':''}>${esc(t)}</option>`).join('');
  function abrirChat(chat){
    const novo=!chat;chat=chat||{grupo_id:grupoDe(grupoSel)?.id||null,modo_permissao:'auto'};
    const grupoInicial=grupoDe(chat.grupo_id);
    fundo.innerHTML=`<form class="chats-modal"><h2>${novo?'Novo chat':'Editar chat'}</h2><p>${novo?'O chat roda pelo Claude Code, na pasta escolhida. Você acompanha e conversa por aqui.':'As mudanças valem a partir da próxima mensagem.'}</p>
      <label>Título<input name="titulo" required maxlength="90" value="${esc(chat.titulo||'')}"></label>
      <div class="chats-duas"><label>Grupo<select name="grupo_id"><option value="">Sem grupo</option>${grupos.map(g=>`<option value="${esc(g.id)}" ${g.id===chat.grupo_id?'selected':''}>${esc(g.nome)}${g.origem==='desktop'?' (Desktop)':''}</option>`).join('')}</select></label>
      <label>Modelo<select name="modelo">${opcoes(MODELOS,chat.modelo)}</select></label></div>
      <label>Pasta de trabalho<input name="pasta" required value="${esc(chat.pasta||grupoInicial?.pasta_padrao||'')}" placeholder="C:\\Users\\...\\projeto"></label>
      <div class="chats-duas"><label>Permissões<select name="modo_permissao">${Object.keys(MODOS).map(m=>`<option value="${m}" ${m===chat.modo_permissao?'selected':''}>${m}</option>`).join('')}</select><small class="chats-dica modo-dica"></small></label>
      <label>Esforço<select name="esforco">${opcoes(ESFORCOS,chat.esforco)}</select></label></div>
      ${novo?'<label>Primeira mensagem (opcional)<textarea name="mensagem" rows="4" placeholder="Se preencher, o chat já começa executando."></textarea></label>':''}
      <details ${chat.prompt_rotina?'open':''}><summary>Rotina — um prompt salvo para rodar com um clique</summary>
        <textarea name="prompt_rotina" rows="5" placeholder="Ex.: atualize a página de notícias…">${esc(chat.prompt_rotina||'')}</textarea>
        <label class="chats-check"><input type="checkbox" name="rotina_sessao_nova" ${chat.rotina_sessao_nova?'checked':''}> Cada execução da rotina começa uma sessão nova (sem a conversa anterior)</label></details>
      <div class="actions"><button type="button" class="cancel">Cancelar</button><button class="save" type="submit">${novo?'Criar chat':'Salvar'}</button></div></form>`;
    fundo.classList.add('show');
    const form=fundo.querySelector('form'),modo=form.elements.modo_permissao,dica=form.querySelector('.modo-dica');
    const mostrarDica=()=>dica.textContent=MODOS[modo.value];mostrarDica();modo.onchange=mostrarDica;
    form.elements.grupo_id.onchange=()=>{const g=grupoDe(form.elements.grupo_id.value);if(g?.pasta_padrao&&novo)form.elements.pasta.value=g.pasta_padrao};
    form.querySelector('.cancel').onclick=fecharModal;form.elements.titulo.focus();
    form.onsubmit=async e=>{
      e.preventDefault();
      const dados=Object.fromEntries(new FormData(form));dados.rotina_sessao_nova=form.elements.rotina_sessao_nova.checked;
      try{
        const salvo=novo?await api('POST','/api/chats',dados):await api('PATCH',`/api/chats/${chat.id}`,dados);
        fecharModal();await carregar();selecionar('org',salvo.id);toast(novo?'Chat criado.':'Chat atualizado.');
      }catch(erro){toast(erro.message)}
    };
  }
  function abrirGrupo(grupo){
    const novo=!grupo,doDesktop=grupo?.origem==='desktop';grupo=grupo||{cor:'#549866'};
    fundo.innerHTML=`<form class="chats-modal"><h2>${novo?'Novo grupo':'Editar grupo'}</h2><p>${doDesktop?'Grupo do Claude Desktop: o nome e os chats dele se mudam no próprio Desktop. Aqui ficam a cor e a pasta padrão dos chats novos.':'Grupos do organizador reúnem chats criados aqui.'}</p>
      <label>Nome<input name="nome" required maxlength="60" value="${esc(grupo.nome||'')}" ${doDesktop?'disabled':''}></label>
      <div class="chats-duas"><label>Cor<input name="cor" type="color" value="${esc(grupo.cor||'#549866')}"></label><label>Pasta padrão dos chats novos<input name="pasta_padrao" value="${esc(grupo.pasta_padrao||'')}"></label></div>
      <div class="actions">${!novo&&!doDesktop?'<button type="button" class="cancel perigo-texto" data-excluir>Excluir grupo</button>':''}<button type="button" class="cancel">Cancelar</button><button class="save" type="submit">${novo?'Criar grupo':'Salvar'}</button></div></form>`;
    fundo.classList.add('show');
    const form=fundo.querySelector('form');
    form.querySelectorAll('.cancel:not([data-excluir])').forEach(b=>b.onclick=fecharModal);
    form.querySelector('[data-excluir]')?.addEventListener('click',async()=>{
      if(!confirm(`Excluir o grupo “${grupo.nome}”? Os chats dele continuam, sem grupo.`))return;
      try{await api('DELETE',`/api/grupos/${grupo.id}`);fecharModal();grupoSel='todos';carregar()}catch(erro){toast(erro.message)}
    });
    form.onsubmit=async e=>{
      e.preventDefault();const dados=Object.fromEntries(new FormData(form));
      try{
        if(novo){const g=await api('POST','/api/grupos',dados);grupoSel=g.id}else await api('PATCH',`/api/grupos/${grupo.id}`,dados);
        fecharModal();carregar();
      }catch(erro){toast(erro.message)}
    };
  }

  // --- ações ---------------------------------------------------------------
  pagina.addEventListener('click',async e=>{
    const botao=e.target.closest('[data-acao]');if(!botao||botao.disabled)return;
    const acao=botao.dataset.acao,id=chatSel?.id;
    try{
      if(acao==='novo-chat')return abrirChat();
      if(acao==='novo-grupo')return abrirGrupo();
      if(acao==='login'){await api('POST','/api/claude/login');toast('Abri uma janela do Claude: conclua o login no navegador.');const espera=setInterval(async()=>{claude=await api('GET','/api/claude/status');if(claude.logado){clearInterval(espera);desenharLogin();toast('Claude logado.')}},4000);return}
      if(acao==='rotina'){await api('POST',`/api/chats/${id}/rotina`);toast('Rotina iniciada.');return puxarMensagens(false)}
      if(acao==='parar'){await api('POST',`/api/chats/${id}/parar`);return puxarMensagens(false)}
      if(acao==='abrir-desktop'||acao==='abrir-terminal'){await api('POST',`/api/chats/${id}/abrir`,{onde:acao==='abrir-terminal'?'terminal':'desktop'});return toast('Abrindo…')}
      if(acao==='editar-chat')return abrirChat(chatsOrg.find(c=>c.id===id));
      if(acao==='excluir-chat'){
        const c=chatsOrg.find(x=>x.id===id);
        if(!confirm(`Tirar o chat “${c?.titulo}” do organizador? A transcrição do Claude Code continua guardada.`))return;
        await api('DELETE',`/api/chats/${id}`);chatSel=null;$p('.chats-conversa').innerHTML='<div class="chats-vazio">Chat removido.</div>';return carregar();
      }
      if(acao==='abrir-link'){await api('POST',`/api/desktop/${id}/abrir`);return toast('Abrindo no Claude Desktop…')}
      if(acao==='recarregar')return selecionar('desk',id);
      if(acao==='bifurcar'){
        const c=chatsDesk.find(x=>x.id===id);
        const mensagem=prompt(`Continuar “${c.titulo}” no organizador.\nA cópia começa com toda a conversa; o chat original no Desktop não muda.\n\nPrimeira mensagem da cópia (pode deixar vazio):`,'');
        if(mensagem===null)return;
        const novo=await api('POST',`/api/desktop/${id}/bifurcar`,{mensagem});
        await carregar();return selecionar('org',novo.id);
      }
    }catch(erro){toast(erro.message)}
  });

  // --- importar o organizador antigo ---------------------------------------
  $p('.chats-importar input').onchange=async e=>{
    const arquivo=e.target.files[0];if(!arquivo)return;
    try{
      const valores=JSON.parse(await arquivo.text());
      const chaves=Object.keys(valores);
      if(!chaves.length)throw new Error('O arquivo não tem dados.');
      if(!confirm(`Importar ${chaves.length} conjunto(s) de dados (${chaves.join(', ')})?\nO que já existe aqui com o mesmo nome será SUBSTITUÍDO.`))return;
      const r=await api('POST','/api/importar',{valores,sobrescrever:true});
      alert(`Importado: ${r.gravadas.length} conjunto(s). A página vai recarregar.`);location.reload();
    }catch(erro){toast('Não consegui importar: '+erro.message)}
    finally{e.target.value=''}
  };
})();
