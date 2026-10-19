/**
 * Royal Bet Lab — deterministic historical odds helper.
 * This module never writes to the database. Only confirmed/approved set rows
 * should be supplied by the caller; publishing remains a separate operation.
 */
(function () {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const keyPair = (a, b) => [String(a), String(b)].sort().join(':');
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const validScore = (a, b) => Number.isInteger(a) && Number.isInteger(b) &&
    ((a === 6 && b >= 0 && b <= 4) || (b === 6 && a >= 0 && a <= 4) ||
     (a === 7 && (b === 5 || b === 6)) || (b === 7 && (a === 5 || a === 6)));

  function buildHistory(rows) {
    const players = new Map();
    const pairs = new Map();
    let setsUsed = 0;
    const ensure = (map, key) => {
      if (!map.has(key)) map.set(key, { played: 0, wins: 0, gameDiff: 0 });
      return map.get(key);
    };
    for (const r of rows || []) {
      if (!r || typeof r !== 'object') continue;
      const ids = [r.pair_a_player_1, r.pair_a_player_2, r.pair_b_player_1, r.pair_b_player_2];
      if (ids.some(v => v == null || String(v).trim() === '') ||
          new Set(ids.map(String)).size !== 4) continue;
      // Reject null/blank score values instead of coercing them to zero.
      if (r.games_a == null || r.games_b == null || String(r.games_a).trim() === '' ||
          String(r.games_b).trim() === '') continue;
      const ga = Number(r.games_a), gb = Number(r.games_b);
      if (!validScore(ga, gb)) continue;
      setsUsed++;
      const aw = ga > gb, diff = ga - gb;
      for (const [id, won, gd] of [[ids[0], aw, diff], [ids[1], aw, diff],
        [ids[2], !aw, -diff], [ids[3], !aw, -diff]]) {
        const s = ensure(players, String(id));
        s.played++; if (won) s.wins++; s.gameDiff += gd;
      }
      for (const [x, y, won, gd] of [[ids[0], ids[1], aw, diff], [ids[2], ids[3], !aw, -diff]]) {
        const s = ensure(pairs, keyPair(x, y));
        s.played++; if (won) s.wins++; s.gameDiff += gd;
      }
    }
    return { players, pairs, setsUsed };
  }

  // Join sets to their parent match and accept only explicitly confirmed results.
  // This is a pure filter: callers still must query the official tables read-only.
  function buildConfirmedHistory(matches, sets) {
    const confirmed = new Set((matches || []).filter(m => m && m.is_confirmed === true &&
      String(m.approval_status || '').toLowerCase() === 'confirmed' && m.id != null)
      .map(m => String(m.id)));
    const eligibleSets = (sets || []).filter(s => s && s.match_id != null && confirmed.has(String(s.match_id)));
    return {
      ...buildHistory(eligibleSets),
      confirmedMatchesUsed: confirmed.size,
      eligibleSetRows: eligibleSets.length
    };
  }

  function individualStrength(history, id) {
    const s = history.players.get(String(id));
    if (!s) return 0;
    const smoothedWinRate = (s.wins + 2) / (s.played + 4);
    const diffPerSet = s.gameDiff / Math.max(1, s.played);
    return Math.log(smoothedWinRate / (1 - smoothedWinRate)) * 0.65 + clamp(diffPerSet, -5, 5) * 0.055;
  }
  function pairStrength(history, a, b) {
    const s = history.pairs.get(keyPair(a, b));
    if (!s || s.played < 2) return 0;
    const smoothed = (s.wins + 2) / (s.played + 4);
    const diff = s.gameDiff / Math.max(1, s.played);
    const reliability = s.played / (s.played + 8);
    return reliability * (Math.log(smoothed / (1 - smoothed)) * 0.45 + clamp(diff, -5, 5) * 0.04);
  }
  function estimatePairWin(history, sideA, sideB) {
    if (!history || !(history.players instanceof Map) || !(history.pairs instanceof Map) ||
        !Array.isArray(sideA) || !Array.isArray(sideB) || sideA.length !== 2 || sideB.length !== 2 ||
        [...sideA, ...sideB].some(id => id == null || String(id).trim() === '') ||
        new Set([...sideA, ...sideB].map(String)).size !== 4) {
      throw new TypeError('Servono due coppie distinte, ciascuna con due giocatori diversi.');
    }
    const score = sideA.reduce((n, id) => n + individualStrength(history, id), 0)
      + pairStrength(history, sideA[0], sideA[1])
      - sideB.reduce((n, id) => n + individualStrength(history, id), 0)
      - pairStrength(history, sideB[0], sideB[1]);
    const p = clamp(0.5 + 0.36 * (sigmoid(score) - 0.5), 0.08, 0.92);
    return { probabilityA: p, probabilityB: 1 - p, score, historySets: history.setsUsed };
  }
  function odds(probability, overround = 0.08) {
    const p = Number(probability), margin = Number(overround);
    if (!Number.isFinite(p) || p <= 0 || p > 1) throw new RangeError('La probabilità deve essere maggiore di 0 e non superiore a 1.');
    if (!Number.isFinite(margin) || margin < 0 || margin > 0.25) throw new RangeError('Il margine deve essere compreso tra 0 e 0,25.');
    return Math.round((1 / (Math.min(p, 0.99) * (1 + margin))) * 100) / 100;
  }
  function marketSelections(outcomes, overround = 0.08) {
    if (!Array.isArray(outcomes) || !outcomes.length) return [];
    const values = outcomes.map(x => Number(x && x.probability));
    if (values.some(p => !Number.isFinite(p) || p <= 0)) throw new RangeError('Ogni esito quotato deve avere una probabilità finita maggiore di zero.');
    const total = values.reduce((n, p) => n + p, 0);
    if (!Number.isFinite(total) || total <= 0) throw new Error('Le probabilità devono avere una somma finita e positiva.');
    // Validate the margin even when an outcome has zero probability.
    if (!Number.isFinite(Number(overround)) || Number(overround) < 0 || Number(overround) > 0.25)
      throw new RangeError('Il margine deve essere compreso tra 0 e 0,25.');
    return outcomes.map((x, i) => {
      const p = values[i] / total;
      return {
        selection_key: String(x.selection_key),
        selection_label: String(x.selection_label),
        theoretical_probability: Math.round(p * 10000) / 10000,
        odds: odds(p, overround)
      };
    });
  }
  window.RoyalBetOdds = Object.freeze({ buildHistory, buildConfirmedHistory, estimatePairWin, odds, marketSelections });
})();
