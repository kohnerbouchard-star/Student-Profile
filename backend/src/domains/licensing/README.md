# Licensing Domain

Purchase-code redemption and entitlement activation code lives here.

## Structure

- `domain/purchaseCodeRules.ts` contains pure purchase-code redemption validation rules.
- `infrastructure/licensingRepository.ts` contains the Supabase persistence adapter boundary for `purchase_codes` and `entitlements`.
- `application/redeemPurchaseCode.ts` validates activation input and calls the transaction-safe activation repository boundary.
- `contracts/` is reserved for future request/response DTOs.
- `tests/` is reserved for licensing-specific tests.

## Boundary

This domain owns:

- purchase-code redemption eligibility
- purchase-code redemption state
- entitlement activation rules

It does not own:

- game-session lifecycle
- game join codes
- player enrollment
- student access codes
- attendance
- store
- stocks
- ledger/economy

Plaintext purchase codes must never be stored. Backend code should validate against hashes or trusted server-side normalized values only.


## Runtime Safety Notes

`application/redeemPurchaseCode.ts` is an application service boundary, not a public route.

Purchase-code activation now routes through the transaction-safe activation RPC repository wrapper. The activation RPC is responsible for purchase-code redemption, game-session creation, game-settings creation, entitlement creation, and audit logging as one atomic database operation.

Do not wire this service to a runtime endpoint until:

1. the route/auth boundary is designed,
2. safe error responses use `application/licensingActivationErrors.ts`,
3. the request DTO contract is defined,
4. plaintext purchase codes are normalized and hashed before repository/RPC access,
5. the route has been reviewed manually.

Do not add request handlers inside `backend/supabase/functions/classroom-api` until the Edge Function/API structure checkpoint is intentionally opened.
