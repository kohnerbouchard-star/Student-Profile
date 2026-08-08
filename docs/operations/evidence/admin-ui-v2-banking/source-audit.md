# Admin UI V2 Banking — Focused Contract Reconciliation

Reconciled base: `5469e47cfc160d1821e7e99e4bd19985eabcc72b`

Branch: `refactor/admin-ui-v2-banking-v1`

This is a continuation of the existing Banking audit. The final reconciliation checked the merged PR #501 Checking/Savings authority, merged backend PR #529 / issue #528 resolution, current Admin V2 integration state, and the PR-owned diff.

## Mainline reconciliation

The Banking branch is normalized onto `5469e47cfc160d1821e7e99e4bd19985eabcc72b`, which includes both the PR #501 Checking/Savings convergence and the PR #529 `economy.adjust`-authorized personal Banking Admin contract.

All already-converged Admin V2 routes are preserved additively. Banking remains the only newly migrated route in this PR.

## PR #501 dependency

PR #501 is merged. Banking V2 remains aligned with its final authority:

- only `checking` and `savings` enter the route read model or transaction presentation;
- currency remains row-scoped and is never cross-summed;
- no generic Cash compatibility model is retained;
- no route-owned ECO fallback is introduced;
- administrative adjustments submit canonical account type plus explicit currency.

Status: **cleared**.

## Backend permission authority

Issue #528 was resolved by PR #529, merged to `main` as `5469e47cfc160d1821e7e99e4bd19985eabcc72b`.

The authoritative Banking Admin/BFF resource family is now protected by `economy.adjust`, while `/players` remains separately protected by `players.manage`.

Banking V2 no longer consumes the Players administration routes.

## Authoritative contracts used

### Banking roster and balances

`GET /api/admin/games/:gameId/banking/players`

The Banking-specific DTO supplies only the presentation identity, country name, status, and currency-scoped canonical Checking/Savings balances needed by this route. The backend filters non-canonical account rows before response construction.

### Posted transaction activity

`GET /api/admin/games/:gameId/banking/players/:playerId/history-audit`

The response supplies canonical ledger presentation fields only. Ledger IDs, source IDs, and unrelated Players administration data are not part of this Banking response.

### Administrative correction

`POST /api/admin/games/:gameId/banking/players/:playerId/ledger-adjustments`

The route accepts an explicit Checking/Savings account type, amount, reason, currency code, and idempotency key. The backend rejects retired `cash`, revalidates currency authority, and records the correction through the existing idempotent staff ledger service under `admin.banking.ledger_adjustment`.

## Transfers

No Admin personal-banking mutation endpoint for initiating Checking ↔ Savings transfers exists on the authoritative merged contract.

Therefore:

- Banking V2 does not fabricate a transfer control or endpoint;
- posted transfer ledger entries remain visible read-only;
- no from/to account pair is inferred when it is not part of the Banking history response.

## Currency authority

Banking V2 preserves the authoritative currency code attached to each Checking/Savings balance and ledger entry. Tests cover HWC, KRW, and LOC and verify that the adjustment adapter rejects missing currency instead of forcing ECO.

No cross-currency total balance is calculated.

## Permission boundary

Navigation permission: `economy.adjust`.

Backend Banking resource permission: `economy.adjust`.

Players administration remains `players.manage` and is no longer a dependency of Banking V2.

Status: **aligned**.

## Guardrail ownership

The Banking branch does not own generic Admin architecture-debt thresholds or legacy scroll contracts.

The following files remain authoritative from `main` and are not part of the Banking PR diff:

- `scripts/admin-architecture-ratchet.mjs`
- `scripts/admin-scroll-integrity-contract.test.mjs`

No threshold is increased and no inherited assertion is weakened.

## Domain exclusions

This PR intentionally excludes implementation work in:

- Loans
- Market
- Marketplace
- business banking
- Backend/Supabase/migrations (now supplied independently by merged PR #529)
- shared permission policy
- roadmaps
- generic Admin architecture/scroll behavior

## Final gate

The external Banking dependencies are cleared. Remaining convergence requirement: exact-head accumulated Admin V2 CI must pass on the normalized branch before controller merge.
