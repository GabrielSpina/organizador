// "＋ Novo card neste projeto": o card novo já nasce parecido com os do projeto.
// Regra da maioria sobre TODOS os cards do projeto (inclusive os concluídos):
// - tipo + frequência (+ dia da semana): a combinação mais comum;
// - categoria principal (pessoal/trabalho): a mais comum;
// - subtags: as que aparecem em mais da metade dos cards.
// Empate fica com o card mais recente (os cards novos entram no começo de `tasks`).
// "Meta hj" nunca é herdada: ela vale só para o dia em que foi posta.
(()=>{
  const NAO_HERDA=new Set(['meta hj']);
  const form=document.querySelector('#form');
  const aviso=document.createElement('div');aviso.className='heranca-aviso';aviso.hidden=true;
  form.querySelector('.actions').before(aviso);

  // O valor mais comum; no empate, o que aparece primeiro (o card mais recente).
  function maisComum(valores){
    const contagem=new Map();
    for(const v of valores)contagem.set(v,(contagem.get(v)||0)+1);
    let melhor=null,maior=0;
    for(const v of valores){const n=contagem.get(v);if(n>maior){melhor=v;maior=n}}
    return melhor;
  }

  function padraoDoProjeto(projetoId){
    const cards=tasks.filter(card=>card.projectId===projetoId);
    if(!cards.length)return null;
    const agenda=maisComum(cards.map(c=>c.kind==='once'?'once':`${c.period}|${c.period==='week'?c.day:''}`));
    const categoria=maisComum(cards.map(c=>categoryOf(c.tags)));
    const contagem=new Map();
    for(const c of cards)for(const id of new Set(c.tags||[]))contagem.set(id,(contagem.get(id)||0)+1);
    const subtags=[...contagem].filter(([id,n])=>id!==PERSONAL&&id!==WORK&&!NAO_HERDA.has(id)&&tagById(id)&&n>cards.length/2).map(([id])=>id);
    const [periodo,dia]=agenda==='once'?['once','']:agenda.split('|');
    return{total:cards.length,kind:agenda==='once'?'once':'recurring',period:periodo,day:dia===''?null:Number(dia),categoria,subtags};
  }

  function descrever(p){
    const dias=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
    const agenda=p.kind==='once'?'Uma vez':p.period==='day'?'Recorrente, diariamente':`Recorrente, toda ${dias[p.day]}`;
    const nomes=p.subtags.map(id=>tagById(id)?.name||id);
    return `${agenda} · ${p.categoria===WORK?'Trabalho':'Pessoal'}${nomes.length?' · '+nomes.join(', '):''}`;
  }

  function herdar(projetoId){
    const p=padraoDoProjeto(projetoId);
    if(!p){aviso.hidden=true;return}
    form.querySelector('#kind').value=p.kind;
    if(p.kind==='recurring'){form.querySelector('#period').value=p.period;if(p.day!=null)form.querySelector('#weekday').value=String(p.day)}
    periodField();
    addSelectedTags.clear();
    addSelectedTags.add(p.categoria);
    for(const id of p.subtags)addSelectedTags.add(id);
    paintAddTags();syncAddCategory();
    const seletor=form.querySelector('#cardProject'),nome=seletor.selectedOptions[0]?.textContent||'projeto';
    aviso.innerHTML=`<b>Herdado de ${esc(nome)}</b> (maioria dos ${p.total} ${p.total===1?'card':'cards'}): ${esc(descrever(p))}. Dá para mudar qualquer campo antes de salvar.`;
    aviso.hidden=false;
  }

  // O "＋ Nova tarefa" comum não herda nada.
  const abrirAntesDaHeranca=document.querySelector('#add').onclick;
  // Se o formulário veio de uma herança, o tipo volta ao padrão (Uma vez) para não carregar o do último projeto.
  document.querySelector('#add').onclick=e=>{
    if(!aviso.hidden){form.querySelector('#kind').value='once';form.querySelector('#period').value='day';periodField()}
    aviso.hidden=true;abrirAntesDaHeranca(e);
  };

  // O botão do projeto já abriu o formulário e escolheu o projeto; aqui vem o resto.
  document.querySelector('#list').addEventListener('click',e=>{
    if(!e.target.closest('.project-add-card'))return;
    herdar(document.querySelector('#cardProject').value);
  });
  // Trocar o projeto no próprio formulário também herda (e "Sem projeto" limpa o aviso).
  form.querySelector('#cardProject').addEventListener('change',e=>{if(e.target.value)herdar(e.target.value);else aviso.hidden=true});
})();
