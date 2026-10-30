const noticiasTab=document.createElement('a');
noticiasTab.className='news-tab';
noticiasTab.href='noticias/index.html';
noticiasTab.target='_blank';
noticiasTab.rel='noopener noreferrer';
noticiasTab.innerHTML='Notícias <span class="external-mark" aria-hidden="true">↗</span>';
noticiasTab.setAttribute('aria-label','Abrir notícias em uma nova aba ou janela');
document.querySelector('.side .hint').before(noticiasTab);
