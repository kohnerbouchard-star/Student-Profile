# License Email Outbox V1

## Purpose

Econovaria separates license-code issuance from external email delivery with a
**transactional email outbox**. A verified payment first creates a durable
issuance job. The materialization worker then creates or replays the HMAC-only
purchase code and the outbox row in one PostgreSQL transaction. Email is a
later, independently retryable phase.

The database remains the source of truth. Neither an Edge Function process nor
an email-provider response is the authoritative record that a customer is owed
a license.

## Durable phases

```text
verified payment
  -> issuance job
  -> purchase-code verifier + email-outbox row (one transaction)
  -> email delivery
  -> delivered evidence
```

The issuance job and email job each use `FOR UPDATE SKIP LOCKED`, a unique
lease token, lease expiration, bounded attempts, retry scheduling, and a
terminal dead-letter state. Multiple worker invocations may run concurrently.

If the **issuance worker crashes** before its transaction commits, no purchase
code or outbox row is partially accepted. The lease expires and another worker
reclaims the job. If the transaction commits but the HTTP response is lost, a
replay verifies the same code hash and returns the existing outbox row.

If the **email worker crashes** before the provider accepts the request, the
email lease expires and the job is retried. If the provider accepts the request
but its response is lost, the worker retries with the same provider idempotency
key.

## Code confidentiality and verification

The 16-symbol `XXXX-XXXX-XXXX-XXXX` code is regenerated from the protected
code-derivation secret, issuance-job UUID, and collision nonce. Plaintext is
never stored in PostgreSQL, queue rows, logs, or audit metadata.

Before sending, the email worker computes the existing keyed HMAC verifier and
compares it in constant time with the verifier stored on `public.purchase_codes`.
A derivation-secret or HMAC-secret mismatch therefore dead-letters the email
instead of sending an invalid activation code.

The derivation secret must not be rotated while
`read_license_issuance_secret_rotation_guard_v1()` reports blocked work. The
guard includes pending, processing, retry, and dead-letter email jobs because
all of them may still require deterministic code regeneration.

## Email idempotency window

The outbox uses one stable key per issuance job:

```text
license-issuance/<issuance-job-uuid>/delivery-v1
```

Resend's idempotency window is **24-hour** scoped. Automatic attempts stop at
23 hours after the first delivery attempt. An unresolved job then moves to
`dead_letter` for provider reconciliation instead of risking a duplicate after
the provider key expires.

Template version, recipient, product terms, and the activation-code derivation
inputs are stable for the life of the job. Sender or support-copy changes must
be made only after the queue is drained or reconciled; otherwise the provider
can correctly reject reuse of the key with a different payload.

## Rolling-release compatibility

The migration disables the prior issuance scheduler and refuses to run while
an unexpired issuance lease exists. New workers use the additive V2
materialization RPC. The previous completion RPC remains compatible long enough
to record an already-sent message as a delivered outbox row, preventing a
rolling deployment from losing delivery evidence.

The source workflow deploys the payment ingress, materialization worker, and
email worker only through an explicitly confirmed staging dispatch. Both worker schedulers are disabled before optional activation. Each
**scheduler remains disabled** unless the operator separately enables it after
secrets and staging evidence are verified.

## Reconciliation

The service-role-only RPC below is read-only:

```sql
select public.read_license_fulfillment_reconciliation_v1();
```

It reports:

- accepted payments missing issuance jobs;
- materialized jobs missing email-outbox rows;
- outbox rows missing purchase-code records;
- delivered issuance records missing delivered email evidence;
- delivered email evidence missing a delivered issuance projection;
- active email jobs attached to a non-accepted payment.

Queue age, attempts, dead letters, and phase-specific counts are available from
`read_license_issuance_queue_health_v1()`.

## Activation and production hold

No production deployment is defined by this workflow. Staging activation still
requires the payment-provider adapter, provider-native signature verification,
immutable product and price mapping, independent secrets, verified sender
domain, and a controlled delivery test.

A refund and chargeback adapter remains a separate provider-policy slice. Until
that policy is approved, payment reversals must not be mapped to successful
payment events and production fulfillment remains blocked.
