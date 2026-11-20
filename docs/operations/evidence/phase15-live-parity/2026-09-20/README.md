# Phase 15A evidence — 2026-09-20

Status: **BLOCKED at 15A**. This is not a staging or production certificate. See [BLOCKED.md](BLOCKED.md) for the current checkpoint and resumption requirements.

Source main: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90`.
Owner: `fix/phase15-live-migration-parity-v1`.

## Established facts

- PRs #684–#688 are merged; the seven final-main workflows pass. Production release jobs skipped as designed. The latest production Vercel deployment still uses `59a82ef8580d7d571727e722424bc84cf064e8aa`.
- Repository: 435 migrations; staging: 316 ledger entries; production: 294. Repository head: `20260918095220_business_financial_market_purge_convergence_v1`.
- The original 70-migration checksum baseline remains byte-identical. No migration present at the production application source was modified between that source and current main.
- Fresh existing release-parity enforcement exits 2: historical ledger digests match, post-cutoff ledger identities differ, and eleven unapproved routine differences remain. Original raw evidence and that failed result are preserved.
- The original release exporter covers only `public` and `private`. Separate evidence captures `economy_private`, cross-schema function ownership/security/search paths, view definitions as hashes, all non-internal triggers, extensions and scheduler command hashes.

## Evidence interpretation

`three-way-classification.json` assigns each repository/live identity one preliminary classification. `EXACT_MATCH` proves version/name identity only. `REPO_PENDING` is an application candidate, not permission to replay. Same-name and `source_` candidates remain `UNKNOWN`; live-only identities remain unapproved. No historical alias has been promoted to `EQUIVALENT_RECONCILED` without effective-state proof.

The immutable manifest digest hashes canonical JSON of the ordered migration array. File checksums hash raw repository bytes. Live statement-array/joined-statement hashes have distinct serialization boundaries and must not be compared to file hashes as if they were interchangeable. Function definition hashes use PostgreSQL `pg_get_functiondef`; no whitespace removal inside literals is used. Catalogs omit application rows, raw function bodies, scheduler command literals and credentials.

`*-schema.json` is the existing two-schema release export. `*-economy-private-schema.json` supplements the missing application schema. `*-schema-supplement.json` contains runtime catalogs. `*-advisor-findings.json` preserves each advisor finding; the shorter initial `*-advisors.json` is only a grouped inventory, not a classification/allowlist.

## Hard-gate work remaining

1. Two clean 435-migration replays now match at `6219b0605e632f1aec248b11028deb5164d18d03`; see `canonical-replay-certification.json`. The initial canonical/live comparison finds substantive differences; complete effect review is still required.
2. Resolve all candidate aliases and live-only effects using immutable migration statement evidence and isolated effective-schema/data-effect review.
3. Explain the eleven routine differences and scheduler differences without broad allowlisting. Establish the exact staging upgrade path and production delta.
4. Only after 15A passes, construct and verify 15B corrections. Staging recovery evidence precedes 15C; production remains behind 15A–15E.

## Reproduction

```sh
node scripts/operations/live-migration-reconciliation/phase15-audit.mjs . docs/operations/evidence/phase15-live-parity/2026-09-20
node scripts/operations/live-migration-reconciliation/verify-immutable-manifest.mjs
node --test scripts/operations/live-migration-reconciliation/phase15-audit.test.mjs
```

The Database Replay workflow now captures two application-schema and runtime-catalog snapshots and enforces equality using the existing comparison utility. It uses a disposable local database and no hosted credentials. The local Work workspace has no Docker/Postgres binaries; that limitation is not evidence that the repository replay fails.

Do not run the historical `apply-pending-via-psql.sh` or `normalize-outer-transactions.py` for Phase 15: they contain old ledger-recording/version assumptions and source rewriting. They are retained as history, not approved convergence procedures.

## Follow-up evidence

`canonical-comparison-summary.json` records the canonical/live structural differences and live-only identities. `purge-guard-conflict.json` records the confirmed production guard mismatch. `historical-ledger-revalidation.json` rechecks the old alias map against current ledgers. `scheduler-comparison.json` retains the remaining command-hash differences. `*-column-access-details.json` adds explicit-null column dimensions, relation metadata, constraint flags and schema grants to the original snapshots. `deployment-health-verification.json` records bounded HTTP health/version probes. `candidate-6219-ci-evidence.json` retains the failed authority checks before their bounded correction.
