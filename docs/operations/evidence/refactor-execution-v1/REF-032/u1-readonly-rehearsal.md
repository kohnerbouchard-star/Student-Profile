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
