/**
 * Royal Bet Lab — deterministic historical odds helper.
 *
 * This module never writes to the database. It scores candidate outcomes from
 * confirmed RPL set history, applies smoothing to small samples, then returns
 * normalized probabilities and margin-adjusted odds for an operator/generator
 * to review. Automatic publishing is deliberately separate.
 *
 * Input rows: {pair_a_player_1,pair_a_player_2,pair_b_player_1,pair_b_player_2,
 * games_a,games_b}. Only pass sets belonging to confirmed/approved matches.
 */
(function () {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const keyPair = (a,b) => [String(a),String(b)].sort().join(':');
  const sigmoid = x => 1 / (1 + Math.exp(-x));

  function buildHistory(rows) {
    const players = new Map();
    const pairs = new Map();
    const ensure = (map,key) => {
      if(!map.has(key)) map.set(key,{played:0,wins:0,gameDiff:0});
      return map.get(key);
    };
    for(const r of rows || []) {
      const a1=r.pair_a_player_1,a2=r.pair_a_player_2,b1=r.pair_b_player_1,b2=r.pair_b_player_2;
      const ga=Number(r.games_a),gb=Number(r.games_b);
      if([a1,a2,b1,b2].some(v=>v==null)||!Number.isFinite(ga)||!Number.isFinite(gb)||ga===gb) continue;
      const aw=ga>gb, diff=ga-gb;
      for(const [id,won,gd] of [[a1,aw,diff],[a2,aw,diff],[b1,!aw,-diff],[b2,!aw,-diff]]) {
        const s=ensure(players,String(id)); s.played++; if(won)s.wins++; s.gameDiff+=gd;
      }
      for(const [x,y,won,gd] of [[a1,a2,aw,diff],[b1,b2,!aw,-diff]]) {
        const s=ensure(pairs,keyPair(x,y)); s.played++; if(won)s.wins++; s.gameDiff+=gd;
      }
    }
    return {players,pairs,setsUsed:(rows||[]).length};
  }

  function individualStrength(history,id) {
    const s=history.players.get(String(id));
    if(!s) return 0;
    const smoothedWinRate=(s.wins+2)/(s.played+4);
    const diffPerSet=s.gameDiff/Math.max(1,s.played);
    return Math.log(smoothedWinRate/(1-smoothedWinRate))*0.65 + clamp(diffPerSet,-5,5)*0.055;
  }
  function pairStrength(history,a,b) {
    const s=history.pairs.get(keyPair(a,b));
    if(!s || s.played<2) return 0;
    const smoothed=(s.wins+2)/(s.played+4);
    const diff=s.gameDiff/Math.max(1,s.played);
    // Pair synergy is shrunk strongly for low sample counts.
    const reliability=s.played/(s.played+8);
    return reliability*(Math.log(smoothed/(1-smoothed))*0.45+clamp(diff,-5,5)*0.04);
  }
  function estimatePairWin(history, sideA, sideB) {
    if(!history || !Array.isArray(sideA)||!Array.isArray(sideB)||sideA.length!==2||sideB.length!==2) {
      throw new TypeError('Servono due coppie, ciascuna con due giocatori.');
    }
    const score=sideA.reduce((n,id)=>n+individualStrength(history,id),0)
      +pairStrength(history,sideA[0],sideA[1])
      -sideB.reduce((n,id)=>n+individualStrength(history,id),0)
      -pairStrength(history,sideB[0],sideB[1]);
    // Shrink prediction toward 50/50 to avoid overconfident small-history odds.
    const p=clamp(0.5+0.36*(sigmoid(score)-0.5),0.08,0.92);
    return {probabilityA:p,probabilityB:1-p,score,historySets:history.setsUsed};
  }
  function odds(probability, overround=0.08) {
    const p=clamp(Number(probability),0.01,0.99);
    const margin=clamp(Number(overround),0,0.25);
    return Math.round((1/(p*(1+margin)))*100)/100;
  }
  function marketSelections(outcomes, overround=0.08) {
    if(!Array.isArray(outcomes)||!outcomes.length) return [];
    const total=outcomes.reduce((n,x)=>n+Math.max(0,Number(x.probability)||0),0);
    if(total<=0) throw new Error('Le probabilità devono avere una somma positiva.');
    return outcomes.map(x=>{
      const p=Math.max(0,Number(x.probability)||0)/total;
      return {
        selection_key:String(x.selection_key),
        selection_label:String(x.selection_label),
        theoretical_probability:Math.round(p*10000)/10000,
        odds:odds(p,overround)
      };
    });
  }
  window.RoyalBetOdds = Object.freeze({buildHistory,estimatePairWin,odds,marketSelections});
})();
