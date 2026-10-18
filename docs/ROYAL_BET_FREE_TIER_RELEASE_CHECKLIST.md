# Royal Bet Lab — free-tier release checklist

## Cost constraints
- Reuse the existing RPL Supabase project and GitHub Pages hosting.
- Do not create Supabase branches, projects, paid compute, or external paid services.
- Keep credits virtual only; no deposits, withdrawals, or real-money payment integrations.
- Use local deterministic JavaScript calculations for preview odds and the existing confirmed-match history.

## Current safety state
- Player wagering UI has `WAGERING_ENABLED = false`.
- No new wagers, wallet balances, market rows, or production permissions are changed by this branch.
- Odds previews and market planner are dry-run only.
- The hardening migration `202610180001_royalbet_hardening.sql` is not applied to production.

## Required checks before enabling wagers
1. Verify all market and wallet reads are limited by RLS to the authenticated player/operator as appropriate.
2. Verify `rpl_place_bet` rejects participants betting on their own match, stale/closed markets, insufficient balance, invalid selections, and duplicate idempotency keys.
3. Verify every admin RPC checks operator membership server-side; browser-side checks are not authorization.
4. Test stake lock, cancellation refund, market settlement, and void/refund in a disposable test setup or transaction-safe test harness.
5. Confirm settlement and refunds are atomic and idempotent under retries.
6. Validate complete outcome groups and probability sums before any draft market is created.
7. Confirm the app can be disabled with a single feature flag without changing the existing RPL login or ranking experience.
8. Run the full GitHub Actions suite and inspect Supabase Security Advisor findings before deployment.

## Activation rule
Do not switch `WAGERING_ENABLED` to true until the security checks above have passed. If safe testing would require a paid staging branch or compute, stop and ask first; do not incur the cost automatically.
