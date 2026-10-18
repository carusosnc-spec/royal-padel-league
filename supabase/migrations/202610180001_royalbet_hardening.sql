-- Royal Bet Lab hardening — reviewed migration, NOT applied to production.
-- Validate on staging first. This migration intentionally does not alter balances,
-- wagers, odds, or existing market rows.
begin;

-- Predictions: no anon access and no direct browser inserts/updates. Reads are
-- limited to operators and official active players participating in that match.
drop policy if exists rpl_bet_predictions_insert on public.rpl_bet_predictions;
drop policy if exists rpl_bet_predictions_update_future on public.rpl_bet_predictions;
drop policy if exists rpl_bet_predictions_read on public.rpl_bet_predictions;

create policy rpl_bet_predictions_read_authorized
  on public.rpl_bet_predictions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.operators o
      where o.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.player_accounts pa
      join public.players p on p.id = pa.player_id
      where pa.user_id = (select auth.uid())
        and p.active = true
        and coalesce(p.is_guest, false) = false
        and p.id in (
          pair_a_player_1, pair_a_player_2,
          pair_b_player_1, pair_b_player_2
        )
    )
  );

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
