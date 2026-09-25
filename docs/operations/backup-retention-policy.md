# Backup Retention and Recovery Objectives

This policy separates the Phase 15 release recovery point from the broader,
recurring disaster-recovery program. A successful Phase 15 logical export and
isolated restore proves a bounded application-database recovery path. It does
not, by itself, prove full disaster recovery for Supabase Auth, Vault,
Supabase Storage object bytes, R2 objects, Edge Function configuration, Vercel,
or provider-managed backups.

## Recovery objectives

The objectives below are operational targets. They are not evidence that the
corresponding recurring controls are already enabled.

| Recovery domain | Target RPO | Target RTO | Recovery authority |
| --- | ---: | ---: | --- |
| Application schema, migration ledger, and economic data | 24 hours | 4 hours | Encrypted logical recovery points plus provider-managed database recovery |
| Supabase Auth identities and configuration | 24 hours | 6 hours | Provider-managed/current-version recovery and approved configuration authority |
| Supabase Storage metadata | 24 hours | 8 hours | Provider-managed database recovery |
| Supabase Storage object bytes | 24 hours | 8 hours | Separate object inventory and object recovery procedure |
| R2 object bytes and metadata | 24 hours | 8 hours | Separate R2 inventory and object recovery procedure |
| Edge Functions and web release | One approved release | 2 hours | Immutable Git source and recorded deployment identity |

## Phase 15 release recovery point

- Retain the encrypted Phase 15 release artifact for **90 days** in GitHub
  Actions. Record its artifact ID, GitHub artifact digest, ciphertext SHA-256,
  byte size, exact source commit, migration head, creation time, and expiry.
- The application-data export contains data from `public` and `private` only.
  `economy_private` is schema-only. Its routines, grants, ownership, and other
  schema facts are covered by the schema comparison, not by a data dump.
- Derive the source comparator directly from the exact `application-data.sql`
  produced by the internally snapshot-consistent `pg_dump` operation. Bind the
  evidence to that file's SHA-256 and parse every `COPY` table, ordered column
  list, row multiset, and sequence state in `public` and `private`. Do not use
  later live counts as a proxy for the dump. The restored dump comparator must
  match every source table, row count, row-multiset digest, and sequence state.
- Encrypt with the versioned GitHub `production` environment secret
  `PHASE15_BACKUP_ENCRYPTION_KEY_V1`. The secret value must never enter an
  artifact, log, repository file, command trace, or evidence JSON.
- Do not rotate, overwrite, or delete `PHASE15_BACKUP_ENCRYPTION_KEY_V1` while
  any artifact encrypted with V1 remains retained. A successor key uses a new
  versioned name; retain V1 until the last V1 artifact expires and its final
  recoverability check is complete.
- After upload, a fresh GitHub-hosted runner using the `production` environment
  must download the retained artifact, verify the GitHub artifact digest and
  ciphertext SHA-256, decrypt it, verify the plaintext/archive and internal
  manifest hashes, and publish sanitized pass/fail evidence. Same-runner
  encryption/decryption is an implementation check, not the custody proof.

The 90-day release artifact is a one-release control. It does not satisfy the
recurring retention targets below.

## Recurring retention targets

When the recurring backup service, approved storage, and cost controls are in
place:

- retain at least seven daily encrypted recovery points;
- retain four weekly recovery points;
- retain one monthly recovery point for twelve months;
- keep a recoverable copy outside the source platform and outside the
  credentials needed to administer that platform; and
- run an isolated restore rehearsal at least quarterly and after a material
  recovery-procedure change.

Provider-managed backup or PITR retention follows the purchased Supabase plan
and must be recorded independently. A logical artifact must never be described
as enabling PITR or as extending provider-managed retention.

## Scope ledger

Every recovery point and rehearsal must disposition these scopes separately:

| Scope | Phase 15 logical artifact treatment |
| --- | --- |
| Application data | Dump-bound data for `public` and `private` |
| `economy_private` | Schema only; no application-data rows |
| Managed database backup/PITR | Observed and recorded separately; no provider backup bytes are in the GitHub artifact |
| Vault | Secret values excluded; restore from a separately approved authority |
| Migration ledger | Captured and verified separately from application tables |
| `pg_cron` | Definitions and activation state captured and verified separately; isolated restores stay inactive |
| Supabase Storage metadata | Managed database scope, separate from application-data proof and object bytes |
| Supabase Storage object bytes | Not in a PostgreSQL logical dump; require separate inventory and recovery evidence |
| R2 objects | Not in a PostgreSQL logical dump; require separate inventory and recovery evidence |
| Auth managed data | Current-version managed-platform recovery scope; not proved by the application-table comparator |
| Edge Functions and Vercel | Reconstituted from immutable release/deployment identities, not from the database artifact |

## Safety and evidence gates

- Source, isolated target, and production guard identities must be explicit.
  The isolated target must differ from production; for a production recovery
  point, the source and production guard are expected to be the same project.
- Backup capture is read-only. Restore execution requires separate approval and
  targets only a disposable, isolated environment.
- Record schema, ownership, grants, RLS, default privileges, migration ledger,
  scheduler disposition, and dump-bound all-table data comparison.
- Record excluded and separately recovered scopes without relabeling them as
  restored. Inventory evidence is not object-byte recovery evidence.
- Evidence must remain sanitized and must identify failures and manual
  interventions. Never retain archive bytes, credentials, connection strings,
  access codes, or encryption material in the repository.
- Production promotion and production restore remain separately authorized
  operations.
