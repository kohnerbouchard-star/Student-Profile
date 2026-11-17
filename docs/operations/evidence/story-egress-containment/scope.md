# Story dependency retry containment

Status: IN_PROGRESS. Base main `9df2064d`. No production or staging action.

## Source diagnosis and bounded scope

A failed Story event retains its frozen plan but can immediately reacquire its
lease. A persistent dependency failure therefore replays earlier idempotent
effects on every scheduler tick. Idempotency protects economic results, but does
not prevent repeated requests. Request counts do not establish billed bytes.

This SQL-only forward migration adds retry delay and persistent holds. Active
leases retain priority. A saved currency-volatility plan is held when canonical
FX is not ready or game lifecycle is incompatible. Other failures use exponential
backoff starting at 60 seconds, capped at one hour, and eight attempts per epoch.
The first-ever plan may execute once before reacquisition detects the dependency.

Holds fence expired tokens, retain the original plan/time/tick and lifetime
attempt count, and never create final resolutions. Existing callers receive
`busy`, an empty plan, no lease token and nullable expiry. Persisted effective_at
and nonnegative attempt_count remain valid. The parser accepts this response and
the resolver exits before side effects. Inspected deployed source matches these
compatibility conditions; the executable local regression checks the matching
parser/resolver and invalid-field rejection. No live invocation is claimed.

No currency bootstrap, fabricated baseline, timestamp repair, FX readiness
change, global scheduler pause or economic write is performed by containment.
Canonical cutover repair remains separate and must preserve economic provenance.
Frozen Story times must not be rewritten to accommodate a dependency.

## Guarded release

The service-role-only release RPC checks game ownership, lifecycle, expected
hold reason, historical attempt count and durable hold generation. It validates
FX readiness when the saved plan needs FX. It records a reason and immutable
idempotent release intent, then permits a fresh bounded retry epoch without
resetting historical attempts or effect identity. Every new hold increments its
generation, preventing stale approval after release/rehold at the same count.
Holds never auto-release.

The trusted service caller supplies an owner staff ID; this is not independently
authenticated by the RPC. An eventual authenticated admin caller must derive its
actor server-side, never forward browser-supplied identity, and own its approval
flow. No browser or admin route is added here.

Audit is caller-append-only, not permanent retention. Claim/game/event deletion
cascades remove associated audit rows; actor deletion remains restricted while
referenced. This preserves existing game deletion behavior and makes no separate
retention promise.

## Ownership and validation

PR #999 owns durable Story adapter/Contract replay. This patch does not edit those
TypeScript files. When stacked after it, its immediate-retry database fixture
must advance only the rollback fixture's retry time before asserting reacquisition;
all replay/ownership/stale-token assertions remain required.

- Eight source/workflow-contract tests, 17 runner safety tests, one executable
  parser/resolver compatibility test and three existing redactor tests pass locally (29 total).
- Migration validation: 463 unique versions; whitespace check passes.
- Rollback-only PostgreSQL proof covers delay boundaries, high historical attempt
  counts, frozen identity, active lease priority, dependency holds, release
  fencing/idempotency/ownership, generation ABA, completed replay and RPC ACLs.
- Multi-session proof observes actual lock waiting. It covers competing claims,
  both finalize/hold orderings, concurrent releases, release/claim, and both
  readiness/lifecycle-change orderings. Expiry alone does not fence finalize:
  finalization that wins the authority lock first is allowed by existing behavior.
- Actual PostgreSQL and concurrency proofs have NOT run locally: Docker and psql
  are unavailable. Source tests are not database qualification or merge readiness.

## Dedicated disposable CI

The prepared workflow is same-repository, named-branch pull-request-to-main only,
with contents-read permission and no persisted checkout credentials. It has no
manual dispatch, secret references, deployment environment, project linking,
remote database command, production/staging access or artifact upload.

Pinned: Ubuntu 24.04, reviewed action SHAs, Node 22.23.1, npm 10.9.8,
lockfile Supabase CLI 2.109.1, and runtime-verified local PostgreSQL image
17.6.1.143. The runner rejects dirty/untracked source and external connections,
checks a fresh local container, resets from the exact PR head and verifies applied
migration versions before running serial and concurrent tests. Sessions have
server/client deadlines and named-backend cleanup. Fixtures are rolled back or
removed within the disposable database; teardown uses --no-backup.

Raw CLI/database output remains in temporary runner files and is never uploaded
or printed. On failure, the existing fail-closed redactor sanitizes and validates
the entire log before a bounded 120-line sanitized tail is printed. The redactor
and its regression test are locked read-only in this PR authority. Independent
source and workflow review found no remaining source blocker; exact-head real
PostgreSQL CI must still pass before a merge decision. No release approval is
implied by a draft PR or passing disposable tests.

## Qualification follow-up

Exact-head dedicated run 44016740068 passed all 24 initial local-contract tests,
migration validation and disposable PostgreSQL startup. Acceptance failed before
its diagnostic could be observed because the original workflow suppressed raw
output. A reviewed sanitized diagnostic path is added without relaxing any gate;
the underlying acceptance cause is not yet claimed or guessed.

A separate scratch Git regression reproduces a freshness-check defect: clean
`git status` updates the `.git` directory mtime while the immutable checkout HEAD
file stays unchanged. The harness now uses the HEAD file marker rather than that
mutable directory. Exact SHA, clean-tree, Docker identity/image, and stale-container
rejection remain enforced. This is a reproduced defect consistent with the early
CI failure, not confirmation of the original suppressed exception. Sanitized CI
diagnostics and exact-head database rerun remain required.
