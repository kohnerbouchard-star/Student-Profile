# Admin UI V2 Loans Architecture

## Status

- Route: `Loans`
- Admin V2 disposition: source-owned V2, explicit `not_configured`
- Required UI permission: `economy.adjust`
- Branch: `refactor/admin-ui-v2-loans-v1`
- Reconciled base: `cfe51cb1b22077a4b1341bde9d6aa790d16a0d7b`
- Banking is a separate, already-merged Finance route.

## Authoritative contract boundary

This migration uses existing Admin/BFF contracts only and adds no Admin loan endpoint, schema, RPC, security resource, workflow behavior, or loan runtime behavior.

Current `main` exposes two Admin loan reads through `businessBankingOperations.ts`:

- `GET /games/:gameId/loan-applications`
- `GET /games/:gameId/loan-products`

It also contains existing loan mutation/service bindings, including application review, product upsert, restructure, and servicing. None of those constitute the browser-safe supervisory portfolio read required by this Admin V2 route.

There is still no existing Admin/BFF GET contract that exposes authoritative outstanding `player_loans` together with `loan_payments` repayment history in a browser-safe supervisory DTO. The existing applications read also contains internal ownership UUID fields (`player_id`, `business_id`, `loan_product_id`) and repayment-source data, so it is not consumed as a portfolio substitute.

## V2 behavior

Loans is registered as a native V2 route under `economy.adjust`, but it performs zero loan network requests. Its controller resolves locally to `not-configured` and the route renders an explicit supervisory unavailable state explaining the missing authoritative portfolio/repayment-history contract.

No loan creation, approval, restructure, servicing, repayment, product write, settlement, or balance-correction control is exposed by this UI route.

## Zero-network client

`LoansApiClient.js` intentionally exposes only:

- `implementationStatus: "not_configured"`
- a no-op request cancellation method

It contains no fetch call, Admin endpoint, read method, or mutation transport. This is deliberate: the UI must not invent a backend contract to make the route appear complete.

## Scope correction retained

An earlier version of PR #516 introduced `GET /games/:gameId/loans`, a server-side projection, backend tests, Admin security changes, and Business Banking workflow coverage solely to support this UI. Those additions were out of scope and remain removed.

This reconciled PR contains no Backend, Supabase, migration, workflow, security-map, or Loans-specific CSS changes.

## Current dependency state

PR #501 Checking/Savings convergence is merged.

PR #529 Banking backend authority and PR #512 Banking V2 are merged.

Those changes do not add a browser-safe Loans portfolio/repayment-history read contract. The authoritative Loans disposition therefore remains `not_configured`, not blocked on Banking or Checking/Savings.

## Shared Admin V2 integration

The only shared integration changes are additive:

- register the zero-network Loans controller in `admin/v2/src/app.js`;
- mark Loans `v2` under `economy.adjust` in `navigation-registry.js`;
- update `admin-v2-unit.test.mjs` to retain all already-merged routes and include the focused Loans contract test.

No inherited architecture or scroll guardrail is modified.
