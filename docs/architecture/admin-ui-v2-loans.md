# Admin UI V2 Loans Architecture

## Status

- Route: `Loans`
- Admin V2 disposition: configured, source-owned V2
- Permission: `economy.adjust`
- Supervisory read: `GET /games/:gameId/economy/loans`
- Mutation authority: existing loan application review, product upsert, restructure, and servicing RPCs
- Monetary authority: unchanged; loan disbursement and repayment remain ledger-backed

## Authoritative data boundary

Loans V2 reads one server-side supervisory snapshot assembled from the existing authoritative loan runtime: `player_loans`, `loan_payments`, `loan_applications`, `loan_products`, `players`, and `business_entities`.

The Admin API resolves internal relationships server-side. The browser receives only public loan/application/product/business/payment identifiers plus safe player presentation fields. Internal ownership UUIDs, ledger entry IDs, request hashes, idempotency records, and repayment-source internals are not part of the DTO.

The snapshot exposes portfolio state and exposure by currency; original principal, current principal, accrued interest, scheduled payment, APR and due dates; active/delinquent/defaulted/restructured/paid lifecycle states; posted repayment history; applications and credit/affordability review inputs; and configured loan products. Currencies are grouped independently and never cross-summed.

## Admin actions

Loans V2 reuses existing authoritative operations rather than introducing parallel lending logic:

- approve or decline a pending application;
- create or update a loan product;
- restructure an existing payable loan;
- run loan servicing to evaluate accrual, delinquency and default status.

Player repayment remains player-owned. The Admin route does not fabricate repayments or directly edit balances.

## Security

All V2 requests use `/games/:gameId/economy/...`, which is already protected by the Admin `economy.adjust` permission, MFA mutation guard, game scope validation, and the `economy` rate-limit bucket. The browser uses the existing HttpOnly Admin BFF transport and does not send an Authorization header or access Supabase tables directly.

## Verification

The implementation is covered by `businessBankingOperations.test.ts` for game scope/RPC/privacy projection, `admin-v2-loans-api.test.mjs` for the V2 client/controller/route contract, accumulated Admin V2 coverage, and the focused `Admin V2 Loans` workflow plus the repository-wide Admin/security/typecheck checks.
