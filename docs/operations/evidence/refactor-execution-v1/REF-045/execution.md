# REF-045 Licensing issuance ownership

Status: VERIFIED_COMPLETE. Base main `e2dd6495456d39feb1d702c58549d2364ef9c437`.
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

Draft PR #814 binds this source family and exact-path verification authority.
Eight changed paths comprise seven meaningful files plus generated inventory;
parent union remains ten meaningful paths. Conservative unchanged-move credit is
382 changed lines; generated inventory contributes four changed lines. The
remaining semantic diff is below 400 lines, with no compressed/split source owner.
Local complete root suite, backend TypeScript, application Deno check, auth suites,
32 contracts, architecture, secret scan and exact-PR authority checks pass.

## REF-045 implementation merge and final evidence

PR #814 was normally merged with expected-head protection as
`da3ed11551b19884791913cb8bd0236e09326bdf`, from qualified application head
`c167172119d8e0403d390762f541ebbbb2cbcb07`. Both trees equal
`98628a169174b18c4705393d805c2566af6868b8`. Source and callback-boundary reviews
approved; all 36 PR workflows passed, with 73 successful jobs and seven expected
conditional/manual skips, successful Vercel and no unresolved review threads.

Actual extracted-application R3 passed run
[36898108371](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36898108371),
job `110490129115`, artifact `11180741909`, verified ZIP SHA-256
`26d05645faaf085aa65c66e7b016f1cbe8910c7eacd563f090eded4cd6effc52`.
The retained harness label is REF-045a; its sourceSha is the exact b candidate and
its actual worker import invokes the new application. Every lease/provenance,
replay, contention and rollback case passed. Effects remain seven synthetic
payment/jobs, five verifiers/pending outbox jobs, zero new entitlements or email
requests. Full 28-root backend typecheck/smoke and 32 contracts passed; retained
R3 suites passed and lint stayed at 142 findings/17 errors, with no new diagnostics.

Historical Multiplayer run `36898108178`, job `110490128912`, timed out for 60
seconds waiting for a World travel quote response. Questionnaire persistence
passed, no quote request was recorded, and console/page errors were empty.
Relevant World/Player/browser/gateway source was unchanged; no root cause is
asserted. One unchanged failed-job retry passed as `110495295520`. Initial artifact
`11179974123` remains retained, verified SHA-256
`12df4557c112fc90bcbc56728da39760d7f4170037a17eef2cd7871cef9bafcf`.
Successful retry artifact `11181696574`, verified SHA-256
`1e0a38d951a30a3dc3ace4eb3a25ddf1c45604f5fdfcd2fb4ceb2289c325abb9`,
confirms World travel/residency and 30/40-player load: 210/280 final successful
reads, with 14 read retries under the unchanged policy. It is not evidence of zero
raw transient responses. No assertion, timeout, retry budget or runtime changed.

Fresh merged-main R3 passed run
[36901239519](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36901239519),
job `110500653812`, artifact `11182450850`, verified ZIP SHA-256
`b3cad107b0f101badd894a0ee42b487e8e5069b7590c3e259172277c365b9c69`.
Its sourceSha is `da3ed11551b19884791913cb8bd0236e09326bdf`, every worker case
passes with the same effects, full backend/contracts pass, and lint is unchanged.
Merged main is terminal: 18 workflows passed, one expected Edge-convergence
workflow skipped; 37 jobs passed and eight conditional/manual jobs skipped.
Relevant run references: backend `36901239273`, quality `36901239251`, Seller
Offers `36901239380`, Listing `36901239227`, Atomic Settlement `36901239336`,
Withdrawal `36901239453` and Store Cutover `36901239131`. Skips cover explicit
staging/production deployment or live-parity actions and push dependency review.
Main Store Cutover run `36901239131` initially failed only replay job
`110500653069`: Docker could not bind loopback PostgreSQL port 54322 (address
already in use), before migration replay or test execution. Its other five jobs
passed, including browser coverage. Diagnostic artifact `11182040870` records
this startup failure (verified ZIP SHA-256
`78267faf14aca69096a4e7da6496769796c159720c29ba4c6c09c3588ab40106`).
One unchanged failed-job retry passed as `110507380873`, including both full
migration replays and lint. No source, workflow, database policy or assertion was
changed for either retained CI failure.
The closeout changes only this evidence, REF-045 task and its backlog entry.
No provider payment, webhook, hosted licensing, email delivery or production
certification is included; refund/chargeback and release holds remain in force.

## Next gated work

The 50-ID graph now has 33 VERIFIED_COMPLETE, six BLOCKED and 11 PLANNED
tasks. After REF-045, no independent task is eligible under current instructions.
REF-015/025/032/040/042/043 remain BLOCKED; REF-019/020 remain explicitly paused
with PLANNED manifest status. REF-027 depends on 025; 033/034/046 depend directly
or transitively on 032; 044 depends on 043; 047/048 depend on 015; 049 depends on
046/048 and 050 on the remaining tasks. Resolve a recorded gate with the owner
before restarting that lane; no dependency or completion condition is bypassed.
