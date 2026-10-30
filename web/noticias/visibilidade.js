(()=>{
  function atualizarSecoes(){
    document.querySelectorAll('section.section, section[data-news-section]').forEach(secao=>{
      const noticias=secao.querySelectorAll('article, .news-item');
      secao.hidden=noticias.length===0;
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',atualizarSecoes,{once:true});
  else atualizarSecoes();
})();
