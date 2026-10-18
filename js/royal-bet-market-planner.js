/**
 * Royal Bet Lab — deterministic dry-run planner for market draft rows.
 * Pure function only: no Supabase client and no database writes.
 */
(function () {
  'use strict';
  const ALLOWED_TYPES = new Set([
    'set_winner', 'set_exact_score', 'set_game_margin', 'mvp', 'unbeaten',
    'most_sets_won', 'fewest_sets_won', 'regular_season_champion',
    'bonus_ranking_champion', 'finals_champion', 'finals_podium'
  ]);
  const keyOf = row => [
    row.market_scope,
    row.market_scope === 'match' ? String(row.calendar_match_id) : String(row.season_key),
    row.market_type,
    row.set_number == null ? '' : String(row.set_number),
    String(row.selection_key)
  ].join('|');
  function validate(row) {
    if (!row || typeof row !== 'object') return 'riga non valida';
    if (!ALLOWED_TYPES.has(row.market_type)) return 'tipo mercato non supportato';
    if (!row.selection_key || !String(row.selection_key).trim()) return 'selection_key mancante';
    if (!row.selection_label || !String(row.selection_label).trim()) return 'selection_label mancante';
    if (row.market_scope === 'match') {
      if (row.calendar_match_id == null || !Number.isInteger(Number(row.calendar_match_id)) ||
          Number(row.calendar_match_id) <= 0 || row.season_key != null)
        return 'ambito partita incoerente';
    } else if (row.market_scope === 'season') {
      if (!row.season_key || !String(row.season_key).trim() || row.calendar_match_id != null)
        return 'ambito stagione incoerente';
    } else return 'market_scope deve essere match o season';
    if (row.set_number != null && (!Number.isInteger(Number(row.set_number)) ||
        Number(row.set_number) < 1 || Number(row.set_number) > 10))
      return 'set_number fuori intervallo';
    const p = Number(row.theoretical_probability), o = Number(row.odds);
    if (!Number.isFinite(p) || p <= 0 || p >= 1) return 'probabilità teorica fuori intervallo (0, 1)';
    if (!Number.isFinite(o) || o <= 1 || o > 1000) return 'quota fuori intervallo (1, 1000]';
    return null;
  }
  function planMarketDrafts(candidates, existing) {
    const known = new Set((existing || []).filter(Boolean).map(keyOf));
    const seen = new Set();
    const planned = [], skipped = [];
    for (const candidate of candidates || []) {
      const reason = validate(candidate);
      if (reason) { skipped.push({ candidate, reason }); continue; }
      const key = keyOf(candidate);
      if (known.has(key) || seen.has(key)) {
        skipped.push({ candidate, reason: 'mercato duplicato (già presente o ripetuto nel lotto)' });
        continue;
      }
      seen.add(key);
      planned.push({
        market_scope: candidate.market_scope,
        calendar_match_id: candidate.market_scope === 'match' ? Number(candidate.calendar_match_id) : null,
        season_key: candidate.market_scope === 'season' ? String(candidate.season_key).trim() : null,
        market_type: candidate.market_type,
        set_number: candidate.set_number == null ? null : Number(candidate.set_number),
        selection_key: String(candidate.selection_key).trim(),
        selection_label: String(candidate.selection_label).trim(),
        theoretical_probability: Number(candidate.theoretical_probability),
        odds: Number(candidate.odds),
        status: 'draft',
        opens_at: candidate.opens_at || null,
        closes_at: candidate.closes_at || null,
        market_metadata: {
          ...(candidate.market_metadata && typeof candidate.market_metadata === 'object' ? candidate.market_metadata : {}),
          generation_mode: 'dry_run',
          requires_operator_review: true
        }
      });
    }
    return { planned, skipped, writePerformed: false };
  }
  window.RoyalBetMarketPlanner = Object.freeze({ planMarketDrafts });
})();
