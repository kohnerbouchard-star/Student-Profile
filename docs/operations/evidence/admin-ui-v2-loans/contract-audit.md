# Loans Contract Recheck

## Result

The previous `not_configured` disposition is resolved without a new loan ledger, repayment engine, schema, or parallel domain.

The authoritative runtime already contained `player_loans`, `loan_payments`, loan products, applications, application review, product upsert, restructure, repayment and servicing behavior. The missing capability was a browser-safe Admin supervisory projection.

## Final Admin/BFF contract

`GET /games/:gameId/economy/loans` now projects the existing runtime into a privacy-safe DTO containing portfolio, repayment history, applications, products, safe borrower presentation, public business references, and per-currency exposure.

The route intentionally does not publish internal table relationships. Internal UUIDs are used only inside the server to join records. The response omits ownership UUIDs, ledger IDs, request hashes, idempotency keys and repayment-source internals.

## Existing write authority retained

Loans V2 calls economy-scoped aliases that dispatch to the existing RPCs:

- `review_player_loan_application_v1`
- `upsert_loan_product_v1`
- `restructure_player_loan_v1`
- `service_player_loan_status_v1`

No repayment or balance mutation was added. Player loan repayment remains controlled by the existing player runtime and authoritative ledger.

## Security conclusion

Using the `/economy/...` resource family keeps read and mutation requests under the existing `economy.adjust` permission and rate-limit policy. No security threshold or generic Admin guardrail is weakened.

## Completion conclusion

Loans is now a configured native Admin V2 route rather than a placeholder. Its remaining release gate is exact-head CI and merge, not a missing product contract.
