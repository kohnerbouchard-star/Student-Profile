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
Local database execution remains NOT_RUN; actual CI results follow below.
Local candidate: all 26 contracts, complete root npm test, auth-boundary suites,
architecture with unchanged inventory, secret scan and diff checks pass.

Licensing staging and Edge release mutations require explicit authorized manual
dispatch; this publication does not enable them. Refund/chargeback and production
fulfillment holds remain separate. Rollback is the bounded source/test revert;
never revoke a real license, replay a real payment or send email for this task.

Initial candidate `1afa89b73ba436c0d3c03891c32b0fdcb396692b` failed the
secret scan on the literal non-secret service-role placeholder (run 36893691755,
job 110475278052). The pre-stage local scan had omitted this untracked new file.
The documented reviewed-test annotation identifies that exact intercepted fixture;
scanner rules and enforcement remain unchanged. Rerun includes the tracked harness.

That initial source passed real R3 run [36893691820](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36893691820),
job `110475280896`, artifact `11178557531`, locally verified ZIP SHA-256
`6efb1b284e99aa803481a4b583dd82d54dd0f4976fa76970ae8af6144bf3fc2e`.
All worker cases passed: seven synthetic payment/jobs, five verifiers/outbox jobs,
zero new entitlements or email requests; retained qualification suites also passed.
Full 28-root backend typecheck/smoke passed; lint stayed at 142 findings/17 errors.
Fresh exact-head checks remain mandatory after the annotation change. No SQL or
runtime correction was needed for this baseline qualification.

## REF-045b application extraction

Qualification PR #813 merged as `55d9755f498938b63a2c27bf345c068c59dbc4da`
from `335ce91b4334b8500eaa9f763041158a82770f88`; this is b's exact base.
Final a passed all eight workflows (11 successful jobs, three expected manual
skips), Vercel, and independent source review. R3 run
[36895008209](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36895008209),
job `110479677335`, artifact `11179807379`, verified ZIP SHA-256
`7d6128a0db85fd01087871ddbb7b9e37173e7bd4d47f60c7a10779c62a21e369`
proves the unchanged worker baseline. This is not b's exact-head qualification.

The selected family is processClaimedJob/materializeLicenseCode, JobFailure,
normalizeJobFailure/redactLicenseCodes, their three types and template constant.
Licensing had activation/redemption ownership but no issuance application; its
redemption use case is a different atomic authority and remains untouched.
`processClaimedLicenseJob.ts` now owns issuance/collision/retry decisions. Two
actively used, narrowly typed materialize/retry callbacks keep Supabase RPC names
and transport in the worker. Crypto delegates to the unchanged shared helper.
The worker retains POST/auth/config ordering, claim normalization, batch 10,
lease 90 seconds, chunks of five, logging and response construction.
No new persistence command, repository scaffold or unused port is introduced.

The 25 type lines, 118 execution lines and 61 failure-policy lines match the
original after explicit export/name/dependency substitutions and removal of one
trailing separator blank line. SHA-256:
- Types: `b78229b09aabc0f9a3ae90bfd5884228a143b6b6088af67a01a3a128ebb01aa8`
- Execution: `835b1ab194250438de1b77df90fced9d10357833244bb4b426b8b5e736f747e8`
- Failure policy: `2a2e4cfbc1254ae2fce11acb06113d620336a757361e62bfc6ce54fe62e33456`
- Residual worker, excluding those blocks/import/composition changes:
  `158b98ccf73448736e7f43794423084156c1dc5413e44e09d59d59d9bc6a058a`

Before/after traces from the original source family and extracted application are
byte-identical for 16 cases: created/replayed, valid/invalid/exhausted collisions,
RPC error/throw, retry recording failure, dead letter, crypto failure and retry
attempts 1/2/8/50. The 14,856-byte result includes ordered commands, complete
parameter payloads, results and safe logs; SHA-256
`3a0e83235f3f2c1ea1782f0cffe92583bac6d1188d7e8c8075178446d1ae0323`.
All 26 original contracts pass before; all 32 pass after six registered policy
cases are added to the existing queue suite. The other existing outbox source
contract now follows the actual application and worker binding. No test package,
R3 harness or qualification workflow changes are needed in b.

Worker size is 477→287 lines; cohesive application is 224. Inventory source files
1267→1268 (Licensing 24→25); persistence-outside-infrastructure stays 52 and
cross-domain imports stay 163. All ceilings remain unchanged. The first local
candidate exposed a raw-client boundary during review; before publication it was
replaced with the two typed commands, with identical traces and no new file.
Application typecheck and focused contracts pass locally. Full worker dependency
resolution and real database execution remain required CI checks on b's exact
head; a's proof alone does not qualify the extracted application.
