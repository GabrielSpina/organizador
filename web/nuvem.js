// O organizador na nuvem: os dados moram em arquivos JSON num repositório PRIVADO do GitHub
// (DONO/REPO abaixo) e esta página — que é pública — só os enxerga com a chave de acesso.
//
// Login: uma vez por máquina. A chave (um "fine-grained token" do GitHub que só abre o
// repositório de dados) fica guardada neste navegador e é usada direto nas próximas
// aberturas. "Sair desta máquina" apaga a chave daqui; apagá-la no GitHub corta o acesso
// de todas as máquinas que a usam.
//
// Gravação: as telas continuam falando com os mesmos endereços /api/... do servidor local.
// Aqui esses endereços são atendidos no próprio navegador, lendo e gravando os arquivos do
// repositório. Cada arquivo junta as mudanças de alguns segundos num commit só; se outra
// máquina gravou no meio, o arquivo é lido de novo e as mudanças daqui são reaplicadas.
//
// Arquivos (todos listas de registros, no mesmo formato dos Parquet do servidor local):
//   estado.json  — cards, tags, projetos, histórico... ({chave, valor, atualizado_em})
//   pesos.json   — uma pesagem por dia            medidas.json — fita por dia
//   semanas.json — o registro de sexta            analise.json — a leitura das semanas
const Nuvem=(()=>{
  const DONO='GabrielSpina',REPO='organizador-dados',RAMO='main';
  const CHAVE_KEY='organizador.nuvem.chave';
  const API=`https://api.github.com/repos/${DONO}/${REPO}`;
  const ESPERA_GRAVACAO=1500;
  let chave=null;
  const fetchOriginal=window.fetch.bind(window);

  // --- texto <-> base64 (UTF-8) ---------------------------------------------------
  const emBase64=texto=>{const b=new TextEncoder().encode(texto);let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(s)};
  const deBase64=b64=>new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g,'')),c=>c.charCodeAt(0)));
  const agora=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`};

  class ChaveInvalida extends Error{}

  async function github(metodo,caminho,corpo){
    const r=await fetchOriginal(API+caminho,{method:metodo,cache:'no-store',headers:{
      'Authorization':'Bearer '+chave,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
      ...(corpo?{'Content-Type':'application/json'}:{})},body:corpo?JSON.stringify(corpo):undefined});
    if(r.status===401)throw new ChaveInvalida('A chave de acesso não vale mais (expirou ou foi apagada).');
    return r;
  }

  // --- um arquivo do repositório ----------------------------------------------------
  class Arquivo{
    constructor(nome){this.nome=nome;this.dados=null;this.sha=null;this.pendentes=[];this.timer=null;this.enviando=false;this.lendo=null}
    async ler(){
      const r=await github('GET',`/contents/${this.nome}?ref=${RAMO}`);
      if(r.status===404){this.sha=null;return []}
      if(!r.ok)throw new Error(`Não consegui ler ${this.nome} (${r.status}).`);
      const j=await r.json();
      let conteudo=j.content;
      if(!conteudo&&j.sha){ // arquivo acima de 1 MB: a API manda o conteúdo pelo blob
        const b=await github('GET',`/git/blobs/${j.sha}`);conteudo=(await b.json()).content;
      }
      this.sha=j.sha;
      return JSON.parse(deBase64(conteudo||'')||'[]');
    }
    async obter(){
      if(this.dados)return this.dados;
      this.lendo??=this.ler().then(d=>{this.dados=d;return d});
      return this.lendo;
    }
    // Aplica a mudança agora (a tela já vê) e agenda o commit.
    alterar(mudanca){mudanca(this.dados);this.pendentes.push(mudanca);Selo.mostrar('salvando');this.agendar()}
    agendar(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.enviar(),ESPERA_GRAVACAO)}
    async enviar(tentativa=0){
      if(this.enviando){this.agendar();return}
      if(!this.pendentes.length)return;
      this.enviando=true;
      const lote=this.pendentes.length;
      try{
        const r=await github('PUT',`/contents/${this.nome}`,{
          message:`${this.nome.replace('.json','')}: ${lote} ${lote===1?'mudança':'mudanças'} (${agora().replace('T',' ')})`,
          content:emBase64(JSON.stringify(this.dados,null,1)+'\n'),branch:RAMO,...(this.sha?{sha:this.sha}:{})});
        if(r.status===409||r.status===422){
          // Outra máquina gravou no meio: lê de novo e reaplica o que ainda não subiu daqui.
          if(tentativa>=3)throw new Error('O arquivo mudou em outra máquina várias vezes seguidas.');
          const frescos=await this.ler();
          this.pendentes.forEach(m=>m(frescos));this.dados.splice(0,this.dados.length,...frescos);
          this.enviando=false;return this.enviar(tentativa+1);
        }
        if(!r.ok)throw new Error(`O GitHub recusou a gravação de ${this.nome} (${r.status}).`);
        this.sha=(await r.json()).content.sha;
        this.pendentes.splice(0,lote);
      }catch(erro){
        if(erro instanceof ChaveInvalida){pedirLoginDeNovo(erro.message);return}
        Selo.mostrar('erro',erro.message);
        clearTimeout(this.timer);this.timer=setTimeout(()=>this.enviar(),15000);
      }finally{this.enviando=false}
      if(this.pendentes.length)this.agendar();
      else if(Selo.el?.dataset.situacao!=='erro'||!algumPendente())Selo.mostrar(algumPendente()?'salvando':'salvo');
    }
  }
  const arquivos={};
  const arquivo=nome=>arquivos[nome]??=new Arquivo(nome);
  const algumPendente=()=>Object.values(arquivos).some(a=>a.pendentes.length||a.enviando);

  // --- o estado das telas (o que elas guardam no localStorage) ----------------------
  const ehDoOrganizador=k=>!k.startsWith('organizador.nuvem.');
  // Sem a chave, nada dos seus dados fica neste navegador (nem para quem abrir as ferramentas dele).
  const ehDado=k=>ehDoOrganizador(k)&&(k.startsWith('ritmo.')||k.startsWith('organizador.'));
  function apagarDadosDoNavegador(){
    const remover=Storage.prototype.removeItem;
    for(const k of Object.keys(localStorage))if(ehDado(k)||k===CHAVE_KEY)remover.call(localStorage,k);
  }
  function prepararEstado(registros){
    // O que já estava neste navegador (de antes, ou do modo local) dá lugar ao da nuvem.
    for(const k of Object.keys(localStorage))if(ehDado(k))localStorage.removeItem(k);
    const gravar=Storage.prototype.setItem,remover=Storage.prototype.removeItem;
    for(const r of registros)gravar.call(localStorage,r.chave,r.valor);
    const doc=arquivo('estado.json');
    const definir=(k,v)=>{
      const atual=doc.dados.find(r=>r.chave===k);
      if(v===null?!atual:atual&&atual.valor===v)return;
      doc.alterar(lista=>{const i=lista.findIndex(r=>r.chave===k);if(v===null){if(i>=0)lista.splice(i,1)}else if(i>=0)Object.assign(lista[i],{valor:v,atualizado_em:agora()});else lista.push({chave:k,valor:v,atualizado_em:agora()})});
    };
    Storage.prototype.setItem=function(k,v){gravar.call(this,k,v);if(this===localStorage&&ehDoOrganizador(String(k)))definir(String(k),String(v))};
    Storage.prototype.removeItem=function(k){remover.call(this,k);if(this===localStorage&&ehDoOrganizador(String(k)))definir(String(k),null)};
  }

  // --- os endereços /api/... das telas, atendidos aqui ------------------------------
  const resposta=(dados,status=200)=>new Response(JSON.stringify(dados),{status,headers:{'Content-Type':'application/json'}});
  const porData=lista=>[...lista].sort((a,b)=>a.data.localeCompare(b.data));
  const numero=(v,min,max,casas,rotulo)=>{
    if(v==null||String(v).trim()==='')return null;
    const n=Number(String(v).replace(',','.'));
    if(!isFinite(n))throw new Error(`${rotulo}: valor inválido.`);
    const r=Math.round(n*10**casas)/10**casas;
    if(r<min||r>max)throw new Error(`${rotulo}: ${r} está fora do esperado (${min} a ${max}).`);
    return r;
  };
  const dia=t=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new Error('Dia inválido.');return t};
  // Os mesmos campos de organizador/medidas.py (CAMPOS). Desde 22/10/2026 é um só: a cintura.
  const CAMPOS_FITA={cintura_cm:'Circunferência da cintura'};

  async function atender(metodo,caminho,corpo){
    let m;
    if(caminho==='/api/estado'&&metodo==='GET'){const l=await arquivo('estado.json').obter();return resposta(Object.fromEntries(l.map(r=>[r.chave,r.valor])))}
    if((m=caminho.match(/^\/api\/estado\/(.+)$/))&&metodo==='PUT'){
      const k=decodeURIComponent(m[1]),v=corpo.valor??null;
      v===null?localStorage.removeItem(k):localStorage.setItem(k,v);return resposta({ok:true});
    }
    if(caminho==='/api/importar'&&metodo==='POST'){
      const gravadas=[];
      for(const [k,v] of Object.entries(corpo.valores||{})){if(typeof v!=='string')continue;if(localStorage.getItem(k)!==null&&!corpo.sobrescrever)continue;localStorage.setItem(k,v);gravadas.push(k)}
      return resposta({gravadas});
    }
    if(caminho==='/api/pesos'&&metodo==='GET')return resposta(porData(await arquivo('pesos.json').obter()));
    if((m=caminho.match(/^\/api\/pesos\/(.+)$/))){
      const d=dia(m[1]),doc=arquivo('pesos.json');await doc.obter();
      if(metodo==='PUT'){
        const peso=numero(corpo.peso_kg,30,300,2,'Peso');if(peso==null)throw new Error('Peso inválido.');
        const reg={data:d,peso_kg:peso,atualizado_em:agora()};
        doc.alterar(l=>{const i=l.findIndex(p=>p.data===d);i>=0?l.splice(i,1,reg):l.push(reg)});return resposta(reg);
      }
      if(metodo==='DELETE'){doc.alterar(l=>{const i=l.findIndex(p=>p.data===d);if(i>=0)l.splice(i,1)});return resposta({ok:true})}
    }
    if(caminho==='/api/medidas'&&metodo==='GET')return resposta(porData(await arquivo('medidas.json').obter()));
    if((m=caminho.match(/^\/api\/medidas\/(.+)$/))&&metodo==='PUT'){
      // Mesma regra do organizador/medidas.py: campo em branco preserva o que já havia; o
      // método repete o da medida anterior (medidas de métodos diferentes não se comparam).
      const d=dia(m[1]),doc=arquivo('medidas.json');await doc.obter();
      const novos=Object.fromEntries(Object.entries(CAMPOS_FITA).map(([c,r])=>[c,numero(corpo[c],50,200,1,r)]));
      if(Object.values(novos).every(v=>v==null))throw new Error('Nenhuma medida informada.');
      let gravada;
      doc.alterar(l=>{
        const atual=l.find(x=>x.data===d),anteriores=porData(l).filter(x=>x.data<d);
        const metodo=corpo.metodo||atual?.metodo||anteriores[anteriores.length-1]?.metodo||'novo_metodo_padronizado';
        const reg={data:d,...Object.fromEntries(Object.keys(CAMPOS_FITA).map(c=>[c,atual?.[c]??null]))};
        for(const [c,v] of Object.entries(novos))if(v!=null)reg[c]=v;
        Object.assign(reg,{metodo,atualizado_em:agora()});gravada=reg;
        const i=l.findIndex(x=>x.data===d);i>=0?l.splice(i,1,reg):l.push(reg);
      });
      return resposta(gravada);
    }
    if(caminho==='/api/semanas'&&metodo==='GET'){
      const [semanas,analise]=await Promise.all([arquivo('semanas.json').obter(),arquivo('analise.json').obter()]);
      return resposta({semanas:porData(semanas),analise:Array.isArray(analise)&&!analise.length?null:analise});
    }
    return null; // não é dado: vai para o servidor local, se houver
  }

  function interceptarApi(){
    window.fetch=async(entrada,opcoes={})=>{
      const url=new URL(typeof entrada==='string'?entrada:entrada.url,location.href);
      if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return fetchOriginal(entrada,opcoes);
      const metodo=(opcoes.method||'GET').toUpperCase();
      let corpo={};try{corpo=opcoes.body?JSON.parse(opcoes.body):{}}catch{}
      try{
        const r=await atender(metodo,url.pathname,corpo);
        if(r)return r;
      }catch(erro){
        if(erro instanceof ChaveInvalida){pedirLoginDeNovo(erro.message);return resposta({erro:erro.message},401)}
        return resposta({erro:erro.message},400);
      }
      if(ORGANIZADOR.servidorLocal)return fetchOriginal(entrada,opcoes);
      return resposta({erro:'Disponível só no organizador do seu computador.'},503);
    };
  }

  // --- selo "salvo na nuvem" e saída ------------------------------------------------
  const Selo={
    el:null,
    criar(){
      this.el=document.createElement('div');this.el.className='nuvem-selo';
      this.el.innerHTML='<span class="nuvem-selo-texto"></span><button type="button" class="nuvem-sair">Sair desta máquina</button>';
      this.el.querySelector('.nuvem-sair').onclick=()=>{
        if(algumPendente()&&!confirm('Ainda há mudanças subindo para a nuvem. Sair mesmo assim e perdê-las?'))return;
        if(!confirm('Sair desta máquina? Para entrar de novo será preciso a chave de acesso.'))return;
        apagarDadosDoNavegador();location.reload();
      };
      document.body.append(this.el);this.mostrar('salvo');
    },
    mostrar(situacao,detalhe=''){
      if(!this.el)return;
      const textos={salvo:'☁ Salvo na nuvem',salvando:'☁ Salvando…',erro:'⚠ Não salvou — tentando de novo'};
      this.el.dataset.situacao=situacao;
      this.el.querySelector('.nuvem-selo-texto').textContent=textos[situacao];
      this.el.title=detalhe||'Dados no repositório privado '+DONO+'/'+REPO;
    },
  };
  window.addEventListener('beforeunload',e=>{if(algumPendente()){e.preventDefault();e.returnValue=''}});

  const esconderApp=(esconder=true)=>{const app=document.querySelector('.app');if(app)app.hidden=esconder};

  // --- login ---------------------------------------------------------------------------
  function telaDeLogin(mensagem){
    const nomeMaquina=(navigator.userAgentData?.platform||navigator.platform||'maquina').replace(/\W+/g,'-').toLowerCase();
    const linkChave='https://github.com/settings/personal-access-tokens/new?'+new URLSearchParams({
      name:'organizador-'+nomeMaquina,description:'Organizador: acesso só ao repositório '+REPO,target_name:DONO,contents:'write'});
    const tela=document.createElement('div');tela.className='nuvem-login';
    tela.innerHTML=`<form class="nuvem-login-caixa">
      <h1>✳ organizador</h1>
      <p>Para abrir os seus dados neste aparelho, cole a chave de acesso do GitHub. É uma vez só: depois este navegador lembra.</p>
      ${mensagem?`<p class="nuvem-login-erro">${mensagem}</p>`:''}
      <label>Chave de acesso<input type="password" name="chave" autocomplete="off" required placeholder="github_pat_..."></label>
      <button type="submit">Entrar</button>
      ${ORGANIZADOR.servidorLocal?'<button type="button" class="nuvem-login-voltar">Continuar sem a nuvem (dados antigos deste computador)</button>':''}
      <details><summary>Como criar a chave</summary><ol>
        <li>Abra <a href="${linkChave}" target="_blank" rel="noopener noreferrer">a página de chaves do GitHub</a> (já vem com nome e permissão sugeridos).</li>
        <li>Em <b>Repository access</b>, escolha <b>Only select repositories</b> → <b>${REPO}</b>.</li>
        <li>Em <b>Permissions → Contents</b>, deixe <b>Read and write</b>. Nada mais.</li>
        <li>Em <b>Expiration</b>, escolha o prazo (o mais longo que o GitHub deixar). Quando vencer, a página pede uma nova.</li>
        <li>Clique em <b>Generate token</b>, copie e cole aqui.</li>
      </ol><p>Uma chave por aparelho: se perder um, apague só a chave dele no GitHub.</p></details>
    </form>`;
    document.body.append(tela);
    const form=tela.querySelector('form');
    form.onsubmit=async e=>{
      e.preventDefault();
      const candidata=form.elements.chave.value.trim();
      const botao=form.querySelector('button');botao.disabled=true;botao.textContent='Conferindo…';
      chave=candidata;
      try{
        const r=await github('GET','');
        if(r.status===404)throw new Error(`Essa chave não enxerga o repositório ${DONO}/${REPO}. Confira o "Repository access".`);
        if(!r.ok)throw new Error(`O GitHub respondeu ${r.status}.`);
        localStorage.setItem(CHAVE_KEY,candidata);location.reload();
      }catch(erro){
        chave=null;botao.disabled=false;botao.textContent='Entrar';
        let aviso=form.querySelector('.nuvem-login-erro');
        if(!aviso){aviso=document.createElement('p');aviso.className='nuvem-login-erro';form.querySelector('label').before(aviso)}
        aviso.textContent=erro instanceof ChaveInvalida?'Chave não aceita pelo GitHub. Confira se copiou inteira.':erro.message;
      }
    };
    form.querySelector('.nuvem-login-voltar')?.addEventListener('click',()=>{tela.remove();esconderApp(false)});
    form.elements.chave.focus();
  }
  // No computador, sem a chave, a página mostra os Parquet de dados/ — que pararam no dia da
  // migração para a nuvem (30/10/2026). O aviso evita mexer neles achando que são os de hoje.
  function avisoDadosLocais(){
    const aviso=document.createElement('div');aviso.className='nuvem-aviso-local';
    aviso.innerHTML='<span><b>Dados antigos deste computador.</b> Desde 30/10/2026 os seus dados ficam na nuvem; o que mudar aqui não aparece no celular nem na web.</span><button type="button">Entrar com a chave</button>';
    aviso.querySelector('button').onclick=()=>{esconderApp();telaDeLogin()};
    document.body.prepend(aviso);
  }
  function pedirLoginDeNovo(mensagem){
    apagarDadosDoNavegador();
    if(!document.querySelector('.nuvem-login')){esconderApp();telaDeLogin(mensagem+' Cole uma chave nova.')}
  }

  // --- abertura ------------------------------------------------------------------------
  // Devolve true quando as telas podem carregar (nuvem pronta, ou modo local sem chave).
  async function iniciar(){
    chave=localStorage.getItem(CHAVE_KEY);
    if(!chave){
      if(!ORGANIZADOR.servidorLocal){apagarDadosDoNavegador();esconderApp();telaDeLogin();return false}
      avisoDadosLocais();
      return true; // modo local de sempre (Parquet em dados/)
    }
    try{
      const estado=await arquivo('estado.json').obter();
      prepararEstado(estado);
    }catch(erro){
      if(erro instanceof ChaveInvalida){esconderApp();pedirLoginDeNovo(erro.message);return false}
      throw erro;
    }
    ORGANIZADOR.nuvem=true;
    interceptarApi();
    Selo.criar();
    return true;
  }
  function mostrarErro(erro){
    const caixa=document.createElement('div');caixa.className='nuvem-login';
    caixa.innerHTML=`<div class="nuvem-login-caixa"><h1>✳ organizador</h1><p class="nuvem-login-erro">Não consegui abrir os dados: ${String(erro.message||erro).replace(/</g,'&lt;')}</p><button type="button">Tentar de novo</button></div>`;
    caixa.querySelector('button').onclick=()=>location.reload();
    esconderApp();document.body.append(caixa);
  }
  return{iniciar,mostrarErro};
})();
