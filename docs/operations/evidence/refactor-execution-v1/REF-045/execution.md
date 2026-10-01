# REF-045 Licensing issuance ownership

Status: IN_PROGRESS. Base main `e2dd6495456d39feb1d702c58549d2364ef9c437`.
REF-005 is VERIFIED_COMPLETE. Preserve REF-043 BLOCKED and its unmerged PR #810,
all other blocked/paused tasks, protected payment/email consumers and release owners.

## Named children and exact scope

REF-045a: this evidence, REF-045 task and backlog entry;
`scripts/ref-045-license-issuance-acceptance.ts`;
`.github/workflows/ref-018-attendance-qualification.yml`.
Qualification comes first and changes no runtime source or SQL.
REF-045b, after qualified/merged a: worker `backend/supabase/functions/license-issuance-worker/index.ts`;
new `backend/src/domains/licensing/application/processClaimedLicenseJob.ts`;
existing `scripts/license-issuance-queue-contract.test.mjs` and
`scripts/license-email-outbox-contract.test.mjs`; its exact-PR authority manifest.
Ten meaningful parent paths total; generated architecture inventory is separate.
Each review child stays below 400 semantic lines. Parent remains incomplete until
both children and applicable merged-main evidence pass.

Protected: shared license crypto and compatibility export, payment/Stripe webhooks,
email worker, migrations, SQL authorities, catalog/payment/entitlement rules,
queue/lease policy, package scripts and release/deployment configuration.
No dead-code deletion is appropriate: the scheduler and paid-event path are live callers.

## Existing behavior and qualification

Worker: POST, base config, scheduler token verification, distinct materialization
secrets, claim batch 10/lease 90 seconds, chunks of 5, issuance and bounded retry.
`claim_license_materialization_jobs_v2` locks due accepted-payment jobs with
SKIP LOCKED and replaces expired leases. `materialize_license_and_enqueue_email_v2`
fences lease/nonce/payment provenance and commits one HMAC verifier plus durable
email outbox atomically. Product terms come from accepted-payment snapshots.
`retry_license_issuance_job_v1` preserves retry/dead-letter policy. Actual email
transport is separately owned and is never invoked by this qualification.

The harness imports the actual worker unchanged, captures Deno.serve and adapts
its SDK fetch calls to allowlisted SQL RPCs under service_role. Unknown endpoints
fail closed; --deny-net and loopback-only PostgreSQL prevent hosted/provider calls.
Only synthetic receipts, example.test recipients and public test-only derivation
constants are used; no real credentials or license codes enter retained evidence.
It checks auth-before-claim, event/payment replay, conflicting payload, one code
and outbox, already-materialized replay, expired lease recovery/stale-owner denial,
post-claim cancellation/expiry, failed purchase persistence and in-command outbox
failure rollback/retry. A held row/observed PostgreSQL lock proves two real worker
claims overlap and the loser skips the locked job. Full code/outbox snapshots and
aggregate counts detect orphan/duplicate effects; entitlement count stays unchanged.
Successful issuance clears the lease; stale direct materialization is a rejection,
not an invented replay receipt. Legacy materialized reclaim preserves existing rows.

## Validation and limits

Baseline: all 26 existing Licensing/Stripe source/schema/crypto tests passed on
main before edits (`/tmp/ref045-before.log`). They are not database proof.
Required candidate checks: those four existing contract files, full backend
28-root typecheck/smoke, auth/shared repository gates and actual disposable R3
qualification with source SHA and retained JSON. Existing database lint findings
must remain identical; no clean-database or production certification is claimed.
Local Docker/PostgreSQL is unavailable. Local worker typecheck cannot resolve the
pinned esm.sh dependency in this environment; exact CI must check the real dependency.
Database execution is pending, with no acceptance credit assigned yet.
Local candidate: all 26 contracts, complete root npm test, auth-boundary suites,
architecture with unchanged inventory, secret scan and diff checks pass.

Licensing staging and Edge release mutations require explicit authorized manual
dispatch; this publication does not enable them. Refund/chargeback and production
fulfillment holds remain separate. Rollback is the bounded source/test revert;
never revoke a real license, replay a real payment or send email for this task.
