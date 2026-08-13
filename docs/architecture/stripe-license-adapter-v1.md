# Stripe License Adapter V1

## Scope

This adapter connects Stripe Checkout to Econovaria's durable license issuance
and email-outbox pipeline. Stripe remains the payment authority. PostgreSQL
remains the fulfillment authority.

The implementation is initially sandbox-only. Production deployment and live
payments remain blocked until the account, prices, tax policy, webhook, email,
and reversal controls are approved.

## Merchant structure

- Legal merchant: United States company.
- Stripe account country: United States.
- Default settlement: USD to a U.S. business bank account.
- Korean customer presentment: KRW.
- Checkout surface: Stripe-hosted Checkout.
- Fulfillment trigger: verified Stripe webhook only.
- Browser success redirect: informational only; it never issues a license.

## Stripe sandbox catalog

The connected Stripe sandbox contains:

```text
Product
prod_V3vDHJztuOUmIe
Econovaria Classroom Annual License — Sandbox

USD integration price
price_1T2ahXLAfpHwsEEip8tC88PD
$1.00 USD, one time
lookup_key: econovaria_classroom_annual_usd_sandbox_v1

KRW integration price
price_1U3oCjHbcOdT4fPk4pk6WgiR
₩1,000 KRW, one time
lookup_key: econovaria_classroom_annual_krw_sandbox_v1
```

Both prices map to:

```text
product_sku: econovaria-classroom-annual
license_duration_days: 365
purchase_code_expires_after_days: 90
max_redemptions: 1
commercial_price_approved: false
```

These are integration-test prices, not approved commercial prices.

## End-to-end flow

1. The browser calls `stripe-checkout-session` with only `market=usd` or
   `market=krw`.
2. The Edge Function selects the corresponding server-owned Stripe Price ID.
   The browser cannot supply a price ID, amount, currency, duration, or SKU.
3. The function consumes shared PostgreSQL rate-limit buckets and creates a
   hosted one-time Checkout Session through Stripe's server API.
4. Stripe collects the payment and sends a signed event to
   `stripe-license-webhook`.
5. The webhook verifies the exact raw body against `Stripe-Signature` and the
   endpoint signing secret.
6. Only final paid `checkout.session.completed` and
   `checkout.session.async_payment_succeeded` events enter fulfillment.
7. The adapter retrieves the single Stripe line item and verifies:
   - the approved Product ID;
   - the approved USD or KRW Price ID;
   - quantity exactly one;
   - session and price currency equality;
   - price unit amount, line subtotal, and session subtotal equality;
   - the expected Econovaria fulfillment metadata;
   - test/live mode consistency.
8. The adapter signs a provider-neutral `payment.succeeded` event and forwards
   it to `license-payment-webhook`.
9. The existing PostgreSQL transaction records the Stripe payment and one
   issuance job before returning `202`.
10. The issuance and email workers perform deterministic code materialization
    and idempotent delivery.

## Checkout request

```http
POST /functions/v1/stripe-checkout-session
Origin: https://approved-econovaria-origin.example
Content-Type: application/json

{"market":"krw"}
```

Allowed values:

```text
usd
krw
```

Successful response:

```json
{
  "ok": true,
  "sessionId": "cs_test_...",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "market": "krw",
  "currency": "KRW"
}
```

The browser redirects to `checkoutUrl`.

## Webhook event subscription

The Stripe sandbox webhook endpoint must subscribe only to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
```

Refund and dispute events are intentionally not subscribed until the license
revocation policy is implemented.

## Required staging secrets

```text
ECONOVARIA_STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_LICENSE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-02-25.clover
STRIPE_ECONOVARIA_PRODUCT_ID=prod_V3vDHJztuOUmIe
STRIPE_ECONOVARIA_ANNUAL_USD_PRICE_ID=price_1T2ahXLAfpHwsEEip8tC88PD
STRIPE_ECONOVARIA_ANNUAL_KRW_PRICE_ID=price_1U3oCjHbcOdT4fPk4pk6WgiR
ECONOVARIA_PUBLIC_APP_ORIGINS=https://approved-origin.example
ECONOVARIA_CHECKOUT_SUCCESS_URL=https://approved-origin.example/payment/success?session_id={CHECKOUT_SESSION_ID}
ECONOVARIA_CHECKOUT_CANCEL_URL=https://approved-origin.example/pricing?checkout=cancelled
ECONOVARIA_CHECKOUT_RATE_LIMIT_SECRET=<independent random 32+ character secret>
ECONOVARIA_PAYMENT_WEBHOOK_SECRET=<same internal ingress secret used by license-payment-webhook>
STRIPE_AUTOMATIC_TAX_ENABLED=false
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Edge Function
runtime. No Stripe secret or service-role credential may appear in browser code,
Vercel public variables, logs, or repository files.

## Staging activation sequence

1. Complete the U.S. Stripe live-account business onboarding separately; keep
   this integration in sandbox mode while developing.
2. Install the staging secrets above.
3. Apply the reviewed licensing and email-outbox migrations.
4. Configure both sandbox Price IDs in `private.license_products` as disabled.
5. Deploy:
   - `license-payment-webhook`;
   - `stripe-checkout-session`;
   - `stripe-license-webhook`;
   - `license-issuance-worker`;
   - `license-email-worker`.
6. Create the Stripe sandbox webhook endpoint targeting:

```text
https://eecvbssdvarfcykcfrny.supabase.co/functions/v1/stripe-license-webhook
```

7. Copy the endpoint's `whsec_...` secret into
   `STRIPE_LICENSE_WEBHOOK_SECRET` and redeploy the Stripe webhook function.
8. Keep both worker schedulers disabled.
9. Enable the disabled sandbox product mappings.
10. Create one USD and one KRW Checkout Session and complete each with Stripe
    test payment data.
11. Confirm each payment produces exactly one payment receipt, issuance job,
    purchase-code verifier, email-outbox row, and delivered test email.
12. Replay each Stripe event and confirm no second license or email is created.
13. Run reconciliation and verify every mismatch count is zero.
14. Only then enable the staging worker schedulers.

## Production hold

Production remains blocked until all of the following are complete:

- U.S. Stripe live-account identity and business verification;
- U.S. payout bank account verification;
- final commercial USD and KRW prices approved;
- live Product and Price IDs configured separately from sandbox IDs;
- Korean payment methods reviewed and enabled where eligible;
- Stripe Tax and Korean VAT treatment reviewed by a qualified tax professional;
- live webhook endpoint and signing secret installed;
- verified Resend domain and production sender installed;
- refund, cancellation, dispute, and chargeback-to-license policy implemented;
- queue-age, dead-letter, webhook failure, and reconciliation alerts installed;
- controlled live-mode low-value payment acceptance completed;
- production promotion explicitly approved.

Sandbox and live IDs and secrets must never be mixed.
