# REF-046 bounded Campaign verification

Date: 2026-10-04. Parent acceptance: **BLOCKED**, not complete.
Mappings: ARCH-209 / ARCH-600. Repository: Student-Profile only.
Base and fetched main: `f8ce47a3f57a429b75c7205d07018736bb8d70cb`.
Working branch: supplied `work`; no replacement ownership branch created.
REF-032 and REF-033 are VERIFIED_COMPLETE in the current backlog, with
merge identities `0a3d88ceff3bb1db0b4ffcd306a21b872159cf9e` and
`2fbcc0ab996243bec5406e8ddcbb584b6b2a6953`. Their evidence remains authoritative;
this tranche does not rerun or alter their closeout.

## Accepted initial scope

Only these paths are editable, below 400 semantic diff lines:

- `backend/supabase/functions/admin-api/campaignWorkersRuntime.test.ts`: four
  characterization cases and one typed result fixture helper.
- `docs/operations/evidence/refactor-execution-v1/REF-046/preflight.md`: this
  scope, source reconciliation, qualification proposal and observed checks.

No production symbol, migration, route, RPC, schedule, credential, deployment,
release hold, task status or backlog entry changes. Parent owns task/backlog
closeout serially and coordinates all shared package/workflow/inventory edits
with REF-034. REF-034's Notifications, Contracts and Stock hooks remain untouched.
Initial PR lookup via both `gh pr list` and `gh api .../pulls?state=open` failed
with Forbidden. Remote head lookup for `*ref-046*` and `*ref-034*` returned none;
that is not proof of full owner clearance. No draft PR or required CI can be
claimed from this environment. Retain the supplied branch for parent handoff.

## Source reconciliation and protected contract

`campaign-orchestrator/index.ts` already authenticates a POST using the scheduler
header before running application work. Unsupported method is 405, invalid token
401; scheduler name and SHA-256 verification RPC are in its infrastructure client.
The trigger derives the current clock and unique run ID, calls
`runCampaignScheduler` with a 25-campaign limit, then `runCampaignEffectWorker`
with a 100-command limit. JSON success/error envelopes are unchanged.

The scheduler/provider select the versioned event; the repository calls
`execute_campaign_event_atomic_v2` with game, expected revision/phase, trigger
identity, clock, schedule and durable effect commands. It does not invoke the
in-memory coordinator directly. Rewiring it to do so would replace the established
atomic SQL authority, not remove duplicated trigger logic. Follow the ticket's
already-thin stop rule: verification only. Existing coordinator/state-machine,
Arrival scoring, World runtime and Admin tests remain relevant parity checks.

The only production callers of the two runner functions found in the backend
TypeScript scan are the two calls in the orchestrator. No new caller or wrapper
is introduced. Production debt/coupling change: zero across this one entrypoint,
one scheduler and one worker boundary. Four tests are added to the existing
four-test worker file; `test:world-runtime` already registers that file.

The cases verify bounded empty discovery with no downstream work; missing program
failure isolation using the provider's `campaign_program_not_found` code; paused
candidate rejection before program/persistence access; and two games at arrival
and adaptation with distinct event, effect, revision, trigger and evidence scope.
These use synthetic repository results. Existing replay/failure tests and these
new cases do **not** prove database locking, lease recovery or exactly-once effects.

## Exact proposed database amendment — not implemented

Reuse the disposable harness pattern in
`scripts/ref-045-license-issuance-acceptance.ts` and the overlapping-session lock
barrier in `scripts/ref-022-ledger-adjustment-acceptance.ts`. Existing
`.github/workflows/ref-018-attendance-qualification.yml` already starts the local
Supabase stack, resets migrations, lints and runs guarded psql-backed Deno proofs.
`.github/workflows/database-replay.yml` supplies two clean resets plus schema and
catalog comparison. Neither currently executes a Campaign race/expiry proof.
`backend/supabase/config.toml` disables seeding, so resetting alone supplies no
Campaign fixture.

Minimal additional paths proposed for parent acceptance:

1. `scripts/ref-046-campaign-acceptance.ts`: self-contained synthetic fixture,
   loopback-only psql bridge and executable runner/RPC assertions. Require
   `REF046_DISPOSABLE_DATABASE=1`, exact source SHA, localhost/127.0.0.1 port
   54322, database/user postgres, no URL query/fragment; deny Deno network.
2. `.github/workflows/ref-018-attendance-qualification.yml`: parent-coordinated
   registration, filters and evidence upload for this single script using its
   existing disposable database job. Do not create another replay framework.
3. `docs/operations/evidence/refactor-execution-v1/REF-046/database-qualification.json`:
   sanitized exact-source results, fixture identities, migration head, counts,
   race barrier observations, cleanup and failures. Runtime logs stay CI artifacts.

