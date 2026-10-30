// Um histórico separado mantém o que foi executado mesmo após editar ou excluir um card.
const HISTORY_KEY='ritmo.history.v1';
let history=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
function saveHistory(){localStorage.setItem(HISTORY_KEY,JSON.stringify(history))}
function recordKey(cardId,period){return cardId+'|'+period}
function completionPeriod(card,date){return card.kind==='once'?key(date):card.period==='day'?key(date):wk(date)}
function recordCompletion(card,date){
  const period=completionPeriod(card,date),identity=recordKey(card.id,period);
  if(history.some(h=>h.identity===identity))return;
  history.unshift({id:crypto.randomUUID(),identity,cardId:card.id,name:card.name,kind:card.kind,period:card.period,date:key(date),items:(card.items||[]).filter(i=>itemDone(card,i,date)).map(i=>i.name)});
  saveHistory();
}
function removeCompletion(card,date){
  const identity=recordKey(card.id,completionPeriod(card,date));
  history=history.filter(h=>h.identity!==identity);saveHistory();
}
let migratedHistory=false;
for(const card of tasks){
  if(card.kind==='once'&&card.done&&card.completedAt){recordCompletion(card,new Date(card.completedAt+'T12:00:00'));migratedHistory=true}
  if(card.kind==='recurring'){
    for(const date of card.days||[]){recordCompletion(card,new Date(date+'T12:00:00'));migratedHistory=true}
    for(const date of card.weeks||[]){recordCompletion(card,new Date(date+'T12:00:00'));migratedHistory=true}
  }
}
listTasks=function(){
  if(view==='all')return tasks.filter(t=>t.kind==='once'?!t.done:!completed(t,chosen));
  if(view==='week')return tasks.filter(t=>t.kind==='once'?active(t,chosen)&&!completed(t,chosen):t.period==='week'&&!completed(t,chosen));
  return tasks.filter(t=>active(t,chosen)&&!completed(t,chosen));
};
toggle=function(id){
  const card=tasks.find(t=>t.id===id);
  if(!card)return;
  const wasCompleted=completed(card,chosen);
  if(card.kind==='once'){
    card.done=!wasCompleted;
    card.completedAt=wasCompleted?null:key(chosen);
  }else{
    const bucket=card.period==='day'?'days':'weeks';
    const period=card.period==='day'?key(chosen):wk(chosen);
    card[bucket]||=[];
    card[bucket]=wasCompleted?card[bucket].filter(x=>x!==period):[...card[bucket],period];
  }
  if(wasCompleted)removeCompletion(card,chosen);else recordCompletion(card,chosen);
  save();render();toast(wasCompleted?'Card voltou para a lista.':'Card movido para Concluídos.');
};
const archive=document.createElement('section');
archive.className='card archive';archive.id='archive';
archive.innerHTML='<div class="archive-head"><h2>Concluídos</h2><span class="archive-count" id="archiveCount">0 registros</span></div><div class="sub">O que você já executou, com a data da conclusão.</div><div id="archiveList"></div>';
document.querySelector('.layout').after(archive);
const archiveNav=document.createElement('div');
archiveNav.className='nav';archiveNav.dataset.view='archive';archiveNav.textContent='✓ Concluídos';
document.querySelector('.side .hint').before(archiveNav);
const editOverlay=document.createElement('div');editOverlay.className='edit-overlay';
editOverlay.innerHTML='<form class="edit-modal" id="editForm"><h2>Editar card</h2><p>Altere o nome e a programação do card.</p><div class="edit-field"><label for="editName">Nome</label><input id="editName" required maxlength="90"></div><div class="edit-grid"><div class="edit-field"><label for="editKind">Tipo</label><select id="editKind"><option value="once">Uma vez</option><option value="recurring">Recorrente</option></select></div><div class="edit-field"><label for="editPeriod">Frequência</label><select id="editPeriod"><option value="day">Diariamente</option><option value="week">Semanalmente</option></select></div></div><div class="edit-field" id="editDayField"><label for="editDay">Dia da semana</label><select id="editDay"><option value="1">Segunda-feira</option><option value="2">Terça-feira</option><option value="3">Quarta-feira</option><option value="4">Quinta-feira</option><option value="5">Sexta-feira</option><option value="6">Sábado</option><option value="0">Domingo</option></select></div><div class="edit-actions"><button type="button" class="edit-cancel" id="editCancel">Cancelar</button><button class="edit-save" type="submit">Salvar alterações</button></div></form>';
document.body.append(editOverlay);
const editItemsPanel=document.createElement('div');
editItemsPanel.className='edit-items-panel';
document.querySelector('#editForm .edit-actions').before(editItemsPanel);
function renderEditItems(card){
  editItemsPanel.innerHTML=`<h3>Itens do card</h3><div class="edit-items-list">${(card.items||[]).map(item=>`<div class="edit-item-row" data-item="${item.id}"><input aria-label="Nome do item" maxlength="90" value="${esc(item.name)}"><button type="button" class="save-item-name">Salvar</button><button type="button" class="delete-item-name">Excluir</button></div>`).join('')}</div><div class="edit-item-row"><input id="newEditItem" aria-label="Novo item" maxlength="90" placeholder="Novo item"><button type="button" id="addEditItem">Adicionar</button></div>`;
  editItemsPanel.querySelectorAll('.edit-item-row[data-item]').forEach(row=>{
    const item=card.items.find(i=>i.id===row.dataset.item),field=row.querySelector('input');
    const saveItem=()=>{const name=field.value.trim();if(!name)return;item.name=name;save();renderEditItems(card);render()};
    row.querySelector('.save-item-name').onclick=saveItem;
    field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveItem()}};
    row.querySelector('.delete-item-name').onclick=()=>{
      if(!confirm(`Excluir o item “${item.name}”?`))return;
      card.items=card.items.filter(i=>i.id!==item.id);save();renderEditItems(card);render();
    };
  });
  const addItem=()=>{const field=editItemsPanel.querySelector('#newEditItem'),name=field.value.trim();if(!name)return;card.items||=[];card.items.push({id:crypto.randomUUID(),name,done:false,days:[],weeks:[]});save();renderEditItems(card);render()};
  editItemsPanel.querySelector('#addEditItem').onclick=addItem;
  editItemsPanel.querySelector('#newEditItem').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addItem()}};
}
let editingId=null;
function editFields(){document.querySelector('#editDayField').hidden=!(document.querySelector('#editKind').value==='recurring'&&document.querySelector('#editPeriod').value==='week')}
document.querySelector('#editKind').onchange=editFields;
document.querySelector('#editPeriod').onchange=editFields;
function editCard(id){
  const card=tasks.find(t=>t.id===id);if(!card)return;
  editingId=id;document.querySelector('#editName').value=card.name;
  document.querySelector('#editKind').value=card.kind;
  document.querySelector('#editPeriod').value=card.period==='week'?'week':'day';
  document.querySelector('#editDay').value=String(card.day??1);
  editFields();renderEditItems(card);editOverlay.classList.add('show');document.querySelector('#editName').focus();
}
function closeEdit(){editOverlay.classList.remove('show');editingId=null}
document.querySelector('#editCancel').onclick=closeEdit;
editOverlay.onclick=e=>{if(e.target===editOverlay)closeEdit()};
document.querySelector('#editForm').onsubmit=e=>{
  e.preventDefault();const card=tasks.find(t=>t.id===editingId);if(!card)return;
  const kind=document.querySelector('#editKind').value,period=kind==='once'?'once':document.querySelector('#editPeriod').value;
  if(card.kind!==kind||card.period!==period){card.days=[];card.weeks=[];card.done=false;card.completedAt=null}
  card.name=document.querySelector('#editName').value.trim();
  card.kind=kind;card.period=period;card.day=Number(document.querySelector('#editDay').value);
  save();closeEdit();render();toast('Card atualizado.');
};
function deleteCard(id){
  const card=tasks.find(t=>t.id===id);if(!card)return;
  if(!confirm(`Excluir o card “${card.name}”? O histórico de conclusões será mantido.`))return;
  tasks=tasks.filter(t=>t.id!==id);save();render();toast('Card excluído.');
}
function renderArchive(){
  const list=document.querySelector('#archiveList');
  const entries=[...history].sort((a,b)=>b.date.localeCompare(a.date));
  document.querySelector('#archiveCount').textContent=`${entries.length} ${entries.length===1?'registro':'registros'}`;
  list.innerHTML=entries.length?entries.map(h=>`<div class="archive-entry" data-history="${h.id}"><div class="archive-icon">✓</div><div class="archive-body"><div class="archive-title">${esc(h.name)}</div><div class="archive-meta">${new Date(h.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})} · ${h.kind==='once'?'Uma vez':h.period==='day'?'Diário':'Semanal'}</div>${h.items?.length?`<div class="archive-items">Itens: ${h.items.map(esc).join(', ')}</div>`:''}</div><button type="button" class="archive-delete" title="Remover este registro">Excluir registro</button></div>`).join(''):'<div class="empty">Nenhum card concluído ainda.</div>';
  list.querySelectorAll('.archive-entry').forEach(entry=>{
    const record=history.find(h=>h.id===entry.dataset.history);
    if(!record||!tasks.some(t=>t.id===record.cardId))return;
    const actions=document.createElement('div');actions.className='card-actions';
    actions.innerHTML='<button type="button" class="edit-card">Editar card</button><button type="button" class="delete-card">Excluir card</button>';
    entry.append(actions);
    actions.querySelector('.edit-card').onclick=()=>editCard(record.cardId);
    actions.querySelector('.delete-card').onclick=()=>deleteCard(record.cardId);
  });
  list.querySelectorAll('.archive-delete').forEach(button=>button.onclick=()=>{
    const id=button.closest('.archive-entry').dataset.history;
    if(!confirm('Excluir este registro do histórico?'))return;
    const record=history.find(h=>h.id===id),card=tasks.find(t=>t.id===record?.cardId);
    if(card){
      if(card.kind==='once'&&card.completedAt===record.date){card.done=false;card.completedAt=null}
      if(card.kind==='recurring'){
        const bucket=record.period==='day'?'days':'weeks';
        card[bucket]=(card[bucket]||[]).filter(x=>x!==record.identity.split('|').slice(1).join('|'));
      }
      save();
    }
    history=history.filter(h=>h.id!==id);saveHistory();render();
  });
}
const renderBeforeCards=render;
render=function(){
  renderBeforeCards();
  document.querySelectorAll('#list .row').forEach(row=>{
    const actions=document.createElement('div');actions.className='card-actions';
    actions.innerHTML='<button type="button" class="edit-card" title="Editar card">Editar</button><button type="button" class="delete-card" title="Excluir card">Excluir</button>';
    row.append(actions);
    actions.querySelector('.edit-card').onclick=()=>editCard(row.dataset.id);
    actions.querySelector('.delete-card').onclick=()=>deleteCard(row.dataset.id);
  });
  renderArchive();
};
archiveNav.onclick=()=>{view='archive';nav();render();archive.scrollIntoView({behavior:'smooth',block:'start'})};
render();
