const PERSONAL='pessoal',WORK='trabalho';
for(const category of [{id:PERSONAL,name:'Pessoal',color:'#aa86dc'},{id:WORK,name:'Trabalho',color:'#7da4d6'}]){
  if(!tagById(category.id))tagRegistry.push(category);
}
tagRegistry.sort((a,b)=>{
  const priority=id=>id===PERSONAL?0:id===WORK?1:2;
  return priority(a.id)-priority(b.id);
});
saveTags();
function categoryOf(ids){return (ids||[]).includes(WORK)?WORK:PERSONAL}
let changedCards=false;
for(const card of tasks){
  card.tags||=[];
  const category=categoryOf(card.tags);
  const normalized=card.tags.filter(id=>id!==PERSONAL&&id!==WORK);
  normalized.unshift(category);
  if(normalized.join('|')!==card.tags.join('|')){card.tags=normalized;changedCards=true}
}
if(changedCards)save();
let changedHistory=false;
for(const entry of history){
  const card=tasks.find(t=>t.id===entry.cardId);
  const source=entry.tags?.length?entry.tags:card?.tags||[];
  const normalized=[categoryOf(source),...source.filter(id=>id!==PERSONAL&&id!==WORK)];
  if(normalized.join('|')!==(entry.tags||[]).join('|')){entry.tags=normalized;changedHistory=true}
}
if(changedHistory)saveHistory();
paintAddTags();paintEditTags();
function categoryControls(form,selected){
  const picker=form.querySelector('.tag-picker');
  const panel=document.createElement('div');panel.className='category-picker';
  panel.innerHTML='<label>Categoria principal</label><div class="category-choices"><label><input type="radio" name="'+form.id+'-category" value="pessoal"> Pessoal</label><label><input type="radio" name="'+form.id+'-category" value="trabalho"> Trabalho</label></div>';
  picker.before(panel);
  function sync(){
    const category=categoryOf([...selected]);
    panel.querySelector(`input[value="${category}"]`).checked=true;
    picker.querySelector('label').textContent='Subtags';
    picker.querySelectorAll('input[data-tag]').forEach(input=>{
      if(input.dataset.tag===PERSONAL||input.dataset.tag===WORK)input.closest('.tag-option').hidden=true;
    });
    return category;
  }
  panel.querySelectorAll('input[type=radio]').forEach(input=>input.onchange=()=>{
    selected.delete(PERSONAL);selected.delete(WORK);selected.add(input.value);sync();
  });
  return sync;
}
const syncAddCategory=categoryControls(document.querySelector('#form'),addSelectedTags);
const syncEditCategory=categoryControls(document.querySelector('#editForm'),editSelectedTags);
const addClickBeforeCategory=document.querySelector('#add').onclick;
document.querySelector('#add').onclick=e=>{addClickBeforeCategory(e);addSelectedTags.add(PERSONAL);syncAddCategory()};
const editCardBeforeCategory=editCard;
editCard=function(id){editCardBeforeCategory(id);syncEditCategory()};
const submitBeforeCategory=document.querySelector('#form').onsubmit;
document.querySelector('#form').onsubmit=e=>{
  const selected=document.querySelector('#form .category-picker input:checked')?.value||PERSONAL;
  addSelectedTags.delete(PERSONAL);addSelectedTags.delete(WORK);addSelectedTags.add(selected);
  submitBeforeCategory(e);syncAddCategory();
};
const editSubmitBeforeCategory=document.querySelector('#editForm').onsubmit;
document.querySelector('#editForm').onsubmit=e=>{
  const selected=document.querySelector('#editForm .category-picker input:checked')?.value||PERSONAL;
  editSelectedTags.delete(PERSONAL);editSelectedTags.delete(WORK);editSelectedTags.add(selected);
  editSubmitBeforeCategory(e);syncEditCategory();
};
function matchesFilters(ids){
  const categories=[...selectedFilters].filter(id=>id===PERSONAL||id===WORK);
  const subtags=[...selectedFilters].filter(id=>id!==PERSONAL&&id!==WORK);
  return (!categories.length||categories.some(id=>(ids||[]).includes(id)))&&(!subtags.length||subtags.some(id=>(ids||[]).includes(id)));
}
const listBeforeCategory=listTasks;
listTasks=function(){
  const filters=[...selectedFilters];selectedFilters.clear();
  let cards;
  try{cards=listBeforeCategory()}finally{filters.forEach(id=>selectedFilters.add(id))}
  return cards.filter(card=>matchesFilters(card.tags));
};
const filterBeforeCategory=renderTagFilters;
renderTagFilters=function(){
  filterBeforeCategory();
  filterBar.querySelectorAll('[data-tag]').forEach(button=>{
    if(button.dataset.tag===PERSONAL||button.dataset.tag===WORK)button.classList.add('primary-filter');
  });
  const firstSub=[...filterBar.querySelectorAll('[data-tag]')].find(button=>button.dataset.tag!==PERSONAL&&button.dataset.tag!==WORK);
  if(firstSub){const divider=document.createElement('span');divider.className='filter-divider';firstSub.before(divider)}
  syncAddCategory();syncEditCategory();
};
const archiveBeforeCategory=renderArchive;
renderArchive=function(){
  const filters=[...selectedFilters];selectedFilters.clear();
  try{archiveBeforeCategory()}finally{filters.forEach(id=>selectedFilters.add(id))}
  const current=key(new Date());let count=0;
  document.querySelectorAll('#archiveList .archive-entry').forEach(row=>{
    const entry=history.find(h=>h.id===row.dataset.history);
    const show=entry?.date===current&&matchesFilters(entry.tags);
    row.hidden=!show;if(show)count++;
  });
  archive.querySelector('.archive-head h2').textContent='Concluídos hoje';
  archive.querySelector('.sub').textContent='O que você executou neste dia.';
  document.querySelector('#archiveCount').textContent=`${count} ${count===1?'registro':'registros'}`;
};
const completedPage=document.createElement('section');
completedPage.className='completed-page';completedPage.hidden=true;
document.querySelector('.main').append(completedPage);
function dateLabel(value){return new Date(value+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}
function historyLines(entries,empty){
  return entries.length?'<div class="history-list">'+entries.map(entry=>{
    const subtags=(entry.tags||[]).filter(id=>id!==PERSONAL&&id!==WORK).map(id=>tagById(id)?.name||id);
    return `<div class="history-line"><span class="history-mark">✓</span><div class="history-main"><b>${esc(entry.name)}</b><small>${dateLabel(entry.date)}${subtags.length?' · '+subtags.map(esc).join(', '):''}</small></div>${tasks.some(card=>card.id===entry.cardId)?'<button type="button" class="edit-history-card" data-card-id="'+entry.cardId+'">Editar card</button>':''}</div>`;
  }).join('')+'</div>':`<div class="history-empty">${empty}</div>`;
}
function recurringStats(card,now){
  let done=0,missed=0;
  for(let offset=1;offset<=30;offset++){
    const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-offset,12);
    if(card.createdAt&&key(date)<card.createdAt)continue;
    if(card.period==='week'&&card.day!==date.getDay())continue;
    if(window.diaNeutro?.(key(date)))continue; // dia neutro não conta (organizador-dia-neutro.js)
    if(completed(card,date))done++;else missed++;
  }
  const total=done+missed;
  return{card,done,missed,total,rate:total?Math.round(done/total*100):null,failRate:total?Math.round(missed/total*100):null};
}
function leader(rows,metric,label,suffix){
  const eligible=rows.filter(row=>row.total>0&&row[metric]>0).sort((a,b)=>b[metric]-a[metric]||b.total-a.total);
  const first=eligible[0];
  return `<div class="rank-card ${metric==='missed'||metric==='failRate'?'worst':'best'}"><small>${label}</small><b>${first?esc(first.card.name):'Sem dados ainda'}</b><strong>${first?first[metric]+suffix:'—'}</strong></div>`;
}
function renderCompletedPage(){
  const now=new Date(),todayKey=key(now),weekStart=wk(now),monthStart=todayKey.slice(0,7)+'-01';
  const personalRecurring=tasks.filter(card=>card.kind==='recurring'&&categoryOf(card.tags)===PERSONAL);
  const stats=personalRecurring.map(card=>recurringStats(card,now));
  const todayDue=personalRecurring.filter(card=>(!card.createdAt||card.createdAt<=todayKey)&&(card.period==='day'||card.day===now.getDay()));
  const todayDone=todayDue.filter(card=>completed(card,now)).length;
  const done30=stats.reduce((sum,row)=>sum+row.done,0),missed30=stats.reduce((sum,row)=>sum+row.missed,0);
  const personalOnce=history.filter(entry=>entry.kind==='once'&&categoryOf(entry.tags)===PERSONAL).sort((a,b)=>b.date.localeCompare(a.date));
  const personalRecent=history.filter(entry=>entry.kind==='recurring'&&categoryOf(entry.tags)===PERSONAL).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);
  const workHistory=history.filter(entry=>categoryOf(entry.tags)===WORK&&!window.diaNeutro?.(entry.date)).sort((a,b)=>b.date.localeCompare(a.date));
  const workWeek=workHistory.filter(entry=>entry.date>=weekStart).length,workMonth=workHistory.filter(entry=>entry.date>=monthStart).length;
  completedPage.innerHTML=`<p class="completed-intro">Acompanhe o que foi feito e veja onde as recorrências estão funcionando melhor.</p><div class="completed-summary"><div class="summary-tile mint"><small>Recorrentes pessoais hoje</small><strong>${todayDone}/${todayDue.length}</strong><span>${todayDue.length?Math.round(todayDone/todayDue.length*100):0}% concluídas · ${todayDue.length-todayDone} ainda pendentes</span></div><div class="summary-tile lavender"><small>Execuções em 30 dias</small><strong>${done30}</strong><span>recorrências pessoais concluídas</span></div><div class="summary-tile peach"><small>Falhas em 30 dias</small><strong>${missed30}</strong><span>dias previstos que terminaram sem conclusão</span></div></div><section class="completed-group"><div class="group-head"><h2>Pessoal</h2><span>Recorrentes e cards de uma vez</span></div><h3>Recorrentes · últimos 30 dias encerrados</h3><div class="insights-grid"><div>${stats.length?`<table class="recurring-table"><thead><tr><th>Card</th><th>Executadas</th><th>Falhas</th><th>Taxa</th></tr></thead><tbody>${stats.map(row=>`<tr><td class="name">${esc(row.card.name)}</td><td>${row.done}</td><td>${row.missed}</td><td><div class="rate-track"><i style="width:${row.rate||0}%"></i></div><span class="rate-value">${row.rate===null?'Sem período completo':row.rate+'%'}</span></td></tr>`).join('')}</tbody></table>`:'<div class="history-empty">Nenhum card recorrente pessoal cadastrado.</div>'}</div><div><h3>Destaques por índice e volume</h3><div class="rank-grid">${leader(stats,'rate','Maior índice de execução','%')}${leader(stats,'failRate','Maior índice de falha','%')}${leader(stats,'done','Mais execuções no total',' execuções')}${leader(stats,'missed','Mais falhas no total',' falhas')}</div><p class="period-note">A taxa considera apenas os dias programados já encerrados. Cards diários são avaliados por dia; semanais, no dia previsto da semana. Hoje aparece no resumo acima e só contará como falha amanhã.</p></div></div><div class="history-grid" style="margin-top:22px"><div><h3>Cards de uma vez concluídos</h3>${historyLines(personalOnce,'Nenhum card de uma vez concluído ainda.')}</div><div><h3>Execuções recorrentes recentes</h3>${historyLines(personalRecent,'Nenhuma recorrência concluída ainda.')}</div></div></section><section class="completed-group"><div class="group-head"><h2>Trabalho</h2><span>O que foi executado</span></div><div class="work-counts"><div><strong>${workWeek}</strong><small>conclusões nesta semana</small></div><div><strong>${workMonth}</strong><small>conclusões neste mês</small></div></div>${historyLines(workHistory,'Nenhum card de trabalho concluído ainda.')}</section>`;
}
const renderCompletedPageBase=renderCompletedPage;
renderCompletedPage=function(){
  renderCompletedPageBase();
  const now=new Date();
  const rows=tasks.filter(card=>card.kind==='recurring'&&categoryOf(card.tags)===PERSONAL).map(card=>recurringStats(card,now));
  document.querySelectorAll('.recurring-table tbody tr .rate-value').forEach((element,index)=>{
    const row=rows[index];
    if(row?.rate!==null&&row?.rate!==undefined)element.textContent=`${row.rate}% feitas · ${row.failRate}% falhas`;
  });
  const scheduled=tasks.filter(card=>card.kind==='recurring'&&categoryOf(card.tags)===PERSONAL&&(!card.createdAt||card.createdAt<=key(now))&&(card.period==='day'||card.day===now.getDay()));
  const done=scheduled.filter(card=>completed(card,now)).length;
  const percent=scheduled.length?Math.round(done/scheduled.length*100):0;
  const summary=completedPage.querySelector('.summary-tile.mint span');
  if(summary)summary.textContent=`${percent}% concluídas · ${scheduled.length?100-percent:0}% pendentes hoje`;
  completedPage.querySelectorAll('.edit-history-card').forEach(button=>button.onclick=()=>editCard(button.dataset.cardId));
};
const renderBeforeCompleted=render;
render=function(){
  renderBeforeCompleted();
  const show=view==='archive';
  document.querySelector('.app').classList.toggle('completed-view',show);
  completedPage.hidden=!show;
  document.querySelector('#title').textContent=show?'Concluídos':'Olá, Gabriel 👋';
  document.querySelector('.head .muted').textContent=show?'Seu histórico e seus indicadores em um só lugar.':'Um novo dia, novas possibilidades. Vamos lá?';
  if(show)renderCompletedPage();
};
archiveNav.onclick=()=>{view='archive';nav();render();window.scrollTo({top:0,behavior:'smooth'})};
syncAddCategory();syncEditCategory();
render();
