# Royal Bet — server quote refresh (review required)

## Current implementation
- `supabase/functions/royal-bet-refresh-quotes/index.ts` reads official confirmed/approved RPL results using the existing Supabase project.
- It recalculates Regular Season winner quotes server-side and updates the existing `rpl_bet_markets` rows. No new project or paid service is required.
- `js/royal-bet-lab.js` invokes the function before loading market rows. If the function is not deployed, the UI falls back to saved quotes and logs a warning.
- Existing `rpl_place_bet` locks the market row and uses the database's current `odds` value for `odds_locked` and `potential_payout`. The client does not supply the payout odds.

## Important limitations before production activation
1. The Edge Function is committed to the development branch only; it has NOT been deployed to the production Supabase project.
2. The quote model is a heuristic, not calibrated from historical RPL outcomes.
3. Automatic mathematical clinch detection is not enabled because the complete maximum-remaining-points schedule has not yet been modeled in SQL.
4. A refresh is triggered when the Royal Bet dashboard loads; a database-side trigger/cron for every approved match result is not configured.
5. Month-specific markets are not refreshed by this function. Current production inventory was observed to contain season markets only for Regular Season and bonus ranking.
6. The Edge Function currently uses official confirmed/approved matches and saved `match_players.fascia_value` snapshots. Verify award_type spellings and official ranking reconciliation against the production leaderboard before deployment.
7. This function requires the existing project environment variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Never put the service-role key in frontend code or GitHub.

## Deployment and verification checklist
- Review the diff and verify quote totals and ranking scores against the official RPL ranking on a test date.
- Run Deno type-check/tests for the Edge Function.
- Deploy only this function to the existing project; do not create another Supabase project.
- Verify a logged-out request returns 401 and a non-player/non-operator request returns 403.
- Verify official player requests update only open `regular_season_champion` markets for the current `season_key`.
- Verify expired markets close and future markets remain untouched.
- Verify a wager stores the current database odds in `odds_locked`, and the wallet/ledger remains unchanged when a wager is rejected.
- Do not enable wagering until the function and RPC have been validated together. `WAGERING_ENABLED` remains false.

## Database-side quote freshness gate (development branch)
- Migration `202610180002_royalbet_quote_freshness.sql` adds `quote_calculated_at` and updates `rpl_place_bet` to lock the market row during placement.
- For `regular_season_champion`, the RPC rejects missing/stale (>10 minutes) server-calculated quotes and invalid odds before touching the wallet.
- The Edge Function writes `quote_calculated_at` whenever it refreshes an open season market.
- This migration has NOT been applied to Supabase. The RPC behavior must be tested in a disposable/test environment or reviewed before production migration.
- Idempotent retries return the original wager without a second debit, preserving the existing behavior.
