# Player Loans principal progress

Status: IMPLEMENTED_NOT_MERGED. Base: actual main03adc6891995fe1d780fe34629b1daf14470ea39.
Owner: feat/loans-principal-progress-20261117. No merge or deployment authorized.
Roadmap item: PLAYER-LOANS-PRINCIPAL-PROGRESS-001.

## Verified source semantics

The active legacy loan card's balance includes principal plus accrued interest,
while repaidPercent is principal-only (supabasePlayerBusinessBankingRepository.ts).
The current unlabeled bar and balance-of-original pairing can imply a payoff
percentage. The existing scoped normalized lifecycle read already supplies exact
originalPrincipal, principalBalance, accruedInterest and recordedOutstanding,
plus lastAccruedAt. loanCurrencyProjection.ts derives recordedOutstanding from
principal and stored interest. No backend/query or DTO change is necessary.

## Bounded behavior

Use one matching public facility key and currency from that lifecycle read.
Compute principal repaid from original minus remaining principal using BigInt
cents, never legacy Number amounts or payment-history totals. Floor displayed
percentage to tenths so a residual cent cannot display100%. Clearly label original
and remaining principal, stored accrued interest and its recorded timestamp.
Missing, malformed or contradictory principal inputs show progress unavailable.
Missing or inconsistent interest/total fields do not produce a recorded debt
claim. Stored amounts are not a payoff quote; future/unrecorded interest remains
excluded. Existing repayment forms, default amounts, transport, idempotency,
authorization and account binding remain byte-identical.

A per-facility paid milestone requires server status paid, exact recorded
outstanding0.00, principal0.00, stored interest0.00 and a known currency. It never
infers payoff from a partial payment window, invents a paid date/reward, aggregates
lifetime payments, or claims the player is debt-free. Returned paid rows remain
explicitly bounded when facility coverage is incomplete. Missing closure time is
shown as not recorded.

## Overlap and ownership

PR1007 owns facility-grouped payment receipts in loans-history.js and its existing
lifecycle/browser tests. This branch does not modify those files. It adds a small
separate pure presenter and new focused/browser regressions, with only call-site
wiring in loans-page.js and registration in the existing Loans test aggregate.
Shared metadata/inventory/source pins require normal reconciliation before any
future merge. No CSS, mutation, backend, route, RPC, migration, permission or live
configuration change.

## Verification and next step

Twenty focused cases (eleven retained and nine new) pass, including exact
large values, residual-cent percentage, unknown/mismatched/contradictory inputs,
interest-only debt, paid-status/zero-debt consistency, incomplete/reversed receipt
windows, escaping and retained repayment controls. Desktop/mobile tests cover
accessible progress, keyboard disclosure, refresh, route return and unavailable
read replacement without issuing mutations. Full aggregates, local browser/Edge
limits, independent review, actual PR authority, public source pins and hosted
exact-head results must be recorded before readiness. The inherited roster
runtime-equivalence guard is not exempted: freeze the complete reviewed source,
then pin both integrated roles to its verified public SHA/tree.

## Draft PR 1011 verification checkpoint

Public source 99d6edc4dc747e380be8c6ac15995a50d3616250, tree 910bb7baa3ab65c719cbee7e85945c0e903f7040, exactly matches independently reviewed local bd1605282. All 20 focused cases, full root tests, Player verification and core backend TypeScript pass. Browser execution is blocked before test bodies because local Chromium is absent. Full Edge typecheck and smoke are blocked by the frozen esm.sh Supabase SDK network fetch; no passing claim is made for either. Hosted exact-head qualification remains required. Authority and CI inventory use the actual PR number and deny production deployment, mutation and secret handling. No guard or workflow weakening.

## Actual-main serial integration (2026-11-18)

Normally integrate actual main `b9265aecd9b59099b6973d27eec9580ffc806c38` containing Loans receipts #1007, Crafting #1008 and Store state #1010. Preserve every predecessor source/test/authority and both Player package test registrations. Resolve only additive roadmap, regenerated combined inventory and inherited runtime pins. Principal progress source/tests remain unchanged from `73e96c54`. Publish metadata-complete integration then a four-value pin-only child; independent review and full fresh exact-head hosted qualification remain required. No manual deployment, provider setting or live DB action.
