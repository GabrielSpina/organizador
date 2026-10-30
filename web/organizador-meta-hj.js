// Tag "Meta hj": o que precisa sair HOJE.
// - os cards com a tag sobem para o topo da lista, com borda e sombra douradas;
// - cada card guarda o dia em que recebeu a tag (metaHjDia);
// - num dia seguinte a tag sai sozinha; se o card não foi concluído naquele dia,
//   ele entra no registro "Metas do dia não atingidas", mostrado em Concluídos.
// - o PROJETO inteiro também pode ser a meta do dia (botão no cabeçalho do projeto):
//   o grupo sobe dourado; na virada, se algum card dele previsto para aquele dia não foi
//   concluído, entra UM registro com o projeto e os cards que faltaram.
(()=>{
  const META_ID='meta hj',MISSED_KEY='organizador.metas-nao-atingidas.v1';
  let naoAtingidas=[];
  try{naoAtingidas=JSON.parse(localStorage.getItem(MISSED_KEY)||'[]')}catch{naoAtingidas=[]}
  if(!Array.isArray(naoAtingidas))naoAtingidas=[];
  const salvarNaoAtingidas=()=>localStorage.setItem(MISSED_KEY,JSON.stringify(naoAtingidas));
  const temMeta=card=>(card.tags||[]).includes(META_ID);
  // Projetos que são meta: { id do projeto: dia em que viraram meta }.
  const PROJETOS_KEY='organizador.metas-projeto.v1';
  let metasProjeto={};
  try{const lidas=JSON.parse(localStorage.getItem(PROJETOS_KEY)||'{}');if(lidas&&typeof lidas==='object'&&!Array.isArray(lidas))metasProjeto=lidas}catch{}
  const salvarMetasProjeto=()=>localStorage.setItem(PROJETOS_KEY,JSON.stringify(metasProjeto));
  const nomeDoProjeto=id=>{try{return (JSON.parse(localStorage.getItem('organizador.projects.v1')||'[]').find(p=>p.id===id)||{}).name||'Projeto'}catch{return 'Projeto'}};
  const dataLonga=dia=>{const t=new Date(dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});return t.charAt(0).toUpperCase()+t.slice(1)};

  if(!tagById(META_ID)){tagRegistry.push({id:META_ID,name:'Meta hj',color:'#d4a72c'});saveTags()}

  // Marca o dia da tag nos cards que acabaram de recebê-la e limpa nos que a perderam.
  function anotarDias(){
    const hoje=key(new Date());let mudou=false;
    for(const card of tasks){
      if(temMeta(card)&&!card.metaHjDia){card.metaHjDia=hoje;mudou=true}
      if(!temMeta(card)&&card.metaHjDia){delete card.metaHjDia;mudou=true}
    }
    if(mudou)save();
  }

  // Virada do dia: tira a tag do que ficou de ontem (ou de antes) e registra o que não saiu.
  function virarDia(){
    const hoje=key(new Date());let mudou=false;
    for(const card of tasks){
      if(!temMeta(card)||!card.metaHjDia||card.metaHjDia>=hoje)continue;
      const dia=card.metaHjDia;
      // Meta de dia neutro não vira "não atingida" (organizador-dia-neutro.js).
      if(!window.diaNeutro?.(dia)&&!completed(card,new Date(dia+'T12:00:00'))&&!naoAtingidas.some(r=>r.cardId===card.id&&r.dia===dia)){
        naoAtingidas.unshift({id:crypto.randomUUID(),cardId:card.id,nome:card.name,dia,projetoId:card.projectId||null,registradoEm:new Date().toISOString()});
      }
      card.tags=card.tags.filter(id=>id!==META_ID);
      delete card.metaHjDia;mudou=true;
    }
    // Projetos: a meta é do dia; o que ficou de ontem sai, e o que faltou vira um registro só.
    for(const [projetoId,dia] of Object.entries(metasProjeto)){
      if(dia>=hoje)continue;
      const data=new Date(dia+'T12:00:00');
      const faltaram=tasks.filter(c=>c.projectId===projetoId&&active(c,data)&&!completed(c,data));
      if(!window.diaNeutro?.(dia)&&faltaram.length&&!naoAtingidas.some(r=>r.projetoMetaId===projetoId&&r.dia===dia)){
        naoAtingidas.unshift({id:crypto.randomUUID(),projetoMetaId:projetoId,cardIds:faltaram.map(c=>c.id),dia,registradoEm:new Date().toISOString(),
          nome:`Projeto ${nomeDoProjeto(projetoId)} — faltaram ${faltaram.length} de ${tasks.filter(c=>c.projectId===projetoId&&active(c,data)).length}: ${faltaram.map(c=>c.name).join(', ')}`});
      }
      delete metasProjeto[projetoId];mudou=true;
    }
    if(mudou){save();salvarNaoAtingidas();salvarMetasProjeto()}
    return mudou;
  }

  // Leva os cards com a tag para uma seção no topo da lista.
  function subirMetas(){
    const lista=document.querySelector('#list');if(!lista)return;
    const hoje=key(new Date());
    botoesDeProjeto(lista,hoje);
    const grupos=[...lista.querySelectorAll('.project-group[data-projeto]')].filter(g=>metasProjeto[g.dataset.projeto]===hoje);
    const linhas=[...lista.querySelectorAll('.row')].filter(row=>temMeta(tasks.find(t=>t.id===row.dataset.id)||{}));
    if(!linhas.length&&!grupos.length)return;
    const secao=document.createElement('section');secao.className='meta-hj-grupo';
    const partes=[linhas.length?`${linhas.length} ${linhas.length===1?'card':'cards'}`:'',grupos.length?`${grupos.length} ${grupos.length===1?'projeto':'projetos'}`:''].filter(Boolean).join(' · ');
    secao.innerHTML=`<div class="meta-hj-cabeca"><span>★ Metas de hoje</span><small>${partes}</small></div>`;
    for(const row of linhas){row.classList.add('meta-hj');secao.append(row)}
    for(const grupo of grupos){grupo.classList.add('meta-hj-projeto');secao.append(grupo)}
    lista.prepend(secao);
    // Grupo de projeto que ficou vazio some; os outros recontam.
    lista.querySelectorAll('.project-group').forEach(grupo=>{
      const n=grupo.querySelectorAll('.row').length;
      if(!n)grupo.remove();else grupo.querySelector('.project-group-head small').textContent=n===1?'1 card':`${n} cards`;
    });
  }

  // O botão "Meta hj" no cabeçalho de cada projeto liga e desliga a meta do projeto para hoje.
  function botoesDeProjeto(lista,hoje){
    lista.querySelectorAll('.project-group[data-projeto]').forEach(grupo=>{
      const cabeca=grupo.querySelector('.project-group-head');
      if(!cabeca||cabeca.querySelector('.meta-hj-projeto-botao'))return;
      const id=grupo.dataset.projeto,ligada=metasProjeto[id]===hoje;
      const botao=document.createElement('button');botao.type='button';
      botao.className='meta-hj-projeto-botao'+(ligada?' ligada':'');
      botao.textContent=ligada?'★ Meta hj':'☆ Meta hj';
      botao.title=ligada?'Tirar o projeto das metas de hoje':'Fazer do projeto inteiro uma meta de hoje';
      botao.onclick=()=>{if(metasProjeto[id]===hoje)delete metasProjeto[id];else metasProjeto[id]=hoje;salvarMetasProjeto();render()};
      cabeca.append(botao);
    });
  }

  const renderAntesDaMeta=render;
  render=function(){anotarDias();renderAntesDaMeta();subirMetas()};

  // Em Concluídos: o registro das metas que não saíram no dia.
  const concluidosAntesDaMeta=renderCompletedPage;
  renderCompletedPage=function(){
    concluidosAntesDaMeta();
    const secao=document.createElement('section');secao.className='completed-group meta-hj-registro';
    const porDia=new Map();
    for(const r of [...naoAtingidas].sort((a,b)=>b.dia.localeCompare(a.dia))){if(!porDia.has(r.dia))porDia.set(r.dia,[]);porDia.get(r.dia).push(r)}
    secao.innerHTML=`<div class="group-head"><h2>Metas do dia não atingidas</h2><span>${naoAtingidas.length} ${naoAtingidas.length===1?'registro':'registros'}</span></div>${porDia.size?[...porDia].map(([dia,regs])=>`<div class="meta-hj-dia"><h3>${dataLonga(dia)}</h3>${regs.map(r=>`<div class="history-line"><span class="history-mark meta-hj-x">✕</span><div class="history-main"><b>${esc(r.nome)}</b></div><button type="button" class="meta-hj-apagar" data-registro="${r.id}">Apagar registro</button></div>`).join('')}</div>`).join(''):'<div class="history-empty">Nenhuma meta perdida até agora.</div>'}`;
    completedPage.append(secao);
    secao.querySelectorAll('.meta-hj-apagar').forEach(b=>b.onclick=()=>{
      if(!confirm('Apagar este registro de meta não atingida?'))return;
      naoAtingidas=naoAtingidas.filter(r=>r.id!==b.dataset.registro);salvarNaoAtingidas();render();
    });
  };

  // A virada também acontece com a página aberta, à meia-noite.
  let diaVisto=key(new Date());
  setInterval(()=>{const hoje=key(new Date());if(hoje!==diaVisto){diaVisto=hoje;if(virarDia())render()}},60000);

  virarDia();
  render();
})();
