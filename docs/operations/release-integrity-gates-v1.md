# Release Integrity Gates v1

Status: implementation authority for branch `fix/release-integrity-gates`

Date: 2026-08-01

Base commit: `ce6aa77eae32bdc5a25c108c1d4aed6550d6b22a`

## Purpose

This document defines the required architecture and acceptance criteria for the release-integrity branch. Changes on this branch must remain within this document's scope. A change that conflicts with an invariant below must be rejected or this document must be amended in a separate, reviewed commit before the implementation changes.

The branch establishes fail-closed evidence for runtime compatibility, repository migration identity, live migration-ledger parity, normalized database schema parity, and exact-source release attestation. It does not deploy application code, apply database migrations, repair migration history, change production grants, delete Edge Functions, or mutate production data.

## Current risk being corrected

The existing production promotion path can reconcile migration identities inside the workflow and materialize local placeholder files for production-only migration rows before running `supabase db push`. That allows the release process to adapt the repository checkout to the live database rather than proving that the live database matches the repository. This reverses the desired source-of-truth relationship and can hide migration drift.

The replacement policy is:

1. Git is the migration source of truth.
2. Remote databases are inspected read-only before promotion.
3. Drift blocks promotion.
4. History repair is a separate, explicitly authorized operational procedure.
5. No release workflow creates migration placeholders or edits migration history dynamically.

## Authoritative external guidance

The implementation follows these primary sources, reviewed on 2026-08-01:

- Node.js 22.23.1 archive and bundled npm 10.9.8: https://nodejs.org/en/download/archive/v22.23.1
- Node.js 22.23.1 LTS release notes: https://nodejs.org/en/blog/release/v22.23.1/
- Vercel supported Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- GitHub Actions secure-use reference: https://docs.github.com/en/actions/reference/security/secure-use
- GitHub deployment environments and protection rules: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- GitHub deployment concurrency and environment controls: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- Supabase database migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase environment management: https://supabase.com/docs/guides/deployment/managing-environments

## Decisions derived from the research

### Node.js and npm

Vercel exposes Node.js major-version selection and automatically advances minor and patch releases. Therefore production compatibility must not require one exact Vercel patch forever.

The repository contract is:

- local and GitHub Actions validation use Node.js `22.23.1` and npm `10.9.8` exactly;
- deployable runtimes must satisfy Node.js `>=22.23.1 <23` and npm `>=10.9.8 <11`;
- `.nvmrc` remains the exact local/CI version;
- `package.json` remains the compatible production range;
- `.npmrc` uses `engine-strict=true` so an incompatible install fails instead of emitting a non-blocking warning;
- a runtime verifier validates that all declarations agree.

This avoids both under-pinning CI and over-pinning a Vercel patch that Vercel does not expose as a stable project setting.

### GitHub Actions

Third-party actions must be pinned to full-length commit SHAs. Workflows must use read-only repository permissions unless a narrower job explicitly requires more. Production-sensitive jobs must use a protected environment and concurrency control. The exact checked-out source SHA must be verified before evidence collection.

### Supabase migrations

Remote schema changes must be represented by committed migration files. The release gate must never use `migration repair`, insert or update rows in `supabase_migrations.schema_migrations`, create checkout-only migration placeholders, or derive an executable migration from production during a release run.

A live mismatch is classified and reported. It is not fixed by the gate.

## Scope

The branch may add or modify only the following categories:

- this design document and supporting release-integrity documentation;
- runtime declaration enforcement;
- deterministic migration-manifest tooling;
- read-only migration-ledger comparison tooling;
- read-only schema-fingerprint export and comparison tooling;
- exact-source release-attestation tooling;
- unit and contract tests for those tools;
- CI workflows that generate evidence or block unsafe promotion;
- retirement of the unsafe production-promotion workflow.

The branch must not include:

- UI, gameplay, authentication-flow, or business-logic changes;
- production or staging database writes;
- RLS policy or database grant changes;
- leaked-password configuration changes;
- Edge Function deployment or deletion;
- index additions or removals;
- seed activation;
- player or game data changes;
- a production deployment.

## Required invariants

### I1. Exact source binding

Every workflow checks out an explicit commit SHA and verifies `git rev-parse HEAD` equals the expected SHA. A user-supplied SHA must be a lowercase 40-character hexadecimal commit and must equal the checked-out workflow ref.

### I2. Read-only live inspection

All live database inspection uses PostgreSQL read-only transaction settings:

- `default_transaction_read_only=on`;
- finite `statement_timeout`;
- finite `lock_timeout`;
- TLS required.

The SQL exporter starts a read-only transaction and rolls it back.

### I3. Repository migration authority

The repository manifest is generated only from `backend/supabase/migrations/*.sql`. Each entry records the timestamp version, canonical name, filename, byte length, and SHA-256 digest. Duplicate versions, invalid filenames, and an empty migration set are fatal.

### I4. Complete ordered ledger comparison

The live ledger is compared against the entire ordered repository manifest, not only its maximum version. The report separately identifies:

