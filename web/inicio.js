// Abertura do organizador: decide de onde vêm os dados e só então carrega as telas.
//
// - Com a chave do GitHub guardada neste navegador: os dados vêm do repositório
//   privado (nuvem.js). Vale no GitHub Pages e também no servidor local.
// - Sem a chave, no servidor local (porta 8765): como sempre, com os Parquet de dados/.
// - Sem a chave e fora do servidor local (GitHub Pages): pede o login, uma vez por máquina.
//
// As telas leem o localStorage no momento em que carregam, então os dados precisam
// estar lá ANTES delas — por isso elas não estão mais no organizador.html, e sim aqui,
// carregadas na mesma ordem de antes.
(()=>{
  const TELAS=[
    'organizador-base.js','organizador-extra.js','organizador-dia-neutro.js','organizador-cards.js',
    'organizador-tags.js','organizador-sort.js','organizador-mosaico.js','organizador-concluidos.js',
    'organizador-noticias.js','organizador-painel.js','organizador-descricao.js','organizador-projetos.js',
    'organizador-chats.js','organizador-shape.js','organizador-shape-semanal.js','organizador-shape-medidas.js',
    'organizador-projetos-ordem.js','organizador-meta-hj.js','organizador-heranca.js',
  ];
  window.ORGANIZADOR={nuvem:false,servidorLocal:false};

  function carregarTelas(){
    // async=false mantém a ordem de execução igual à da lista.
    for(const arquivo of TELAS){const s=document.createElement('script');s.src=arquivo;s.async=false;document.body.append(s)}
  }

  async function haServidorLocal(){
    if(!['127.0.0.1','localhost'].includes(location.hostname))return false;
    try{const r=await fetch('/api/claude/status',{cache:'no-store'});return r.ok}catch{return false}
  }

  (async()=>{
    ORGANIZADOR.servidorLocal=await haServidorLocal();
    try{
      const pronto=await Nuvem.iniciar();
      if(!pronto&&!ORGANIZADOR.servidorLocal)return; // ficou na tela de login
    }catch(erro){
      Nuvem.mostrarErro(erro);return;
    }
    carregarTelas();
  })();
})();
