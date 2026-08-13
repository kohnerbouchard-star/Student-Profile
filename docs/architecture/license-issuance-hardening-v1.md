# License Issuance Queue Hardening V1

## Scope

This hardening layer closes the fulfillment race between payment acceptance
and asynchronous license delivery. It extends the provider-neutral durable
queue described in `license-issuance-queue-v1.md`; it does not select a payment
processor and it does not activate production delivery.

## Payment-to-license invariant

One accepted provider payment produces at most one license issuance job.
Payment acceptance and job creation remain one PostgreSQL transaction. The
webhook returns `202` only after that transaction commits, so an upstream
provider or adapter can safely retry a non-2xx response.

The queue is implemented as private PostgreSQL job tables with row locks,
`FOR UPDATE SKIP LOCKED`, lease tokens, lease expiration, bounded retries, and
dead-letter states. This is a durable database-backed queue; it is not an
in-memory task list and it does not depend on the webhook process remaining
alive after acknowledgment.

## Immutable fulfillment snapshots

The product catalog is intentionally editable for future sales. A paid order,
however, must never inherit later catalog changes while waiting in the queue.
At payment acceptance the database now snapshots:

- product SKU;
- activated license duration;
- unredeemed purchase-code expiration period;
- redemption limit.

The worker claim and purchase-code materialization functions read only those
snapshots. Changing a catalog price or license term affects future accepted
payments only. It cannot change an already accepted order or change the email
payload used with that order's stable idempotency key.

## License-code security

The display code contains 16 Base32 symbols grouped `4-4-4-4`, for example:

```text
7FQK-9T2H-WM5R-C8XP
```

The alphabet excludes `0`, `1`, `I`, and `O`. Sixteen symbols from a 32-symbol
alphabet represent 80 bits.

The worker deterministically derives the code from a secret, the issuance job
UUID, and a collision nonce. Determinism allows a crashed worker to recreate
the same code without storing plaintext. PostgreSQL stores only the existing
keyed HMAC verifier in `public.purchase_codes`.

The plaintext code must never appear in PostgreSQL, queue payloads, audit
metadata, logs, error details, or monitoring labels.

## Email delivery safety

The worker uses one stable Resend idempotency key per issuance job. Retryable
provider failures are rescheduled with backoff. Automatic delivery stops at 23
hours after the first delivery attempt, before the provider's 24-hour
idempotency-key retention can expire. Unresolved jobs move to `dead_letter`
for provider reconciliation rather than risking a duplicate email.

A delivered-job replay must present the same provider message ID. A conflicting
message ID is rejected. Control characters are rejected from stored provider
message identifiers.

## Lease invariants

A job in `processing` must have both a lease token and lease expiration. Every
other job state must have neither. The database enforces this relationship in
addition to the existing lease-token pair constraint.

Parallel workers remain safe because only one transaction can claim a row.
Expired leases become eligible for recovery; active leases cannot be stolen.

## Secret rotation guard

A materialized but undelivered job requires the original derivation secret to
regenerate its plaintext code. The service-role-only RPC below reports whether
that secret can be rotated safely:

```sql
select public.read_license_issuance_secret_rotation_guard_v1();
```

The derivation secret must not be rotated while `safeToRotateDerivationSecret`
is false. Operators must first drain or reconcile every listed class of job.
The purchase-code HMAC secret and derivation secret must be independently
generated values.

Email sender, support text, and template content also form part of Resend's
idempotent request payload. Do not change those values while undelivered jobs
remain unless the affected jobs are reconciled first.

## Deployment controls

Pull requests and pushes to `main` run contract tests only. Staging deployment
is available only through `workflow_dispatch`, requires the exact phrase:

```text
DEPLOY LICENSE ISSUANCE TO STAGING
```

and targets the staging project reference. The workflow disables the worker
scheduler before any optional activation. Scheduler activation is a separate,
default-off boolean control. Every third-party GitHub Action is pinned to an
immutable commit SHA.

No production deployment job exists.

## Required provider adapter

A selected payment processor must supply an adapter that:

1. verifies the processor's native webhook signature against the exact body;
2. accepts only a final successful-payment event type;
3. maps the immutable provider price reference to the server-owned catalog;
4. forwards the normalized event to the internal HMAC-authenticated ingress;
5. preserves provider event and payment identifiers for idempotency;
6. returns non-2xx when durable acceptance fails so the processor retries;
7. implements refund, cancellation, dispute, and chargeback policy;
8. reconciles provider payments against accepted events and issuance jobs.

The generic internal HMAC is not a substitute for native processor signature
verification.

## Promotion gates

Production promotion remains blocked until all of the following are complete:

- payment processor selected;
- immutable provider price reference configured;
- amount and currency approved;
- license duration and unredeemed-code expiration approved;
- native webhook adapter implemented and tested;
- Resend sending domain verified;
- payment, code-derivation, purchase-code-HMAC, and scheduler secrets installed;
- refund and chargeback policy implemented;
- dead-letter and queue-age alerting configured;
- end-to-end staging payment test passed;
- replay, concurrency, crash-recovery, and sustained-load tests passed;
- payment-to-license reconciliation report reviewed.

Until those gates pass, the API remains source-ready and intentionally dormant.
