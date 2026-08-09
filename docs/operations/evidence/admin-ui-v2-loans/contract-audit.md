# Loans Contract Recheck

## Boundary

This is the narrow final contract recheck for PR #516 after Checking/Savings and Banking convergence. It does not repeat the broader loan audit and does not authorize backend redesign inside the UI PR.

Rechecked base: `cfe51cb1b22077a4b1341bde9d6aa790d16a0d7b`.

## Existing Admin/BFF loan contracts on current main

`backend/supabase/functions/admin-api/businessBankingOperations.ts` currently owns:

- `GET /games/:gameId/loan-applications`
- `GET /games/:gameId/loan-products`
- existing mutation/service RPC bindings for application review, loan-product upsert, loan restructure, and loan servicing.

It does **not** expose `GET /games/:gameId/loans` or another browser-safe supervisory portfolio read that combines authoritative outstanding `player_loans` with `loan_payments` repayment history.

## Why the existing reads are not used as the Loans portfolio

The supervisory Loans surface needs authoritative borrower presentation, original principal, current principal/interest balance, repayment state/history, term/payment state, and delinquent/default/paid lifecycle data.

The product read supplies catalog terms only.

The application read supplies applications, not current portfolio state, and includes internal ownership UUID fields (`player_id`, `business_id`, `loan_product_id`) plus repayment-source data. Forwarding it directly would violate the Admin V2 browser privacy boundary and still would not provide the required portfolio/repayment model.

Using either read as a substitute would therefore be incomplete and semantically wrong.

## Corrected disposition

Loans remains a source-owned V2 route under `economy.adjust`, but its runtime state is `not_configured`.

The route performs zero loan network requests. It does not create an endpoint, call a table directly, consume the partial application feed, or expose existing write operations as if a supervisory portfolio were available.

## Backend scope verification

The earlier PR-created backend additions remain absent:

- no `backend/supabase/functions/admin-api/loanOperations.ts`;
- no Loans-specific Admin security mapping added by PR #516;
- no Loans-specific Business Banking workflow additions;
- no new migration, RPC, schema, or Supabase contract.

Current `main` backend files are inherited without modification by PR #516.

## Banking / Checking-Savings reconciliation

PR #501 is merged and canonical personal accounts are Checking/Savings.

PR #529 and PR #512 are merged and provide the separate `economy.adjust` Banking authority and V2 Banking route.

Those changes do not add the missing Loans portfolio/repayment GET contract and do not change this route's zero-network disposition.

## Final conclusion

The authoritative implementation available to PR #516 is an explicit source-owned V2 `not_configured` Loans page, not a partial portfolio and not a fabricated backend adapter.
