# Royal Bet Lab — test plan for staging

These checks must run against a disposable/staging Supabase project with seeded test users. Do not use live players or production wallets for wagering tests.

## Identity and access
- [ ] Unauthenticated user cannot read or write prediction rows.
- [ ] Authenticated official active player can read markets and own wallet/wagers only.
- [ ] Guest/inactive player cannot place a wager.
- [ ] Authenticated user with no player_accounts link cannot place a wager.
- [ ] Non-operator cannot create, change, settle, void or cancel markets/wagers, even by direct RPC calls.
- [ ] Operator can perform permitted market management actions.
- [ ] Player A cannot read Player B's wallet, transactions or wager history.

## Wager placement
- [ ] Stake must be a positive integer.
- [ ] Insufficient available balance is rejected without ledger or wallet mutation.
- [ ] Player participating in the calendar match is rejected for every market in that match.
- [ ] Selection key must belong to the selected market group.
- [ ] Market must be open and within opens_at/closes_at window.
- [ ] The placed wager stores odds_locked and potential_payout; later odds edits do not change the wager.
- [ ] Repeating the same idempotency key and same payload returns the original wager and does not debit twice.
- [ ] Reusing an idempotency key with a different player/market/selection/stake is rejected.
- [ ] Two concurrent wagers cannot overspend the same wallet.
- [ ] Every stake lock creates exactly one ledger entry.

## Settlement and refund
- [ ] Settlement requires operator authorization and a valid winning selection.
- [ ] Settlement of the same market group cannot pay twice.
- [ ] Winning wager pays the locked potential payout; losing wager pays zero; locked credits decrease by stake.
- [ ] Void/refund returns stake exactly once and decrements locked credits exactly once.
- [ ] Canceling an individual open wager returns stake exactly once.
- [ ] Wallet balance and locked_credits reconcile to the transaction ledger after each scenario.
- [ ] Missing wallet or inconsistent locked credits aborts the entire transaction with no partial changes.
- [ ] Invalid result or postponed/unplayed match follows a documented void/reopen policy.

## Market generation and odds
- [ ] Market generation is idempotent: repeated runs do not create duplicate market groups.
- [ ] No market opens before the configured time or after close.
- [ ] Season markets are keyed by season_key and are not mixed with match markets.
- [ ] Historical model records source window, model_version, generated_at, probabilities and odds.
- [ ] Probabilities for a complete outcome group normalize to 1 (within documented rounding tolerance).
- [ ] Odds include a documented margin and are clamped to agreed bounds.
- [ ] Insufficient historical sample size falls back to a clearly labeled conservative prior, not fabricated precision.
- [ ] Only validated/official match results trigger settlement.
- [ ] Automatic settlement is idempotent and alerts the operator on incomplete or ambiguous outcomes.

## UI / session integration
- [ ] Reuses the existing Supabase session and existing player_accounts link; no second login.
- [ ] No service-role key or privileged credential appears in client code.
- [ ] UI works on iPhone Safari in portrait and landscape.
- [ ] Wallet, active markets, placed wagers and settled history refresh after each successful action.
- [ ] Clear Italian error messages are shown for rejected wagers and expired sessions.
