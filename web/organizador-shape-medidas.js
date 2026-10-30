// Aba Shape → Diário: a circunferência da cintura, medida na fita, por dia.
// As medidas entram pelo formulário do Diário (organizador-shape.js) ou pelo chat (registrar_medidas.py),
// em dados/medidas.parquet. A diferença só é calculada entre medidas do MESMO método.
(()=>{
  const diario=document.querySelector('.shape-page .shape-aba[data-aba=diario]');
  if(!diario)return;
  const CAMPOS=[['cintura_cm','Circunferência da cintura']];
  const METODOS={novo_metodo_padronizado:'padronizado (desde 15/10/2026)'};
  let carregado=false;
  const num=(v,sinal=false)=>v==null||!isFinite(v)?'—':(sinal&&v>0?'+':'')+v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
  const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dataLonga=iso=>new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'});

  const secao=document.createElement('section');
  secao.className='card shape-medidas';
  secao.innerHTML='<h2>Medidas na fita</h2><div class="shape-medidas-resumo"></div><div class="shape-medidas-linhas"></div>';
  diario.querySelector('.shape-tabela').before(secao);

  document.querySelector('.shape-page').addEventListener('shape:aba',e=>{if(e.detail==='diario'&&!carregado)carregar()});
  document.querySelector('.shape-page').addEventListener('shape:medidas-salvas',()=>carregar());

  async function carregar(){
    try{
      const r=await fetch('/api/medidas');
      const medidas=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(medidas.erro||('Erro '+r.status));
      carregado=true;desenhar(medidas);
    }catch(erro){secao.querySelector('.shape-medidas-resumo').innerHTML=`<div class="shape-aviso">Não consegui ler as medidas: ${html(erro.message)}. Se o organizador foi aberto antes desta versão, feche a janela do “Iniciar Organizador.bat” e abra de novo.</div>`}
  }

  function desenhar(medidas){
    const linhas=secao.querySelector('.shape-medidas-linhas'),resumo=secao.querySelector('.shape-medidas-resumo');
    if(!medidas.length){linhas.innerHTML='<div class="empty">Nenhuma medida ainda. Mande pelo chat.</div>';resumo.innerHTML='';return}
    // Resumo: do primeiro ao último valor do método atual, por campo.
    const metodo=medidas[medidas.length-1].metodo,doMetodo=medidas.filter(m=>m.metodo===metodo);
    resumo.innerHTML=CAMPOS.map(([c,r])=>{
      const serie=doMetodo.filter(m=>m[c]!=null);
      if(!serie.length)return `<div class="stat shape-card"><small>${r}</small><strong>—</strong><small>ainda não medida</small></div>`;
      const ult=serie[serie.length-1],var_=serie.length>1?ult[c]-serie[0][c]:null;
      return `<div class="stat shape-card"><small>${r}</small><strong>${num(ult[c])} cm</strong><small>${var_==null?'primeira medida, em '+dataLonga(ult.data):`${num(var_,true)} cm desde ${dataLonga(serie[0].data)}`}</small></div>`;
    }).join('');
    // Tabela: mais recente primeiro; a diferença é para a medida anterior do mesmo método.
    const lista=[...medidas].reverse();
    const anteriorDe=(i,c)=>lista.slice(i+1).find(m=>m[c]!=null&&m.metodo===lista[i].metodo);
    const celula=(m,i,c)=>{
      if(m[c]==null)return '<td>—</td><td></td>';
      const a=anteriorDe(i,c),d=a?m[c]-a[c]:null;
      return `<td>${num(m[c])} cm</td><td class="${d==null||d===0?'':d<0?'desce':'sobe'}">${d==null?'—':num(d,true)}</td>`;
    };
    linhas.innerHTML=`<table><thead><tr><th>Dia</th><th>Cintura</th><th>Diferença</th><th>Método</th></tr></thead><tbody>${lista.map((m,i)=>
      `<tr><td>${dataLonga(m.data)}</td>${celula(m,i,'cintura_cm')}<td>${html(METODOS[m.metodo]||m.metodo)}</td></tr>`).join('')}</tbody></table>`;
  }
})();
