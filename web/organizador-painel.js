// O painel do chat lê anotações do trabalho que ficam só neste computador (fora do git).
if(window.ORGANIZADOR?.servidorLocal){
// Aba "Painel": abre o painel do chat (painel.html?p=<nome>) numa janela propria,
// estreita, para ficar ao lado do chat. Mesmo estilo do link de Noticias.
const PAINEL_NOME='passivos';
const painelTab=document.createElement('a');
painelTab.className='news-tab';
painelTab.href='painel.html?p='+PAINEL_NOME;
painelTab.innerHTML='Painel <span class="external-mark" aria-hidden="true">↗</span>';
painelTab.setAttribute('aria-label','Abrir o painel em uma janela separada');
painelTab.addEventListener('click',e=>{
  const janela=window.open(painelTab.href,'painel_'+PAINEL_NOME,'popup,width=520,height=900');
  if(janela){e.preventDefault();janela.focus();}   // popup bloqueado: segue o link normal
});
document.querySelector('.news-tab').after(painelTab);
}
