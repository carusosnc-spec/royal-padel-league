/**
 * Royal Bet Lab — player-area module, isolated scaffold.
 * Load after the existing RPL Supabase client and authenticated session.
 * Mount with: window.RoyalBetLab.mount(document.querySelector('#royal-bet-lab'))
 */
(function () {
  'use strict';

  const RPC = { placeBet: 'rpl_place_bet' };
  // Wagering enabled for markets whose server-side odds have been recalculated and verified.
  const WAGERING_ENABLED = true;
  const MARKET_NAMES = {
    set_winner: 'Vincitore set',
    set_exact_score: 'Risultato esatto',
    set_game_margin: 'Margine game',
    mvp: 'MVP serata',
    unbeaten: 'Imbattuto',
    most_sets_won: 'Più set vinti',
    fewest_sets_won: 'Meno set vinti',
    regular_season_champion: 'Campione Regular Season',
    bonus_ranking_champion: 'Campione Bonus Ranking',
    finals_champion: 'Campione Finals',
    finals_podium: 'Podio Finals'
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const fmt = (v) => Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });
  const client = () => {
    const sb = window.sb || window.supabaseClient;
    if (!sb || typeof sb.rpc !== 'function') throw new Error('Sessione RPL non inizializzata.');
    return sb;
  };

  async function currentPlayer() {
    const sb = client();
    const { data: auth, error: authErr } = await sb.auth.getUser();
    if (authErr) throw authErr;
    if (!auth || !auth.user) throw new Error('Accedi dall’Area Giocatori RPL.');
    const { data: account, error: accErr } = await sb.from('player_accounts')
      .select('player_id').eq('user_id', auth.user.id).maybeSingle();
    if (accErr) throw accErr;
    if (!account) throw new Error('Il tuo account non è collegato a un giocatore RPL.');
    const { data: player, error: playerErr } = await sb.from('players')
      .select('id,name,nickname,active,is_guest').eq('id', account.player_id).maybeSingle();
    if (playerErr) throw playerErr;
    if (!player || !player.active || player.is_guest) throw new Error('Accesso riservato ai giocatori ufficiali attivi.');
    return { user: auth.user, player };
  }

  function styles() {
    return `
      <style>
      .rbl{font-family:inherit;color:var(--text-color,#f5f7fb);max-width:100%;box-sizing:border-box}
      .rbl *{box-sizing:border-box}.rbl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
      .rbl-card{border:1px solid rgba(130,160,210,.25);border-radius:14px;padding:14px;background:rgba(20,36,64,.72);min-width:0}
      .rbl-muted{opacity:.72;font-size:.88rem}.rbl-balance{font-size:1.7rem;font-weight:800;color:#d5f36a}
      .rbl-tabs{display:flex;gap:8px;overflow:auto;margin:12px 0}.rbl-tabs button,.rbl-btn{border:0;border-radius:10px;padding:10px 13px;font-weight:700;cursor:pointer}
      .rbl-tabs button{background:#233b61;color:#fff;white-space:nowrap}.rbl-tabs button[aria-selected=true]{background:#d5f36a;color:#15243c}
      .rbl-btn{background:#d5f36a;color:#172640}.rbl-btn:disabled{opacity:.5;cursor:wait}
      .rbl-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .rbl-market{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}
      .rbl-market + .rbl-market{border-top:1px solid rgba(130,160,210,.2);padding-top:12px;margin-top:12px}
      .rbl-odd{min-width:76px;text-align:center;border:1px solid #d5f36a;border-radius:10px;padding:8px}
      .rbl-odd strong{display:block;font-size:1.1rem;color:#d5f36a}
      .rbl-input{width:100%;max-width:150px;border-radius:8px;padding:9px;border:1px solid #7185a5;background:#0f1b30;color:#fff}
      .rbl-alert{padding:10px 12px;border-radius:10px;margin:10px 0;background:rgba(213,243,106,.12)}
      .rbl-market-tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,220px) auto;gap:8px;align-items:center;margin:10px 0}
      .rbl-market-tools .rbl-input{max-width:none;width:100%;min-width:0}
      .rbl-market-tools select{cursor:pointer}
      .rbl-market[hidden]{display:none!important}
      .rbl-error{background:rgba(255,100,100,.14)}.rbl-empty{padding:16px;text-align:center;opacity:.75}
      @media(max-width:520px){.rbl-card{padding:11px}.rbl-market{grid-template-columns:minmax(0,1fr) auto}.rbl-odd{min-width:64px}.rbl-market-tools{grid-template-columns:1fr 1fr}.rbl-market-tools #rbl-market-search{grid-column:1/-1}.rbl-market-tools #rbl-market-count{grid-column:1/-1}}
      </style>`;
  }

  async function loadScriptOnce(src, test) {
    if (test()) return;
    await new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>s.src && s.src.endsWith(src));
      if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('Caricamento '+src+' non riuscito.')),{once:true});return;}
      const script=document.createElement('script');script.src=src;script.onload=resolve;
      script.onerror=()=>reject(new Error('Caricamento '+src+' non riuscito.'));
      document.head.appendChild(script);
    });
  }

  async function ensureRankingModules() {
    const load = (src) => new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-rbl-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.rblSrc = src;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error('Impossibile caricare il modulo quote: ' + src));
      document.head.appendChild(script);
    });
    await load('./js/royal-bet-ranking-odds.js');
    await load('./js/royal-bet-ranking-source.js');
  }

  async function loadHistoricalStats(sb, currentPlayerId) {
    const matchesRes = await sb.from('matches').select('id,played_at,is_confirmed,approval_status')
      .eq('is_confirmed', true).eq('approval_status', 'confirmed').order('played_at', {ascending:false}).limit(5000);
    if (matchesRes.error) throw matchesRes.error;
    const matchIds = (matchesRes.data || []).map(m => m.id);
    if (!matchIds.length) return {totalSets:0, player:null, pairs:[]};
    const [setsRes, playersRes] = await Promise.all([
      sb.from('sets').select('match_id,set_number,pair_a_player_1,pair_a_player_2,pair_b_player_1,pair_b_player_2,games_a,games_b').in('match_id', matchIds).limit(20000),
      sb.from('players').select('id,name,nickname').eq('active', true)
    ]);
    if (setsRes.error) throw setsRes.error;
    if (playersRes.error) throw playersRes.error;
    const names = new Map((playersRes.data || []).map(p => [String(p.id), p.nickname ? p.name+' “'+p.nickname+'”' : p.name]));
    const players = new Map(), pairs = new Map();
    const pairKey = ids => ids.map(String).sort().join(':');
    let totalSets = 0;
    for (const row of setsRes.data || []) {
      const ga = Number(row.games_a), gb = Number(row.games_b);
      if (!Number.isFinite(ga) || !Number.isFinite(gb) || ga === gb) continue;
      const sideA = [row.pair_a_player_1, row.pair_a_player_2].filter(x => x != null);
      const sideB = [row.pair_b_player_1, row.pair_b_player_2].filter(x => x != null);
      if (sideA.length !== 2 || sideB.length !== 2) continue;
      totalSets++;
      const winner = ga > gb ? sideA : sideB;
      for (const id of [...sideA, ...sideB]) {
        const key = String(id);
        if (!players.has(key)) players.set(key, {played:0,won:0});
        const st = players.get(key); st.played++; if (winner.some(x=>String(x)===key)) st.won++;
      }
      for (const ids of [sideA, sideB]) {
        const key = pairKey(ids);
        if (!pairs.has(key)) pairs.set(key, {ids:ids.map(String).sort(),played:0,won:0});
        const st = pairs.get(key); st.played++;
        if (ids.every(id=>winner.some(x=>String(x)===String(id)))) st.won++;
      }
    }
    const mine = players.get(String(currentPlayerId)) || null;
    const topPlayers = [...players.entries()].filter(([id,s])=>s.played>=5)
      .map(([id,s])=>({...s,id,name:names.get(id)||('Giocatore '+id),percent:Math.round(s.won/s.played*100)}))
      .sort((a,b)=>b.percent-a.percent || b.played-a.played).slice(0,5);
    const topPairs = [...pairs.values()].filter(p=>p.played>=3)
      .map(p=>({...p,percent:Math.round(p.won/p.played*100),label:p.ids.map(id=>names.get(id)||('Giocatore '+id)).join(' + ')}))
      .sort((a,b)=>b.percent-a.percent || b.played-a.played).slice(0,5);
    return {totalSets,player:mine?{...mine,percent:Math.round(mine.won/mine.played*100)}:null,topPlayers,pairs:topPairs};
  }

  async function loadDashboard(root) {
    const sb = client();
    await ensureRankingModules();
    const { player } = await currentPlayer();
    const [walletRes, marketsRes, wagersRes, historyRes] = await Promise.all([
      sb.from('rpl_bet_wallets').select('balance,locked_credits,updated_at').eq('player_id', player.id).maybeSingle(),
      sb.from('rpl_bet_markets').select('id,calendar_match_id,market_type,set_number,selection_key,selection_label,odds,status,opens_at,closes_at,market_scope,season_key,market_metadata')
        .eq('status','open')
        .or('opens_at.is.null,opens_at.lte.' + new Date().toISOString())
        .or('closes_at.is.null,closes_at.gt.' + new Date().toISOString())
        .order('closes_at',{ascending:true,nullsFirst:false}).limit(100),
      sb.from('rpl_bet_wagers').select('id,market_id,selection_key,stake,odds_locked,potential_payout,status,settled_payout,placed_at')
        .eq('player_id',player.id).order('placed_at',{ascending:false}).limit(25),
      loadHistoricalStats(sb, player.id)
    ]);
    if (walletRes.error) throw walletRes.error;
    if (marketsRes.error) throw marketsRes.error;
    if (wagersRes.error) throw wagersRes.error;
    const wallet = walletRes.data;
    let markets = marketsRes.data || [];
    // Read-only preview: calculate quotes only in the browser from official,
    // confirmed RPL results. Phase 1 must not invoke server refresh or write to DB.
    if (window.RoyalBetRankingSource && window.RoyalBetRankingOdds) {
      try {
        markets = await window.RoyalBetRankingSource.quoteMarkets(sb, markets, window.RoyalBetRankingOdds);
      } catch (quoteError) {
        console.warn('Royal Bet: preventivo dinamico non disponibile; mostro le quote salvate.', quoteError);
      }
    }
    const wagers = wagersRes.data || [];
    const balance = wallet ? wallet.balance : 0;
    const locked = wallet ? wallet.locked_credits : 0;
    const history = historyRes;

    root.innerHTML = styles() + `
      <section class="rbl">
        <div class="rbl-row">
          <div><div class="rbl-muted">ROYAL BET LAB</div><h2 style="margin:4px 0 10px">Il tuo portafoglio</h2></div>
          <div class="rbl-muted">${esc(player.name)}${player.nickname ? ' · '+esc(player.nickname):''}</div>
        </div>
        <div class="rbl-grid">
          <div class="rbl-card"><div class="rbl-muted">Crediti disponibili</div><div class="rbl-balance">${fmt(balance)}</div></div>
          <div class="rbl-card"><div class="rbl-muted">Crediti impegnati</div><div class="rbl-balance">${fmt(locked)}</div></div>
        </div>
        <div class="rbl-card" style="margin-top:12px">
          <div class="rbl-row"><div><strong>Statistiche storiche RPL</strong><div class="rbl-muted">Calcolate dai set ufficiali confermati · sola lettura</div></div>
          ${history.player ? '<div class="rbl-odd"><span class="rbl-muted">La tua % vittorie</span><strong>'+history.player.percent+'%</strong><span class="rbl-muted">'+history.player.won+'/'+history.player.played+' set</span></div>' : ''}
          </div>
          <div class="rbl-muted" style="margin-top:10px">Campione analizzato: ${fmt(history.totalSets)} set ufficiali</div>
          <div style="margin-top:12px"><strong>Giocatori più efficaci · almeno 5 set</strong></div>
          ${history.topPlayers && history.topPlayers.length ? history.topPlayers.map((p,i)=>'<div class="rbl-market"><div><strong>'+(i+1)+'. '+esc(p.name)+'</strong><div class="rbl-muted">'+p.won+' set vinti su '+p.played+' giocati</div></div><div class="rbl-odd"><strong>'+p.percent+'%</strong><span class="rbl-muted">vittorie</span></div></div>').join('') : '<div class="rbl-empty">Dati insufficienti per la classifica individuale.</div>'}
          <div style="margin-top:12px"><strong>Coppie con almeno 3 set insieme</strong></div>
          ${history.pairs.length ? history.pairs.map((p,i)=>'<div class="rbl-market"><div><strong>'+(i+1)+'. '+esc(p.label)+'</strong><div class="rbl-muted">'+p.won+' set vinti su '+p.played+' insieme</div></div><div class="rbl-odd"><strong>'+p.percent+'%</strong><span class="rbl-muted">vittorie</span></div></div>').join('') : '<div class="rbl-empty">Dati insufficienti per classificare le coppie (servono almeno 3 set insieme).</div>'}
        </div>
        <div class="rbl-tabs" role="tablist">
          <button data-tab="markets" aria-selected="true">Mercati aperti (${markets.length})</button>
          <button data-tab="wagers" aria-selected="false">Le mie puntate (${wagers.length})</button>
        </div>
        <div class="rbl-market-tools">
          <input id="rbl-market-search" class="rbl-input" type="search" placeholder="Cerca giocatore o mercato…" aria-label="Cerca tra i mercati">
          <select id="rbl-market-filter" class="rbl-input" aria-label="Filtra per categoria">
            <option value="all">Tutte le categorie</option>
            ${[...new Set(markets.map(m=>m.market_type))].sort().map(type=>'<option value="'+esc(type)+'">'+esc(MARKET_NAMES[type]||type)+'</option>').join('')}
          </select>
          <span id="rbl-market-count" class="rbl-muted">${markets.length} mercati disponibili</span>
        </div>
        <div id="rbl-alert" aria-live="polite">${WAGERING_ENABLED ? "" : '<div class="rbl-alert">Modalità verifica: quote dinamiche dalla classifica ufficiale confermata; puntate temporaneamente disabilitate.</div>'}</div>
        <div id="rbl-markets" class="rbl-card">
          ${markets.length ? markets.map(m => `
            <article class="rbl-market" data-market-type="${esc(m.market_type)}" data-market-search="${esc([MARKET_NAMES[m.market_type] || m.market_type,m.selection_label,m.selection_key,m.market_scope,m.calendar_match_id].filter(Boolean).join(' ').toLowerCase())}">
              <div>
                <strong>${esc(MARKET_NAMES[m.market_type] || m.market_type)}</strong>
                <div>${esc(m.selection_label)}</div>
                <div class="rbl-muted">${m.market_scope === 'season' ? 'Mercato stagione' : (m.market_scope === 'month' ? 'Mercato mensile' : (m.calendar_match_id ? 'Partita #'+m.calendar_match_id : 'Mercato generale'))}${m.set_number ? ' · Set '+m.set_number : ''}</div>
                ${m.dynamic_quote ? '<div class="rbl-muted">Quota ricalcolata dalla classifica ufficiale · anteprima non salvata</div>' : ''}
                ${m.dynamic_quote_error ? '<div class="rbl-muted">Quota dinamica non disponibile: verifica i dati ufficiali</div>' : ''}
                ${m.dynamic_quote_blocked ? '<div class="rbl-muted">Mercato non puntabile: '+esc(m.dynamic_quote_reason || 'verifica automatica')+'</div>' : ''}
                <label class="rbl-muted" for="rbl-stake-${m.id}">Puntata (crediti)</label><br>
                <input class="rbl-input" id="rbl-stake-${m.id}" type="number" min="1" step="1" inputmode="numeric" value="10">
                <button class="rbl-btn" data-bet="${m.id}" data-selection="${esc(m.selection_key)}" ${WAGERING_ENABLED && !m.dynamic_quote_blocked ? "" : "disabled"}>${!WAGERING_ENABLED ? "Prove non attive" : (m.dynamic_quote_blocked ? "Mercato bloccato" : "Punta")}</button>
              </div>
              <div class="rbl-odd"><span class="rbl-muted">${m.dynamic_quote ? 'Quota live*' : 'Quota'}</span><strong>${fmt(m.dynamic_quote ? m.display_odds : m.odds)}</strong></div>
            </article>`).join('') : '<div class="rbl-empty">Non ci sono mercati aperti al momento.</div>'}
        </div>
        <div id="rbl-wagers" class="rbl-card" hidden>
          ${wagers.length ? wagers.map(w => `
            <article class="rbl-market">
              <div><strong>Puntata #${w.id}</strong><div class="rbl-muted">Mercato #${w.market_id} · ${esc(w.selection_key)}</div>
              <div class="rbl-muted">${new Date(w.placed_at).toLocaleString('it-IT')} · Stato: ${esc(w.status)}</div></div>
              <div class="rbl-odd"><span class="rbl-muted">Puntata / quota</span><strong>${fmt(w.stake)} · ${fmt(w.odds_locked)}</strong><div class="rbl-muted">Potenziale ${fmt(w.potential_payout)}</div></div>
            </article>`).join('') : '<div class="rbl-empty">Non hai ancora effettuato puntate.</div>'}
        </div>
      </section>`;

    root.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
      const showMarkets = btn.dataset.tab === 'markets';
      root.querySelector('#rbl-markets').hidden = !showMarkets;
      root.querySelector('#rbl-wagers').hidden = showMarkets;
      root.querySelector('.rbl-market-tools').hidden = !showMarkets;
      root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    }));
    const searchInput = root.querySelector('#rbl-market-search');
    const filterSelect = root.querySelector('#rbl-market-filter');
    const applyMarketFilters = () => {
      const term = (searchInput.value || '').trim().toLocaleLowerCase('it-IT');
      const type = filterSelect.value;
      let visible = 0;
      root.querySelectorAll('#rbl-markets [data-market-type]').forEach(card => {
        const matchesType = type === 'all' || card.dataset.marketType === type;
        const matchesTerm = !term || (card.dataset.marketSearch || '').includes(term);
        card.hidden = !(matchesType && matchesTerm);
        if (!card.hidden) visible++;
      });
      root.querySelector('#rbl-market-count').textContent = visible + (visible === 1 ? ' mercato trovato' : ' mercati trovati');
    };
    searchInput.addEventListener('input', applyMarketFilters);
    filterSelect.addEventListener('change', applyMarketFilters);
    root.querySelectorAll('[data-bet]').forEach(btn => btn.addEventListener('click', async () => {
      if (!WAGERING_ENABLED) {
        const alert = root.querySelector('#rbl-alert');
        alert.innerHTML = '<div class="rbl-alert rbl-error">Le puntate sono disabilitate durante la verifica del sistema.</div>';
        return;
      }
      const marketId = Number(btn.dataset.bet);
      const input = root.querySelector('#rbl-stake-' + marketId);
      const stake = Number(input && input.value);
      const alert = root.querySelector('#rbl-alert');
      if (!Number.isSafeInteger(stake) || stake < 1) {
        alert.innerHTML = '<div class="rbl-alert rbl-error">Inserisci una puntata intera positiva.</div>'; return;
      }
      btn.disabled = true;
      alert.innerHTML = '<div class="rbl-alert">Invio puntata in corso…</div>';
      try {
        // Reuse the same idempotency key if a request is retried after an
        // uncertain network outcome. Clear it only when the intent changes or
        // the server confirms success.
        const intent = [player.id, marketId, btn.dataset.selection, stake].join(':');
        const storageKey = 'royalbet:idempotency:' + encodeURIComponent(intent);
        let savedKey = '';
        try { savedKey = window.sessionStorage.getItem(storageKey) || ''; } catch (_) { /* storage can be unavailable in private contexts */ }
        if (btn.dataset.betIntent !== intent || !btn.dataset.idempotencyKey) {
          const randomId = (window.crypto && typeof window.crypto.randomUUID === 'function') ? window.crypto.randomUUID() : (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
          btn.dataset.betIntent = intent;
          btn.dataset.idempotencyKey = savedKey || ('rbl-' + player.id + '-' + marketId + '-' + btn.dataset.selection + '-' + randomId);
          try { window.sessionStorage.setItem(storageKey, btn.dataset.idempotencyKey); } catch (_) { /* dataset remains a same-page fallback */ }
        }
        const idem = btn.dataset.idempotencyKey;
        const { error } = await sb.rpc(RPC.placeBet, {
          p_market_id: marketId,
          p_selection_key: btn.dataset.selection,
          p_stake: stake,
          p_idempotency_key: idem
        });
        if (error) throw error;
        try { window.sessionStorage.removeItem(storageKey); } catch (_) { /* no-op when storage is unavailable */ }
        delete btn.dataset.idempotencyKey;
        delete btn.dataset.betIntent;
        alert.innerHTML = '<div class="rbl-alert">Puntata registrata. Aggiorno saldo e storico…</div>';
        await loadDashboard(root);
      } catch (e) {
        alert.innerHTML = '<div class="rbl-alert rbl-error">' + esc(e.message || 'Puntata non riuscita.') + '</div>';
        btn.disabled = false;
      }
    }));
  }

  async function mount(root) {
    if (!root) throw new Error('Contenitore Royal Bet Lab non trovato.');
    root.innerHTML = '<div class="rbl-card">Caricamento Royal Bet Lab…</div>';
    try { await loadDashboard(root); }
    catch (e) {
      root.innerHTML = styles() + '<div class="rbl-card rbl-error">' + esc(e.message || 'Impossibile caricare Royal Bet Lab.') + '</div>';
    }
  }

  window.RoyalBetLab = Object.freeze({ mount, getCurrentPlayer: currentPlayer, refresh: loadDashboard });
})();
