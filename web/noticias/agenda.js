// A agenda da página de notícias ("Guardar na agenda").
// Com a chave da nuvem neste navegador, a agenda mora no repositório privado de dados
// (como o resto do organizador): o nuvem.js é carregado antes, e o que se guarda num
// aparelho aparece nos outros. Sem a chave, fica só neste navegador, como antes.
(async()=>{
  if(localStorage.getItem('organizador.nuvem.chave')&&!window.Nuvem){
    const carregar=(tag,attrs)=>new Promise((ok,falha)=>{const el=Object.assign(document.createElement(tag),attrs);el.onload=ok;el.onerror=falha;document.head.append(el)});
    try{
      await carregar('link',{rel:'stylesheet',href:'../nuvem.css'});
      await carregar('script',{src:'../nuvem.js'});
      window.ORGANIZADOR??={nuvem:false,servidorLocal:false};
      // O que este aparelho guardou só para si antes da nuvem não se perde: junta com a da nuvem.
      let soNoAparelho=[];try{soNoAparelho=JSON.parse(localStorage.getItem('organizador.noticias.agenda.v1')||'[]')}catch{}
      await Nuvem.iniciar();
      if(Array.isArray(soNoAparelho)&&soNoAparelho.length){
        let daNuvem=[];try{daNuvem=JSON.parse(localStorage.getItem('organizador.noticias.agenda.v1')||'[]')}catch{}
        const ids=new Set(daNuvem.map(n=>n.id));const faltam=soNoAparelho.filter(n=>n&&n.id&&!ids.has(n.id));
        if(faltam.length)localStorage.setItem('organizador.noticias.agenda.v1',JSON.stringify([...daNuvem,...faltam]));
      }
    }catch(erro){console.warn('Agenda: sem a nuvem, fica só neste navegador.',erro)}
  }
  const STORAGE_KEY='organizador.noticias.agenda.v1';
  const OPEN_KEY='organizador.noticias.agenda.aberta.v1';
  let saved=[];
  try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(value))saved=value}catch{}
  const persist=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const dateLabel=value=>{if(!value)return'';const d=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00'):new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})};
  const getCards=()=>[...document.querySelectorAll('.news-item, article[data-news-id], .section article')].filter(card=>!card.closest('.news-agenda-panel'));
  const readCard=card=>{
    const link=card.querySelector('a[href]');
    const title=(card.dataset.title||card.querySelector('h2,h3,h4')?.textContent||'').trim();
    const category=(card.dataset.category||card.closest('section')?.querySelector('h2')?.textContent||'Notícias').trim();
    const sourceUrl=card.dataset.sourceUrl||link?.href||'';
    const published=card.dataset.published||card.querySelector('time[datetime]')?.getAttribute('datetime')?.slice(0,10)||'';
    const eventDate=card.dataset.eventDate||'';
    return{id:card.dataset.newsId||sourceUrl||`${category}|${title}|${published}`,title,category,sourceUrl,published,eventDate};
  };
  const tab=document.createElement('button');tab.type='button';tab.className='news-agenda-tab';tab.setAttribute('aria-label','Abrir minha agenda de notícias');
  const panel=document.createElement('aside');panel.className='news-agenda-panel';panel.setAttribute('aria-label','Minha agenda de notícias');
  panel.innerHTML='<div class="news-agenda-header"><div><small>Notícias guardadas</small><h2>Minha agenda</h2></div><button class="news-agenda-close" type="button" aria-label="Minimizar agenda">×</button></div><div class="news-agenda-sub">Clique em uma notícia para guardá-la aqui. As datas de eventos aparecem quando informadas na matéria.</div><div class="news-agenda-list"></div>';
  document.body.append(tab,panel);
  let open=localStorage.getItem(OPEN_KEY)==='1';
  function setOpen(value){open=value;panel.classList.toggle('open',open);tab.hidden=open;localStorage.setItem(OPEN_KEY,open?'1':'0')}
  tab.onclick=()=>setOpen(true);panel.querySelector('.news-agenda-close').onclick=()=>setOpen(false);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open)setOpen(false)});
  function text(tag,className,value){const el=document.createElement(tag);el.className=className;el.textContent=value;return el}
  function renderGroup(list,label,items){if(!items.length)return;list.append(text('div','news-agenda-group',label));for(const item of items){
    const entry=document.createElement('div');entry.className='news-agenda-entry';
    entry.append(text('div','news-agenda-category',item.category||'Notícias'));
    entry.append(text('strong','news-agenda-title',item.title||'Notícia salva'));
    const details=item.eventDate?'Evento: '+dateLabel(item.eventDate):item.published?'Publicada em '+dateLabel(item.published):'Notícia salva';
    entry.append(text('div','news-agenda-date',details));
    const actions=document.createElement('div');actions.className='news-agenda-actions';
    if(/^https?:\/\//i.test(item.sourceUrl||'')){const source=document.createElement('a');source.href=item.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Abrir fonte ↗';actions.append(source)}else actions.append(document.createElement('span'));
    const remove=text('button','news-agenda-remove','Remover');remove.type='button';remove.onclick=()=>{saved=saved.filter(x=>x.id!==item.id);persist();render()};actions.append(remove);entry.append(actions);list.append(entry);
  }}
  function render(){
    tab.innerHTML=`Agenda <b>${saved.length}</b>`;
    const list=panel.querySelector('.news-agenda-list');list.replaceChildren();
    if(!saved.length)list.append(text('div','news-agenda-empty','Nenhuma notícia guardada. Clique em uma notícia da página para colocá-la na agenda.'));
    else{
      const upcoming=saved.filter(item=>item.eventDate&&item.eventDate>=today()).sort((a,b)=>a.eventDate.localeCompare(b.eventDate));
      const other=saved.filter(item=>!upcoming.includes(item)).sort((a,b)=>(b.savedAt||'').localeCompare(a.savedAt||''));
      renderGroup(list,'Próximos eventos',upcoming);renderGroup(list,'Notícias salvas',other);
    }
    for(const card of getCards()){
      const item=readCard(card),button=card.querySelector('.news-agenda-add');
      if(button){const exists=saved.some(x=>x.id===item.id);button.textContent=exists?'✓ Na agenda':'＋ Guardar na agenda';button.classList.toggle('saved',exists)}
    }
  }
  function saveCard(card){const item=readCard(card);if(!item.title)return; if(!saved.some(x=>x.id===item.id)){saved.unshift({...item,savedAt:new Date().toISOString()});persist()}render();setOpen(true)}
  for(const card of getCards()){
    card.classList.add('news-item');card.tabIndex=0;card.title='Clique para guardar na agenda';
    let button=card.querySelector('.news-agenda-add');
    if(!button){button=document.createElement('button');button.className='news-agenda-add';button.type='button';card.append(button)}
    button.onclick=event=>{event.stopPropagation();saveCard(card)};
    card.addEventListener('click',event=>{if(event.target.closest('a,button,input,select,textarea'))return;saveCard(card)});
    card.addEventListener('keydown',event=>{if(event.target!==card)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();saveCard(card)}});
  }
  setOpen(open);render();
})();
