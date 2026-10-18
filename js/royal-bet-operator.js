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
    const historyButton=root.querySelector('[data-history-preview]');
    if(historyButton) historyButton.onclick=async()=>{
      const box=root.querySelector('[data-history-result]');
      historyButton.disabled=true; box.hidden=false; box.textContent='Lettura dello storico confermato…';
      try{
        const c=sb();
        if(!window.RoyalBetOdds || typeof window.RoyalBetOdds.buildConfirmedHistory!=='function'){
          // index.html currently loads the player and operator modules only.
          // Load the read-only odds helper on demand so the history preview works
          // without requiring a risky edit to the large production HTML file.
          await new Promise((resolve,reject)=>{
            const script=document.createElement('script');
            script.src='./js/royal-bet-odds.js';
            script.onload=resolve;
            script.onerror=()=>reject(new Error('Impossibile caricare il modulo storico quote.'));
            document.head.appendChild(script);
          });
        }
        if(!window.RoyalBetOdds || typeof window.RoyalBetOdds.buildConfirmedHistory!=='function')
          throw new Error('Modulo storico quote non disponibile dopo il caricamento.');
        const {data:matches,error:matchError}=await c.from('matches')
          .select('id,is_confirmed,approval_status').eq('is_confirmed',true).eq('approval_status','confirmed').limit(1000);
        if(matchError)throw matchError;
        const ids=(matches||[]).map(m=>m.id);
        if(!ids.length){box.textContent='Nessuna partita confermata disponibile per il calcolo.';return;}
        const {data:sets,error:setError}=await c.from('sets')
          .select('match_id,set_number,pair_a_player_1,pair_a_player_2,pair_b_player_1,pair_b_player_2,games_a,games_b')
          .in('match_id',ids).limit(5000);
        if(setError)throw setError;
        const history=window.RoyalBetOdds.buildConfirmedHistory(matches,sets||[]);
        const reliablePlayers=[...history.players.values()].filter(s=>s.played>=3).length;
        const reliablePairs=[...history.pairs.values()].filter(s=>s.played>=2).length;
        box.textContent='Storico in sola lettura: '+history.confirmedMatchesUsed+' partite confermate; '+history.setsUsed+' set validi su '+history.eligibleSetRows+' set collegati; '+history.players.size+' giocatori identificati ('+reliablePlayers+' con almeno 3 set); '+history.pairs.size+' coppie osservate ('+reliablePairs+' con almeno 2 set). I campioni ridotti saranno segnalati come poco affidabili nella futura proposta quote. Nessun mercato creato e nessun dato modificato.';
      }catch(e){box.textContent=e.message||'Analisi dello storico non riuscita.';box.classList.add('rbo-error');}
      finally{historyButton.disabled=false;}
    };
    const proposalButton=root.querySelector('[data-auto-proposals]');
    if(proposalButton) proposalButton.onclick=async()=>{
      const box=root.querySelector('[data-proposal-result]');
      proposalButton.disabled=true; box.hidden=false; box.textContent='Confronto quote in sola lettura…'; box.classList.remove('rbo-error');
      try{
        const c=sb();
        const loadScript=src=>new Promise((resolve,reject)=>{
          const existing=[...document.scripts].find(s=>s.src.endsWith(src));
          if(existing){resolve();return;}
          const script=document.createElement('script');script.src='./js/'+src;
          script.onload=resolve;script.onerror=()=>reject(new Error('Impossibile caricare '+src));document.head.appendChild(script);
        });
        if(!window.RoyalBetOdds) await loadScript('royal-bet-odds.js');
        const {data:matches,error:me}=await c.from('matches').select('id,is_confirmed,approval_status').eq('is_confirmed',true).eq('approval_status','confirmed').limit(1000);
        if(me)throw me;
        const ids=(matches||[]).map(m=>m.id);
        if(!ids.length)throw new Error('Nessuna partita confermata disponibile.');
        const {data:sets,error:se}=await c.from('sets').select('match_id,set_number,pair_a_player_1,pair_a_player_2,pair_b_player_1,pair_b_player_2,games_a,games_b').in('match_id',ids).limit(5000);
        if(se)throw se;
        const history=window.RoyalBetOdds.buildConfirmedHistory(matches,sets||[]);
        if(history.setsUsed<4)throw new Error('Campione insufficiente: servono almeno 4 set validi confermati.');
        const {data:players,error:pe}=await c.from('players').select('id,name,nickname,active,is_guest').eq('active',true).eq('is_guest',false).limit(500);
        if(pe)throw pe;
        const eligible=(players||[]).filter(p=>history.players.has(String(p.id))&&history.players.get(String(p.id)).played>=2);
        if(eligible.length<2)throw new Error('Campione insufficiente per confrontare le quote.');
        const raw=eligible.map(p=>{
          const st=history.players.get(String(p.id));
          const rate=(st.wins+2)/(st.played+4);
          const diff=st.gameDiff/Math.max(1,st.played);
          return Math.exp(Math.max(-1.2,Math.min(1.2,(rate-.5)*2.2+Math.max(-5,Math.min(5,diff))*.06)));
        });
        const total=raw.reduce((a,b)=>a+b,0);
        const {data:existing,error:ee}=await c.from('rpl_bet_markets').select('selection_key,selection_label,theoretical_probability,odds,status').eq('market_scope','season').eq('season_key','2026-27').eq('market_type','regular_season_champion').limit(500);
        if(ee)throw ee;
        const byKey=new Map((existing||[]).map(m=>[String(m.selection_key),m]));
        const rows=eligible.map((p,i)=>{
          const probability=raw[i]/total;
          const modelOdds=window.RoyalBetOdds.odds(probability,0.08);
          const current=byKey.get('player_'+p.id);
          return {label:p.name+(p.nickname?' “'+p.nickname+'”':''),probability,modelOdds,current,sets:history.players.get(String(p.id)).played};
        }).sort((a,b)=>b.probability-a.probability);
        const present=rows.filter(r=>r.current).length;
        box.innerHTML='<strong>Audit quote · stagione 2026/27 · sola lettura</strong><p>Set validi: '+history.setsUsed+' · Giocatori con almeno 2 set: '+eligible.length+' · Quote esistenti confrontate: '+present+'/'+rows.length+'.</p>'+
          '<div>'+rows.map(r=>{
            const oldP=Number(r.current&&r.current.theoretical_probability);
            const oldO=Number(r.current&&r.current.odds);
            const delta=Number.isFinite(oldO)&&oldO>0?r.modelOdds-oldO:null;
            const status=!r.current?'Nessuna quota esistente':delta!==null&&Math.abs(delta)>=0.5?'Differenza da revisionare': 'Vicino alla quota attuale';
            return '<div class="rbo-row"><div><strong>'+esc(r.label)+'</strong><div class="rbo-muted">'+r.sets+' set storici · Modello '+fmt(r.probability*100)+'% (quota '+fmt(r.modelOdds)+')</div><div class="rbo-muted">Attuale: '+(r.current?fmt(oldP*100)+'% · quota '+fmt(oldO)+' · '+esc(r.current.status):'non presente')+'</div></div><div class="rbo-muted">'+esc(status)+(delta!==null?' · scarto quota '+(delta>0?'+':'')+fmt(delta):'')+'</div></div>';
          }).join('')+'</div><p class="rbo-muted">Stima preliminare basata su forma individuale e differenza game; non considera ancora tutte le regole di classifica RPL e non è una previsione certificata. Nessuna scrittura eseguita: le quote non sono state modificate.</p>';
      }catch(e){box.textContent=e.message||'Confronto quote non riuscito.';box.classList.add('rbo-error');}
      finally{proposalButton.disabled=false;}
    };    root.querySelectorAll('[data-save-odds]').forEach(b=>b.onclick=async()=>{
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
      const choices=outcomes.map(m=>m.selection_key+' — '+m.selection_label).join('\n');
      const winning=window.prompt('Esiti disponibili per questo gruppo:\n'+choices+'\n\nInserisci la chiave esatta dell’esito vincente:',selected.selection_key);
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
      <div class="rbo-actions"><button class="rbo-btn" type="button" data-history-preview>Analizza storico confermato</button><button class="rbo-btn" type="button" data-auto-proposals>Genera anteprima quote stagione</button></div>
      <div class="rbo-alert" data-history-result hidden aria-live="polite"></div><div class="rbo-alert" data-proposal-result hidden aria-live="polite"></div>
      <div class="rbo-muted" data-rbo-count></div><div data-rbo-list>Caricamento mercati…</div>
    </div></section>`;
    try{await refresh(root);}catch(e){notify(root,e.message||'Impossibile caricare la console.',true);}
  }
  window.RoyalBetOperator=Object.freeze({mount,refresh});
})();
