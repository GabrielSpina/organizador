const mosaicWelcome=document.createElement('section');
mosaicWelcome.className='mosaic-welcome';
// O banner mostra um item da lista (citação ou título); um clique em qualquer ponto passa para a próxima.
// As fotos moram em web/imagens/; a escolha fica no estado das telas. Foto que não carrega
// vira o quadrado decorativo, só naquele banner.
const BANNERS=[
  {tema:'cbum',foto:'imagens/cbum.jpg',alt:'Chris Bumstead',frase:"Don't be a skinny bitch",autor:'Chris Bumstead (CBum)'},
  {tema:'bruce',foto:'imagens/bruce_lee.jpg',alt:'Bruce Lee',frase:'Be water',autor:'Bruce Lee'},
  // Sem "frase": não é citação, é um título solto (sem aspas e sem autor).
  // "contagem": data-alvo (meia-noite do dia, hora local) de uma contagem regressiva embaixo do título.
  {tema:'faixa-azul',foto:'imagens/blue_belt.jpg',alt:'Faixa azul de jiu-jitsu',titulo:'Dezembro 2026',contagem:'2026-12-12'},
  // Itens novos entram no FIM: a escolha salva é a posição na lista.
  {tema:'charlie',foto:'imagens/charlie.jpg',alt:'Charles do Bronx',frase:'É tempo ruim o tempo todo',autor:'Charles do Bronx'},
  {tema:'jigoro',foto:'imagens/jigoro_kano.jpg',alt:'Jigoro Kano',frase:'Conhecer-se é dominar-se, dominar-se é triunfar.',autor:'Jigoro Kano'},
];
const BANNER_KEY='organizador.banner.v1';
let bannerAtual=Math.min(Math.max(Number(localStorage.getItem(BANNER_KEY))||0,0),BANNERS.length-1);
let relogioContagem=null;
// Escreve quanto falta para a data-alvo; no próprio dia, "É hoje!"; depois, "Chegou o dia".
function atualizarContagem(caixa,alvoIso){
  const alvo=new Date(alvoIso+'T00:00:00'),agora=new Date(),dois=n=>String(n).padStart(2,'0');
  const diaAlvo=alvo.toLocaleDateString('pt-BR');
  if(agora>=alvo){
    caixa.innerHTML=key(agora)===alvoIso?'<b class="contagem-hoje">É hoje!</b>':`<small>Chegou o dia: ${diaAlvo}</small>`;
    return false;
  }
  let resto=Math.floor((alvo-agora)/1000);
  const dias=Math.floor(resto/86400);resto%=86400;
  const horas=Math.floor(resto/3600);resto%=3600;
  const minutos=Math.floor(resto/60),segundos=resto%60;
  caixa.innerHTML=`<span><b>${dias}</b><small>${dias===1?'dia':'dias'}</small></span><span><b>${dois(horas)}</b><small>h</small></span><span><b>${dois(minutos)}</b><small>min</small></span><span><b>${dois(segundos)}</b><small>s</small></span><em>até ${diaAlvo}</em>`;
  return true;
}
function mostrarBanner(){
  clearInterval(relogioContagem);relogioContagem=null;
  const b=BANNERS[bannerAtual];
  mosaicWelcome.className='mosaic-welcome com-foto tema-'+b.tema;
  mosaicWelcome.innerHTML=`<img class="mosaic-photo" src="${b.foto}" alt="${esc(b.alt)}">${b.frase?`<blockquote class="mosaic-quote"><h2>“${esc(b.frase)}”</h2><p>— ${esc(b.autor)}</p></blockquote>`:`<div class="mosaic-titulo"><h2>${esc(b.titulo)}</h2>${b.contagem?'<div class="mosaic-contagem" aria-live="off"></div>':''}</div>`}<div class="mosaic-welcome-shape" aria-hidden="true" hidden></div>`;
  mosaicWelcome.querySelector('.mosaic-photo').onerror=function(){this.remove();mosaicWelcome.classList.remove('com-foto');mosaicWelcome.querySelector('.mosaic-welcome-shape').hidden=false};
  const caixa=mosaicWelcome.querySelector('.mosaic-contagem');
  if(caixa&&atualizarContagem(caixa,b.contagem))relogioContagem=setInterval(()=>{if(!atualizarContagem(caixa,b.contagem))clearInterval(relogioContagem)},1000);
}
mosaicWelcome.title='Clique para trocar o banner';
mosaicWelcome.onclick=()=>{bannerAtual=(bannerAtual+1)%BANNERS.length;localStorage.setItem(BANNER_KEY,String(bannerAtual));mostrarBanner()};
mostrarBanner();
document.querySelector('.stats').before(mosaicWelcome);
document.querySelector('#title').textContent='Olá, Gabriel 👋';
const mosaicRing=document.createElement('div');
mosaicRing.className='mosaic-ring';
mosaicRing.innerHTML='<b>0%</b>';
document.querySelector('.stats .stat').append(mosaicRing);
const renderBeforeMosaic=render;
render=function(){
  renderBeforeMosaic();
  const value=document.querySelector('#done').textContent.split('/').map(Number);
  const percent=value[1]?Math.round(value[0]/value[1]*100):0;
  mosaicRing.style.background=`conic-gradient(#549866 0 ${percent}%,#a9d9b2 ${percent}% 100%)`;
  mosaicRing.querySelector('b').textContent=percent+'%';
};
render();
