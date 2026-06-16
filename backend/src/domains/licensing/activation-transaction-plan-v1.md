# Licensing Activation Transaction Plan v1

## Purpose

This document defines the required transaction-safe activation flow for purchase-code redemption in Eco Novaria / Student Profile.

The current TypeScript application service must not be exposed through a public route until the activation flow is atomic.

## Current risk

A purchase code must not be marked as redeemed before the related game session, game settings, entitlement, and audit record are created.

Unsafe ordering:

1. Validate purchase code.
2. Mark purchase code redeemed.
3. Create game session.
4. Create game settings.
5. Create entitlement.
6. Write audit log.

If step 2 succeeds and a later step fails, the system can enter a bad state:

- purchase code consumed
- no usable game exists
- no entitlement exists
- staff user cannot activate the product again with the same code

## Required safe behavior

Activation must happen as one atomic database operation.

Required atomic writes:

1. Conditionally update `purchase_codes.redeemed_count`.
2. Update `purchase_codes.status` when needed.
3. Create `game_sessions` row.
4. Create `game_settings` row.
5. Create `entitlements` row.
6. Create `audit_log` row.

If any write fails, none of the writes should persist.

## Proposed database function / RPC

Possible function name:

```sql
redeem_purchase_code_for_game(...)
```

The RPC should be the only write boundary for production purchase-code activation.

## Inputs

The RPC should accept:

- staff user id
- purchase code hash
- game name
- game settings payload
- optional request id / correlation id
- optional metadata needed for audit logging

The RPC must never accept or store plaintext purchase codes.

## Responsibilities

The RPC must:

1. Find the purchase code by hash.
2. Confirm the code exists.
3. Confirm the code is active or otherwise eligible.
4. Confirm the code is not expired.
5. Confirm the redemption limit has not been reached.
6. Lock or conditionally update the purchase code row to prevent double redemption.
7. Increment `redeemed_count`.
8. Set purchase code status to `exhausted` if the redemption limit is reached.
9. Create the game session.
10. Create default game settings.
11. Create the staff entitlement.
12. Write an audit log entry.
13. Return the activation result.

## Output

The RPC should return:

- game session id
- entitlement id
- purchase code id
- purchase code status
- redeemed count
- redemption limit
- activation timestamp

The application service should map this database result into the existing backend response shape.

## Optimistic conflict behavior

If two requests attempt to redeem the same code at the same time, only one should succeed when the redemption limit would be exceeded.

The losing request should receive a safe domain error such as:

```text
PURCHASE_CODE_ALREADY_REDEEMED
```

or:

```text
PURCHASE_CODE_EXHAUSTED
```

depending on the final domain error naming.

## Expiration behavior

Expired codes must not create games or entitlements.

If a code is expired, the RPC should fail before writing any activation rows.

Possible error:

```text
PURCHASE_CODE_EXPIRED
```

## Exhaustion behavior

If a code has already reached its redemption limit, the RPC should fail before creating a game or entitlement.

Possible error:

```text
PURCHASE_CODE_EXHAUSTED
```

If the current redemption reaches the limit, the RPC should complete the activation and update the code status to exhausted in the same transaction.

## Audit behavior

Every successful activation should write an audit log entry.

The audit log should include:

- staff user id
- purchase code id
- game session id
- entitlement id
- action type
- timestamp
- request id / correlation id when available

Failed attempts may be logged later, but failure logging must not interfere with rollback behavior.

## Route wiring prerequisites

Do not wire a public route until:

1. The RPC exists.
2. The TypeScript repository wrapper calls the RPC.
3. The application service no longer performs non-atomic multi-write activation.
4. Safe domain errors are mapped to safe HTTP responses.
5. Typecheck passes.
6. Manual activation flow has been reviewed.

## What not to do before the RPC exists

Do not:

- expose `redeemPurchaseCode` through a public route
- mark a purchase code redeemed before creating the game and entitlement
- store plaintext purchase codes
- split activation writes across multiple independent service calls
- touch frontend activation UI
- modify unrelated domains such as attendance, store, stocks, ledger, or player access codes

## Final target flow

The final backend flow should be:

1. Route receives activation request.
2. Route hashes the purchase code.
3. Route calls application service.
4. Application service calls the transaction-safe RPC wrapper.
5. RPC performs all activation writes atomically.
6. Application service returns activation result.
7. Route returns safe response.
