# Licensing Domain

Purchase-code redemption and entitlement activation code lives here.

## Structure

- `domain/purchaseCodeRules.ts` contains pure purchase-code redemption validation rules.
- `infrastructure/licensingRepository.ts` contains the Supabase persistence adapter boundary for `purchase_codes` and `entitlements`.
- `application/redeemPurchaseCode.ts` coordinates purchase-code validation, game creation, and entitlement creation.
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

Do not wire it to a runtime endpoint until redeemed-count increment/update behavior is added with a transaction-safe persistence path. The current repository boundary can find purchase codes and create entitlements, but redeemed-count update is intentionally deferred.
