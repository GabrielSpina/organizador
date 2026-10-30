// A ordem dos projetos na lista, escolhida arrastando o cabeçalho do projeto (alça ⋮⋮).
// Os projetos trocam de lugar só entre si: os cards soltos (sem projeto) ficam onde estão.
// A ordem fica em "organizador.projetos-ordem.v1" (lista de ids); projeto novo, ainda fora
// da lista, mantém o lugar em que nasceu. Cada grupo ganha data-projeto (o id do projeto),
// que o organizador-meta-hj.js também usa.
(()=>{
  const ORDEM_KEY='organizador.projetos-ordem.v1';
  let ordem=[];
  try{const lida=JSON.parse(localStorage.getItem(ORDEM_KEY)||'[]');if(Array.isArray(lida))ordem=lida}catch{}
  const salvar=()=>localStorage.setItem(ORDEM_KEY,JSON.stringify(ordem));
  let arrastando=null;

  function marcarGrupos(lista){
    lista.querySelectorAll('.project-group').forEach(grupo=>{
      const row=grupo.querySelector('.row');
      const card=row&&tasks.find(t=>t.id===row.dataset.id);
      if(card?.projectId)grupo.dataset.projeto=card.projectId;
    });
  }

  // Põe os grupos na ordem salva, ocupando as mesmas posições que eles já tinham na lista.
  function ordenar(lista){
    const grupos=[...lista.querySelectorAll(':scope > .project-group[data-projeto]')];
    if(grupos.length<2)return;
    const posicao=id=>{const i=ordem.indexOf(id);return i<0?Infinity:i};
    const ordenados=[...grupos].sort((a,b)=>posicao(a.dataset.projeto)-posicao(b.dataset.projeto)||grupos.indexOf(a)-grupos.indexOf(b));
    const lugares=grupos.map(g=>{const marca=document.createComment('lugar');g.before(marca);return marca});
    lugares.forEach((marca,i)=>{marca.replaceWith(ordenados[i])});
  }

  function prepararArraste(lista){
    lista.querySelectorAll(':scope > .project-group[data-projeto]').forEach(grupo=>{
      const cabeca=grupo.querySelector('.project-group-head');
      if(!cabeca||cabeca.querySelector('.project-drag-handle'))return;
      const alca=document.createElement('span');
      alca.className='drag-handle project-drag-handle';alca.textContent='⋮⋮';alca.title='Arraste para mudar a ordem do projeto';alca.draggable=true;
      cabeca.prepend(alca);
      alca.ondragstart=e=>{arrastando=grupo.dataset.projeto;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',arrastando);try{e.dataTransfer.setDragImage(cabeca,20,16)}catch{};setTimeout(()=>grupo.classList.add('dragging'),0);e.stopPropagation()};
      alca.ondragend=()=>{arrastando=null;lista.querySelectorAll('.project-group').forEach(g=>g.classList.remove('dragging','drag-before','drag-after'))};
      grupo.addEventListener('dragover',e=>{
        if(!arrastando||arrastando===grupo.dataset.projeto)return;
        e.preventDefault();
        const caixa=grupo.getBoundingClientRect(),depois=e.clientY>caixa.top+caixa.height/2;
        lista.querySelectorAll('.project-group').forEach(g=>g.classList.remove('drag-before','drag-after'));
        grupo.classList.add(depois?'drag-after':'drag-before');
      });
      grupo.addEventListener('drop',e=>{
        if(!arrastando||arrastando===grupo.dataset.projeto)return;
        e.preventDefault();e.stopPropagation();
        const caixa=grupo.getBoundingClientRect(),depois=e.clientY>caixa.top+caixa.height/2;
        // A ordem nova parte da que está na tela (inclui projetos que ainda não estavam salvos).
        const naTela=[...lista.querySelectorAll(':scope > .project-group[data-projeto]')].map(g=>g.dataset.projeto);
        const resto=ordem.filter(id=>!naTela.includes(id));
        const nova=naTela.filter(id=>id!==arrastando);
        nova.splice(nova.indexOf(grupo.dataset.projeto)+(depois?1:0),0,arrastando);
        ordem=[...nova,...resto];salvar();arrastando=null;render();
      });
    });
  }

  const renderAntesDaOrdem=render;
  render=function(){
    renderAntesDaOrdem();
    const lista=document.querySelector('#list');if(!lista)return;
    marcarGrupos(lista);ordenar(lista);prepararArraste(lista);
  };
  render();
})();
