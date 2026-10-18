-- Royal Bet: server-calculated quote freshness gate.
-- Development branch only; do not apply to production before review.
ALTER TABLE public.rpl_bet_markets
  ADD COLUMN IF NOT EXISTS quote_calculated_at timestamptz;

CREATE OR REPLACE FUNCTION public.rpl_place_bet(
  p_market_id bigint,
  p_selection_key text,
  p_stake integer,
  p_idempotency_key text
)
RETURNS TABLE(
  wager_id bigint,
  available_balance integer,
  locked_credits integer,
  potential_payout integer,
  already_placed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_player_id bigint;
  v_market public.rpl_bet_markets%ROWTYPE;
  v_wallet public.rpl_bet_wallets%ROWTYPE;
  v_existing public.rpl_bet_wagers%ROWTYPE;
  v_wager_id bigint;
  v_potential integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Devi accedere per effettuare una puntata';
  END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'La puntata deve essere maggiore di zero';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'Chiave della puntata non valida';
  END IF;
  IF p_selection_key IS NULL OR length(trim(p_selection_key)) = 0 THEN
    RAISE EXCEPTION 'Selezione non valida';
  END IF;

  SELECT pa.player_id INTO v_player_id
  FROM public.player_accounts pa
  WHERE pa.user_id = v_user_id
  LIMIT 1;
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Account non associato a un giocatore RPL';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = v_player_id AND p.active = true AND p.is_guest = false
  ) THEN
    RAISE EXCEPTION 'Solo i giocatori ufficiali attivi possono puntare';
  END IF;

  -- Idempotency returns the existing wager without a second debit.
  SELECT w.* INTO v_existing
  FROM public.rpl_bet_wagers w
  WHERE w.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.player_id <> v_player_id
       OR v_existing.market_id <> p_market_id
       OR v_existing.selection_key <> p_selection_key
       OR v_existing.stake <> p_stake THEN
      RAISE EXCEPTION 'La chiave idempotente è già stata usata per una richiesta diversa';
    END IF;
    SELECT rw.balance, rw.locked_credits INTO available_balance, locked_credits
    FROM public.rpl_bet_wallets rw WHERE rw.player_id = v_player_id;
    wager_id := v_existing.id;
    potential_payout := v_existing.potential_payout;
    already_placed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock the selected market so the quote cannot change mid-transaction.
  SELECT m.* INTO v_market
  FROM public.rpl_bet_markets m
  WHERE m.id = p_market_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mercato non trovato';
  END IF;
  IF v_market.status <> 'open'
     OR (v_market.opens_at IS NOT NULL AND now() < v_market.opens_at)
     OR (v_market.closes_at IS NOT NULL AND now() >= v_market.closes_at) THEN
    RAISE EXCEPTION 'Questo mercato non è aperto alle puntate';
  END IF;
  IF v_market.selection_key <> p_selection_key THEN
    RAISE EXCEPTION 'La selezione non appartiene al mercato scelto';
  END IF;

  -- Season-winner odds must have been calculated server-side recently.
  -- A stale or missing quote fails closed: no stake is deducted.
  IF v_market.market_type = 'regular_season_champion' THEN
    IF v_market.quote_calculated_at IS NULL
       OR v_market.quote_calculated_at < now() - interval '10 minutes' THEN
      RAISE EXCEPTION 'Quota non aggiornata: ricarica Royal Bet e riprova';
    END IF;
    IF v_market.odds IS NULL OR v_market.odds <= 1 OR v_market.odds > 1000 THEN
      RAISE EXCEPTION 'Quota non valida';
    END IF;
  END IF;

  -- A player may not bet on their own match.
  IF v_market.market_scope = 'match' AND EXISTS (
    SELECT 1 FROM public.calendar_matches cm
    WHERE cm.id = v_market.calendar_match_id
      AND v_player_id IN (cm.player_1, cm.player_2, cm.player_3, cm.player_4)
  ) THEN
    RAISE EXCEPTION 'Non puoi puntare su una partita a cui partecipi';
  END IF;

  SELECT rw.* INTO v_wallet
  FROM public.rpl_bet_wallets rw
  WHERE rw.player_id = v_player_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portafoglio Royal Bet non trovato';
  END IF;
  IF v_wallet.balance < p_stake THEN
    RAISE EXCEPTION 'Crediti insufficienti';
  END IF;

  v_potential := round(p_stake * v_market.odds)::integer;
  IF v_potential <= 0 THEN
    RAISE EXCEPTION 'Vincita potenziale non valida';
  END IF;

  INSERT INTO public.rpl_bet_wagers (
    player_id, market_id, selection_key, stake, odds_locked,
    potential_payout, status, settled_payout, idempotency_key, created_by
  ) VALUES (
    v_player_id, p_market_id, p_selection_key, p_stake, v_market.odds,
    v_potential, 'open', 0, p_idempotency_key, v_user_id
  ) RETURNING id INTO v_wager_id;

  UPDATE public.rpl_bet_wallets
  SET balance = balance - p_stake,
      locked_credits = locked_credits + p_stake,
      updated_at = now()
  WHERE player_id = v_player_id
  RETURNING balance, locked_credits INTO available_balance, locked_credits;

  INSERT INTO public.rpl_bet_wallet_transactions (
    player_id, transaction_type, amount, balance_after,
    reference_type, reference_id, idempotency_key, note, created_by
  ) VALUES (
    v_player_id, 'stake_lock', -p_stake, available_balance,
    'wager', v_wager_id, 'bet-stake-lock-' || v_wager_id::text,
    'Crediti bloccati per puntata Royal Bet', v_user_id
  );

  wager_id := v_wager_id;
  potential_payout := v_potential;
  already_placed := false;
  RETURN NEXT;
END;
$function$;

COMMENT ON COLUMN public.rpl_bet_markets.quote_calculated_at IS
  'Timestamp of server-side quote calculation; required to be no older than 10 minutes for Regular Season champion wagers.';
