// Cada data mantém seu próprio estado. Tarefas únicas acompanham o usuário até a conclusão.
const originalRender=render;
// Preserve conclusões registradas antes desta versão.
tasks.forEach(t=>{if(t.kind==='once'&&t.done&&!t.completedAt)t.completedAt=key(new Date())});
save();
active=function(t,d){
  const date=key(d);
  if(t.createdAt&&t.createdAt>date)return false;
  if(t.kind==='once')return !t.completedAt||date<=t.completedAt;
  return t.period==='day'||t.day===d.getDay();
};
completed=function(t,d){
  if(t.kind==='once')return Boolean(t.done&&t.completedAt===key(d));
  return t.period==='day'?(t.days||[]).includes(key(d)):(t.weeks||[]).includes(wk(d));
};
listTasks=function(){
  if(view==='all')return tasks;
  if(view==='week')return tasks.filter(t=>t.kind==='once'?active(t,chosen):t.period==='week'&&(!t.createdAt||t.createdAt<=key(chosen)));
  return tasks.filter(t=>active(t,chosen));
};
toggle=function(id){
  const t=tasks.find(x=>x.id===id);
  if(!t)return;
  if(t.kind==='once'){
    const done=completed(t,chosen);
    t.done=!done;
    t.completedAt=done?null:key(chosen);
  }else{
    const bucket=t.period==='day'?'days':'weeks';
    const date=t.period==='day'?key(chosen):wk(chosen);
    t[bucket]||=[];
    t[bucket]=t[bucket].includes(date)?t[bucket].filter(x=>x!==date):[...t[bucket],date];
  }
  save();render();toast('Progresso atualizado.');
};
render=function(){
  originalRender();
  const selected=key(chosen),current=key(new Date());
  const label=chosen.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.querySelector('#selectedDay').textContent=label.charAt(0).toUpperCase()+label.slice(1);
  document.querySelector('#listTitle').textContent=view==='today'?selected===current?'Sua lista de hoje':'Tarefas do dia':view==='week'?'Sua semana':view==='all'?'Todas as tarefas':'Seu progresso';
  document.querySelectorAll('.row').forEach(row=>{
    const t=tasks.find(x=>x.id===row.dataset.id);
    if(!t)return;
    row.classList.toggle('completed',completed(t,chosen));
    row.classList.toggle('overdue',t.kind==='recurring'&&selected<current&&active(t,chosen)&&!completed(t,chosen));
  });
};
const controls=document.createElement('div');
controls.className='day-nav';
controls.innerHTML='<button type="button" id="prevDay" aria-label="Dia anterior">← Anterior</button><strong id="selectedDay"></strong><button type="button" id="nextDay" aria-label="Próximo dia">Próximo →</button><button type="button" class="today-button" id="goToday">Hoje</button>';
document.querySelector('.head').after(controls);
document.querySelector('#prevDay').onclick=()=>{chosen.setDate(chosen.getDate()-1);view='today';nav();render()};
document.querySelector('#nextDay').onclick=()=>{chosen.setDate(chosen.getDate()+1);view='today';nav();render()};
document.querySelector('#goToday').onclick=()=>{chosen=new Date();view='today';nav();render()};
document.querySelectorAll('.nav').forEach(el=>el.onclick=()=>{view=el.dataset.view;if(view==='today')chosen=new Date();nav();render()});
function itemDone(task,item,date){
  if(task.kind==='once')return Boolean(item.done);
  const periodKey=task.period==='day'?key(date):wk(date);
  return (task.period==='day'?item.days||[]:item.weeks||[]).includes(periodKey);
}
function toggleItem(taskId,itemId){
  const task=tasks.find(t=>t.id===taskId),item=task?.items?.find(i=>i.id===itemId);
  if(!item)return;
  if(task.kind==='once')item.done=!item.done;
  else{
    const bucket=task.period==='day'?'days':'weeks';
    const periodKey=task.period==='day'?key(chosen):wk(chosen);
    item[bucket]||=[];
    item[bucket]=item[bucket].includes(periodKey)?item[bucket].filter(x=>x!==periodKey):[...item[bucket],periodKey];
  }
  save();render();
}
function decorateItems(){
  document.querySelectorAll('.row').forEach(row=>{
    const task=tasks.find(t=>t.id===row.dataset.id),info=row.querySelector('.info');
    if(!task||!info)return;
    const items=task.items||[];
    const section=document.createElement('div');
    section.className='task-items';
    section.innerHTML=`${items.length?`<div class="items-count">${items.filter(i=>itemDone(task,i,chosen)).length}/${items.length} itens</div>`:''}<div class="items-list">${items.map(i=>`<div class="item-row ${itemDone(task,i,chosen)?'item-done':''}" data-item="${i.id}"><button type="button" class="item-check" aria-label="Marcar item ${esc(i.name)}">${itemDone(task,i,chosen)?'✓':''}</button><span>${esc(i.name)}</span></div>`).join('')}</div><button type="button" class="add-item">＋ Adicionar item</button><form class="item-form" hidden><input maxlength="90" required placeholder="Nome do item" aria-label="Nome do item"><button type="submit">Adicionar</button><button type="button" class="cancel-item">Cancelar</button></form>`;
    info.append(section);
    section.querySelectorAll('.item-check').forEach(button=>button.onclick=()=>toggleItem(task.id,button.closest('.item-row').dataset.item));
    section.querySelectorAll('.item-row').forEach(itemRow=>{
      const item=task.items.find(i=>i.id===itemRow.dataset.item);
      const actions=document.createElement('span');actions.className='item-actions';
      actions.innerHTML='<button type="button" class="item-edit">Editar</button><button type="button" class="item-delete">Excluir</button>';
      itemRow.append(actions);
      actions.querySelector('.item-edit').onclick=()=>{
        const label=itemRow.querySelector('span:not(.item-actions)');
        const field=document.createElement('input');field.className='item-edit-input';field.value=item.name;field.maxLength=90;
        label.replaceWith(field);actions.innerHTML='<button type="button" class="item-save">Salvar</button><button type="button" class="item-cancel">Cancelar</button>';
        actions.querySelector('.item-save').onclick=()=>{const name=field.value.trim();if(!name)return;item.name=name;save();render()};
        actions.querySelector('.item-cancel').onclick=()=>render();
        field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();actions.querySelector('.item-save').click()}if(e.key==='Escape')render()};
        field.focus();field.select();
      };
      actions.querySelector('.item-delete').onclick=()=>{
        if(!confirm(`Excluir o item “${item.name}”?`))return;
        task.items=task.items.filter(i=>i.id!==item.id);save();render();
      };
    });
    const form=section.querySelector('.item-form');
    section.querySelector('.add-item').onclick=()=>{form.hidden=false;section.querySelector('.add-item').hidden=true;form.querySelector('input').focus()};
    section.querySelector('.cancel-item').onclick=()=>{form.hidden=true;section.querySelector('.add-item').hidden=false};
    form.onsubmit=e=>{e.preventDefault();const name=form.querySelector('input').value.trim();if(!name)return;task.items||=[];task.items.push({id:crypto.randomUUID(),name,done:false,days:[],weeks:[]});save();render()};
  });
}
const renderWithoutItems=render;
render=function(){renderWithoutItems();decorateItems()};
render();
