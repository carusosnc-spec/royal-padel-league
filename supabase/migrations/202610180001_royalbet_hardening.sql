-- Royal Bet Lab hardening — reviewed migration, NOT applied to production.
-- Validate on staging first. This migration intentionally does not alter balances,
-- wagers, odds, or existing market rows.
begin;

-- Predictions: authenticated read-only in the browser. No anon reads/writes and
-- no direct browser inserts/updates; trusted server-side generation is required.
drop policy if exists rpl_bet_predictions_insert on public.rpl_bet_predictions;
drop policy if exists rpl_bet_predictions_update_future on public.rpl_bet_predictions;
drop policy if exists rpl_bet_predictions_read on public.rpl_bet_predictions;

create policy rpl_bet_predictions_read_authenticated
  on public.rpl_bet_predictions
  for select
  to authenticated
  using (true);

revoke all privileges on table public.rpl_bet_predictions from anon, authenticated;
grant select on table public.rpl_bet_predictions to authenticated;

-- Markets are read-only for clients. Existing RLS already restricts reads to
-- authenticated users; mutations should go through operator-checked RPCs.
revoke insert, update, delete, truncate, references, trigger
  on table public.rpl_bet_markets from anon, authenticated;

-- Remove PUBLIC/anon EXECUTE and grant authenticated execution for the existing
-- signatures. The RPC bodies must still enforce operator checks for admin actions.
revoke execute on function public.rpl_place_bet(bigint, text, integer, text) from public, anon;
grant execute on function public.rpl_place_bet(bigint, text, integer, text) to authenticated;

revoke execute on function public.rpl_settle_bet_market(bigint, text) from public, anon;
grant execute on function public.rpl_settle_bet_market(bigint, text) to authenticated;

revoke execute on function public.rpl_void_bet_market(bigint, text) from public, anon;
grant execute on function public.rpl_void_bet_market(bigint, text) to authenticated;

revoke execute on function public.rpl_admin_cancel_bet_wager(bigint, text) from public, anon;
grant execute on function public.rpl_admin_cancel_bet_wager(bigint, text) to authenticated;

revoke execute on function public.rpl_admin_create_bet_market_group(text, text, jsonb, bigint, integer, text, timestamp with time zone, timestamp with time zone, jsonb, boolean) from public, anon;
grant execute on function public.rpl_admin_create_bet_market_group(text, text, jsonb, bigint, integer, text, timestamp with time zone, timestamp with time zone, jsonb, boolean) to authenticated;

revoke execute on function public.rpl_admin_set_bet_market_status(bigint, text) from public, anon;
grant execute on function public.rpl_admin_set_bet_market_status(bigint, text) to authenticated;

revoke execute on function public.rpl_admin_update_bet_market_odds(bigint, numeric) from public, anon;
grant execute on function public.rpl_admin_update_bet_market_odds(bigint, numeric) to authenticated;

commit;
