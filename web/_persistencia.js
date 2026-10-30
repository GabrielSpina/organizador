// O estado das telas mora no servidor (dados/estado.parquet).
// As telas continuam usando localStorage: aqui ele é preenchido com o que veio
// do servidor antes de qualquer outro script rodar, e cada gravação sobe de volta.
(()=>{
  // Com a chave da nuvem neste navegador, quem guarda o estado é o nuvem.js (repositório do GitHub).
  // Ligar os dois faria um chamar o outro sem fim — e gravaria nos dois lugares.
  if(localStorage.getItem('organizador.nuvem.chave'))return;
  const estado=window.__ESTADO_ORGANIZADOR__||{};
  const gravar=Storage.prototype.setItem,remover=Storage.prototype.removeItem;
  for(const [chave,valor] of Object.entries(estado))gravar.call(localStorage,chave,valor);
  const pendentes=new Map();let agendado=null,falhou=false;
  function enviar(ultimaChance){
    agendado=null;
    for(const [chave,valor] of pendentes){
      fetch('/api/estado/'+encodeURIComponent(chave),{method:'PUT',keepalive:!!ultimaChance&&(valor||'').length<60000,headers:{'Content-Type':'application/json','X-Organizador':'1'},body:JSON.stringify({valor})})
        .then(r=>{if(!r.ok)throw new Error(r.status)})
        .catch(()=>{if(!falhou){falhou=true;alert('O organizador não conseguiu salvar no servidor. Confira se o "Iniciar Organizador.bat" está aberto — o que você mudar agora pode se perder.')}});
    }
    pendentes.clear();
  }
  function marcar(chave,valor){
    if(estado[chave]===valor)return;
    if(valor===null)delete estado[chave];else estado[chave]=valor;
    pendentes.set(chave,valor);agendado??=setTimeout(enviar,150);
  }
  Storage.prototype.setItem=function(chave,valor){gravar.call(this,chave,valor);if(this===localStorage)marcar(String(chave),String(valor))};
  Storage.prototype.removeItem=function(chave){remover.call(this,chave);if(this===localStorage)marcar(String(chave),null)};
  window.addEventListener('pagehide',()=>enviar(true));
})();
