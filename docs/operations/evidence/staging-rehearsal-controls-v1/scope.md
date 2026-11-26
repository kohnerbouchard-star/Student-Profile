# REF-032 / OPS-STAGE-001: captured staging disposable controls and diagnostics

Status: IMPLEMENTED_NOT_MERGED. Source-only draft owner
ops/staging-rehearsal-controls-20261125, based on current main
73ee21a9846442e85e3e5f2f650229423f2c5404. Consolidates only the proven fixture
repair and sanitized diagnostics. The blocked staging apply scaffold is excluded.
No new migration, historical SQL edit, application/Edge/frontend change, hosted
write, broad hold restoration, deployment, merge or manual dispatch is included.

## Problem and behavior

Protected rehearsal 45600326090 restored schema only and stopped after the first
new suffix. The next attempted identity is
20261004202506_reconcile_loan_liability_purge_graph_v1.sql. Its graph function
consumes purge registry rows, which schema-only capture deliberately omits.
The corrected disposable path reconstructs only canonical repository registry
and delete-order control seeds. It does not copy hosted control/application rows.

The seed is 20260918093319_business_financial_market_purge_registry_v1.sql,
raw SHA256 512e68067b38b3cc8258a42d4d2985712b0d600641c82c9e1a9aa477a3014ed5.
Only its two INSERT/SELECT statements are extracted. Cursor reconciliation and
TRUNCATE operations are not executed. Both target tables must be empty, and one
transaction must prove exact registry, FK graph and delete-order fingerprints.
Any wrong marker, nonempty target or fingerprint drift fails closed.

## Execution boundary

Only the existing protected Econovaria Staging Schema Rehearsal manual workflow
sets the explicit fixture authorization marker, after hosted credentials and the
connection file have been removed. The runner requires exact repository, workflow,
job, manual event, main ref, first attempt, Git SHA, staging project, canonical
capture/work directories and absence of external database/Docker settings.
The capture SHA manifest is rechecked before fixture execution.

The Docker context must be unix:///var/run/docker.sock. The freshly created
container must have the exact staging rehearsal name/project label, official
Postgres image, running state and no connected networks; host/container network
modes are denied. The exact container ID is re-attested immediately before exec.
psql connects explicitly to its /var/run/postgresql Unix socket, port 5432,
postgres database, with host-address/service overrides cleared. No hosted URL or
credentials are supplied. Other held rehearsal entry points do not implicitly
activate fixture reconstruction. No existing broad hold changes.

Native tests allow loopback only with the anchored literal database expression
^ref032_disposable_[a-z0-9_]+$; regex underscores are literal. No SQL LIKE wildcard
prefix remains. This route is for the independent disposable test, not hosted use.

## Staging aggregate comparison

Read-only connected staging checks on 2026-11-25 returned the following exact
pre-suffix controls. Only aggregate counts and digests were retrieved:

| Control | Count | SHA256 |
|---|---:|---|
| Registry | 207 | 7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3 |
| FK graph | 456 | fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329 |
| Delete order | 206 | 19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897 |

These match the repository fixture assertions. No hosted row values, raw control
rows or player data were exported. The correction does not alter graph guards.

## Public artifact boundary

Raw psql stderr stays in a private work file and is removed on both success and
handled failure. psql uses VERBOSITY=sqlstate. Sanitization publishes only a
plan-approved migration identity/version, fixed execution stage and an explicitly
allowlisted SQLSTATE. Unknown, malformed or ambiguous codes become null. No
messages, DETAIL, CONTEXT, SQL, dump, credential, connection URL or row payload
passes through. The workflow uploads only u1/sanitized/result.json and removes
u1 on exit; private logs and captures are not uploaded. ReleaseCertificate remains
false. Tests cover unknown identities, sensitive text and non-allowlisted tokens.

## Actual PostgreSQL evidence and limits

Exact-main Database Replay run 45570377295, artifact 15001463766 was downloaded
through the connected GitHub API. Archive SHA256:
7335b8366f8972384e5a0f30ad370c5ad4b93514cb2ca52ad54bea53edeff667.
schema-1.json SHA256:
772b1b8c90344007c7f44a0c69a5e8e2f72434064d07fa0bfb8828dc7c7bc55b.
This artifact is clean repository catalog metadata, not a hosted dump.

Native PostgreSQL 17.12 used a new empty cluster on unique loopback port 57639.
A topology model preserves canonical relation/column/FK identities and exact
repository purge functions, simplifying unused application types. It reproduces
P0001 / REF025_UNEXPECTED_PURGE_GRAPH with empty registry, proves seed rollback
on unexpected schema, reconstructs all three expected fingerprints, and passes
the unchanged actual loan DDL and reconciliation at exact 460-edge digest
0c932d6e620cec801b527e81f3e4d3e91bd8d70fd4fb45d6e1a72166ff0c7a82.
Repeated load and wrong marker are rejected. No application rows are copied.
This is NOT full application replay or acceptance of all 15 pending migrations.

A separate actual PostgreSQL shared-snapshot test on port 57641 proves concurrent
DDL/ledger consistency, exporter-loss failure, timeout cleanup and password/database
conversion. The test derives the OS username and uses test-only port routing.
Hosted conversion code is unchanged. Both native clusters stop on exit.

All 45 combined targeted/native/hold tests pass on pinned Node 22.23.1, with no
skipped tests; see qualification.json. Shell syntax, unchanged migration
validation, secret scan and whitespace checks pass. Docker-container attestation is covered by positive
and negative contract fixtures here; real Docker invocation/full corrected
15-suffix staging-shaped replay remains NOT_RUN. No release certificate, runtime
acceptance, recovery readiness or apply readiness is claimed.

## Independent test entry points

Supply embedded-postgres@17.12.0-beta.19 tooling and the exact artifact schema
metadata above, plus PostgreSQL 17 client/server binaries, then run:

```sh
REF032_EMBEDDED_MODULE=/absolute/tooling/node_modules/embedded-postgres/dist/index.js \
REF032_CANONICAL_SCHEMA=/absolute/verified-artifact/schema-1.json \
node --test scripts/operations/live-migration-reconciliation/disposable-purge-control-fixture.test.mjs
REF032_PG_BIN=/absolute/private/bin REF032_PG_PORT=57641 \
node --test scripts/operations/live-migration-reconciliation/readonly-rehearsal.test.mjs
```

Missing native inputs explicitly skip the engine cases; source-contract tests
still run. The existing protected manual rehearsal is the entry point for full
restored-staging qualification after separate source review and a main merge.
Do not dispatch from this draft. New main source requires fresh exact-source
replay/rehearsal evidence; prior attestations cannot be reused blindly.

## PR1058 source-authority and Roster pin follow-up

Initial public head 8a1f7839 failed four natural source authority checks before
Player verification and Roster runtime-equivalence before disposable activation.
The normal PR1058 exact-path authority retains #1055's complete ordered 127
required / 76 critical check identities and all false production/mutation/secret
permissions. Its scope is the original source-only tranche plus its own manifest,
regression test and Roster pins; the unchanged verifier is explicitly locked.
No verifier assertion, workflow filter, source fixture, diagnostic guard or release
hold is weakened. Existing integrated-composite Roster mode, exact API relation
and seven overlays remain unchanged; both roles pin one public source carrier.
The initial local authority/Roster run accepted the new authority but retained the
expected stale-pin runtime failure. Final actual-path authority and strict Roster
runtime-equivalence must be rerun after the pin-only correction; carrier identity
is recorded in scripts/roster-connected/sources.json and the PR head. No claim of
full corrected 15-suffix replay is added by this metadata correction.
