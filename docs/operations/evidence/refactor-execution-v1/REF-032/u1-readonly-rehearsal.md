# U1 consistent read-only rehearsal

Base: `371b6e21924df4702019636b01fb91d7cfce3a9c`; parent review/merge controls execution.
Owner authorized one-time staging and production schema/migration-history capture
for disposable rehearsal, with restricted temporary raw data and sanitized results.
This source PR is not dispatch approval: review the merged exact-main binding first.

Scope is five paths: the new `phase15-readonly-rehearsal.yml` workflow, new
`capture-rehearsal-snapshot.sh`, existing `rehearse-live-shaped-upgrade.sh`, new
`readonly-rehearsal.test.mjs`, and this evidence. #730/#731 ownership is preserved.
All original task IDs, immutable bundle identities, migrations and nine holds remain.

The first manual run/first attempt only is admitted. Missing existing environment
`SUPABASE_DB_URL` fails closed; no linking, new secrets or access configuration.
The capture-only process holds REPEATABLE READ READ ONLY while pg_dump imports its
snapshot and the same exporter reads ledger hashes. There are no capture retries.
Exporter loss, timeout or dump failure invalidates the capture. Raw errors stay
private. Raw dumps/ledger/diagnostics are removed after use; only selected scalar
result fields may be uploaded under a diagnostic-only artifact name.

The restore step receives no hosted credentials; disposable database networks are
disconnected before restore. Complete schema comparison remains mandatory. Runtime
catalog comparison is informational; this is schema-shaped, not populated-row proof.
Manual results cannot certify or trigger a release. A failed or uncertain capture
requires parent inspection before any further authorization/run, never a blind retry.

Validation: local PostgreSQL 17.11 (Debian 17.11-0+deb13u1) passed actual
concurrent-DDL/ledger snapshot isolation and exporter-loss tests. No application
rows are copied. The hosted runner uses pinned Supabase PostgreSQL 17.6.1.054
amd64 digest `e884cde9f5594ddb30ebec888bd236d128eaf9c9b48cc864d8fa3d27a6c6c6bc`.
Focused contract tests also pass; exact-head outcomes are recorded in the PR.
Hosted capture and true live-shaped results remain NOT_RUN until reviewed execution.
REF-032 remains BLOCKED. Revert this source only; never restore held jobs as rollback.

Independent review found URI-in-PGDATABASE was treated as a literal database name.
Regression reproduces that failure, then executes the actual workflow converter and
Docker env-file route with SCRAM-authenticated disposable PostgreSQL, percent-encoded
password/database fields, and an ephemeral 0600 PGPASSFILE. Passwords stay off argv
and out of the env-file; target/TLS/newline failures and ignored URI overrides are
covered. Container fixture client is PostgreSQL 17.11, not the full hosted image.
The converter additionally requires canonical ASCII DNS labels before revalidating
Supabase project binding; encoded socket/multihost/separator/whitespace hosts fail
before credential output. Fixture PGHOSTADDR maps the valid DNS identity only to
local loopback for native and Docker transport tests; the workflow never sets it.

## Approved staging-only amendment (2026-10-04)

Status: IMPLEMENTED_NOT_MERGED; REF-032 / REF-UNBLOCK-001 remains BLOCKED.
Initial audited base: `8178ee7c13b5c02761bb0f9bbf34cea03a3467ca`.
Reconciled base: `486b5e2d0f2fc042be444840fff2d4f11c4ac72c` (#837).
Owner Sentinel_322434987b60819189c6b2fb5ca464a6 approved the narrow
staging-only additional-run amendment with “yes” at 02:53:39 UTC on October 4.
Parent reports the owner is adding staging environment `SUPABASE_DB_URL`;
this amendment neither reads nor changes that secret or any security setting.

This supersedes the historical two-environment / first-dispatch-only scope above.
Only three paths change: this evidence, the manual workflow, and its existing test.
Parent retains source review and merge authority. No migration, route, RPC, bundle
identity or release-hold file changes. Shared roadmap edits remain parent-owned to
respect the explicit three-path limit; no task is marked VERIFIED_COMPLETE.

Prior dispatch `36961759600`: staging job `110696781286` failed in the capture
step before capture due to missing SUPABASE_DB_URL (parent-supplied diagnosis);
its restore/rehearsal was skipped. Production job `110696781402` passed capture
and disposable rehearsal. Both source-binding steps and both cleanups passed.
Connected GitHub job metadata independently confirmed these step outcomes on
October 4; raw logs, captures and secrets were not accessed. Production success
is historical evidence, not a release certificate or current-main qualification.

The production matrix is removed entirely. The sole admitted additional dispatch
must be first attempt, with exactly two history entries: itself and the exact
completed, failed first-attempt prior run. Before accessing credentials, its exact
two prior job IDs/names and binding/capture/restore/sanitization/cleanup outcomes
must match. Missing, changed, duplicated or extra evidence fails closed, as do
later dispatches and reruns. Current-main/source-SHA/passed push replay binding,
project/TLS checks, consistent read-only snapshot, private ephemeral raw files,
sanitized-only artifacts, credential-free local restore and cleanup remain intact.

New staging capture/rehearsal: NOT_RUN. No database connection, dispatch, live SQL,
production recapture or deployment occurred in this amendment. Next exact action:
parent review and merge, then verify the exact new-main push Database Replay
succeeds before considering the single authorized staging dispatch. Any failed or
uncertain capture returns to parent inspection; never retry blindly. Nine release
holds remain unchanged. Rollback reverts only this amendment and retains all holds.

Amendment validation: pinned Node 22.23.1/npm 10.9.8; root `npm test` PASS;
all reconciliation tests 28 PASS / one existing disposable-PostgreSQL test skipped
(no database connections authorized here). Exact jq predicates are executed against
valid and independently mutated/missing/extra run, job and step evidence. Existing
nine-hold positive/negative tests pass, and all three held workflow files are
byte-identical to base. Secret scan, YAML parse, every workflow shell block's
`bash -n`, and `git diff --check` pass. Backend TypeScript passes; full Edge
checking is blocked by the esm.sh dependency fetch (`unsuccessful tunnel`) with
pinned Deno 2.9.3. Backend smoke also stops on that same dependency fetch.
Exact-head hosted checks are recorded in the PR handoff, not assumed successful. No database replay was run locally.
