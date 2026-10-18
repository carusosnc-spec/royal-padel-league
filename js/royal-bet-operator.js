/**
 * Royal Bet Lab — operator console scaffold.
 * Mount inside the existing protected operator area:
 * window.RoyalBetOperator.mount(document.querySelector('#royal-bet-operator'))
 * Database RPCs perform the authoritative operator authorization.
 */
(function () {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = v => Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });
  const sb = () => {
    const c = window.sb || window.supabaseClient;
    if (!c || typeof c.rpc !== 'function') throw new Error('Sessione RPL non inizializzata.');
    return c;
  };
  async function assertOperator() {
    const c=sb();
    const {data:{user},error:uerr}=await c.auth.getUser();
    if(uerr) throw uerr;
    if(!user) throw new Error('Accedi dall’Area Riservata RPL.');
    const {data,error}=await c.from('operators').select('user_id').eq('user_id',user.id).maybeSingle();
    if(error) throw error;
    if(!data) throw new Error('Accesso riservato agli operatori.');
    return user;
  }
  async function refresh(root) {
    const c=sb();
    await assertOperator();
    const {data:markets,error}=await c.from('rpl_bet_markets')
      .select('id,calendar_match_id,market_type,set_number,selection_key,selection_label,odds,status,opens_at,closes_at,market_scope,season_key,created_at')
      .order('created_at',{ascending:false}).limit(150);
    if(error) throw error;
    const rows=markets||[];
    root.querySelector('[data-rbo-list]').innerHTML=rows.length ? rows.map(m=>`
      <article class="rbo-row">
        <div class="rbo-main"><strong>#${m.id} · ${esc(m.market_type)}</strong>
          <div>${esc(m.selection_label)} <span class="rbo-muted">(${esc(m.selection_key)})</span></div>
          <div class="rbo-muted">${m.market_scope==='season'?'Stagione '+esc(m.season_key):'Partita #'+esc(m.calendar_match_id)} · Set ${esc(m.set_number||'—')} · ${esc(m.status)}</div>
        </div>
        <div class="rbo-actions">
          <label class="rbo-muted">Quota <input class="rbo-input" type="number" min="1.01" max="1000" step=".01" value="${esc(m.odds)}" data-odds="${m.id}"></label>
          <button class="rbo-btn" data-save-odds="${m.id}">Salva quota</button>
          ${['draft','closed'].includes(m.status)?'<button class="rbo-btn" data-status="'+m.id+'" data-next="open">Apri</button>':''}
          ${m.status==='open'?'<button class="rbo-btn" data-status="'+m.id+'" data-next="closed">Chiudi</button>':''}
          ${['open','closed'].includes(m.status)?'<button class="rbo-btn" data-settle="'+m.id+'" data-selection="'+esc(m.selection_key)+'">Dichiara vincente</button><button class="rbo-btn" data-void="'+m.id+'">Annulla / rimborsa</button>':''}
        </div>
      </article>`).join(''):'<div class="rbo-empty">Nessun mercato trovato.</div>';
    root.querySelector('[data-rbo-count]').textContent=rows.length+' mercati caricati';
    root.querySelectorAll('[data-save-odds]').forEach(b=>b.onclick=async()=>{
      const input=root.querySelector('[data-odds="'+b.dataset.saveOdds+'"]');
      const odds=Number(input.value);
      if(!Number.isFinite(odds)||odds<=1||odds>1000){notify(root,'Quota non valida: deve essere maggiore di 1 e non superiore a 1000.',true);return;}
      await action(root,async()=>sb().rpc('rpl_admin_update_bet_market_odds',{p_market_id:Number(b.dataset.saveOdds),p_odds:odds}),'Quota aggiornata.');
    });
    root.querySelectorAll('[data-status]').forEach(b=>b.onclick=async()=>{
      await action(root,async()=>sb().rpc('rpl_admin_set_bet_market_status',{p_market_id:Number(b.dataset.status),p_new_status:b.dataset.next}),'Stato aggiornato.');
    });
    root.querySelectorAll('[data-settle]').forEach(b=>b.onclick=async()=>{
      const marketId=Number(b.dataset.settle);
      const selected=rows.find(m=>Number(m.id)===marketId);
      if(!selected)return;
      const sameGroup=rows.filter(m=>m.market_scope===selected.market_scope &&
        m.market_type===selected.market_type &&
        (m.market_scope==='season' ? m.season_key===selected.season_key :
          Number(m.calendar_match_id)===Number(selected.calendar_match_id)) &&
        (m.set_number||null)===(selected.set_number||null) &&
        ['open','closed'].includes(m.status));
      const outcomes=[...new Map(sameGroup.map(m=>[m.selection_key,m])).values()];
      if(outcomes.length<2){notify(root,'Liquidazione bloccata: non sono visibili almeno due esiti del gruppo. Aggiorna i mercati e verifica il gruppo prima di procedere.',true);return;}
      const choices=outcomes.map(m=>m.selection_key+' — '+m.selection_label).join('\\n');
      const winning=window.prompt('Esiti disponibili per questo gruppo:\\n'+choices+'\\n\\nInserisci la chiave esatta dell’esito vincente:',selected.selection_key);
      if(winning===null||!outcomes.some(m=>m.selection_key===winning.trim())){if(winning!==null)notify(root,'Chiave non valida: nessuna liquidazione eseguita.',true);return;}
      const label=outcomes.find(m=>m.selection_key===winning.trim()).selection_label;
      if(!window.confirm('Confermi la liquidazione del gruppo "'+selected.market_type+'" con esito "'+label+'"? Le puntate del gruppo saranno liquidate.'))return;
      await action(root,async()=>sb().rpc('rpl_settle_bet_market',{p_market_id:marketId,p_winning_selection_key:winning.trim()}),'Mercato liquidato.');
    });
    root.querySelectorAll('[data-void]').forEach(b=>b.onclick=async()=>{
      const reason=window.prompt('Motivo dell’annullamento e rimborso:');
      if(reason===null)return;
      await action(root,async()=>sb().rpc('rpl_void_bet_market',{p_market_id:Number(b.dataset.void),p_reason:reason}),'Mercato annullato e puntate rimborsate.');
    });
  }
  function notify(root,msg,error=false){const el=root.querySelector('[data-rbo-alert]');el.className='rbo-alert'+(error?' rbo-error':'');el.textContent=msg;}
  async function action(root,fn,success){
    try{notify(root,'Operazione in corso…');const {error}=await fn();if(error)throw error;notify(root,success);await refresh(root);}
    catch(e){notify(root,e.message||'Operazione non riuscita.',true);}
  }
  async function mount(root){
    if(!root)throw new Error('Contenitore console Royal Bet non trovato.');
    root.innerHTML=`<style>
      .rbo{font-family:inherit}.rbo *{box-sizing:border-box}.rbo-card{padding:14px;border:1px solid rgba(130,160,210,.25);border-radius:14px;background:rgba(20,36,64,.72)}
      .rbo-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,280px);gap:12px;padding:12px 0;border-bottom:1px solid rgba(130,160,210,.2)}
      .rbo-row:last-child{border-bottom:0}.rbo-actions{display:flex;gap:7px;align-items:flex-start;flex-wrap:wrap}
      .rbo-input{width:90px;max-width:100%;padding:8px;border-radius:8px;border:1px solid #7185a5;background:#0f1b30;color:#fff}
      .rbo-btn{border:0;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer;background:#d5f36a;color:#172640}
      .rbo-muted{opacity:.72;font-size:.84rem}.rbo-alert{padding:10px;border-radius:8px;margin:10px 0;background:rgba(213,243,106,.12)}.rbo-error{background:rgba(255,100,100,.16)}
      @media(max-width:650px){.rbo-row{grid-template-columns:1fr}.rbo-actions{align-items:center}}
    </style><section class="rbo"><div class="rbo-card"><div class="rbo-muted">ROYAL BET LAB · AREA RISERVATA</div><h2>Gestione mercati</h2>
      <div data-rbo-alert class="rbo-alert" aria-live="polite">Verifica autorizzazioni operatore…</div>
      <div class="rbo-muted" data-rbo-count></div><div data-rbo-list>Caricamento mercati…</div>
    </div></section>`;
    try{await refresh(root);}catch(e){notify(root,e.message||'Impossibile caricare la console.',true);}
  }
  window.RoyalBetOperator=Object.freeze({mount,refresh});
})();