No package change is needed for the initial four tests. New DB script registration
must be serialized with REF-034 by the parent before adding these paths. If the
full amendment exceeds the semantic budget, register an explicit child first.

Replay the complete immutable migration chain, not a handpicked reconstructed
schema. Critical definitions include `20260721100000` (Campaign/Arrival tables),
`20260721101000` (game lifecycle), `20260721107000` (control/outbox/claims),
`20260721108000` (atomic event), `20260818121000` (program provisioning),
`20260818121200` / `20260818121300` (trigger/revision fixes), subsequent permission,
program and schedule migrations, and Phase 15 reassertions through current head.
Use only local synthetic game/program/campaign/event/outbox rows, with one active
arrival game, one active adaptation game, a paused game and missing runtime/program
cases. Snapshot event, audit, command and destination-effect counts before/after.

Required executable assertions:

- Overlapping scheduler sessions use the real atomic event RPC on the same
  candidate. Observe database lock contention, then require at most one event,
  revision advance and effect-command set; check same-trigger replay separately
  from different-run stale revision. Preserve unchanged other-game state.
- Overlapping effect claim sessions prove `FOR UPDATE SKIP LOCKED` disjoint claims;
  drive actual worker/repository adapters and reviewed effect RPCs, not fabricated
  success responses. Assert destination receipts/effect counts under retry.
- A processing command exactly five minutes old is not reclaimable; strictly older
  is reclaimable while attempt_count < 25. Assert incremented attempts, stable
  effect idempotency identity, completed exclusion and retry-cap behavior.
- Resume the old worker after reclaim and exercise late completion/failure with
  actual effects. Current completion/failure RPCs accept only command identity,
  not a lease token. Do not invent a fencing assertion or claim fenced ownership.
  If duplicate effects or a correctness defect appears, stop and report the
  separately owned correction; no SQL/lease semantics change is authorized here.
- Inject failure locally and prove the atomic event transaction leaves no partial
  event/command/audit; verify paused/missing-runtime denial and two-stage isolation.
- Prove scheduler auth denial before work and preserve method, batch and clock
  contracts. Clean up only these synthetic fixtures, recording counts.

No local database was started or mutated in this tranche. Database proof remains
NOT_RUN pending the exact-path amendment; U1 holds remain unchanged.

## Validation record

Pinned tools installed outside the repository under `/tmp/ref046-tools`:
Node 22.23.1, npm 10.9.8 and Deno 2.9.3. Root/backend lockfile installs completed.
Deno cache and logs use `/tmp/ref046-*`; no hosted credentials were requested.
The Supabase skill was read; changelog retrieval failed with HTTP 403, so this
tranche makes no external Supabase API or schema changes.

Checks apply to the base above plus this two-file working diff; they are not
merged-head or CI acceptance. Results are finalized below. Required parent gates
remain the focused World/Campaign/Arrival/Admin suite, auth/lease qualification,
repository tests/architecture/security checks, backend typecheck/smoke and actual
DB race/expiry proof. No runtime deployment or release certification is implied.

| Command | Observed result | Local log |
| --- | --- | --- |
| `npm --prefix backend run test:world-runtime` | PASS: 50 domain + 15 Admin cases, zero failures; worker file 8/8 | `/tmp/ref046-world-runtime.log` |
| `npm test` | PASS, exit 0, including architecture/high-priority/legacy audits and auth boundaries | `/tmp/ref046-root-test.log` |
| `npm run security:secrets` | PASS, exit 0 | `/tmp/ref046-secrets.log` |
| `npm --prefix backend run typecheck:all` | BLOCKED: Edge import download failed after TypeScript check | `/tmp/ref046-typecheck.log` |
| `npm --prefix backend run smoke` | BLOCKED: dependency import download failed during Admin local mutations; earlier suites passed | `/tmp/ref046-smoke.log` |
| `git diff --check` | PASS | local console |
| Competing workers / expired leases / migration replay | NOT_RUN; amendment proposed above | none |
| Draft PR / required CI / merged-head proof | BLOCKED: GitHub API Forbidden | none |

Both blocked backend commands report an unsuccessful proxy tunnel fetching the
locked `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs`.
Do not substitute packages, relax locks or count partial suites as full passes.
The architecture inventory regeneration in `npm test` produced no tracked diff.
The final test file is 487 lines, below the existing 500-line inventory threshold.
Only the two accepted paths differ. Rollback is reverting these tests/evidence;
there is no production wiring to roll back. Next exact work remains REF-046 DB
qualification and parent owner/CI reconciliation, not REF-050 or release work.
