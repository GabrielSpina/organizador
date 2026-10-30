(()=>{
  const addForm=document.querySelector('#form');
  const editForm=document.querySelector('#editForm');
  const createField=(id,label,className)=>{
    const field=document.createElement('div');field.className=className+' description-field';
    const caption=document.createElement('label');caption.htmlFor=id;caption.textContent=label;
    const textarea=document.createElement('textarea');textarea.id=id;textarea.maxLength=300;textarea.rows=3;textarea.placeholder='Anote o contexto ou o que precisa lembrar';
    const hint=document.createElement('small');hint.className='description-hint';hint.textContent='A descrição aparece somente ao editar este card.';
    field.append(caption,textarea,hint);return field;
  };
  addForm.querySelector('#name').closest('.field').after(createField('cardDescription','Descrição breve (opcional)','field'));
  editForm.querySelector('#editName').closest('.edit-field').after(createField('editCardDescription','Descrição breve (opcional)','edit-field'));
  const addBeforeDescription=addForm.onsubmit;
  addForm.onsubmit=event=>{
    const description=document.querySelector('#cardDescription').value.trim();
    addBeforeDescription(event);
    if(tasks[0]){tasks[0].description=description;save()}
  };
  const editCardBeforeDescription=editCard;
  editCard=function(id){
    editCardBeforeDescription(id);
    const card=tasks.find(item=>item.id===id);
    document.querySelector('#editCardDescription').value=card?.description||'';
  };
  const editBeforeDescription=editForm.onsubmit;
  editForm.onsubmit=event=>{
    const card=tasks.find(item=>item.id===editingId);
    if(card)card.description=document.querySelector('#editCardDescription').value.trim();
    editBeforeDescription(event);
  };
})();
