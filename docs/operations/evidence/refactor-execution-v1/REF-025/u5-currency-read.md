# REF-025b — Retained Loans row currency metadata

Date: 2026-10-04. Status: IMPLEMENTED; draft review/qualification pending.
Base: `8178ee7c13b5c02761bb0f9bbf34cea03a3467ca` (includes docs-only #836).
Parent remains BLOCKED. REF-027 still depends on 025 + 026. This is not a release.

## Scope and behavior

Accepted #835 registration; exactly four paths, maximum 250 semantic diff lines:
- `backend/src/domains/business-banking/contracts/playerBusinessBankingContracts.ts`
- `backend/src/domains/business-banking/infrastructure/supabasePlayerBusinessBankingRepository.ts`
- `backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.test.ts`
- This evidence file, `docs/operations/evidence/refactor-execution-v1/REF-025/u5-currency-read.md`.

Only LoansSnapshotDto and readLoans output gain optional nullable currencyCode:
product currency for offers, loan currency for active loans and schedules.
Production emits null for absent/blank currency, never the local context currency.
Optional fields retain injected-repository compatibility. Existing text trimming
is reused; monetary representation/rounding is unchanged and not certified exact.
One context RPC and five queries, all filters/order/limits, owner-based eligibility,
public business key/null, errors, headers, amounts and repayment rights remain.
No liability inference, mandate expansion, economic/schema, UI or package change.

Tests compare the entire old response after removing only currencyCode, for zero,
one and two businesses with mixed NRC/LUM loans and null/undefined/blank currency.
The exact query trace remains asserted; missing context, wrong-game PLAYER_NOT_FOUND,
scope denial and table failure remain errors. No test claims live database proof.
025b2 exact per-currency aggregation and 025b3 actual Loans consumer migration remain
required accepted-successor work; this metadata does not fix the mixed-currency
legacy scalar, label new business liability, or satisfy the parent acceptance.
Rollback reverts these additive types/projections/tests; no money state changed.

## Prerequisite and diagnostic evidence

Merged #834 `8a33ce0ce122115bc06ae525f5ab5d08d4daf557` exactly matches its accepted
six-path patch. Exact-main runs: 22 success, two expected skips. Current base's
seven runs pass; its three docs paths do not change runtime or workflow sources.
Store Cutover run37169084277 originally cancelled during overlapping main retries;
both main runs share a cancel-in-progress group. The overlap supports, but does
not independently prove, the cancellation cause. Parent authorized one serial
retry per cancelled job: browser111341048199, settlement111343152812 and connected
Store111343644997 all passed. No successful job was selected for another retry.
Browser: focused12 pass/2 skip; full136 pass/1 flaky/11 skip. Story optional Escape
case at player-story-delivery.spec.mjs129 retained a modal at the five-second check,
then passed its existing CI retry; cause unproven, no assertion/timeout change.
Original connected cancellation artifact11290003318 is retained (sha256
33babbb1af897b22437663b3c88e7bcbcbc8e0d9593ab07b1f12b3609a7c4c23).
No live SQL, capture, deployment, dispatch or hold restoration was performed.
All nine U1 false guards, release holds and #668/#736 ownership remain unchanged.

## Validation

Pinned Node22.23.1/npm10.9.8/Deno2.9.3; frozen backend lock.
PASS: owning Player9/Admin11; Banking38, BankingFX16, orchestrator18, FX39, ledger25;
Player banking-read/banking-fx/business-workspace/business-workspace-boundary;
focused repository typecheck, SQL source contract, root npm test, architecture/high-priority/
legacy guards, secret scan and whitespace. Inventory regeneration has zero diff:
1,271 source files, 52 persistence exceptions, 163 deep imports, 209 marker files,
100 oversized files; all unchanged. No inventory/scope amendment or ceiling change.
Full backend typecheck/smoke local dependency availability and exact-head CI results
are reported in the draft PR; main results above are prerequisite evidence only.
Parent controls review/merge. No new independent audit or financial-policy work.
