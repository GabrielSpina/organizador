(()=>{
  const PROJECTS_KEY='organizador.projects.v1';
  let projects=[];
  try{projects=JSON.parse(localStorage.getItem(PROJECTS_KEY)||'[]')}catch{projects=[]}
  if(!Array.isArray(projects))projects=[];
  const saveProjects=()=>localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));
  const projectFor=id=>projects.find(project=>project.id===id);
  const projectName=name=>projects.find(project=>project.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
  const makeProject=(name,color='#79a88d')=>{
    const cleaned=name.trim();
    if(!cleaned)return null;
    const existing=projectName(cleaned);
    if(existing)return existing;
    const project={id:crypto.randomUUID(),name:cleaned,color:safeColor(color)};
    projects.push(project);saveProjects();return project;
  };

  // Os itens dentro do card voltaram (06/10/2026). A migração que transformava
  // cada item em um card do projeto foi retirada: ela rodava a cada abertura e
  // desmontaria qualquer lista nova. Os cards antigos já tinham sido migrados.

  const addForm=document.querySelector('#form'),editForm=document.querySelector('#editForm');
  function projectField(form,id){
    const field=document.createElement('div');field.className='project-field';
    field.innerHTML=`<label for="${id}">Projeto</label><select id="${id}"></select>${form===editForm?`<input id="${id}New" maxlength="70" placeholder="Ou digite o nome de um novo projeto">`:''}<small>Cards do mesmo projeto aparecem juntos, cada um com sua própria programação e tags.</small>`;
    form.querySelector(form===addForm?'#cardDescription':'#editCardDescription').closest(form===addForm?'.field':'.edit-field').after(field);
    return field;
  }
  const addProjectField=projectField(addForm,'cardProject');
  const editProjectField=projectField(editForm,'editCardProject');
  function fillProjectSelect(field,selected=''){
    const select=field.querySelector('select');
    select.replaceChildren(new Option('Sem projeto',''));
    projects.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).forEach(project=>select.add(new Option(project.name,project.id)));
    select.value=selected||'';
  }
  function chosenProject(field){
    const name=field.querySelector('input')?.value.trim()||'';
    return name?makeProject(name)?.id||null:field.querySelector('select').value||null;
  }
  fillProjectSelect(addProjectField);fillProjectSelect(editProjectField);
  const projectManager=document.createElement('section');
  projectManager.className='project-manager';
  projectManager.innerHTML='<div class="project-manager-title">Gerenciar projetos</div><div class="project-create-form"><input class="project-create-name" maxlength="70" placeholder="Nome do novo projeto" aria-label="Nome do novo projeto"><input class="project-create-color" type="color" value="#79a88d" aria-label="Cor do projeto"><button type="button">Criar projeto</button></div><div class="project-manager-list"></div>';
  addProjectField.after(projectManager);
  function renderProjectManager(){
    const list=projectManager.querySelector('.project-manager-list');
    list.replaceChildren();
    for(const project of projects){
      const count=tasks.filter(card=>card.projectId===project.id).length;
      const item=document.createElement('div');item.className='project-manager-item';
      item.style.setProperty('--project-color',project.color||'#79a88d');
      const dot=document.createElement('span');dot.className='project-dot';
      const label=document.createElement('span');label.textContent=project.name;
      const amount=document.createElement('small');amount.textContent=`${count} ${count===1?'card':'cards'}`;
      const remove=document.createElement('button');remove.type='button';remove.textContent='Excluir';remove.title=`Excluir o projeto ${project.name}`;
      remove.onclick=()=>{
        if(!confirm(`Excluir o projeto “${project.name}”? Seus ${count} cards continuarão disponíveis sem projeto.`))return;
        for(const card of tasks)if(card.projectId===project.id)delete card.projectId;
        projects=projects.filter(item=>item.id!==project.id);
        save();saveProjects();fillProjectSelect(addProjectField);fillProjectSelect(editProjectField);render();toast('Projeto excluído; cards preservados.');
      };
      item.append(dot,label,amount,remove);list.append(item);
    }
    list.hidden=!projects.length;
  }
  const createProject=()=>{
    const name=projectManager.querySelector('.project-create-name').value.trim();
    if(!name)return;
    if(projectName(name)){toast('Este projeto já existe.');return}
    const project=makeProject(name,projectManager.querySelector('.project-create-color').value);
    projectManager.querySelector('.project-create-name').value='';
    fillProjectSelect(addProjectField,project.id);fillProjectSelect(editProjectField);render();toast('Projeto criado.');
  };
  projectManager.querySelector('.project-create-form button').onclick=createProject;
  projectManager.querySelector('.project-create-name').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();createProject()}};
  const addBeforeProject=document.querySelector('#add').onclick;
  document.querySelector('#add').onclick=event=>{fillProjectSelect(addProjectField);addBeforeProject(event)};
  const editBeforeProject=editCard;
  editCard=function(id){
    editBeforeProject(id);
    fillProjectSelect(editProjectField,tasks.find(card=>card.id===id)?.projectId);
    editProjectField.querySelector('input').value='';
  };
  const addSubmitBeforeProject=addForm.onsubmit;
  addForm.onsubmit=event=>{
    const projectId=chosenProject(addProjectField),previousId=tasks[0]?.id;
    addSubmitBeforeProject(event);
    if(tasks[0]&&tasks[0].id!==previousId){tasks[0].projectId=projectId;save();render()}
    fillProjectSelect(addProjectField);
  };
  const editSubmitBeforeProject=editForm.onsubmit;
  editForm.onsubmit=event=>{
    const card=tasks.find(item=>item.id===editingId);
    if(card)card.projectId=chosenProject(editProjectField);
    editSubmitBeforeProject(event);
  };

  const renderCompletedBeforeProjects=renderCompletedPage;
  renderCompletedPage=function(){
    renderCompletedBeforeProjects();
    if(!projects.length)return;
    const now=new Date();
    const section=document.createElement('section');section.className='completed-group';
    const heading=document.createElement('div');heading.className='group-head';
    heading.innerHTML='<h2>Projetos</h2><span>Cards e execução por projeto</span>';
    const grid=document.createElement('div');grid.className='project-kpis';
    for(const project of projects){
      const cards=tasks.filter(card=>card.projectId===project.id);
      if(!cards.length)continue;
      const due=cards.filter(card=>active(card,now));
      const doneToday=due.filter(card=>completed(card,now)).length;
      const recurring=cards.filter(card=>card.kind==='recurring').map(card=>recurringStats(card,now));
      const done30=recurring.reduce((n,row)=>n+row.done,0);
      const missed30=recurring.reduce((n,row)=>n+row.missed,0);
      const rate=done30+missed30?Math.round(done30/(done30+missed30)*100):0;
      const onceDone=cards.filter(card=>card.kind==='once'&&card.done).length;
      const tile=document.createElement('div');tile.className='project-kpi';tile.style.setProperty('--project-color',project.color||'#79a88d');
      tile.innerHTML=`<h3>${esc(project.name)}</h3><div class="project-kpi-metrics"><div><strong>${doneToday}/${due.length}</strong><small>previstos concluídos hoje</small></div><div><strong>${rate}%</strong><small>recorrências feitas em 30 dias</small></div><div><strong>${missed30}</strong><small>ocorrências não feitas</small></div><div><strong>${onceDone}/${cards.filter(card=>card.kind==='once').length}</strong><small>cards únicos concluídos</small></div></div>`;
      grid.append(tile);
    }
    if(grid.childElementCount){section.append(heading,grid);completedPage.querySelector('.completed-group')?.before(section)}
  };

  const renderBeforeProjects=render;
  render=function(){
    renderBeforeProjects();
    const list=document.querySelector('#list');
    const rows=[...list.querySelectorAll(':scope > .row')];
    const groups=new Map();
    for(const row of rows){
      const card=tasks.find(item=>item.id===row.dataset.id),project=projectFor(card?.projectId);
      if(!project)continue;
      let group=groups.get(project.id);
      if(!group){
        group=document.createElement('section');group.className='project-group';group.style.setProperty('--project-color',project.color||'#79a88d');
        group.innerHTML=`<div class="project-group-head"><span class="project-dot"></span><strong>${esc(project.name)}</strong><small></small></div><div class="project-card-list"></div>`;
        row.before(group);groups.set(project.id,group);
      }
      group.querySelector('.project-card-list').append(row);
    }
    for(const group of groups.values()){
      const count=group.querySelectorAll('.row').length;
      group.querySelector('.project-group-head small').textContent=count===1?'1 card':`${count} cards`;
      const projectId=[...groups].find(([,value])=>value===group)?.[0];
      const addButton=document.createElement('button');addButton.type='button';addButton.className='project-add-card';addButton.textContent='＋ Novo card neste projeto';
      addButton.onclick=()=>{
        document.querySelector('#add').click();
        addProjectField.querySelector('select').value=projectId;
        document.querySelector('#name').focus();
      };
      group.append(addButton);
    }
    renderProjectManager();
  };
  render();
})();
