/**
 * Royal Bet Lab — integration contract (initial scaffold).
 *
 * This module must be loaded by the existing RPL page after its shared Supabase
 * client (window.sb) and player session have initialized. It intentionally does
 * not create a second Supabase client or login screen.
 *
 * Do not expose service-role credentials in the browser.
 */
(function () {
  'use strict';

  const REQUIRED_RPC = {
    placeBet: 'rpl_place_bet',
    settleMarket: 'rpl_settle_bet_market',
    voidMarket: 'rpl_void_bet_market'
  };

  function getClient() {
    const client = window.sb;
    if (!client || typeof client.rpc !== 'function') {
      throw new Error('Sessione RPL non inizializzata.');
    }
    return client;
  }

  async function getCurrentPlayer() {
    const client = getClient();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('Accedi dall’Area Giocatori RPL.');

    const { data: account, error: accountError } = await client
      .from('player_accounts')
      .select('player_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) throw new Error('Account non collegato a un giocatore RPL.');

    const { data: player, error: playerError } = await client
      .from('players')
      .select('id,name,nickname,active,is_guest')
      .eq('id', account.player_id)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player || !player.active || player.is_guest) {
      throw new Error('Accesso riservato ai giocatori ufficiali attivi.');
    }
    return { user, account, player };
  }

  async function placeBet({ marketId, selectionKey, stake, idempotencyKey }) {
    const client = getClient();
    const { player } = await getCurrentPlayer();
    if (!Number.isSafeInteger(Number(stake)) || Number(stake) <= 0) {
      throw new Error('La puntata deve essere un numero intero positivo.');
    }
    if (!marketId || !selectionKey) throw new Error('Mercato o selezione non validi.');
    if (!idempotencyKey || String(idempotencyKey).length < 8) {
      throw new Error('Identificativo della puntata non valido.');
    }

    const { data, error } = await client.rpc(REQUIRED_RPC.placeBet, {
      p_market_id: Number(marketId),
      p_selection_key: String(selectionKey),
      p_stake: Number(stake),
      p_idempotency_key: String(idempotencyKey)
    });
    if (error) throw error;
    return { player, result: Array.isArray(data) ? data[0] : data };
  }

  window.RoyalBetLab = Object.freeze({
    getCurrentPlayer,
    placeBet,
    rpcNames: REQUIRED_RPC
  });
})();
