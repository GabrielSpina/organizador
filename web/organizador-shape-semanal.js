// Aba Shape → Semanal: a leitura das semanas, só para ver.
// Os registros chegam pelo chat com o Claude, que grava com `registrar_semana.py` em
// dados/semanas.parquet. A leitura do que funcionou é feita no servidor
// (organizador/shape_inteligencia.py) e vem pronta em /api/semanas.
(()=>{
  const pagina=document.querySelector('.shape-page');
  if(!pagina)return;
  const MEDIDAS=[
    ['peso_kg','Peso','kg'],['imc','IMC',''],['gordura_pct','Gordura (BFR)','%'],['taxa_muscular_pct','Taxa muscular','%'],
    ['musculo_esqueletico_kg','Músculo esquelético','kg'],['agua_pct','Água','%'],['massa_ossea_kg','Massa óssea','kg'],
    ['tmb_kcal','Metabolismo basal','kcal'],['proteina_pct','Proteína','%'],['idade_corporal','Idade do corpo',''],
    ['gordura_visceral','Gordura visceral',''],['gordura_subcutanea_pct','Gordura subcutânea','%']];
  const SEGMENTOS=[['braco_d','Braço direito'],['braco_e','Braço esquerdo'],['tronco','Tronco'],['perna_d','Perna direita'],['perna_e','Perna esquerda']];
  const DIETA={seguiu:'Seguiu',parcial:'Em parte',nao_seguiu:'Não seguiu bem'};
  let semanas=[],analise=null,carregado=false;

  const num=(v,casas=1,sinal=false)=>v==null||!isFinite(v)?'—':(sinal&&v>0?'+':'')+v.toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas});
  const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dataLonga=iso=>new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'});

  // --- página --------------------------------------------------------------
  const aba=document.createElement('div');
  aba.className='shape-aba sem';aba.dataset.aba='semanal';aba.hidden=true;
  aba.innerHTML=`
    <div class="sem-como">Os registros de sexta chegam pelo chat: mande o print da balança e como foi a semana (protocolo, treino, dieta, comentários) que o Claude grava aqui.</div>
    <section class="card sem-dicas"><h2>O que funcionou e o que não funcionou</h2><div class="sem-dicas-lista"></div></section>
    <section class="card sem-historico"><h2>Semanas registradas</h2><div class="sem-linhas"></div></section>`;
  pagina.append(aba);
  const $a=s=>aba.querySelector(s);

  pagina.addEventListener('shape:aba',e=>{if(e.detail==='semanal'&&!carregado)carregar()});

  async function carregar(){
    try{
      const r=await fetch('/api/semanas');
      const dados=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(dados.erro||('Erro '+r.status));
      ({semanas,analise}=dados);carregado=true;desenhar();
    }catch(erro){$a('.sem-dicas-lista').innerHTML=`<div class="sem-dica alerta"><b>Não consegui ler as semanas</b><p>${html(erro.message)}. Se o organizador foi aberto antes desta versão, feche a janela do “Iniciar Organizador.bat” e abra de novo.</p></div>`}
  }

  // --- desenho -------------------------------------------------------------
  function todasAsMedidas(s){
    const medidas=MEDIDAS.map(([c,r,u])=>`<div><small>${r}</small><b>${num(s[c],c==='tmb_kcal'||c==='idade_corporal'||c==='gordura_visceral'?0:1)}${s[c]==null||!u?'':' '+u}</b></div>`).join('');
    const partes=SEGMENTOS.map(([c,r])=>`<tr><th>${r}</th><td>${num(s[c+'_gordura_kg'])}</td><td>${num(s[c+'_musculo_kg'])}</td></tr>`).join('');
    return `<div class="sem-medidas-lista">${medidas}</div><table class="sem-segmentos"><thead><tr><th>kg</th><th>Gordura</th><th>Músculo</th></tr></thead><tbody>${partes}</tbody></table>`;
  }
  function desenhar(){
    const ICONES={funcionou:'✅',nao_funcionou:'⚠️',indicio:'🔎',alerta:'❗',info:'ℹ️'};
    $a('.sem-dicas-lista').innerHTML=(analise?.dicas||[]).map(d=>`<div class="sem-dica ${d.tipo}"><b>${ICONES[d.tipo]||''} ${html(d.titulo)}</b><p>${html(d.texto)}</p></div>`).join('');
    const porData=new Map((analise?.evolucao||[]).map(l=>[l.data,l]));
    const linhas=[...semanas].reverse();
    $a('.sem-linhas').innerHTML=linhas.length?linhas.map(s=>{
      const l=porData.get(s.data)||{};
      const varia=(v,bomSeCai)=>v==null?'':`<small class="${v===0?'':(v<0)===bomSeCai?'desce':'sobe'}">${num(v,2,true)}/sem</small>`;
      return `<article class="sem-item ${l.resultado||''}">
        <header><b>${dataLonga(s.data)}</b>${l.resultado_texto?`<span class="sem-selo">${html(l.resultado_texto)}</span>`:''}</header>
        <div class="sem-numeros">
          <div><small>Peso</small><strong>${num(s.peso_kg)} kg</strong>${varia(l.d_peso,true)}</div>
          <div><small>Gordura</small><strong>${num(l.gordura_kg)} kg</strong><small>${num(s.gordura_pct)}%</small>${varia(l.d_gordura_kg,true)}</div>
          <div><small>Músculo esquelético</small><strong>${num(s.musculo_esqueletico_kg)} kg</strong>${varia(l.d_musculo_kg,false)}</div>
          <div><small>Visceral</small><strong>${num(s.gordura_visceral,0)}</strong>${varia(l.d_visceral,true)}</div>
          <div><small>Circunferência da cintura</small><strong>${l.cintura_cm==null?'—':num(l.cintura_cm)+' cm'}</strong>${varia(l.d_cintura_cm,true)}</div>
          <div><small>Água</small><strong>${num(s.agua_pct)}%</strong></div>
          <div><small>Média do peso diário</small><strong>${num(l.media_diaria_kg,2)} kg</strong>${varia(l.d_media_diaria,true)}</div>
        </div>
        <dl>${s.dieta?`<dt>Dieta</dt><dd>${DIETA[s.dieta]}</dd>`:''}
          <dt>Treinos</dt><dd>academia ${s.treinos_academia??'—'}x · jiu ${s.treinos_jiu??'—'}x</dd>
          ${s.protocolo?`<dt>Protocolo</dt><dd>${html(s.protocolo)}</dd>`:''}
          ${s.comentario?`<dt>Comentário</dt><dd>${html(s.comentario)}</dd>`:''}
          <dt>Balança</dt><dd><details><summary>todas as medidas</summary>${todasAsMedidas(s)}</details></dd>
          ${s.treino?`<dt>Treino</dt><dd><details><summary>ver divisão</summary>${html(s.treino)}</details></dd>`:''}</dl>
      </article>`}).join(''):'<div class="empty">Nenhuma semana registrada ainda.</div>';
  }
})();
