# Live schema and migration reconciliation v1

**Date:** 2026-07-20  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Branch:** `agent/live-migration-reconciliation-v1`  
**Repository baseline audited:** `f44b0735763da6700fc18513fa7026dbd95aff86`  
**Connected Supabase project:** `cgiukdjwicykrmtkhudh` (`ECON SIM`, `ap-northeast-2`)  
**Roadmap scope:** `OPS-STAGE-001`, `OPS-STAGE-002`, `OPS-STAGE-003`, isolated-staging evidence portion of `BETA-BANK-004`

## Safety boundary

This tranche was conducted as a read-only live-environment audit. It did not apply a migration, alter `supabase_migrations.schema_migrations`, modify schema objects, change grants or RLS policies, change Auth configuration, deploy or update an Edge Function, or write application data.

The authoritative roadmap was not edited. This document records evidence and disposition only.

## Executive disposition

The reconciliation covers every migration identity visible in the live migration ledger and every migration identity present in the repository at the audited baseline.

| Disposition | Count | Meaning |
|---|---:|---|
| `matched` identity | 53 | Repository and live ledger contain the same version/name identity. Historical repository SHA-256 comparison remains a deterministic checkout step. |
| `repository-only` | 13 | Migration exists in `main` but is not recorded in the connected live ledger. It is eligible only for ordered isolated-staging replay and verification. |
| `live-only` | 0 | No live ledger identity was found without a repository identity. |
| `divergent` identity | 0 | No same-version/different-name identity was found. |
| `superseded` | 0 | No migration identity was dispositioned as superseded. |

The connected live ledger ends at `20260714113345_add_story_notification_tables_v1`. The repository ends at `20260719200000_add_game_lifecycle_controls_v1.sql`.

The machine-readable ledger is:

`docs/operations/evidence/live-migration-reconciliation-v1/migration-ledger.json`

It records all 66 identities, live statement MD5 values and statement counts, repository Git blob identities for the 13 post-live migrations, expected schema effects, review state, and recommended disposition.

## Repository-only migrations

These migrations must not be applied directly to the connected live project. They must be replayed in version order against a clean database and the isolated restored environment supplied by Chat 2.

| Version | Migration | Repository Git blob | Expected effect | Disposition |
|---|---|---|---|---|
| `20260718064000` | `add_player_stock_watchlist_v1` | `5ecf2bf8d38003c79c911745ed9b0eb0716789ec` | Player watchlist table, scoped FKs, indexes, active-scope trigger, RLS and grants. | Isolated replay required. |
| `20260718083500` | `add_player_notification_public_ids_v1` | `dcbe373ccd4c2609e6c65966a170516cbf0cef6b` | Browser-safe notification and delivery identifiers, constraints and indexes. | Isolated replay required. |
| `20260718112000` | `accept_player_contract_by_key_v2` | `13b8a750f095ced92c24243b5bda4335e2e0bb31` | Atomic service-role Contract acceptance RPC. | Isolated replay required. |
| `20260718113000` | `add_inventory_redemption_player_workflow_v1` | `0e1a79824720363c41242ce0b22936e842bc62e9` | Player redemption request/transition schema and request RPC. | Isolated replay required. |
| `20260718123000` | `add_inventory_redemption_admin_review_v1` | `6eea24fb93434b19f0589e4f1c6fb9d639f78bf4` | Admin review metadata, indexes and review/read RPCs. | Isolated replay required. |
| `20260718173000` | `add_shared_request_rate_limits_v1` | `8ec1680b5614a096e36b4ef8cb801ef2bc236264` | Shared hashed request-rate-limit buckets and atomic consumer RPC. | Isolated replay required. |
| `20260718190000` | `add_pre_auth_rate_limit_rpc_v1` | `43a8ef7fd3c2aba5eeb4b242dcaa098331fae975` | Pre-auth action/IP rate-limit RPC. | Isolated replay required. |
| `20260719120000` | `add_stock_exchange_calendar_runtime_v1` | `b29ed3e63eaa053c7b8e50e9d5907accdead9f60` | Market-session calendar and calendar-gated order RPCs. | Isolated replay required. |
| `20260719133000` | `require_stock_market_timezone_v1` | `abc17d0bba956184b2746fc156c118969219ed25` | Required game-level IANA timezone, validation trigger and game-scoped market decision. | Isolated replay required. |
| `20260719150000` | `add_player_store_public_keys_v1` | `1ca4b691f53a0f7d180f6ba29b26add9a48d0361` | Public Store quote/receipt keys and service-role purchase wrapper. | Isolated replay required. |
| `20260719170000` | `gate_public_store_purchase_by_game_state_v1` | `e780dcc3eb2a8f39bdf243b4f0ece8b820187751` | Game-state mutation gate while preserving completed idempotent replay. | Isolated replay required. |
| `20260719193000` | `add_idempotent_staff_ledger_adjustment_v1` | `0715b732a27eca2f52768fd53f2f2c868a64fc62` | Atomic idempotent staff ledger adjustment and cached replay result. | Isolated replay plus connected retry proof required. |
| `20260719200000` | `add_game_lifecycle_controls_v1` | `9c0c287f907cf946bf5e60527f145a699b626a6e` | Canonical game lifecycle columns, constraints, transition evidence and RPCs. | Isolated replay required. |

