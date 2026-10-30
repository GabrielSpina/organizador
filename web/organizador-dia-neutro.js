// "Dia neutro": um dia que não conta — nem como feito, nem como falha.
// Para viagem, folga, ou um dia em que se fez as coisas mas não se anotou.
// A caixinha no topo da lista marca o dia que está sendo visto (o "chosen").
// Quem respeita o dia neutro:
//   - as taxas dos recorrentes (recurringStats, em organizador-concluidos.js) e os números por projeto;
//   - a contagem do trabalho na semana/mês (organizador-concluidos.js);
//   - a Meta hj: meta de dia neutro não vai para "não atingidas" (organizador-meta-hj.js);
//   - o card recorrente atrasado (deixa de ficar vermelho);
//   - "Últimos 7 dias" e o gráfico de atividade (renderChart, abaixo).
// Os outros módulos perguntam por window.diaNeutro(dia), com dia em AAAA-MM-DD.
(()=>{
  const NEUTROS_KEY='organizador.dias-neutros.v1';
  let neutros=new Set();
  try{const lidos=JSON.parse(localStorage.getItem(NEUTROS_KEY)||'[]');if(Array.isArray(lidos))neutros=new Set(lidos)}catch{}
  const salvar=()=>localStorage.setItem(NEUTROS_KEY,JSON.stringify([...neutros].sort()));
  window.diaNeutro=dia=>neutros.has(dia);

  const controle=document.createElement('div');controle.className='dia-neutro';
  controle.innerHTML='<label title="Marque para este dia não contar nos seus indicadores"><input type="checkbox"> Dia neutro <small>(não conta: nem feito, nem falha)</small></label><span class="dia-neutro-aviso" hidden>Este dia não conta nos indicadores.</span>';
  document.querySelector('#list').before(controle);
  const caixa=controle.querySelector('input');
  caixa.onchange=()=>{const dia=key(chosen);caixa.checked?neutros.add(dia):neutros.delete(dia);salvar();render()};

  // O gráfico de atividade e o "Últimos 7 dias" sem os dias neutros.
  renderChart=function(){
    const nomes=['dom','seg','ter','qua','qui','sex','sáb'];
    const dias=Array.from({length:7},(_,i)=>{
      const d=new Date();d.setDate(d.getDate()-6+i);
      const neutro=diaNeutro(key(d));
      const n=neutro?0:tasks.reduce((s,t)=>s+(t.kind==='once'&&t.done&&t.completedAt===key(d)?1:t.kind==='recurring'&&(t.days||[]).includes(key(d))?1:0),0);
      return{d,n,neutro};
    });
    const maximo=Math.max(1,...dias.map(x=>x.n));
    document.querySelector('#total').textContent=dias.reduce((s,x)=>s+x.n,0);
    document.querySelector('#chart').innerHTML=dias.map(x=>`<div class="col${x.neutro?' neutro':''}" title="${x.neutro?'Dia neutro: não conta':''}"><div class="bar"><i style="height:${x.n/maximo*100}%"></i></div>${nomes[x.d.getDay()]}</div>`).join('');
  };

  const renderAntesDoNeutro=render;
  render=function(){
    renderAntesDoNeutro();
    const neutro=diaNeutro(key(chosen));
    caixa.checked=neutro;
    controle.classList.toggle('ligado',neutro);
    controle.querySelector('.dia-neutro-aviso').hidden=!neutro;
    // Num dia neutro nada fica "atrasado". (Roda antes das tags, que só pintam card sem atraso.)
    if(neutro)document.querySelectorAll('#list .row.overdue').forEach(row=>row.classList.remove('overdue'));
    // Na semana, o dia neutro aparece apagado.
    const hoje=new Date(),inicio=new Date(hoje);inicio.setDate(inicio.getDate()-((inicio.getDay()+6)%7));
    document.querySelectorAll('#week .day').forEach(el=>{
      const d=new Date(inicio);d.setDate(inicio.getDate()+Number(el.dataset.day));
      el.classList.toggle('neutro',diaNeutro(key(d)));
    });
  };
  render();
})();