- repository migrations missing from the live environment;
- live-only migration versions;
- same-version name mismatches;
- duplicate live versions;
- ordering violations.

A non-empty difference is `UNAPPROVED_DRIFT` and exits non-zero.

### I5. Separate structure and authorization fingerprints

Schema evidence produces independent SHA-256 fingerprints for:

- structural objects: schemas, tables, columns, constraints, indexes, routines, and triggers;
- authorization objects: RLS state, policies, table grants, routine grants, and default privileges.

This prevents an unrelated structural change from obscuring an authorization change.

### I6. No dynamic drift concealment

Release workflows must not contain or invoke any of the following:

- `supabase migration repair`;
- writes to `supabase_migrations.schema_migrations`;
- production-only placeholder migration generation;
- `supabase db pull` against production as part of promotion;
- `supabase db push` before parity succeeds;
- an allow-all or generic drift bypass.

### I7. Sanitized evidence

Artifacts may contain project references, migration identities, object definitions, digests, source SHAs, workflow run IDs, and comparison results. They must not contain passwords, database URLs, access tokens, service-role keys, cookie values, player access codes, or user data.

### I8. Fail-closed promotion boundary

The existing unsafe production-promotion workflow is retired on this branch. Until a later branch adds a mutation phase that consumes a successful release-integrity attestation, production runtime promotion must stop with a clear failure rather than proceed without proof.

### I9. Immutable action references

All external GitHub Actions used by the new or modified workflows are pinned to full-length commit SHAs with a human-readable version comment.

### I10. No hidden environment equivalence

Staging and production project references are explicit and distinct. URL validation must prove that each database URL belongs to the expected project before a connection is used.

## Evidence formats

### Migration manifest

Schema: `econovaria.release-integrity.migration-manifest.v1`

Required fields:

- `sourceSha`;
- `migrationRoot`;
- `manifestSha256`;
- `migrations[]` with `version`, `name`, `filename`, `bytes`, and `sha256`.

### Ledger report

Schema: `econovaria.release-integrity.ledger-report.v1`

Required fields:

- `environment`;
- `status` in `PASS`, `UNAPPROVED_DRIFT`, or `ERROR`;
- repository and live counts;
- repository manifest digest;
- ordered lists for every drift category.

### Schema fingerprint

Schema: `econovaria.release-integrity.schema-fingerprint.v1`

Required fields:

- normalized structural evidence;
- normalized authorization evidence;
- `structuralSha256`;
- `authorizationSha256`;
- `overallSha256`.

### Release attestation

Schema: `econovaria.release-integrity.attestation.v1`

Required fields:

- exact source SHA;
- GitHub workflow run and attempt;
- runtime-contract result;
- migration-manifest digest;
- staging ledger result;
- production ledger result;
- staging and production structural fingerprints;
- staging and production authorization fingerprints;
- final status.

An attestation is `PASS` only when every required component is `PASS` and the source SHA is exact.

## Workflow model

### Pull requests and pushes

The static release-integrity job:

1. checks out the exact source;
2. installs Node.js 22.23.1;
3. runs `npm ci` under `engine-strict`;
4. verifies the exact CI runtime contract;
5. runs all release-integrity unit and workflow contract tests;
6. builds the repository migration manifest;
7. uploads sanitized static evidence.

### Manual live parity run

A manually dispatched, protected-environment job:

1. requires an exact source SHA input;
2. checks out and verifies that SHA;
3. validates the staging and production URL project bindings without printing URLs;
4. enables read-only PostgreSQL settings;
5. exports both migration ledgers;
6. compares both ledgers to the repository manifest;
7. exports both schema fingerprints;
8. compares staging and production fingerprints;
9. writes a sanitized attestation;
10. uploads evidence even when the gate fails;
11. performs no mutation.

## Acceptance criteria

The branch is ready for review when:

- the design document exists before implementation commits;
- all new scripts pass syntax and unit tests;
- the runtime verifier passes under Node.js 22.23.1/npm 10.9.8 and rejects incompatible fixture values;
- the migration manifest is deterministic across repeated runs;
- ledger tests cover missing, live-only, name-mismatch, duplicate, and ordering failures;
- schema normalization produces stable hashes regardless of JSON key order;
- authorization-only drift changes only the authorization and overall hashes;
- the unsafe production workflow can no longer mutate a database;
- workflow contract tests reject reintroduction of dynamic migration reconciliation or unpinned actions;
- `git diff --check` passes;
- no production or staging mutation has occurred.

## Rollback

The branch adds validation and retires an unsafe mutation path. Rollback consists of reverting the branch commits. Database rollback is neither required nor permitted because this branch performs no database writes.

Re-enabling the retired promotion workflow without a passing release-integrity attestation is prohibited.

## Follow-on branches

After this branch is merged and live parity is reconciled through a separately authorized operation:

1. `fix/database-access-hardening`
2. `chore/runtime-surface-retirement`
3. `perf/database-index-convergence`

These remain outside this branch to preserve independent rollback and validation boundaries.
