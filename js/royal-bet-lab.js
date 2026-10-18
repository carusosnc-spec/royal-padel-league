/**
 * Royal Bet Lab — player-area module, isolated scaffold.
 * Load after the existing RPL Supabase client and authenticated session.
 * Mount with: window.RoyalBetLab.mount(document.querySelector('#royal-bet-lab'))
 */
(function () {
  'use strict';

  const RPC = { placeBet: 'rpl_place_bet' };
  // Fail-closed safety switch: keep real-credit wagering disabled until the live
  // end-to-end checks are explicitly approved. Read-only dashboard remains usable.
  const WAGERING_ENABLED = false;
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
      .rbl-error{background:rgba(255,100,100,.14)}.rbl-empty{padding:16px;text-align:center;opacity:.75}
      @media(max-width:520px){.rbl-card{padding:11px}.rbl-market{grid-template-columns:minmax(0,1fr) auto}.rbl-odd{min-width:64px}}
      </style>`;
  }

  async function loadDashboard(root) {
    const sb = client();
    const { player } = await currentPlayer();
    const [walletRes, marketsRes, wagersRes] = await Promise.all([
      sb.from('rpl_bet_wallets').select('balance,locked_credits,updated_at').eq('player_id', player.id).maybeSingle(),
      sb.from('rpl_bet_markets').select('id,calendar_match_id,market_type,set_number,selection_key,selection_label,odds,status,opens_at,closes_at,market_scope,season_key,market_metadata')
        .eq('status','open')
        .or('opens_at.is.null,opens_at.lte.' + new Date().toISOString())
        .or('closes_at.is.null,closes_at.gt.' + new Date().toISOString())
        .order('closes_at',{ascending:true,nullsFirst:false}).limit(100),
      sb.from('rpl_bet_wagers').select('id,market_id,selection_key,stake,odds_locked,potential_payout,status,settled_payout,placed_at')
        .eq('player_id',player.id).order('placed_at',{ascending:false}).limit(25)
    ]);
    if (walletRes.error) throw walletRes.error;
    if (marketsRes.error) throw marketsRes.error;
    if (wagersRes.error) throw wagersRes.error;
    const wallet = walletRes.data;
    const markets = marketsRes.data || [];
    const wagers = wagersRes.data || [];
    const balance = wallet ? wallet.balance : 0;
    const locked = wallet ? wallet.locked_credits : 0;

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
        <div class="rbl-tabs" role="tablist">
          <button data-tab="markets" aria-selected="true">Mercati aperti</button>
          <button data-tab="wagers" aria-selected="false">Le mie puntate</button>
        </div>
        <div id="rbl-alert" aria-live="polite">${WAGERING_ENABLED ? "" : '<div class="rbl-alert">Modalità verifica: consultazione attiva, puntate temporaneamente disabilitate.</div>'}</div>
        <div id="rbl-markets" class="rbl-card">
          ${markets.length ? markets.map(m => `
            <article class="rbl-market">
              <div>
                <strong>${esc(MARKET_NAMES[m.market_type] || m.market_type)}</strong>
                <div>${esc(m.selection_label)}</div>
                <div class="rbl-muted">${m.market_scope === 'season' ? 'Mercato stagione' : (m.calendar_match_id ? 'Partita #'+m.calendar_match_id : 'Mercato generale')}${m.set_number ? ' · Set '+m.set_number : ''}</div>
                <label class="rbl-muted" for="rbl-stake-${m.id}">Puntata (crediti)</label><br>
                <input class="rbl-input" id="rbl-stake-${m.id}" type="number" min="1" step="1" inputmode="numeric" value="10">
                <button class="rbl-btn" data-bet="${m.id}" data-selection="${esc(m.selection_key)}" ${WAGERING_ENABLED ? "" : "disabled"}>${WAGERING_ENABLED ? "Punta" : "Prove non attive"}</button>
              </div>
              <div class="rbl-odd"><span class="rbl-muted">Quota</span><strong>${fmt(m.odds)}</strong></div>
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
      root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    }));
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