No corrective migration is proposed. The observed state is an ordered deployment gap, not evidence of a live-only migration or same-version identity conflict.

## Live catalog inventory

The read-only live catalog query recorded:

| Object class | Count |
|---|---:|
| Non-system schemas | 9 |
| Relations inspected | 91 |
| Columns | 1,084 |
| Constraints | 652 |
| Indexes | 324 |
| RLS policies | 2 |
| Functions | 117 |
| Triggers | 32 |
| Table-grant rows | 1,570 |
| Public tables | 48 |
| Public tables with RLS enabled | 48 |
| Public tables with forced RLS | 0 |

Schemas present:

- `auth`
- `extensions`
- `graphql`
- `graphql_public`
- `public`
- `realtime`
- `storage`
- `supabase_migrations`
- `vault`

Installed extensions observed:

| Extension | Schema | Version |
|---|---|---|
| `plpgsql` | `pg_catalog` | `1.0` |
| `supabase_vault` | `vault` | `0.3.1` |
| `pgcrypto` | `extensions` | `1.3` |
| `pg_stat_statements` | `extensions` | `1.11` |
| `uuid-ossp` | `extensions` | `1.1` |

The complete summary, including Edge Function hashes, is:

`docs/operations/evidence/live-migration-reconciliation-v1/live-environment-summary.json`

The deterministic full schema exporter is:

`scripts/operations/live-migration-reconciliation/export-live-schema.sql`

It exports schemas, installed extensions, relations, columns, constraints, indexes, policies, table and routine grants, public functions, triggers and migration history as canonical JSON without selecting application row data.

## Access-control findings

All 48 public tables have RLS enabled, but no public table has forced RLS.

Only two public policies were present:

| Table | Policy | Role | Command |
|---|---|---|---|
| `staff_users` | `staff_users_select_own` | `authenticated` | `SELECT` |
| `game_sessions` | `game_sessions_select_owned` | `authenticated` | `SELECT` |

The catalog also reports broad table grants:

