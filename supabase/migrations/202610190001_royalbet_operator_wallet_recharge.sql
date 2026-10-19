-- Royal Bet Lab: authorized wallet top-up with an immutable ledger entry.
-- Applies only to the existing RPL Supabase project.
begin;

-- Drop first because PostgreSQL does not allow CREATE OR REPLACE to rename
-- OUT columns in an existing RETURNS TABLE signature.
drop function if exists public.rpl_admin_recharge_bet_wallet(bigint, integer, text);

create function public.rpl_admin_recharge_bet_wallet(
  p_player_id bigint,
  p_amount integer,
  p_reason text
)
returns table(new_balance integer, wallet_updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.rpl_bet_wallets%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_new_balance integer;
  v_wallet_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Accesso richiesto';
  end if;

  if not exists (
    select 1 from public.operators o where o.user_id = v_user_id
  ) then
    raise exception 'Solo un operatore autorizzato può ricaricare i portafogli';
  end if;

  if p_player_id is null or p_player_id <= 0 then
    raise exception 'Giocatore non valido';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'La ricarica deve essere tra 1 e 1.000.000 crediti';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 160 then
    raise exception 'Inserisci un motivo da 3 a 160 caratteri';
  end if;

  if not exists (
    select 1 from public.players p
    where p.id = p_player_id and p.active = true and coalesce(p.is_guest, false) = false
  ) then
    raise exception 'Il portafoglio è ricaricabile solo per un giocatore ufficiale attivo';
  end if;

  select w.* into v_wallet
  from public.rpl_bet_wallets w
  where w.player_id = p_player_id
  for update;

  if not found then
    raise exception 'Portafoglio non trovato per il giocatore selezionato';
  end if;

  update public.rpl_bet_wallets as w
  set balance = w.balance + p_amount,
      updated_at = now()
  where w.player_id = p_player_id
  returning w.balance, w.updated_at
  into v_new_balance, v_wallet_updated_at;

  insert into public.rpl_bet_wallet_transactions (
    player_id, transaction_type, amount, balance_after,
    reference_type, reference_id, idempotency_key, note, created_by
  ) values (
    p_player_id, 'admin_adjustment', p_amount, v_new_balance,
    'admin_recharge', p_player_id,
    'admin-topup-' || gen_random_uuid()::text,
    v_reason, v_user_id
  );

  new_balance := v_new_balance;
  wallet_updated_at := v_wallet_updated_at;
  return next;
end;
$function$;

revoke all on function public.rpl_admin_recharge_bet_wallet(bigint, integer, text) from public, anon;
grant execute on function public.rpl_admin_recharge_bet_wallet(bigint, integer, text) to authenticated;

commit;

-- Refresh PostgREST's schema cache after the transaction commits.
notify pgrst, 'reload schema';
