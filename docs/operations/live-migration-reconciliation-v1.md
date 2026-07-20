# Live schema and migration reconciliation v1

**Date:** 2026-07-20  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Branch:** `agent/live-migration-reconciliation-v1`  
**Pull request:** #282  
**Synchronized main:** `906050e6b963332e2a8ae8af4df395b0d0107db0`  
**Environment posture:** live project read-only; no production mutation authorized

## 1. Scope and authority

This document owns the database-truth and migration-reconciliation tranche for:

- `OPS-STAGE-001` — repository migration replay and integrity;
- `OPS-STAGE-002` — connected live schema and configuration evidence;
- `OPS-STAGE-003` — isolated-staging application and three-way comparison;
- the isolated-staging evidence portion of `BETA-BANK-004`.

This branch does not edit the authoritative roadmap. It does not modify the live production database, migration ledger, Auth configuration, grants, policies, functions, Edge Functions, or application data.

## 2. Executive result

The earlier 66-identity catalog was a stale pre-synchronization view. A real checkout of current `main` found **70 repository migrations**. Exact version/name comparison against the connected live migration ledger produced:

| Disposition | Count | Meaning |
|---|---:|---|
| Matched identity | 43 | Same migration version and name exist in repository and live ledger. Repository SHA-256 is recorded; live stored-statement MD5 remains available for historical evidence. |
| Live-only identity | 10 | Live contains a version identity absent from the repository. Each has been paired with a same-name repository migration and explicitly reviewed. |
| Repository-only identity | 27 | Repository migration is absent from the live ledger under its current version identity. |
| Total repository identities | 70 | Every repository file has an exact SHA-256 value. |
| Total live identities | 53 | Every live ledger identity has an explicit disposition. |

The exact comparison is intentionally blocking. The repository and live database must not be treated as migration-identical.

## 3. Clean repository replay

A disposable Supabase stack replayed all 70 repository migrations from zero twice.

| Check | Result |
|---|---|
| Migration source validation | Passed |
| First clean reset | Passed |
| Second clean reset | Passed |
| Database lint at warning level | Passed |
| Canonical snapshot equivalence | Passed |
| Difference count | 0 |
| Canonical schema SHA-256 | `eca6e8a03c79b3a473129a17234d9ec0741d576aca6d4f96ecfc49e5eb3e09a5` |
| Migration manifest SHA-256 | `8c30419372bf5f8fcf4872c72e6c574fb6111e91344ec75fe50726b2bff72c9f` |

The clean replay snapshot contains:

- 103 relations in included schemas;
- 1,199 columns;
- 771 constraints;
- 365 indexes;
- 2 policies;
- 40 public functions;
- 31 non-internal triggers;
- 70 migration-ledger rows.

Evidence:

- `docs/operations/evidence/live-migration-reconciliation-v1/clean-replay-schema.json`
- `docs/operations/evidence/live-migration-reconciliation-v1/clean-replay-determinism.json`
- `docs/operations/evidence/live-migration-reconciliation-v1/clean-replay-summary.json`
- `docs/operations/evidence/live-migration-reconciliation-v1/repository-migration-sha256.json`

## 4. Exact migration identity reconciliation

The authoritative machine-readable ledger is:

`docs/operations/evidence/live-migration-reconciliation-v1/migration-reconciliation-final.json`

It contains all repository and live identities, repository file paths, repository SHA-256 values, live stored-statement checksums, status, content-review state, and recommended disposition.

### 4.1 Ten live-only identities

The ten live-only versions are not unreviewed or orphaned. Each has the same migration name as a repository migration under a different version:

| Live version | Repository version | Name | Statement review |
|---|---|---|---|
| `20260713144033` | `20260713193000` | `create_admin_audit_log_flags_v1` | Content differs; schema-effect comparison required. |
| `20260713144209` | `20260713194500` | `issue_contract_rewards_atomic_v1` | Content differs; function and invariant comparison required. |
| `20260713223157` | `20260714224000` | `harden_admin_data_api_tables_v1` | Stored statement and repository file SHA-256 are identical. |
| `20260713223526` | `20260713223000` | `complete_admin_control_surfaces_v1` | Stored statement and repository file SHA-256 are identical. |
| `20260713224905` | `20260714233000` | `harden_security_definer_rpc_privileges_v1` | Content differs; grants and function-security comparison required. |
| `20260713225007` | `20260714234500` | `index_admin_control_surface_foreign_keys_v1` | Content differs; index comparison required. |
| `20260714072030` | `20260714235950` | `add_configurable_player_identity_v1` | Content differs; columns, constraints, functions, and backfill comparison required. |
| `20260714072127` | `20260715001000` | `harden_configurable_player_identity_rpc_grants_v1` | Content differs; execute-grant comparison required. |
| `20260714073723` | `20260715002000` | `fix_player_identity_rpc_column_ambiguity_v1` | Content differs; effective function comparison required. |
| `20260714113345` | `20260715003000` | `add_story_notification_tables_v1` | Content differs; tables, constraints, RLS, grants, and later hardening effects require comparison. |

Detailed SHA-256 evidence and disposition:

