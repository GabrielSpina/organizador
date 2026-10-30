// Aba Shape: o peso de cada dia, o gráfico e a previsão.
// As pesagens moram em dados/pesos.parquet (via /api/pesos); a meta, no estado das telas.
// A previsão é uma reta de mínimos quadrados sobre as pesagens dos últimos 28 dias:
// a inclinação dá o ritmo (kg/dia), e a reta prolongada dá o peso em 30 dias e a data da meta.
(()=>{
  const META_KEY='organizador.shape.meta.v1',JANELA_DIAS=28,HORIZONTE=30,DIA_MS=864e5;
  const PRELIMINAR_PESAGENS=7,PRELIMINAR_DIAS=14;
  let pesos=[],medidas=[],meta=Number(localStorage.getItem(META_KEY))||90,carregado=false;
  // As medidas na fita entram no gráfico como linhas discretas, com eixo próprio em cm à direita.
  // Só as do método mais recente: medidas de métodos diferentes não se comparam (ver organizador/medidas.py).
  const FITA=[{campo:'cintura_cm',nome:'Circunferência da cintura',classe:'sh-fita-cintura'}];
  const cm=v=>v==null||!isFinite(v)?'—':v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' cm';

  const api=async(metodo,caminho,corpo)=>{
    const r=await fetch(caminho,{method:metodo,headers:{'Content-Type':'application/json','X-Organizador':'1'},body:corpo===undefined?undefined:JSON.stringify(corpo)});
    const dados=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(dados.erro||('Erro '+r.status));
    return dados;
  };
  const kg=(v,casas=1)=>v==null||!isFinite(v)?'—':v.toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas})+' kg';
  const diaNum=iso=>Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))/DIA_MS;
  const numDia=n=>new Date(n*DIA_MS).toISOString().slice(0,10);
  const dataLonga=iso=>new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
  const dataCurta=iso=>new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});

  // --- previsão ------------------------------------------------------------
  function previsao(){
    if(pesos.length<2)return null;
    const ultimo=diaNum(pesos[pesos.length-1].data);
    const janela=pesos.filter(p=>diaNum(p.data)>ultimo-JANELA_DIAS);
    const xs=janela.map(p=>diaNum(p.data)),ys=janela.map(p=>p.peso_kg),n=xs.length;
    const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
    const sxx=xs.reduce((s,x)=>s+(x-mx)**2,0);
    if(!sxx)return null;
    const inclinacao=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/sxx;
    const naReta=x=>my+inclinacao*(x-mx);
    const agora=naReta(ultimo),em30=naReta(ultimo+HORIZONTE);
    let diasMeta=null,situacaoMeta;
    if(agora<=meta)situacaoMeta='alcancada';
    else if(inclinacao<0){diasMeta=Math.ceil((meta-agora)/inclinacao);situacaoMeta='prevista'}
    else situacaoMeta='sem-queda';
    const intervalo=xs[n-1]-xs[0];
    return{inclinacao,naReta,ultimo,agora,em30,diasMeta,situacaoMeta,dataMeta:diasMeta!=null?numDia(ultimo+diasMeta):null,
      pesagens:n,intervalo,preliminar:n<PRELIMINAR_PESAGENS||intervalo<PRELIMINAR_DIAS};
  }

  // --- navegação e página --------------------------------------------------
  const navItem=document.createElement('div');
  navItem.className='nav';navItem.dataset.view='shape';navItem.textContent='💪 Shape';
  document.querySelector('.side [data-view=today]').after(navItem);
  const pagina=document.createElement('section');
  pagina.className='shape-page';pagina.hidden=true;
  pagina.innerHTML=`
    <nav class="shape-abas"><button type="button" data-aba="diario">Diário</button><button type="button" data-aba="semanal">Semanal (sexta)</button></nav>
    <div class="shape-aba" data-aba="diario">
    <form class="shape-registro card"><h2>Registrar peso e medidas</h2>
      <label>Dia<input type="date" name="data" required></label>
      <label>Peso (kg)<input type="number" name="peso" step="0.1" min="30" max="300" inputmode="decimal" placeholder="95,7"></label>
      <label>Circunferência da cintura (cm)<input type="number" name="cintura_cm" step="0.1" min="50" max="200" inputmode="decimal" placeholder="86,5"></label>
      <button class="add" type="submit">Salvar</button>
      <label class="shape-meta">Meta (kg)<input type="number" name="meta" step="0.1" min="30" max="300"></label></form>
    <div class="shape-aviso" hidden></div>
    <div class="shape-cards"></div>
    <section class="card shape-grafico"><div class="shape-grafico-cabeca"><h2>Peso por dia</h2><div class="shape-legenda"><span><i class="leg-peso"></i>Pesagem</span><span><i class="leg-tend"></i>Tendência e previsão</span><span><i class="leg-meta"></i>Meta</span><span class="shape-legenda-fita"></span></div></div><div class="shape-svg"></div><div class="shape-dica" hidden></div></section>
    <section class="card shape-tabela"><h2>Pesagens</h2><div class="shape-linhas"></div></section>
    </div>`;
  document.querySelector('.main').append(pagina);
  const $s=s=>pagina.querySelector(s);
  const form=$s('.shape-registro');
  form.elements.meta.value=meta;

  // Duas visões: o peso de todo dia e o registro de sexta (organizador-shape-semanal.js).
  const ABA_KEY='organizador.shape.aba.v1';
  const SUBTITULOS={diario:'Seu peso dia a dia, a tendência e quando a meta deve chegar.',
    semanal:'Toda sexta: bioimpedância, protocolo, treino e comentários — e o que funcionou.'};
  let aba=localStorage.getItem(ABA_KEY)==='semanal'?'semanal':'diario';
  function mostrarAba(){
    pagina.querySelectorAll('.shape-aba').forEach(d=>d.hidden=d.dataset.aba!==aba);
    pagina.querySelectorAll('.shape-abas button').forEach(b=>b.classList.toggle('on',b.dataset.aba===aba));
    document.querySelector('.head .muted').textContent=SUBTITULOS[aba];
    pagina.dispatchEvent(new CustomEvent('shape:aba',{detail:aba}));
  }
  pagina.querySelectorAll('.shape-abas button').forEach(b=>b.onclick=()=>{aba=b.dataset.aba;localStorage.setItem(ABA_KEY,aba);mostrarAba()});

  navItem.onclick=()=>{view='shape';nav();render();window.scrollTo({top:0})};
  const renderAntesDoShape=render;
  render=function(){
    renderAntesDoShape();
    const ativo=view==='shape';
    document.querySelector('.app').classList.toggle('shape-view',ativo);
    pagina.hidden=!ativo;
    if(ativo){
      document.querySelector('#title').textContent='Shape';
      if(!carregado)carregar();
      mostrarAba();
    }
  };

  async function carregar(){
    try{
      pesos=await api('GET','/api/pesos');
      // A fita é complemento: se a leitura falhar, o peso aparece do mesmo jeito.
      medidas=await api('GET','/api/medidas').catch(()=>[]);
      carregado=true;desenhar();
    }
    catch(erro){$s('.shape-aviso').hidden=false;$s('.shape-aviso').textContent='Não consegui ler os pesos: '+erro.message+'. Se o organizador foi aberto antes desta versão, feche a janela do “Iniciar Organizador.bat” e abra de novo.'}
  }

  form.elements.data.value=key(new Date());
  form.onsubmit=async e=>{
    e.preventDefault();
    // Cada campo é opcional, mas pelo menos um precisa vir. Campo em branco não apaga nada já gravado.
    const ler=nome=>{const t=String(form.elements[nome].value).trim().replace(',','.');return t===''?null:Number(t)};
    const dia=form.elements.data.value,peso=ler('peso');
    const fita={cintura_cm:ler('cintura_cm')};
    const temFita=Object.values(fita).some(v=>v!=null);
    if(peso==null&&!temFita){toast('Preencha o peso ou uma medida.');return}
    const salvos=[];
    try{
      if(peso!=null){await api('PUT',`/api/pesos/${dia}`,{peso_kg:peso});salvos.push('peso')}
      if(temFita){await api('PUT',`/api/medidas/${dia}`,fita);salvos.push('medidas')}
      for(const nome of ['peso','cintura_cm'])form.elements[nome].value='';
      form.elements.data.value=key(new Date());
      await carregar();
      pagina.dispatchEvent(new CustomEvent('shape:medidas-salvas'));
      toast(salvos.length===2?'Peso e medidas salvos.':salvos[0]==='peso'?'Peso salvo.':'Medidas salvas.');
    }catch(erro){toast((salvos.length?`Salvo: ${salvos.join(' e ')}. Falhou o resto: `:'')+erro.message)}
  };
  form.elements.meta.onchange=()=>{
    const valor=Number(String(form.elements.meta.value).replace(',','.'));
    if(!(valor>=30&&valor<=300))return;
    meta=valor;localStorage.setItem(META_KEY,String(meta));desenhar();
  };

  // --- desenho -------------------------------------------------------------
  function desenhar(){
    const p=previsao();
    const aviso=$s('.shape-aviso');
    if(p?.preliminar){
      aviso.hidden=false;
      aviso.innerHTML=`<b>Previsão preliminar.</b> Ela usa ${p.pesagens} pesagens em ${p.intervalo+1} dias. O peso varia perto de 1 kg de um dia para o outro (água, sal, intestino), então com poucos dias a reta exagera. A previsão fica confiável a partir de ${PRELIMINAR_PESAGENS} pesagens espalhadas por ${PRELIMINAR_DIAS} dias.`;
    }else aviso.hidden=true;
    desenharCards(p);desenharGrafico(p);desenharTabela();
  }
  function desenharCards(p){
    const ultima=pesos[pesos.length-1];
    const porSemana=p?p.inclinacao*7:null;
    let metaTitulo,metaTexto;
    if(!p){metaTitulo='—';metaTexto='Registre pelo menos dois dias para estimar.'}
    else if(p.situacaoMeta==='alcancada'){metaTitulo='Meta alcançada';metaTexto=`A tendência já está em ${kg(p.agora)}.`}
    else if(p.situacaoMeta==='sem-queda'){metaTitulo='Sem data';metaTexto='Na tendência atual o peso não está caindo, então a meta não tem data.'}
    else{metaTitulo=dataLonga(p.dataMeta);metaTexto=`Daqui a ${p.diasMeta} ${p.diasMeta===1?'dia':'dias'}, no ritmo de ${kg(porSemana,2)} por semana.`}
    $s('.shape-cards').innerHTML=`
      <div class="stat shape-card"><small>Peso atual</small><strong>${kg(ultima?.peso_kg)}</strong><small>${ultima?dataLonga(ultima.data):'Nenhuma pesagem ainda'}</small></div>
      <div class="stat shape-card"><small>Ritmo</small><strong>${porSemana==null?'—':(porSemana>0?'+':'')+kg(porSemana,2)}</strong><small>por semana, na tendência dos últimos ${JANELA_DIAS} dias</small></div>
      <div class="stat shape-card"><small>Previsão em ${HORIZONTE} dias</small><strong>${kg(p?.em30)}</strong><small>${p?'em '+dataLonga(numDia(p.ultimo+HORIZONTE)):'Registre pelo menos dois dias'}</small></div>
      <div class="stat shape-card shape-card-meta"><small>Quando chego a ${kg(meta)}</small><strong>${metaTitulo}</strong><small>${metaTexto}</small></div>`;
  }
  function desenharGrafico(p){
    const caixa=$s('.shape-svg'),dica=$s('.shape-dica');
    if(!pesos.length){caixa.innerHTML='<div class="empty">Registre o primeiro peso para ver o gráfico.</div>';return}
    const metodoAtual=medidas.length?medidas[medidas.length-1].metodo:null;
    const series=FITA.map(f=>({...f,pontos:medidas.filter(md=>md.metodo===metodoAtual&&md[f.campo]!=null).map(md=>({x:diaNum(md.data),v:md[f.campo]}))})).filter(f=>f.pontos.length);
    const W=820,H=300,m={l:52,r:series.length?56:18,t:series.length?28:16,b:30};
    const primeiroDia=Math.min(diaNum(pesos[0].data),...series.flatMap(f=>f.pontos.map(q=>q.x)));
    const x0=primeiroDia,x1=Math.max(diaNum(pesos[pesos.length-1].data)+(p?HORIZONTE:0),x0+1);
    const valores=[...pesos.map(q=>q.peso_kg),meta];
    if(p)valores.push(p.naReta(x0),p.em30);
    let y0=Math.min(...valores),y1=Math.max(...valores);
    const folga=Math.max((y1-y0)*.08,.5);y0-=folga;y1+=folga;
    const passo=[.5,1,2,5,10].find(s=>(y1-y0)/s<=6)||20;
    y0=Math.floor(y0/passo)*passo;y1=Math.ceil(y1/passo)*passo;
    const X=x=>m.l+(x-x0)/(x1-x0)*(W-m.l-m.r),Y=y=>m.t+(y1-y)/(y1-y0)*(H-m.t-m.b);
    let grade='',eixoX='';
    for(let y=y0;y<=y1+1e-9;y+=passo)grade+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(y)}" y2="${Y(y)}" class="sh-grade"/><text x="${m.l-8}" y="${Y(y)+4}" class="sh-eixo" text-anchor="end">${y.toLocaleString('pt-BR',{maximumFractionDigits:1})}</text>`;
    const passoX=Math.max(1,Math.ceil((x1-x0)/7));
    for(let x=x0;x<=x1;x+=passoX)eixoX+=`<text x="${X(x)}" y="${H-8}" class="sh-eixo" text-anchor="middle">${dataCurta(numDia(x))}</text>`;
    const ultimo=diaNum(pesos[pesos.length-1].data);
    const tendencia=p?`<line x1="${X(Math.max(x0,ultimo-JANELA_DIAS+1))}" y1="${Y(p.naReta(Math.max(x0,ultimo-JANELA_DIAS+1)))}" x2="${X(ultimo)}" y2="${Y(p.agora)}" class="sh-tend"/><line x1="${X(ultimo)}" y1="${Y(p.agora)}" x2="${X(ultimo+HORIZONTE)}" y2="${Y(p.em30)}" class="sh-prev"/><circle cx="${X(ultimo+HORIZONTE)}" cy="${Y(p.em30)}" r="4" class="sh-prev-ponto"/><text x="${X(ultimo+HORIZONTE)-6}" y="${Math.abs(Y(p.em30)-Y(meta))<18?Y(p.em30)+18:Y(p.em30)-10}" class="sh-rotulo" text-anchor="end">${kg(p.em30)}</text>`:'';
    const linha=pesos.map((q,i)=>`${i?'L':'M'}${X(diaNum(q.data))},${Y(q.peso_kg)}`).join(' ');
    const pontos=pesos.map(q=>`<circle cx="${X(diaNum(q.data))}" cy="${Y(q.peso_kg)}" r="4.5" class="sh-ponto"/>`).join('');
    const yMeta=Y(meta);
    // Eixo da direita, em cm, com escala própria (sem grade: a grade é a do peso).
    let fita='',eixoCm='';
    if(series.length){
      const vs=series.flatMap(f=>f.pontos.map(q=>q.v));
      let c0=Math.min(...vs),c1=Math.max(...vs);const folgaCm=Math.max((c1-c0)*.15,1);c0-=folgaCm;c1+=folgaCm;
      const passoCm=[.5,1,2,5,10].find(s=>(c1-c0)/s<=6)||20;
      c0=Math.floor(c0/passoCm)*passoCm;c1=Math.ceil(c1/passoCm)*passoCm;
      const C=v=>m.t+(c1-v)/(c1-c0)*(H-m.t-m.b);
      for(let v=c0;v<=c1+1e-9;v+=passoCm)eixoCm+=`<text x="${W-m.r+8}" y="${C(v)+4}" class="sh-eixo sh-eixo-cm">${v.toLocaleString('pt-BR',{maximumFractionDigits:1})}</text>`;
      eixoCm+=`<text x="${W-m.r+8}" y="11" class="sh-eixo sh-eixo-cm">cm</text>`;
      fita=series.map(f=>`<path d="${f.pontos.map((q,i)=>`${i?'L':'M'}${X(q.x)},${C(q.v)}`).join(' ')}" class="sh-fita ${f.classe}"/>${f.pontos.map(q=>`<circle cx="${X(q.x)}" cy="${C(q.v)}" r="3" class="sh-fita-ponto ${f.classe}"/>`).join('')}`).join('');
    }
    $s('.shape-legenda-fita').innerHTML=series.map(f=>`<span><i class="leg-fita ${f.classe}"></i>${f.nome} (cm, eixo à direita)</span>`).join('');
    caixa.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico do peso por dia, com tendência e previsão">${grade}${eixoX}
      <line x1="${m.l}" x2="${W-m.r}" y1="${yMeta}" y2="${yMeta}" class="sh-meta"/><text x="${W-m.r}" y="${yMeta-6}" class="sh-rotulo" text-anchor="end">Meta ${kg(meta)}</text>
      ${eixoCm}${fita}${tendencia}<path d="${linha}" class="sh-linha"/>${pontos}
      <line class="sh-mira" y1="${m.t}" y2="${H-m.b}" visibility="hidden"/>
      <rect x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" class="sh-alvo"/></svg>`;
    const svg=caixa.querySelector('svg'),mira=svg.querySelector('.sh-mira'),alvo=svg.querySelector('.sh-alvo');
    const porDia=new Map(pesos.map(q=>[diaNum(q.data),q.peso_kg]));
    alvo.onmousemove=e=>{
      const r=svg.getBoundingClientRect(),xs=(e.clientX-r.left)/r.width*W;
      const dia=Math.round(x0+(xs-m.l)/(W-m.l-m.r)*(x1-x0));
      if(dia<x0||dia>x1)return;
      mira.setAttribute('x1',X(dia));mira.setAttribute('x2',X(dia));mira.setAttribute('visibility','visible');
      const medido=porDia.get(dia),linhas=[`<b>${dataLonga(numDia(dia))}</b>`];
      if(medido!=null)linhas.push(`Pesagem: ${kg(medido)}`);
      for(const f of series){const q=f.pontos.find(q=>q.x===dia);if(q)linhas.push(`${f.nome}: ${cm(q.v)}`)}
      if(p&&dia>=Math.max(x0,ultimo-JANELA_DIAS+1))linhas.push(`${dia>ultimo?'Previsão':'Tendência'}: ${kg(p.naReta(dia))}`);
      dica.innerHTML=linhas.join('<br>');dica.hidden=false;
      const px=X(dia)/W*r.width;
      dica.style.left=Math.min(Math.max(px+12,0),r.width-190)+'px';
    };
    alvo.onmouseleave=()=>{mira.setAttribute('visibility','hidden');dica.hidden=true};
  }
  function desenharTabela(){
    const linhas=[...pesos].reverse();
    $s('.shape-linhas').innerHTML=linhas.length?`<table><thead><tr><th>Dia</th><th>Peso</th><th>Diferença</th><th></th></tr></thead><tbody>${linhas.map((q,i)=>{
      const anterior=linhas[i+1],dif=anterior?q.peso_kg-anterior.peso_kg:null;
      return `<tr><td>${dataLonga(q.data)}</td><td>${kg(q.peso_kg)}</td><td class="${dif==null?'':dif<0?'desce':dif>0?'sobe':''}">${dif==null?'—':(dif>0?'+':'')+kg(dif)}</td><td><button type="button" class="shape-editar" data-dia="${q.data}" data-peso="${q.peso_kg}">Editar</button><button type="button" class="shape-excluir" data-dia="${q.data}">Excluir</button></td></tr>`}).join('')}</tbody></table>`:'<div class="empty">Nenhuma pesagem ainda.</div>';
    pagina.querySelectorAll('.shape-editar').forEach(b=>b.onclick=()=>{form.elements.data.value=b.dataset.dia;form.elements.peso.value=b.dataset.peso;form.elements.peso.focus();window.scrollTo({top:0,behavior:'smooth'})});
    pagina.querySelectorAll('.shape-excluir').forEach(b=>b.onclick=async()=>{
      if(!confirm(`Excluir a pesagem de ${dataLonga(b.dataset.dia)}?`))return;
      try{await api('DELETE',`/api/pesos/${b.dataset.dia}`);await carregar()}catch(erro){toast(erro.message)}
    });
  }
})();
