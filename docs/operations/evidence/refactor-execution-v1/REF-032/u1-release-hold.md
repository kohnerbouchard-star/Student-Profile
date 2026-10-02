# REF-UNBLOCK-001 / U1 temporary release hold

Status: IMPLEMENTED_NOT_MERGED; no release or REF-032 completion claim.
Base: `4620fb60dc2d13b5063a9917b2ec9e13e5a26f7f` (2026-10-02).
Branch: `fix/ref032-u1-release-hold`. Parent retains review and merge authority.
The exact candidate identity is the commit containing this record, recorded by
the draft PR and its exact-head CI; it cannot self-reference its own commit SHA.

## Approval, ownership and scope

The owner explicitly approved: "I approve that temporary release hold and the
narrow rehearsal-repair scope" after being told that a rehearsal repair merge
could start automatic staging changes and then production promotion. Parent
delegated the hold first, in its own draft PR; the repair follows only after
hold merge and safety verification. No deployment, hosted capture, live SQL,
credential, cloud setting, cancellation or restoration is authorized here.

Fresh owner audit: #730 remains at `8856648da15b821f591c09bf08a805d405dc5a96`,
#731 at `38d1124a13d22aaa2b30e8579ee8bfd9c7775dea`. The explicit handoff permits
this bounded gate change without replacing their certification/recovery work.
#731 overlaps all three workflows and the existing workflow contract test;
its later integration must preserve the hold until separate restoration approval.
#730's three temporary helper workflows are untouched. Neither branch is imported.

Exactly five editable paths:

- `.github/workflows/database-replay.yml`
- `.github/workflows/phase15-controlled-staging.yml`
- `.github/workflows/phase15-controlled-production.yml`
- `scripts/operations/live-migration-reconciliation/phase15-production-workflow.test.mjs`
- this evidence record

Protected: all migrations, immutable bundle builder/151-and-169 identities,
rehearsal/live convergence scripts, certificates/release requests, security
settings, package/dependency files, application source, all 50 task records,
backlog/dependencies and global ledger. Other REF closeouts remain separate.
One conceptual correction; five meaningful files, below 400 semantic diff lines.

## Held execution and retained checks

Each job below has an explicit literal false guard AND its unchanged original
event predicate. There is no variable, secret, input, label, clock or dispatch
bypass. Existing job bodies, dependencies, environment protections, credentials,
economic/certificate validation and recovery controls remain unchanged.

| Workflow | Explicitly held job IDs |
| --- | --- |
| Database Replay | live-shaped-rehearsal (both matrix environments) |
| Controlled Staging | certify-source; converge-staging-database; converge-staging-runtime; exercise-staging |
| Controlled Production | certify-staging; converge-production-database; converge-production-runtime; publish-production-release |

Database Replay's disposable `replay` job remains enabled, including both clean
replays and warning-level lint. Its existing manual dispatch still runs only
the disposable job; it cannot bypass the held capture. Both static-contract
jobs remain enabled. Their summaries name every held job as NOT_RUN and state
that passing static/disposable checks do not certify a release.

Production no longer subscribes to staging's workflow_run event: skipped live
jobs can leave staging successful, so holding staging alone is insufficient.
A narrow main-push trigger runs production static checks when these three
workflow files or their contract test change. Production's hosted jobs stay
literal-false on every event. Existing PR static triggers are preserved.

## Old-definition run audit before publication

GitHub run queries covered in_progress, queued, waiting, requested and pending
statuses (each result fit one 100-entry page). No active Phase15 staging or
production workflow was returned. No run was cancelled or approved.

- Run 36951082710 (main `4620fb60`, Business Player Store Cutover) was initially
  in progress; subsequent job inspection found all six jobs completed/success.
  Its connected/database jobs use disposable local services.
- Old Database Replay PR run 32216613119 has queued job 95959288223 `replay`;
  it is a pull_request run, not a main push eligible for live-shaped capture.
- Queued PR runs 32218075875 (Production Web Session Release Orchestrator) and
  32218075939 (Edge Function Inventory) have no instantiated jobs. Their exact
  old source `d653a14e8d292a2570c611651f421471e9c952cb` gates hosted jobs on
  main push and workflow_dispatch respectively; these PR events cannot enter
  those hosted jobs. These workflows are outside this hold's editable scope.
- Twelve other queued runs are historical PR validation workflows. No waiting,
  requested or pending runs were returned in this audit.

Refresh at 2026-10-02T01:43:16Z returned zero in_progress, waiting, requested
and pending runs. This is a timestamped observation, not an enduring guarantee. Parent must repeat
the audit immediately before merge. A merged guard cannot stop an already-running
old workflow definition. If an eligible hosted job appears, stop and report its
exact run/job; cancellation requires separate authorization.

## Validation and completion boundary

Local Node 22.23.1 qualification on the candidate:

- Existing bundle/workflow contracts plus new hold and negative-mutation cases:
  14/14 passed. Tests reject each per-job guard bypass, newly introduced jobs,
  disabling local/static work, and restored workflow_run chaining.
- Golden Five, Edge inventory, local Edge/runtime configuration and Vercel Git
  release contracts: 29/29 passed; all economic/recovery assertions retained.
- Three workflow YAML documents parse; whitespace diff check passes.
- Full `npm test`: passed (exit 0). Exact-head CI remains required.

Hosted schema/ledger capture, live-shaped proof, staging/production changes,
runtime activation and release promotion: NOT_RUN, intentionally held.
Disposable replay/lint must pass independently in exact-head CI; a skipped
live-shaped job supplies no parity proof. REF-032 stays BLOCKED, and the nonce
suffix rehearsal correction is not implemented by this hold.

## Restoration and rollback

No automatic expiry. Reverting the hold or restoring its triggers can start
hosted operations on that very merge, so neither is a routine rollback.
Separate explicit owner release approval, reconciled #731 source, reviewed
restoration scope and fresh exact-source release evidence are required first.
If the later U1 repair fails, revert only that repair while keeping this hold.
If this hold needs correction, preserve denial while repairing the guard.

Next: parent review, exact-head CI, fresh old-run audit, hold merge and verification;
only then the separately scoped immutable-bundle-plus-pinned-suffix rehearsal repair.