`docs/operations/evidence/live-migration-reconciliation-v1/live-renumbered-identity-review.json`

Two pairs are statement-identical and represent version-identity drift only. Eight pairs have same-name content drift. None authorizes a live ledger rewrite. None authorizes blindly replaying the repository counterpart into production.

### 4.2 Repository-only identities

The 27 repository-only versions comprise:

- three pre-existing repository migrations absent from the live ledger: storyline schema, Contracts schema, and demo-story seed RPC;
- ten current repository versions paired with the renumbered live identities above;
- `20260717090000_harden_story_notification_scope_v1.sql`;
- thirteen later Player, Inventory, rate-limit, market-calendar, Store, banking-idempotency, and game-lifecycle migrations.

Each remains staging-only until ordered isolated application and schema-effect review.

## 5. Connected live catalog evidence

The read-only live audit recorded:

- 9 included schemas;
- 91 catalog relations in the original summary boundary;
- 1,084 columns;
- 652 constraints;
- 324 indexes;
- 117 catalog functions, including 20 public functions in the canonical exporter scope;
- 32 original trigger records, including 30 non-internal triggers in the canonical exporter scope;
- 1,570 table-grant rows;
- 53 live migration identities;
- 10 active Edge Functions.

All 48 public tables had RLS enabled. None had forced RLS. Only two public policies were observed. `anon` and `authenticated` retained broad table privileges on 37 public tables. These are evidence-backed access-control findings, not changes made by this PR.

The deployed `server` and `admin-api-staging` Edge Functions had platform JWT verification disabled at capture time and require explicit exposure and route-level authorization review.

## 6. Auth metadata boundary

The repository includes a redacted Management API exporter for Auth configuration and Edge Function inventory:

`scripts/operations/live-migration-reconciliation/export-management-metadata.sh`

The connected tool boundary used for this audit did not expose the full Auth Management API configuration. Therefore:

- Auth user/session table inventory was observed read-only;
- provider, redirect, password, leaked-password, MFA, SMTP, and token configuration remains pending redacted export;
- no Auth configuration was changed;
- `OPS-STAGE-002` remains in progress.

## 7. BETA-BANK-004 isolated retry proof

The isolated-only probe is:

`scripts/operations/live-migration-reconciliation/verify-idempotent-staff-ledger-adjustment.sql`

It is transaction-wrapped and requires all of the following:

1. first invocation returns `applied`;
2. identical retry returns `replayed`;
3. both responses return the same ledger-entry and account-balance identifiers;
4. ledger row count changes by exactly one;
5. account balance changes by exactly the requested amount once;
6. exactly one completed idempotency row exists;
7. same key with changed payload raises `LEDGER_IDEMPOTENCY_CONFLICT`;
8. final rollback restores the isolated fixture state.

The repository migration `20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql` has SHA-256:

`3192a644524969440bc0966d83bcd7e67d7b280f363d9aa4f4185636c6066ecb`

The probe was not executed against production. It remains ready for the isolated staging database supplied by Chat 2.

## 8. Required isolated-staging sequence

Once an isolated project or restored database is supplied:

1. record the project reference, source backup, restoration point, and environment owner;
2. verify the target is not production;
3. apply all 70 repository migrations in version order from a clean or documented restored baseline;
4. run migration replay validation and database lint;
5. export the isolated canonical schema;
6. export the connected live canonical schema using the same exporter and visibility role;
7. compare repository-clean, live, and isolated snapshots;
8. review tables, columns, constraints, indexes, grants, RLS enable/force state, policies, functions, triggers, extensions, and migration history;
9. capture redacted Auth metadata and deployed Edge Function metadata;
10. execute the `20260719193000` retry probe;
11. rehearse rollback/restoration;
12. classify every difference as expected environment metadata, renumbered-equivalent, content-divergent, missing, extra, or corrective-action candidate.

## 9. Correction policy

A forward-only correction may be proposed only when all of these are true:

- the discrepancy reproduces in isolation;
- the expected repository effect is explicit;
- the live and isolated effective schema definitions are captured;
- the correction is idempotent or safely guarded;
- grants, RLS, function security, data backfill, and rollback impact are reviewed;
- the migration does not rewrite historical identities;
- the correction passes clean replay and isolated rehearsal.

No corrective migration is included in PR #282.

## 10. Current status

| Roadmap item | Status |
|---|---|
| `OPS-STAGE-001` | Repository SHA-256 manifest complete; two clean replays and canonical deterministic snapshot complete. Exact live identity drift remains blocking. |
| `OPS-STAGE-002` | Live catalog and deployment inventory captured; full canonical live export and redacted Auth configuration remain open. |
| `OPS-STAGE-003` | Blocked: no isolated Supabase branch or restored staging database exists. |
| `BETA-BANK-004` staging evidence | Probe prepared and repository migration replayed cleanly; connected isolated retry proof remains open. |

## 11. Safety attestation

During this tranche:

- no production migration was applied;
- no production SQL write was executed;
- no migration-ledger row was changed;
- no grant, policy, RLS state, function, trigger, extension, Auth setting, Edge Function, or application record was modified;
- no authoritative-roadmap file was edited;
- no replacement branch or pull request was created.
