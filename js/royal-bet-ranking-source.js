/**
 * Royal Bet Lab — read-only adapter to official RPL results.
 * Mirrors the public RPL base-score formula. It never writes market odds or wallets.
 */
(function () {
  'use strict';
  const escDate = d => new Date(d).getTime();
  const dateKey = d => {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0');
  };
  const normalize = v => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');

  function resolvePeriod(market, now = new Date()) {
    const scope = market.market_scope === 'month' ? 'month' : 'season';
    const seasonKey = String(market.season_key || (now.getFullYear() + '-' + (now.getFullYear()+1)));
    const startYear = Number((seasonKey.match(/(20\d{2})/) || [])[1]) || now.getFullYear();
    if (scope === 'month') {
      const md = market.market_metadata || {};
      const month = Number(md.month || md.month_number || now.getMonth()+1);
      const year = Number(md.year || startYear);
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) throw new Error('Periodo mensile non valido.');
      return {scope,year,month,start:year+'-'+String(month).padStart(2,'0')+'-01',end:year+'-'+String(month).padStart(2,'0')+'-31'};
    }
    return {scope,year:startYear,month:null,start:startYear+'-09-15',end:(startYear+1)+'-03-31'};
  }

  async function loadOfficialStandings(sb, period) {
    const [playersR, matchesR] = await Promise.all([
      sb.from('players').select('id,name,nickname,active,is_guest').eq('active',true),
      sb.from('matches').select('id,played_at,is_confirmed,approval_status').order('played_at',{ascending:true}).limit(5000)
    ]);
    if (playersR.error) throw playersR.error;
    if (matchesR.error) throw matchesR.error;
    const players = (playersR.data || []).filter(p => !p.is_guest);
    const start = period.scope === 'month' ? period.year+'-'+String(period.month).padStart(2,'0')+'-01' : period.start;
    const end = period.scope === 'month'
      ? period.year+'-'+String(period.month).padStart(2,'0')+'-'+String(new Date(Date.UTC(period.year,period.month,0)).getUTCDate()).padStart(2,'0')
      : period.end;
    const matches = (matchesR.data || []).filter(m => {
      // Only confirmed official results may influence live quotes.
      if (m.is_confirmed !== true || m.approval_status !== 'confirmed' || !m.played_at) return false;
      const day = dateKey(m.played_at);
      return day >= start && day <= end;
    });
    const ids = matches.map(m => m.id);
    if (!ids.length) return players.map(p => ({selection_key:String(p.id),selection_label:p.name,player_id:p.id,points:0,sets:0,games:0,base:0,bonus:0}));
    const [snapR, setsR, awardsR] = await Promise.all([
      sb.from('match_players').select('match_id,player_id,fascia_value').in('match_id',ids).limit(20000),
      sb.from('sets').select('match_id,set_number,pair_a_player_1,pair_a_player_2,pair_b_player_1,pair_b_player_2,games_a,games_b').in('match_id',ids).order('set_number').limit(20000),
      sb.from('match_awards').select('match_id,player_id,award_type').in('match_id',ids).limit(10000)
    ]);
    if (snapR.error) throw snapR.error;
    if (setsR.error) throw setsR.error;
    if (awardsR.error) throw awardsR.error;
    const byId = new Map(players.map(p => [String(p.id), {
      selection_key:String(p.id), selection_label:p.name, player_id:p.id,
      sets:0, points_from_sets:0, games:0, mvp:0, unbeaten:0
    }]));
    const snap = new Map((snapR.data || []).map(x => [String(x.match_id)+'_'+String(x.player_id), Number(x.fascia_value)||0]));
    for (const row of setsR.data || []) {
      const a=[row.pair_a_player_1,row.pair_a_player_2], b=[row.pair_b_player_1,row.pair_b_player_2];
      const ga=Number(row.games_a), gb=Number(row.games_b);
      if (!Number.isFinite(ga)||!Number.isFinite(gb)||ga===gb) continue;
      const winners=ga>gb?a:b, losers=ga>gb?b:a, winGames=Math.max(ga,gb), loseGames=Math.min(ga,gb);
      for (const id of winners) {
        const p=byId.get(String(id)); if(!p) continue;
        p.sets++; p.games+=winGames;
        p.points_from_sets+=(snap.get(String(row.match_id)+'_'+String(losers[0]))||0)+(snap.get(String(row.match_id)+'_'+String(losers[1]))||0);
      }
      for (const id of losers) { const p=byId.get(String(id)); if(p){p.sets++;p.games+=loseGames;} }
    }
    for (const a of awardsR.data || []) {
      const p=byId.get(String(a.player_id)); if(!p) continue;
      if(a.award_type==='MVP') p.mvp++;
      if(a.award_type==='IMBATTUTO') p.unbeaten++;
    }
    return [...byId.values()].map(p => {
      const base=p.sets ? ((p.points_from_sets+p.games*.30+p.sets*.10)/p.sets)*10 : 0;
      const bonus=p.mvp*1.5+p.unbeaten;
      return {...p,base,bonus,points:base+bonus};
    }).sort((a,b)=>b.points-a.points || b.base-a.base || a.player_id-b.player_id);
  }

  function matchSelection(market, standings) {
    const key=normalize(market.selection_key), label=normalize(market.selection_label);
    return standings.find(p => key===normalize(p.player_id) || key===normalize('player:'+p.player_id) ||
      key===normalize('player_'+p.player_id) || label===normalize(p.selection_label) ||
      label===normalize(p.selection_label+' '+(p.nickname||'')) || key===normalize(p.selection_label));
  }

  async function quoteMarkets(sb, markets, oddsModel) {
    const targets=(markets||[]).filter(m =>
      ['regular_season_champion'].includes(m.market_type) &&
      ['season','month'].includes(m.market_scope));
    if(!targets.length) return markets || [];
    const cache=new Map();
    for(const m of targets) {
      try {
        const period=resolvePeriod(m);
        const cacheKey=[period.scope,period.year,period.month||''].join(':');
        if(!cache.has(cacheKey)) {
          const standings=await loadOfficialStandings(sb,period);
          const close=m.closes_at || oddsModel.marketDeadline(period.scope==='month'?'month':'season',period.year,period.month||undefined);
          const rows=standings.map(p=>({selection_key:String(p.player_id),selection_label:p.selection_label,points:p.points}));
          const quoted=oddsModel.calculateRankingOdds(rows,{now:new Date().toISOString(),opensAt:m.opens_at||new Date().toISOString(),closesAt:close});
          cache.set(cacheKey,{standings,quotes:new Map(quoted.map(q=>[q.selection_key,q]))});
        }
        const cached=cache.get(cacheKey);
        const person=matchSelection(m,cached.standings);
        const q=person && cached.quotes.get(String(person.player_id));
        if(q) { m.display_odds=q.odds; m.dynamic_quote=true; m.dynamic_quote_blocked=!q.is_bettable; m.dynamic_quote_reason=q.unbettable_reason; }
      } catch(err) {
        m.dynamic_quote_error=true;
      }
    }
    return markets;
  }

  window.RoyalBetRankingSource=Object.freeze({resolvePeriod,loadOfficialStandings,quoteMarkets});
})();
