-- Royal Bet Lab hardening — reviewed migration, NOT applied to production.
-- Run only after testing against a staging project and confirming no client-side
-- workflow legitimately inserts/updates rpl_bet_predictions directly.
begin;

-- Predictions are readable by signed-in players, but must not be writable from
-- anon/authenticated browser clients. Generation should happen through a trusted
-- Edge Function/service role or an operator-only RPC.
drop policy if exists rpl_bet_predictions_insert on public.rpl_bet_predictions;
drop policy if exists rpl_bet_predictions_update_future on public.rpl_bet_predictions;

create policy rpl_bet_predictions_read_authenticated
  on public.rpl_bet_predictions
  for select
  to authenticated
  using (true);

-- Remove the broad read policy that currently grants access to anonymous users.
drop policy if exists rpl_bet_predictions_read on public.rpl_bet_predictions;

revoke insert, update, delete, truncate, references, trigger
  on table public.rpl_bet_predictions from anon, authenticated;
grant select on table public.rpl_bet_predictions to authenticated;

-- Keep market catalog readable to authenticated players. Writes remain through
-- SECURITY DEFINER RPCs that explicitly verify operator membership.
revoke insert, update, delete, truncate, references, trigger
  on table public.rpl_bet_markets from anon, authenticated;

-- Explicitly prevent unauthenticated callers from invoking betting/operator RPCs.
revoke execute on function public.rpl_place_bet(bigint, text, integer, text) from public, anon;
grant execute on function public.rpl_place_bet(bigint, text, integer, text) to authenticated;

revoke execute on function public.rpl_settle_bet_market(bigint, text) from public, anon;
grant execute on function public.rpl_settle_bet_market(bigint, text) to authenticated;

revoke execute on function public.rpl_void_bet_market(bigint, text) from public, anon;
grant execute on function public.rpl_void_bet_market(bigint, text) to authenticated;

revoke execute on function public.rpl_admin_cancel_bet_wager(bigint, text) from public, anon;
grant execute on function public.rpl_admin_cancel_bet_wager(bigint, text) to authenticated;

revoke execute on function public.rpl_admin_create_bet_market_group(text, text, jsonb, bigint, integer, text, timestamptz, timestamptz, jsonb, boolean) from public, anon;
grant execute on function public.rpl_admin_create_bet_market_group(text, text, jsonb, bigint, integer, text, timestamptz, timestamptz, jsonb, boolean) to authenticated;

revoke execute on function public.rpl_admin_set_bet_market_status(bigint, text) from public, anon;
grant execute on function public.rpl_admin_set_bet_market_status(bigint, text) to authenticated;

revoke execute on function public.rpl_admin_update_bet_market_odds(bigint, numeric) from public, anon;
grant execute on function public.rpl_admin_update_bet_market_odds(bigint, numeric) to authenticated;

commit;
