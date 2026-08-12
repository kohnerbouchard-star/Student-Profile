# Durable License Issuance Queue V1

## Purpose

This design prepares Econovaria to issue one `XXXX-XXXX-XXXX-XXXX`
license code after a verified successful payment without coupling the
licensing domain to a specific payment processor.

The payment processor is intentionally not selected in V1. A future
provider adapter must verify the provider's native webhook signature,
normalize the successful-payment event, and forward the normalized event
to the internal `license-payment-webhook` contract.

## Existing foundation

The existing licensing domain already provides the critical redemption
controls:

- purchase codes are stored as keyed HMAC digests rather than plaintext;
- redemption locks the purchase-code row and updates redemption state
  atomically;
- successful redemption creates the game, entitlement, and audit state in
  one transaction;
- `license_duration_days` on the purchase code is projected to
  `entitlements.license_expires_at` by the existing entitlement trigger.

This change adds issuance and delivery. It does not replace redemption.

## End-to-end flow

1. The payment provider reports a successful payment to a provider-specific
   adapter.
2. The adapter verifies the provider's native signature.
3. The adapter sends a normalized, HMAC-signed event to
   `license-payment-webhook`.
4. The webhook authenticates the exact raw request body and calls
   `enqueue_paid_license_v1`.
5. PostgreSQL atomically records:
   - the verified payment receipt;
   - the server-owned product mapping used for the license term;
   - one durable issuance job.
6. The webhook returns `202` only after the database transaction commits.
   A database failure returns a non-2xx response so the upstream adapter or
   payment provider can retry.
7. A Vault-authenticated cron invokes `license-issuance-worker` every minute.
8. The worker claims jobs using `FOR UPDATE SKIP LOCKED` and an expiring lease.
   Multiple workers may run safely in parallel.
9. The worker deterministically derives an 80-bit human-safe code from a
   secret, the job UUID, and a collision nonce.
10. The worker stores only the existing HMAC-SHA-256 verifier in
    `public.purchase_codes`.
11. The worker sends the code through Resend with a stable idempotency key.
12. The worker marks the job delivered. Retryable failures are rescheduled
    with bounded exponential backoff; terminal or exhausted jobs enter the
    dead-letter state.

The queue is **at least once**. Unique constraints, deterministic code
derivation, database leases, atomic materialization, and email-provider
idempotency make the externally visible result effectively once.

## License-code format

The displayed code contains 16 symbols grouped as four groups of four:

```text
7FQK-9T2H-WM5R-C8XP
```

The alphabet has exactly 32 symbols:

```text
23456789ABCDEFGHJKLMNPQRSTUVWXYZ
```

Sixteen Base32 symbols represent 80 bits. The ambiguous characters `0`, `1`,
`I`, and `O` are excluded.

The plaintext code is never written to PostgreSQL, logs, audit metadata, or a
queue payload. It is regenerated from the job identity when a retry is needed.

## Internal payment ingress contract

Endpoint:

```text
POST /functions/v1/license-payment-webhook
Content-Type: application/json
x-econovaria-payment-timestamp: <10-digit Unix seconds>
x-econovaria-payment-signature: v1=<HMAC-SHA256 hex>
```

The signature input is the exact byte sequence:

```text
<timestamp>.<raw JSON body>
```

Body:

```json
{
  "schemaVersion": 1,
  "eventType": "payment.succeeded",
  "provider": "provider-adapter-name",
  "eventId": "provider-event-id",
  "paymentId": "provider-payment-id",
  "providerPriceRef": "provider-price-id",
  "customerEmail": "buyer@example.com",
  "amountMinor": 9900,
  "currency": "USD",
  "occurredAt": "2026-08-13T00:00:00.000Z"
}
```

The contract deliberately does **not** accept a license duration, redemption
limit, or purchase-code expiration from the webhook. Those values come from
the server-owned product catalog.

The generic ingress signature is an internal adapter boundary. It is not a
substitute for Stripe, Paddle, Toss Payments, or another provider's native
webhook signature verification.

## Product configuration

No paid product is seeded because the payment processor, price identifier,
currency, and price have not been selected.

A product must be configured through the service-role-only RPC before a
matching payment can be accepted:

```sql
select public.configure_license_product_v1(
  p_provider := 'provider-adapter-name',
  p_provider_price_ref := 'provider-price-id',
  p_product_sku := 'econovaria-classroom-365',
  p_currency := 'USD',
  p_amount_minor := 9900,
  p_license_duration_days := 365,
  p_purchase_code_expires_after_days := 90,
  p_status := 'active'
);
```

`p_purchase_code_expires_after_days` controls how long the unredeemed code
remains valid. `p_license_duration_days` begins when the code is redeemed and
becomes the game entitlement expiration.

## Required Edge Function secrets

Both staging and production eventually require:

```text
ECONOVARIA_PAYMENT_WEBHOOK_SECRET
ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET
ECONOVARIA_PURCHASE_CODE_HMAC_SECRET
RESEND_API_KEY
ECONOVARIA_LICENSE_EMAIL_FROM
```

Optional:

```text
ECONOVARIA_LICENSE_SUPPORT_EMAIL
```

Each HMAC/derivation secret must contain at least 32 characters and must be
different from the public Supabase keys. The derivation secret and purchase-code
verification secret should be independently generated.

## Queue controls

The queue has the following safeguards:

- unique `(provider, provider_event_id)` constraint;
- unique `(provider, provider_payment_id)` constraint;
- payload-digest conflict detection for event-ID replay;
- payment-field conflict detection for payment-ID replay;
- advisory transaction lock per provider payment ID;
- one issuance job per accepted payment;
- `FOR UPDATE SKIP LOCKED` claims;
- lease token and lease expiration;
- maximum attempt count;
- deterministic collision nonce;
- dead-letter state;
- service-role-only RPCs;
- private tables with forced RLS and no direct service-role table grants;
- Vault-held scheduler token;
- no raw webhook payload retention;
- no plaintext license-code persistence.

Queue health is available through:

```sql
select public.read_license_issuance_queue_health_v1();
```

## Integration work that remains provider-specific

Before production promotion, the selected payment integration must add:

1. native provider webhook signature verification;
2. mapping from the provider's immutable price ID to the configured product;
3. forwarding to the normalized internal ingress;
4. refund, cancellation, and chargeback handling;
5. reconciliation between paid orders and issued jobs;
6. alerting for dead letters and oldest-undelivered age;
7. an end-to-end staging payment test;
8. a concurrent load/replay test;
9. verified sending-domain and bounce/complaint handling.

Refund and dispute events must not be treated as successful-payment events.
Their final policy should distinguish an unredeemed code from an already
activated game entitlement.

## Promotion status

V1 is suitable for source review and isolated staging activation. Production
promotion remains intentionally blocked until a payment provider, immutable
price reference, real price, currency, required secrets, and reversal policy
are configured.
