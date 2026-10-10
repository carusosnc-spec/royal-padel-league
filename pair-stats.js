/* Royal Padel League — statistiche coppie stagione corrente */
(function(){
  'use strict';
  const MIN_SETS_AVERAGE = 5;
  const SEASON_START = (function(){
    const now = new Date();
    let year = now.getFullYear();
    if (now < new Date(year, 8, 15, 0, 0, 0)) year--;
    return year + '-09-15T00:00:00';
  })();
  const esc = function(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  const num = function(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const fmt = function(v){ return num(v).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1}); };
  const whole = function(v){ return String(Math.round(num(v))); };
  let datasetPromise = null;
  function getSb(){ return window.sb || null; }
  function getLogo(name){
    try { return typeof window.logoFile === 'function' ? (window.logoFile(name) || '') : ''; }
    catch(_){ return ''; }
  }
  function playerIcon(p){
    const src = getLogo(p && p.name);
    return '<span class="rpl-pair-avatar">' + (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" onerror="this.parentElement.textContent=\'🎾\'">' : '🎾') + '</span>';
  }
  async function loadDataset(force){
    if(datasetPromise && !force) return datasetPromise;
    datasetPromise = (async function(){
      const sb = getSb();
      if(!sb) throw new Error('Database non disponibile');
      const mr = await sb.from('matches').select('id,played_at,approval_status').or('approval_status.eq.confirmed,approval_status.is.null').gte('played_at', SEASON_START).order('played_at',{ascending:true});
      if(mr.error) throw mr.error;
      const matches = mr.data || [];
      const ids = matches.map(function(m){return m.id;});
      const [pr,mp,sr] = await Promise.all([
        sb.from('players').select('id,name,nickname,fascia_value,is_guest'),
        ids.length ? sb.from('match_players').select('match_id,player_id,fascia_value').in('match_id',ids) : Promise.resolve({data:[],error:null}),
        ids.length ? sb.from('sets').select('id,match_id,set_number,pair_a_player_1,pair_a_player_2,pair_b_player_1,pair_b_player_2,games_a,games_b').in('match_id',ids).order('set_number',{ascending:true}) : Promise.resolve({data:[],error:null})
      ]);
      if(pr.error || mp.error || sr.error) throw (pr.error || mp.error || sr.error);
      const players = new Map((pr.data || []).map(function(p){return [String(p.id),p];}));
      const snapshots = new Map((mp.data || []).map(function(x){return [String(x.match_id)+'_'+String(x.player_id),x];}));
      const byPlayer = new Map();
      function statFor(playerId, partnerId){
        const key = String(partnerId);
        if(!byPlayer.has(String(playerId))) byPlayer.set(String(playerId),new Map());
        const m = byPlayer.get(String(playerId));
        if(!m.has(key)){
          const partner = players.get(key) || {id:partnerId,name:'Giocatore',nickname:''};
          m.set(key,{partner:partner,sets:0,wins:0,losses:0,gamesWon:0,gamesLost:0,setPoints:0,gamePoints:0,presencePoints:0,points:0});
        }
        return m.get(key);
      }
      function fasciaValue(matchId, playerId){
        const snap = snapshots.get(String(matchId)+'_'+String(playerId));
        if(snap && snap.fascia_value != null) return num(snap.fascia_value);
        return num((players.get(String(playerId)) || {}).fascia_value);
      }
      (sr.data || []).forEach(function(s){
        const a = [s.pair_a_player_1,s.pair_a_player_2].filter(function(x){return x != null;});
        const b = [s.pair_b_player_1,s.pair_b_player_2].filter(function(x){return x != null;});
        if(a.length !== 2 || b.length !== 2) return;
        const ga = num(s.games_a), gb = num(s.games_b);
        if(ga === gb) return;
        [[a,b,ga,gb],[b,a,gb,ga]].forEach(function(side){
          const own = side[0], opp = side[1], ownGames = side[2], oppGames = side[3];
          const won = ownGames > oppGames;
          const setPoints = won ? fasciaValue(s.match_id,opp[0]) + fasciaValue(s.match_id,opp[1]) : 0;
          const gamePoints = ownGames * 0.30;
          const presencePoints = 0.10;
          const points = setPoints + gamePoints + presencePoints;
          own.forEach(function(playerId){
            const partnerId = String(own[0]) === String(playerId) ? own[1] : own[0];
            const z = statFor(playerId,partnerId);
            z.sets++;
            if(won) z.wins++; else z.losses++;
            z.gamesWon += ownGames;
            z.gamesLost += oppGames;
            z.setPoints += setPoints;
            z.gamePoints += gamePoints;
            z.presencePoints += presencePoints;
            z.points += points;
          });
        });
      });
      return {players:players,byPlayer:byPlayer,matches:matches.length,sets:(sr.data||[]).length,seasonStart:SEASON_START};
    })();
    try { return await datasetPromise; } catch(e){ datasetPromise = null; throw e; }
  }
  function rowsFor(data, playerId){
    const currentPlayer = data.players.get(String(playerId));
    if(currentPlayer && currentPlayer.is_guest === true) return [];
    const map = data.byPlayer.get(String(playerId));
    if(!map) return [];
    return Array.from(map.values()).filter(function(x){ return !(x.partner && x.partner.is_guest === true); }).map(function(x){
      return Object.assign({},x,{average:x.sets ? x.points/x.sets : 0,winRate:x.sets ? x.wins/x.sets*100 : 0});
    });
  }
  function sortRows(rows, mode){
    const copy = rows.slice();
    if(mode === 'average') copy.sort(function(a,b){return b.average-a.average || b.sets-a.sets || b.points-a.points || String(a.partner.name).localeCompare(String(b.partner.name),'it');});
    else if(mode === 'frequent') copy.sort(function(a,b){return b.sets-a.sets || b.points-a.points || String(a.partner.name).localeCompare(String(b.partner.name),'it');});
    else copy.sort(function(a,b){return b.points-a.points || b.sets-a.sets || b.average-a.average || String(a.partner.name).localeCompare(String(b.partner.name),'it');});
    return copy;
  }
  function listMarkup(rows, mode, limit){
    const selected = sortRows(rows,mode).filter(function(x){return mode !== 'average' || x.sets >= MIN_SETS_AVERAGE;}).slice(0,limit || 5);
    if(!selected.length) return '<div class="rpl-pair-empty">' + (mode === 'average' ? 'Servono almeno ' + MIN_SETS_AVERAGE + ' set insieme per confrontare il rendimento medio.' : 'Non ci sono ancora dati sufficienti.') + '</div>';
    return '<div class="rpl-pair-list">' + selected.map(function(x,i){
      const main = mode === 'frequent' ? x.sets + ' set insieme' : mode === 'average' ? fmt(x.average) + ' pt/set' : fmt(x.points) + ' pt';
      const secondary = mode === 'frequent' ? fmt(x.points) + ' pt generati · ' + x.wins + ' set vinti' : x.sets + ' set · ' + x.wins + ' vinti · ' + whole(x.gamesWon) + '-' + whole(x.gamesLost) + ' game';
      return '<div class="rpl-pair-item"><span class="rpl-pair-rank">' + (i+1) + '</span>' + playerIcon(x.partner) + '<span class="rpl-pair-person"><b>' + esc(x.partner.name || 'Giocatore') + '</b><small>' + esc(secondary) + '</small></span><span class="rpl-pair-score"><b>' + esc(main) + '</b></span></div>';
    }).join('') + '</div>';
  }
  function ensureStyles(){
    if(document.getElementById('rpl-pair-stats-style')) return;
    const style = document.createElement('style');
    style.id = 'rpl-pair-stats-style';
    style.textContent = '.rpl-pair-section{margin-top:18px;padding-top:15px;border-top:1px solid rgba(231,185,78,.28)}.rpl-pair-section h3{font-size:16px;margin:0 0 5px;color:#f7d56b}.rpl-pair-intro{font-size:11px;line-height:1.5;color:#aebccc;margin:0 0 12px}.rpl-pair-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.rpl-pair-card{min-width:0;border:1px solid rgba(231,185,78,.22);border-radius:12px;padding:11px;background:rgba(4,17,29,.52)}.rpl-pair-card h4{font-size:12px;letter-spacing:.3px;margin:0 0 8px;color:#fff}.rpl-pair-list{display:flex;flex-direction:column;gap:7px}.rpl-pair-item{display:flex;align-items:center;gap:7px;padding:7px;border-radius:9px;background:rgba(255,255,255,.035);min-width:0}.rpl-pair-rank{width:20px;flex:0 0 20px;height:20px;display:grid;place-items:center;border-radius:6px;background:rgba(231,185,78,.14);color:#f7d56b;font-size:10px;font-weight:900}.rpl-pair-avatar{width:30px;height:30px;flex:0 0 30px;border-radius:50%;overflow:hidden;background:#10283a;display:grid;place-items:center;font-size:15px}.rpl-pair-avatar img{width:100%;height:100%;object-fit:cover}.rpl-pair-person{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}.rpl-pair-person b{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}.rpl-pair-person small{font-size:9px;line-height:1.35;color:#aebccc}.rpl-pair-score{font-size:10px;color:#f7d56b;text-align:right;white-space:nowrap}.rpl-pair-score b{font-weight:900}.rpl-pair-empty{font-size:11px;color:#aebccc;padding:8px 3px;line-height:1.5}.rpl-pair-public{margin-top:16px;padding-top:13px;border-top:1px solid rgba(231,185,78,.24)}.rpl-pair-public h3{font-size:14px;margin:0 0 10px;color:#f7d56b}.rpl-pair-public-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}.rpl-pair-public-card{padding:10px;border:1px solid rgba(231,185,78,.2);border-radius:10px;background:rgba(3,15,25,.45);min-width:0}.rpl-pair-public-card .rpl-pair-public-label{font-size:9px;letter-spacing:.45px;color:#aebccc;text-transform:uppercase;font-weight:800;margin-bottom:7px}.rpl-pair-public-card .rpl-pair-public-name{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:900;color:#fff}.rpl-pair-public-card .rpl-pair-public-meta{font-size:10px;color:#f7d56b;margin-top:6px;line-height:1.4}.rpl-pair-public-card .rpl-pair-avatar{width:28px;height:28px;flex-basis:28px}@media(max-width:520px){.rpl-pair-columns{grid-template-columns:1fr}.rpl-pair-public-grid{grid-template-columns:1fr}.rpl-pair-item{gap:6px}.rpl-pair-person small{font-size:9px}}';
    document.head.appendChild(style);
  }
  function privateMarkup(rows){
    return '<section class="rpl-pair-section" id="rplPairStatsPrivate"><h3>🤝 Le mie statistiche di coppia</h3><p class="rpl-pair-intro">Punti generati nei set giocati insieme: punti fascia degli avversari, game vinti (0,30 ciascuno) e presenza (0,10 per set). I bonus MVP e Imbattuto restano esclusi perché non dipendono dal singolo compagno.</p><div class="rpl-pair-columns"><div class="rpl-pair-card"><h4>🏆 TOP 5 · COMPAGNI PIÙ PRODUTTIVI</h4>' + listMarkup(rows,'points',5) + '</div><div class="rpl-pair-card"><h4>📈 TOP 5 · MIGLIOR RENDIMENTO MEDIO</h4>' + listMarkup(rows,'average',5) + '</div><div class="rpl-pair-card"><h4>🤝 TOP 5 · PARTNER PIÙ FREQUENTI</h4>' + listMarkup(rows,'frequent',5) + '</div></div></section>';
  }
  function publicCard(label,row,mode){
    if(!row) return '<div class="rpl-pair-public-card"><div class="rpl-pair-public-label">' + esc(label) + '</div><div class="rpl-pair-empty">Dati non ancora sufficienti.</div></div>';
    const metric = mode === 'frequent' ? row.sets + ' set insieme' : mode === 'average' ? fmt(row.average) + ' pt medi per set' : fmt(row.points) + ' punti generati';
    const meta = row.sets + ' set condivisi · ' + row.wins + ' vinti · ' + whole(row.gamesWon) + '-' + whole(row.gamesLost) + ' game';
    return '<div class="rpl-pair-public-card"><div class="rpl-pair-public-label">' + esc(label) + '</div><div class="rpl-pair-public-name">' + playerIcon(row.partner) + '<span>' + esc(row.partner.name || 'Giocatore') + '</span></div><div class="rpl-pair-public-meta">' + esc(metric) + '<br>' + esc(meta) + '</div></div>';
  }
  function publicMarkup(rows){
    const productive = sortRows(rows,'points')[0] || null;
    const average = sortRows(rows,'average').filter(function(x){return x.sets >= MIN_SETS_AVERAGE;})[0] || null;
    const frequent = sortRows(rows,'frequent')[0] || null;
    return '<section class="rpl-pair-public" id="rplPairStatsPublic"><h3>🤝 Intesa in campo</h3><div class="rpl-pair-public-grid">' + publicCard('Compagno più produttivo',productive,'points') + publicCard('Miglior rendimento medio',average,'average') + publicCard('Partner più frequente',frequent,'frequent') + '</div><p class="rpl-pair-intro" style="margin-top:9px;margin-bottom:0">Statistiche della stagione in corso. I punti di coppia considerano i punti fascia degli avversari, i game vinti e la presenza nei set; non modificano la classifica ufficiale.</p></section>';
  }
  async function currentPlayerId(){
    const sb = getSb();
    if(!sb) return null;
    const auth = await sb.auth.getUser();
    const user = auth && auth.data && auth.data.user;
    if(!user) return null;
    const r = await sb.from('player_accounts').select('player_id').eq('user_id',user.id).maybeSingle();
    if(r.error) throw r.error;
    return r.data ? r.data.player_id : null;
  }
  async function renderPrivate(){
    const grid = document.getElementById('playerStatsGrid');
    if(!grid) return;
    let host = document.getElementById('rplPairStatsPrivate');
    if(!host){
      host = document.createElement('div');
      host.id = 'rplPairStatsPrivate';
      host.className = 'rpl-pair-section';
      grid.insertAdjacentElement('afterend',host);
    }
    if(host.dataset.loading === '1') return;
    host.dataset.loading = '1';
    host.innerHTML = '<div class="rpl-pair-empty">Calcolo delle statistiche di coppia…</div>';
    try {
      const pid = await currentPlayerId();
      if(!pid){host.innerHTML='';host.dataset.loading='0';return;}
      const data = await loadDataset();
      host.outerHTML = privateMarkup(rowsFor(data,pid));
    } catch(e) {
      host.innerHTML = '<h3>🤝 Le mie statistiche di coppia</h3><div class="rpl-pair-empty">Statistiche non disponibili al momento. Riprova più tardi.</div>';
      host.dataset.loading = '0';
      console.warn('RPL pair statistics private',e);
    }
  }
  async function renderPublic(playerId){
    const body = document.getElementById('rplPlayerProfileModalBody');
    if(!body || !body.querySelector('.rpl-profile-stat-grid')) return;
    const old = document.getElementById('rplPairStatsPublic');
    if(old) old.remove();
    try {
      const data = await loadDataset();
      const rows = rowsFor(data,playerId);
      const grid = body.querySelector('.rpl-profile-stat-grid');
      if(grid) grid.insertAdjacentHTML('afterend',publicMarkup(rows));
    } catch(e) {
      console.warn('RPL pair statistics public',e);
    }
  }
  function init(){
    ensureStyles();
    const grid = document.getElementById('playerStatsGrid');
    if(grid){
      const run = function(){
        const dash = document.getElementById('playerDashboard');
        if(dash && !dash.classList.contains('hidden')) renderPrivate();
      };
      new MutationObserver(run).observe(grid,{childList:true,subtree:true});
      const dash = document.getElementById('playerDashboard');
      if(dash) new MutationObserver(run).observe(dash,{attributes:true,attributeFilter:['class']});
      const playerBtn = document.getElementById('playerAreaBtn');
      if(playerBtn) playerBtn.addEventListener('click',function(){setTimeout(run,250);});
    }
    const original = window.openRplPlayerProfile;
    if(typeof original === 'function' && !original.__rplPairWrapped){
      const wrapped = async function(playerId){
        await original.apply(this,arguments);
        await renderPublic(playerId);
      };
      wrapped.__rplPairWrapped = true;
      window.openRplPlayerProfile = wrapped;
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})();