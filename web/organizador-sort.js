// A posição dos cards e itens é guardada nas listas já persistidas pelo organizador.
const ARCHIVE_ORDER_KEY='ritmo.archive-order.v1';
let archiveOrder=JSON.parse(localStorage.getItem(ARCHIVE_ORDER_KEY)||'[]');
let dragState=null;
function clearDragStyles(){document.querySelectorAll('.dragging,.drag-before,.drag-after').forEach(el=>el.classList.remove('dragging','drag-before','drag-after'))}
function reorder(array,fromId,toId,after){
  const from=array.findIndex(x=>x.id===fromId);
  if(from<0||fromId===toId)return false;
  const [moved]=array.splice(from,1);
  const to=array.findIndex(x=>x.id===toId);
  array.splice(to+(after?1:0),0,moved);
  return true;
}
function reorderIds(array,fromId,toId,after){
  const from=array.indexOf(fromId);
  if(from<0||fromId===toId)return;
  array.splice(from,1);
  const to=array.indexOf(toId);
  array.splice(to+(after?1:0),0,fromId);
}
function dragHandle(row,type,id,cardId){
  const handle=document.createElement('span');
  handle.className='drag-handle '+(type==='item'?'item-drag-handle':'card-drag-handle');
  handle.textContent='⋮⋮';handle.title='Arraste para reorganizar';
  handle.setAttribute('aria-label','Arraste para reorganizar');
  handle.draggable=true;
  row.prepend(handle);
  handle.ondragstart=e=>{
    dragState={type,id,cardId};
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',id);
    try{e.dataTransfer.setDragImage(row,22,18)}catch{}
    setTimeout(()=>row.classList.add('dragging'),0);
    e.stopPropagation();
  };
  handle.ondragend=()=>{dragState=null;clearDragStyles()};
  row.ondragover=e=>{
    if(!dragState||dragState.type!==type||dragState.id===id||type==='item'&&dragState.cardId!==cardId)return;
    e.preventDefault();e.stopPropagation();
    const after=e.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
    clearDragStyles();row.classList.add(after?'drag-after':'drag-before');
    e.dataTransfer.dropEffect='move';
  };
  row.ondrop=e=>{
    if(!dragState||dragState.type!==type||dragState.id===id||type==='item'&&dragState.cardId!==cardId)return;
    e.preventDefault();e.stopPropagation();
    const after=e.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
    if(type==='card'){
      if(reorder(tasks,dragState.id,id,after))save();
    }else if(type==='item'){
      const card=tasks.find(t=>t.id===cardId);
      if(card&&reorder(card.items||[],dragState.id,id,after))save();
    }else{
      if(!archiveOrder.length)archiveOrder=[...document.querySelectorAll('#archiveList .archive-entry')].map(x=>x.dataset.history);
      reorderIds(archiveOrder,dragState.id,id,after);
      localStorage.setItem(ARCHIVE_ORDER_KEY,JSON.stringify(archiveOrder));
    }
    dragState=null;clearDragStyles();render();
  };
}
function applyArchiveOrder(){
  const list=document.querySelector('#archiveList');
  const rows=[...list.querySelectorAll('.archive-entry')];
  if(!archiveOrder.length)return;
  const currentIds=rows.map(row=>row.dataset.history);
  const updated=[...currentIds.filter(id=>!archiveOrder.includes(id)),...archiveOrder.filter(id=>currentIds.includes(id))];
  if(updated.join('|')!==archiveOrder.join('|')){
    archiveOrder=updated;
    localStorage.setItem(ARCHIVE_ORDER_KEY,JSON.stringify(archiveOrder));
  }
  const positions=new Map(archiveOrder.map((id,index)=>[id,index]));
  rows.sort((a,b)=>(positions.get(a.dataset.history)??-1)-(positions.get(b.dataset.history)??-1));
  rows.forEach(row=>list.append(row));
}
function attachSort(){
  document.querySelectorAll('#list .row').forEach(row=>{
    dragHandle(row,'card',row.dataset.id);
    row.querySelectorAll('.item-row').forEach(item=>dragHandle(item,'item',item.dataset.item,row.dataset.id));
  });
  applyArchiveOrder();
  document.querySelectorAll('#archiveList .archive-entry').forEach(row=>dragHandle(row,'archive',row.dataset.history));
}
const renderBeforeSort=render;
render=function(){renderBeforeSort();attachSort()};
render();
