# Backup and Isolated Restore Runbook

This runbook defines the Phase 15 release recovery evidence and later isolated
rehearsals. It does not authorize a production restore, deletion, credential
change, scheduler activation, or object-store mutation. Passing this runbook is
a bounded application-database recovery proof, not a claim of full disaster
recovery.

## 1. Record authority and identities

Record the source release commit, migration head, production source project,
distinct disposable target, operator, approver, workflow run, and evidence
location. For a production backup, `sourceProjectRef` and
`productionProjectRef` are the same; `targetProjectRef` must differ from both.
Stop if the exact commit is not approved or any identity is ambiguous.

Record one disposition for every scope before capture:

- application data: `public` and `private`;
- application schema: `public`, `private`, and schema-only
  `economy_private`;
- provider-managed database backup/PITR;
- managed Auth data and configuration;
- Vault values;
- `supabase_migrations.schema_migrations`;
- `pg_cron` definitions and activation state;
- Supabase Storage metadata;
- Supabase Storage object bytes;
- R2 object bytes and metadata; and
- Edge Function and Vercel release identities.

Do not use “database backup” or “full restore” as shorthand for all of these
independent scopes.

## 2. Capture one dump-bound application snapshot

Create one `--data-only --use-copy` dump for `public` and `private`. `pg_dump`
provides the internally consistent source snapshot for that file. Hash the
exact dump and derive the source comparator from those bytes with
`compare-copy-data-evidence.mjs emit`. Do not query live source tables later to
manufacture source counts or checksums: that would no longer describe the
backup being restored.

The dump evidence must cover every emitted `COPY` table, its ordered column
list, exact row count, deterministic row-multiset SHA-256, and sequence state.
It must also record the dump SHA-256, byte size, total table/row/sequence
counts, content SHA-256, and evidence SHA-256. A table with zero rows must
remain represented by its `COPY` section. Failure to parse any non-wrapper SQL
or a duplicate/malformed object blocks the recovery gate.

The schema and other supplemental exports may be separate logical files and
must carry their own hashes; do not claim they share the application-data
dump's snapshot. The restore data comparison is authoritative only for the
exact application-data dump.

Capture schema, ownership, grants, RLS, policies, default privileges, and
routine definitions for `public`, `private`, and `economy_private`.
`economy_private` is schema-only; do not add it to the application-data dump.

## 3. Capture separate recovery scopes

Keep the following evidence separate from the snapshot-bound application-data
comparison:

- Record Supabase managed-backup/PITR state and latest completed recovery point.
  This is provider evidence; its backup bytes are not part of the GitHub
  artifact.
- Export and digest the migration ledger explicitly. Never infer applied
  migrations from schema similarity.
- Capture sanitized `pg_cron` job identity, schedule, database, active state,
  and command digest. Do not place raw commands in public evidence. An isolated
  restore must leave jobs inactive; reactivation is a separately authorized
  production step.
- Exclude Vault secret values. Record only approved secret names/versions or a
  custodian reference, and restore values from the separately approved secret
  authority.
- Treat Supabase Storage metadata as managed database scope. PostgreSQL dumps
  do not contain Storage object bytes; capture a separate object inventory and
  recovery reference.
- Treat R2 objects and metadata as a separate object-store scope. Capture an
  inventory/digest and recovery reference; never imply that the logical
  database artifact contains those bytes.
- Treat managed Auth data as current-version platform scope. An
  application-table restore does not prove Auth recovery.
- Record the immutable Git commit, Edge Function inventory, Vercel deployment,
  domains, and configuration-name manifest. Secret values remain excluded.

## 4. Package, encrypt, and retain

Create the internal manifest before encryption. It must include every file
SHA-256 and size, the application-data dump SHA-256, source comparator evidence
SHA-256, source commit, migration head, scope dispositions, and timestamps.

Encrypt with the GitHub `production` environment secret
`PHASE15_BACKUP_ENCRYPTION_KEY_V1`. Never derive this key from a Supabase token,
database URL, source commit, or other rotatable operational credential. Never
print or upload the key.

Upload the ciphertext as the Phase 15 release recovery artifact with **90-day**
retention. Record artifact ID, artifact name, GitHub artifact digest,
ciphertext SHA-256, byte size, expiry, and the key reference. Set the key's
`retainWithoutRotationUntil` to the artifact expiry. Do not overwrite or delete
V1 while a V1 artifact remains; introduce V2 under a new secret name.

This release artifact is separate from the daily/weekly/monthly retention
program in `backup-retention-policy.md` and does not prove that recurring
program is active.

## 5. Verify custody from a fresh runner

After upload, start a new GitHub-hosted job using the `production` environment.
It must have no plaintext files or generated key file from the capture runner.
The verifier must:

1. download the artifact by exact run and artifact ID;
2. verify the GitHub artifact digest and ciphertext SHA-256;
3. decrypt with `PHASE15_BACKUP_ENCRYPTION_KEY_V1`;
4. verify the plaintext archive SHA-256;
5. extract into a new temporary directory;
6. verify the internal manifest and every included file hash; and
7. publish only sanitized digest, identity, timestamp, and pass/fail evidence.

Failure or absence of this fresh-runner check blocks the recovery gate.

## 6. Restore only to an isolated target

Independently verify the archive and target identity. Restore roles and
application schema using the documented current-version Supabase target
profile, then restore the dump-bound `public` and `private` data. Restore
the migration ledger through its explicit procedure. Recreate cron definitions
inactive; do not start production schedules in the disposable target.

Do not insert application data into `economy_private`. Restore only its schema
objects and authorization facts. Reconstitute managed or external scopes only
when the rehearsal explicitly includes their separately approved procedure.

## 7. Compare source and restored state

Dump restored `public` and `private` data with the same data-only/COPY profile,
derive its evidence, and compare that evidence with the source dump evidence.
Require:

- identical `public`/`private` table inventory;
- identical row count and row digest for every table;
- identical migration-ledger identity;
- exact application schema comparison for `public`, `private`, and
  `economy_private`, including ownership, grants, RLS, policies, and default
  privileges; and
- zero canonical referential-integrity failures.

Run [`scripts/restore-integrity-checks.sql`](../../scripts/restore-integrity-checks.sql)
as a supplemental canonical count and referential-integrity check. It does not
replace the dump-bound all-table comparator.

Also verify the exact Edge source/release identity and run connected Admin,
Player desktop, and Player mobile smoke tests when the isolated environment
supports those surfaces.

Record managed backup, Auth, Vault, cron, Supabase Storage metadata, Storage
blob, and R2 dispositions separately. A recorded exclusion or inventory is not
a successful byte restore.

## 8. Finalize evidence without overstating recovery

Record start/end timestamps, measured RPO/RTO, failures, manual interventions,
artifact and target identities, fresh-runner decrypt evidence, scope
dispositions, and smoke evidence. Confirm production was not modified and scan
the evidence package for credentials, tokens, access codes, internal
identifiers, sensitive payloads, and encryption material.

Repository validation proves that the contract is present and fail-closed.
Phase 15 recovery readiness requires connected workflow evidence. Full
disaster-recovery readiness requires separate successful recovery evidence for
every managed and object-store scope listed above.
