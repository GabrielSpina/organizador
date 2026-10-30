const TAGS_KEY='ritmo.tags.v1';
let tagRegistry=JSON.parse(localStorage.getItem(TAGS_KEY)||'[]');
let selectedFilters=new Set(),addSelectedTags=new Set(),editSelectedTags=new Set();
function saveTags(){localStorage.setItem(TAGS_KEY,JSON.stringify(tagRegistry))}
function safeColor(value){return /^#[0-9a-f]{6}$/i.test(value)?value:'#8fb79a'}
function tagById(id){return tagRegistry.find(t=>t.id===id)}
function tagsFor(card){return (card.tags||[]).map(tagById).filter(Boolean)}
function badges(ids){return (ids||[]).map(tagById).filter(Boolean).map(tag=>`<span class="card-tag" style="background:${safeColor(tag.color)}26;border-color:${safeColor(tag.color)}80;color:#334739">${esc(tag.name)}</span>`).join('')}
function colorFor(card){const colors=tagsFor(card).map(t=>safeColor(t.color)+'38');return colors.length===1?colors[0]:`linear-gradient(120deg,${colors.join(',')})`}
const filterBar=document.createElement('div');filterBar.className='tag-filter';
document.querySelector('#list').before(filterBar);
function renderTagFilters(){
  filterBar.hidden=!tagRegistry.length;
  filterBar.innerHTML='<span class="tag-filter-label">Filtrar por tag</span><button type="button" class="tag-clear">Todas</button>'+tagRegistry.map(tag=>`<button type="button" data-tag="${esc(tag.id)}" class="${selectedFilters.has(tag.id)?'selected':''}" style="border-color:${safeColor(tag.color)};${selectedFilters.has(tag.id)?`background:${safeColor(tag.color)}38`:''}">${esc(tag.name)}</button>`).join('');
  filterBar.querySelector('.tag-clear').onclick=()=>{selectedFilters.clear();render()};
  filterBar.querySelectorAll('[data-tag]').forEach(button=>button.onclick=()=>{const id=button.dataset.tag;selectedFilters.has(id)?selectedFilters.delete(id):selectedFilters.add(id);render()});
}
function makePicker(form,selected){
  const picker=document.createElement('div');picker.className='tag-picker';
  form.querySelector('.actions,.edit-actions').before(picker);
  function paint(){
    picker.innerHTML=`<label>Tags do card</label><div class="tag-options">${tagRegistry.map(tag=>`<div class="tag-option" style="border-color:${safeColor(tag.color)}"><input type="checkbox" data-tag="${esc(tag.id)}" ${selected.has(tag.id)?'checked':''}><span>${esc(tag.name)}</span><input type="color" data-color="${esc(tag.id)}" value="${safeColor(tag.color)}" title="Cor da tag ${esc(tag.name)}"></div>`).join('')}</div><div class="tag-create"><input type="text" class="tag-new-name" maxlength="30" placeholder="Nova tag"><input type="color" class="tag-new-color" value="#91b99b" title="Cor da nova tag"><button type="button" class="tag-create-button">Adicionar tag</button></div><small>Selecione quantas tags quiser. A cor da tag aparece em todos os cards que a usam.</small>`;
    picker.querySelectorAll('input[type=checkbox]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.tag):selected.delete(input.dataset.tag)});
    picker.querySelectorAll('[data-color]').forEach(input=>input.oninput=()=>{const tag=tagById(input.dataset.color);if(!tag)return;tag.color=safeColor(input.value);saveTags();render()});
    picker.querySelector('.tag-create-button').onclick=()=>{
      const name=picker.querySelector('.tag-new-name').value.trim();if(!name)return;
      const id=name.toLocaleLowerCase('pt-BR');
      if(!tagById(id))tagRegistry.push({id,name,color:safeColor(picker.querySelector('.tag-new-color').value)});
      selected.add(id);saveTags();paint();render();
    };
    picker.querySelector('.tag-new-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();picker.querySelector('.tag-create-button').click()}};
  }
  paint();return paint;
}
const paintAddTags=makePicker(document.querySelector('#form'),addSelectedTags);
const paintEditTags=makePicker(document.querySelector('#editForm'),editSelectedTags);
const listBeforeTags=listTasks;
listTasks=function(){const cards=listBeforeTags();return selectedFilters.size?cards.filter(card=>(card.tags||[]).some(id=>selectedFilters.has(id))):cards};
const createBeforeTags=document.querySelector('#form').onsubmit;
document.querySelector('#form').onsubmit=e=>{
  const ids=[...addSelectedTags];createBeforeTags(e);
  if(tasks[0]){tasks[0].tags=ids;save()}
  addSelectedTags.clear();paintAddTags();render();
};
const addButtonBeforeTags=document.querySelector('#add').onclick;
document.querySelector('#add').onclick=e=>{addSelectedTags.clear();paintAddTags();addButtonBeforeTags(e)};
const editCardBeforeTags=editCard;
editCard=function(id){
  editSelectedTags.clear();
  const card=tasks.find(t=>t.id===id);
  for(const tag of card?.tags||[])editSelectedTags.add(tag);
  paintEditTags();editCardBeforeTags(id);
};
const editBeforeTags=document.querySelector('#editForm').onsubmit;
document.querySelector('#editForm').onsubmit=e=>{
  const id=editingId,ids=[...editSelectedTags];editBeforeTags(e);
  const card=tasks.find(t=>t.id===id);if(card){card.tags=ids;save()}
  render();
};
const recordBeforeTags=recordCompletion;
recordCompletion=function(card,date){
  recordBeforeTags(card,date);
  const entry=history.find(h=>h.identity===recordKey(card.id,completionPeriod(card,date)));
  if(entry&&!entry.tags){entry.tags=[...(card.tags||[])];saveHistory()}
};
for(const entry of history){if(!entry.tags){entry.tags=[...(tasks.find(t=>t.id===entry.cardId)?.tags||[])];saveHistory()}}
const archiveBeforeTags=renderArchive;
renderArchive=function(){
  archiveBeforeTags();
  let shown=0;
  document.querySelectorAll('#archiveList .archive-entry').forEach(row=>{
    const entry=history.find(h=>h.id===row.dataset.history);
    const visible=!selectedFilters.size||(entry?.tags||[]).some(id=>selectedFilters.has(id));
    row.hidden=!visible;if(!visible)return;shown++;
    if(entry?.tags?.length){const badgesEl=document.createElement('div');badgesEl.className='card-tags';badgesEl.innerHTML=badges(entry.tags);row.querySelector('.archive-body').append(badgesEl)}
  });
  document.querySelector('#archiveCount').textContent=`${shown} ${shown===1?'registro':'registros'}`;
};
const renderBeforeTags=render;
render=function(){
  renderBeforeTags();renderTagFilters();
  document.querySelectorAll('#list .row').forEach(row=>{
    const card=tasks.find(t=>t.id===row.dataset.id);if(!card?.tags?.length)return;
    const badgeEl=document.createElement('div');badgeEl.className='card-tags';badgeEl.innerHTML=badges(card.tags);
    row.querySelector('.info').append(badgeEl);
    row.classList.add('tag-colored');
    if(!row.classList.contains('overdue')){row.style.background=colorFor(card);row.style.borderLeft='4px solid '+safeColor(tagsFor(card)[0]?.color)}
  });
};
render();
