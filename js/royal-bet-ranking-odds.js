/**
 * Royal Bet Lab — dynamic standings odds for season/month winner markets.
 * Pure calculation only; does not write to Supabase.
 */
(function () {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const DAY = 86400000;
  const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

  function remainingFraction(now, opensAt, closesAt) {
    const t = new Date(now).getTime();
    const start = new Date(opensAt).getTime();
    const end = new Date(closesAt).getTime();
    if (![t, start, end].every(Number.isFinite) || end <= start)
      throw new RangeError('Intervallo temporale non valido.');
    return clamp((end - t) / (end - start), 0, 1);
  }

  function marketDeadline(scope, year, month) {
    if (!Number.isInteger(year) || year < 2020 || year > 2100)
      throw new TypeError('Anno non valido.');
    let m, day;
    if (scope === 'season') { m = 3; day = 31; }
    else if (scope === 'month' && Number.isInteger(month) && month >= 1 && month <= 12) {
      m = month;
      day = new Date(Date.UTC(year, month, 0)).getUTCDate();
    } else throw new TypeError('Specificare scope season oppure month con anno e mese validi.');
    // Italy local end-of-day: UTC+1 in winter; UTC+2 during daylight-saving months.
    // October's final day is after the EU daylight-saving switch.
    const offset = (m >= 4 && m <= 9) || m === 3 ? '+02:00' : '+01:00';
    return new Date(year+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0')+'T23:59:59.999'+offset).toISOString();
  }

  // standings: [{selection_key, selection_label, points, max_points_remaining?}]
  // If max_points_remaining is supplied for all selections, a mathematically clinched
  // leader can be marked unbettable; otherwise we conservatively estimate probabilities.
  function calculateRankingOdds(standings, opts = {}) {
    if (!Array.isArray(standings) || standings.length < 2)
      throw new TypeError('Servono almeno due giocatori/esiti in classifica.');
    const now = opts.now || new Date().toISOString();
    const opensAt = opts.opensAt || now;
    const closesAt = opts.closesAt;
    if (!closesAt) throw new TypeError('Manca la scadenza del mercato.');
    const remaining = remainingFraction(now, opensAt, closesAt);
    const clean = standings.map(x => ({
      selection_key: String(x.selection_key || ''),
      selection_label: String(x.selection_label || x.selection_key || ''),
      points: Number(x.points),
      max_points_remaining: x.max_points_remaining == null ? null : Number(x.max_points_remaining)
    }));
    if (clean.some(x => !x.selection_key || !Number.isFinite(x.points) ||
      (x.max_points_remaining != null && (!Number.isFinite(x.max_points_remaining) || x.max_points_remaining < 0))))
      throw new TypeError('Classifica incompleta o non valida.');
    if (new Set(clean.map(x => x.selection_key)).size !== clean.length)
      throw new Error('Selezioni duplicate nella classifica.');

    const ranked = [...clean].sort((a, b) => b.points - a.points);
    const leader = ranked[0];
    const allRemainingKnown = clean.every(x => x.max_points_remaining != null);
    const clinched = allRemainingKnown &&
      ranked.slice(1).every(x => leader.points > x.points + x.max_points_remaining);
    const nowMs = new Date(now).getTime();
    const opensMs = new Date(opensAt).getTime();
    const closesMs = new Date(closesAt).getTime();
    const expired = nowMs >= closesMs;
    const notOpen = nowMs < opensMs;
    const marketBlocked = expired || notOpen || clinched;
    const daysLeft = Math.max(0, (new Date(closesAt).getTime() - new Date(now).getTime()) / DAY);
    // Uncertainty shrinks as the deadline approaches. Historical performance is not
    // inferred here; the caller supplies official ranking points and remaining-point bounds.
    const scoreSpread = Math.max(1, ...clean.map(x => Math.abs(leader.points - x.points)));
    // Scale uncertainty to the actual points spread: broad early in the period,
    // progressively sharper near closing, without making ordinary point gaps
    // effectively certain on day one.
    const temperature = Math.max(0.75, scoreSpread * (0.12 + 0.9 * Math.sqrt(Math.max(0, remaining))));
    const weights = clean.map(x => Math.exp(clamp((x.points - leader.points) / temperature, -60, 0)));
    const total = weights.reduce((a, b) => a + b, 0);
    return clean.map((x, i) => {
      const probability = clinched ? (x.selection_key === leader.selection_key ? 1 : 0) : weights[i] / total;
      // Expired, not-yet-open, and mathematically decided markets cannot accept wagers.
      const odds = marketBlocked ? 0 : round(1 / Math.max(probability, 0.0001) / 1.08, 2);
      const reason = expired ? 'mercato scaduto' : notOpen ? 'mercato non ancora aperto' : clinched ? 'classifica matematicamente definita' : null;
      return {
        selection_key: x.selection_key,
        selection_label: x.selection_label,
        theoretical_probability: round(probability),
        odds,
        is_bettable: !marketBlocked,
        unbettable_reason: reason,
        remaining_fraction: round(remaining),
        days_left: round(daysLeft, 2)
      };
    });
  }

  window.RoyalBetRankingOdds = Object.freeze({ marketDeadline, remainingFraction, calculateRankingOdds });
})();
