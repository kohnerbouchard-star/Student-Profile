# Loans Scope-Correction Verification

## Reconciled state

Base: `cfe51cb1b22077a4b1341bde9d6aa790d16a0d7b`

PR #516 remains an Admin UI V2-only migration. The previously invented supervisory backend adapter and all supporting backend/security/workflow changes remain removed.

## Scope

Expected PR diff is limited to 11 files:

- `admin/v2/src/app.js`
- `admin/v2/src/core/navigation-registry.js`
- `admin/v2/src/routes/loans/LoansApiClient.js`
- `admin/v2/src/routes/loans/LoansController.js`
- `admin/v2/src/routes/loans/LoansRoute.js`
- four Loans architecture/evidence documents
- `scripts/admin-v2-loans-api.test.mjs`
- `scripts/admin-v2-unit.test.mjs`

There is no Loans CSS file, Backend/Supabase file, migration, workflow, security-map change, or package-script change.

## Authoritative contract result

Current-main Admin/BFF loan reads remain limited to loan applications and loan products. No authoritative browser-safe GET contract exists for outstanding loans plus repayment history. The existing applications response includes internal ownership UUID fields and is not consumed as a portfolio feed.

Loans therefore resolves locally to `not_configured` and performs zero loan network requests.

## Focused verification

`scripts/admin-v2-loans-api.test.mjs` asserts:

- Loans is V2 under `economy.adjust`;
- already-merged Banking remains V2 under `economy.adjust`;
- the Loans client contains no fetch call, Admin endpoint, read method, or mutation transport;
- the controller resolves locally to `not-configured`;
- the route names the missing outstanding-loan/repayment-history contract;
- current-main `loan-applications` and `loan-products` reads remain present;
- no GET `/loans` handler exists;
- no dedicated `loanOperations.ts` exists;
- no Loans-specific Business Banking workflow additions exist.

The focused Loans test is imported by `scripts/admin-v2-unit.test.mjs`, so it runs inside the standard Admin V2 regression suite.

## Shared-route preservation

`admin/v2/src/app.js`, navigation registry, and unit expectations are reconstructed from current `main`, not from the stale Loans branch base. This preserves Banking and every previously merged Admin V2 route while adding only Loans.

## Security and privacy

- Loans makes zero network calls, so no partial application DTO is exposed through this route.
- No internal borrower, business, product, loan, payment, or ownership UUID is copied into Loans V2 presentation state.
- No browser Authorization header or direct Supabase/table access is introduced.
- Permission remains `economy.adjust` at the Admin V2 route boundary.

## Guardrails

PR #516 does not modify generic Admin architecture or scroll guardrails. No allowed-debt threshold is increased and no inherited assertion is weakened.

## Final merge gate

PR #501 dependency: cleared.

Banking serial dependency: cleared by merged PR #512.

Authoritative Loans portfolio contract: still absent; represented explicitly as `not_configured`, not treated as a merge blocker for this zero-network source-owned route.

Before merge, the normalized exact head must pass the accumulated Admin V2 regression, Repository Quality, Admin Scroll Integrity, Admin Shell Smoke, and Admin Browser E2E.
