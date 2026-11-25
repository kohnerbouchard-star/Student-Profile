# REF-032 / OPS-STAGE-001: synthetic Docker substrate PR smoke

LOCAL_ONLY candidate based on exact diagnostics source
cf27f96f6a4e396ff92afd78609a10764c2a2683 (tree
4f83f905e8489656f7aafdbe2fc652a4067eb132). The previous parent-retained bundle
was checksum verified and restored; its SHA256 is
35718a8194007c142dd0a3cbab04a88c95787b916d8da3b4969ac9090ef07246.
No push, merge, dispatch, deployment, hosted credential/connection/data/job/write
or provider-setting action occurred. The historical run's cause remains UNKNOWN.

## Small CI integration and trigger analysis

Only one step is added to the EXISTING Database Replay `replay` job, after pinned
npm/CLI installation and source-contract checks, before the ordinary disposable
stack starts. It runs the new tests and then the actual synthetic Docker runner.
There is no new workflow, job, dispatch interface, environment or permission.

The existing PR path filters already cover database-replay.yml and
scripts/operations/live-migration-reconciliation/**; they are not broadened.
The new step requires pull_request and same-repository head. The runner further
checks exact PR-head Git identity, main base, Database Replay/replay context,
explicit synthetic marker and absent external database/Docker overrides. A main
push or existing manual dispatch does NOT run this step. Forks do not use this
same-repository smoke path. Other existing replay behavior is unchanged.

The live-shaped job's false hold is byte-for-byte unchanged. The protected staging
workflow and captured-staging authority helper are unchanged. The synthetic runner
never invokes that helper or impersonates its main-only context. Its deterministic
guard is its own tiny synthetic SQL assertion, not a repurposed authority guard.

## What Docker CI will actually execute (PENDING, not run locally)

1. Verify the installed local Supabase CLI is exactly 2.109.1 and the Docker
   context is the local Unix daemon; reject hosted/external credentials/URLs.
2. Create a unique ref032_synthetic_<random> temporary project with an EMPTY
   migrations directory, source config with seed disabled and separate ports.
   Start a database-only local stack via the same pinned CLI/excluded-service
   mechanism used by replay. No repository migrations, seeds or snapshots load.
3. Attest a fresh, owned, running official Postgres container. Disconnect every
   inventoried network, re-inspect to prove no networks remain, and reject host
   or shared-container networking. Any inventory/disconnect error fails closed.
4. Use the exact container ID and explicit /var/run/postgresql Unix socket for
   all SQL. Create only synthetic_probe.item and synthetic_ledger.migrations,
   with one literal synthetic-v1 ledger row. No actual migration-history table
   or Player/application relation is used.
5. pg_dump only those two synthetic schemas with --schema-only, reject any row
   statements, and retain the synthetic ledger observation in memory. Drop and
   restore those schemas through real psql; prove the schema-only restore has an
   empty ledger, then restore its single fixed synthetic row.
6. Reach the independent SYNTHETIC_RESTORE_GUARD and require real P0001 rejection;
   verify item count 0 and synthetic ledger count 1 afterwards. This is success
   for this narrow negative guard, not authorization to apply anything.
7. Stop only the unique stack with --no-backup and remove its private temporary
   directory. Cleanup failure cannot turn an earlier failure into success.

Only fixed status/stage, public source SHA and synthetic flags are printed.
Raw command errors, Docker metadata, SQL/schema dump, connection details and row
payloads are not printed or uploaded. This step adds no artifact upload; the
existing replay diagnostics remain unchanged. fullStagingQualification is always
false. The normal full clean replay stack is started separately after this step.

## What actually ran locally

Docker is NOT installed in the selected local environment. Therefore actual
Docker/Supabase startup, network disconnect, image identity and container Unix
socket restore remain NOT_RUN pending natural GitHub PR CI. No fake success or
skipped Docker step is counted as Docker qualification.

Locally executed on pinned Node 22.23.1:
- Positive/negative context and lifecycle command-plan tests with synthetic stubs;
  they assert empty migration input, startup/isolation/restore ordering, exact
  Unix socket and container ID, no SQL after isolation failure, expected guard
  rejection, bounded error projection, and primary preservation through cleanup.
- Unsafe container ownership/image/freshness/host/shared-network/egress controls.
- ACTUAL native PostgreSQL 17.12 on unique loopback port 57663 with real 17.6
  pg_dump/psql clients: tiny schema-only dump and restore, empty restored ledger,
  fixed synthetic ledger restoration, exact P0001 guard and unchanged counts.
  This is native SQL/client proof, NOT Docker startup or isolation proof.
- Retained diagnostics, immutable bundle, source/hold and native snapshot/fixture
  tests. Final test counts are recorded in result.json. No raw hosted capture,
  player data or hosted job was used.

Native tooling inputs REF032_EMBEDDED_MODULE/REF032_PG_BIN enable only the native
unit regression. The actual CI runner has no stub/native fallback: absent Docker,
failed startup, retained egress or failed restore makes the PR replay step fail.
Missing native test tools may skip that native regression in CI, but the next
actual Docker invocation is mandatory for the same-repository PR condition.

## Remaining limits and next step

This may localize a Docker substrate failure; it does not reproduce the destroyed
staging capture or qualify all 15 suffix migrations, hosted parity, recovery,
authorization journeys or any release/apply gate. Review the local patch/bundle,
then normal source publication/PR checks may exercise it naturally. No dispatch
or restoration of the live-shaped job hold is needed or authorized by this work.

Final local suite: 57/57 PASS, no skips, pinned Node 22.23.1. This count includes
actual native PostgreSQL proof and stubbed Docker-command plan assertions; it is
NOT a count of passed Docker executions. Secret scan and whitespace checks pass.