- `anon` has `DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, `TRUNCATE`, and `UPDATE` on 37 public tables.
- `authenticated` has the same privilege set on 37 public tables.
- `service_role` has that privilege set on all 48 public tables.

These are high-priority review findings because RLS enablement alone does not replace deliberate grant and policy design, and table owners or bypass roles are not constrained by ordinary RLS behavior. This tranche did not alter any grant, owner, role, policy, or RLS setting. Any correction must be independently scoped, reproduced in isolation, and delivered through forward-only migrations.

## Edge Function inventory

Ten active Edge Functions were observed:

| Function | Version | JWT verification | Review disposition |
|---|---:|---:|---|
| `make-server-0dbf686f` | 54 | enabled | Reconcile source and deployment hash. |
| `server` | 225 | disabled | Explicit security review required. |
| `classroom-api` | 23 | enabled | Reconcile against repository artifact. |
| `stock-market-runner` | 6 | enabled | Reconcile against repository artifact. |
| `stock-market-seed-copy` | 3 | enabled | Reconcile against repository artifact. |
| `stock-market-read` | 3 | enabled | Reconcile against repository artifact. |
| `stock-market-trading` | 3 | enabled | Reconcile against repository artifact. |
| `stock-market-player-read` | 1 | enabled | Reconcile against repository artifact. |
| `admin-api` | 14 | enabled | Reconcile against repository artifact. |
| `admin-api-staging` | 3 | disabled | Confirm environment purpose, isolation and exposure before beta. |

The exact deployed bundle SHA-256 values are preserved in `live-environment-summary.json`.

No function was deployed, updated, deleted, or invoked as part of this audit.

## Auth configuration boundary

The connected read-only Supabase tool did not expose the project Auth service configuration. Auth configuration is therefore not claimed as fully captured.

`scripts/operations/live-migration-reconciliation/export-management-metadata.sh` provides a deterministic Management API export for:

- project Auth configuration; and
- Edge Function inventory.

The script performs broad key-name redaction for secrets, passwords, tokens, private values and provider secrets. Its output still requires human review before evidence is committed. The access token and unredacted output must never be committed.

`OPS-STAGE-002` remains open until this redacted Auth export is captured and reviewed.

## Deterministic comparison tooling

The tranche adds:

- `export-live-schema.sql` — canonical catalog and migration-history snapshot.
- `export-management-metadata.sh` — redacted Auth and Edge Function metadata export.
- `reconcile-migrations.mjs` — repository/live migration identity and SHA-256 reconciliation with blocking `live-only` and `divergent` states.
- `compare-schema-snapshots.mjs` — canonical snapshot hashing and bounded structural diff.
- `verify-idempotent-staff-ledger-adjustment.sql` — transaction-wrapped isolated retry/replay proof.
- `README.md` — execution sequence, evidence handling and stop conditions.

The intended three-way comparison is:

1. clean repository replay;
2. connected live schema export; and
3. restored isolated copy supplied by Chat 2.

A snapshot match is based on canonical JSON SHA-256. Capture timestamps are ignored. Any mismatch produces bounded structural paths and blocks promotion until reviewed.

## BETA-BANK-004 isolated retry proof

The target migration is:

`backend/supabase/migrations/20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql`

The prepared isolated-staging probe:

1. requires explicit non-production game, player and staff fixture UUIDs;
2. confirms the target RPC and fixture scope exist;
3. records baseline balance and matching ledger count;
4. sends one staff adjustment;
5. repeats the identical request using the same route and idempotency key;
6. requires `applied` followed by `replayed`;
7. requires the same ledger-entry ID, balance-row ID and returned balance;
8. requires exactly one ledger-entry delta;
9. requires exactly one balance delta;
10. requires exactly one completed idempotency row linked to the ledger result;
11. requires changed payload reuse of the same key to raise `LEDGER_IDEMPOTENCY_CONFLICT`; and
12. rolls the entire probe back.

This proves the migration contract without leaving staging fixture data behind.

The probe is ready but was not run because Chat 2 has not yet supplied an isolated restored environment and fixture identifiers. It must never be run against the connected live project.

## Roadmap disposition

| Item | Current disposition | Evidence still required |
|---|---|---|
| `OPS-STAGE-001` | `IN_PROGRESS` | All 66 identities have an explicit disposition. Complete checkout SHA-256 comparison for the 53 historical live identities, clean replay, and isolated replay. |
| `OPS-STAGE-002` | `IN_PROGRESS` | Catalog and Edge inventory are documented. Capture the complete canonical export and redacted Auth configuration, then review schema, grants, policies, functions and triggers against clean replay. |
| `OPS-STAGE-003` | `BLOCKED_EXTERNAL` | Chat 2 must provide the restored isolated staging database. Then run three-way schema comparison, runtime verification and rollback rehearsal. |
| `BETA-BANK-004` staging evidence | `READY_FOR_ISOLATED_EXECUTION` | Run the prepared transaction-wrapped retry probe in isolated staging and preserve the result. |

No roadmap checkbox or status was changed by this PR.

## Promotion stop conditions

Production promotion is blocked if any of the following is true:

- a live-only migration identity appears;
- a version/name identity diverges;
- repository SHA-256 differs from the reviewed source for a live identity;
- clean replay fails;
- live, clean-replay and isolated snapshots have unexplained structural differences;
- grants, RLS state or policies differ without an approved forward-only migration;
- Auth configuration is not captured and reviewed;
- deployed Edge Function inventory or hashes are unexplained;
- the BETA-BANK-004 isolated retry probe does not prove exactly one ledger and balance outcome;
- rollback and restoration rehearsal is absent; or
- the staging environment is not isolated from production data and credentials.

## Validation performed

The repository-only tooling was validated before publication:

- `node --check` passed for both Node scripts.
- `reconcile-migrations.mjs --self-test` passed.
- `bash -n` passed for the Management API exporter.
- Evidence JSON parsed successfully.
- The migration ledger contains exactly 66 reviewed identities: 53 matched identities and 13 repository-only identities.

## Required next execution

Once Chat 2 supplies isolated staging:

1. replay all repository migrations from a clean database;
2. export the clean replay, connected live schema and restored isolated schema;
3. run migration reconciliation to calculate repository SHA-256 values;
4. run both schema comparisons;
5. capture redacted Auth configuration;
6. reconcile every Edge Function hash with an immutable release artifact;
7. execute the BETA-BANK-004 retry probe;
8. rehearse rollback/restoration; and
9. record exact discrepancies and forward-only proposals without changing the live ledger.
