# Live migration reconciliation tooling

## Phase 15 extension (2026-09-20)

`phase15-audit.mjs` reuses the migration loader to produce conservative three-way identity classifications. `verify-immutable-manifest.mjs` binds frozen checksums to Git and rejects changed, deleted, renamed or backdated migrations. `export-effective-schema-v2.sql` extends the established release exporter to `economy_private`; pair it with `export-runtime-catalog-v2.sql`. Database Replay captures both twice and compares deterministic fingerprints. Ordinary PR checks require no live credentials.

The active parity contract is `docs/operations/contracts/database-parity-v1.json`; its incomplete certification fields deliberately remain null while Phase 15A is blocked. Evidence and interpretation are in `docs/operations/evidence/phase15-live-parity/2026-09-20/README.md`.

The historical `apply-pending-via-psql.sh` and `normalize-outer-transactions.py` are not approved Phase 15 mutation tools. The former contains 71-migration-era ledger-writing assumptions; the latter rewrites source. Preserve their history and use only a separately reviewed, forward-only convergence sequence after the hard gates pass.

This directory is intentionally read-only with respect to the connected environment. None of these tools applies migrations, changes a migration ledger, modifies Auth, changes grants or policies, deploys Edge Functions, or writes application data.

## Required sequence

1. Export a clean repository replay after all repository migrations succeed.
2. Export the connected live schema using `export-live-schema.sql`.
3. Export redacted Auth configuration and the Edge Function inventory using `export-management-metadata.sh`.
4. Reconcile migration identities and repository SHA-256 values using `reconcile-migrations.mjs`.
5. Compare the clean replay to the live export using `compare-schema-snapshots.mjs`.
6. Once Chat 2 supplies an isolated restored environment, export it with the same SQL and compare it to both the clean replay and live export.
7. Run the BETA-BANK-004 retry probe only against isolated staging.

## Commands

```bash
node scripts/operations/live-migration-reconciliation/reconcile-migrations.mjs --self-test

psql "$LIVE_DATABASE_READONLY_URL" -X \
  -f scripts/operations/live-migration-reconciliation/export-live-schema.sql \
  > .tmp/live-migration-reconciliation/live-schema.json

node scripts/operations/live-migration-reconciliation/reconcile-migrations.mjs \
  --repo-dir backend/supabase/migrations \
  --live-snapshot .tmp/live-migration-reconciliation/live-schema.json \
  --out .tmp/live-migration-reconciliation/migration-reconciliation.json

node scripts/operations/live-migration-reconciliation/compare-schema-snapshots.mjs \
  --left .tmp/live-migration-reconciliation/clean-replay-schema.json \
  --right .tmp/live-migration-reconciliation/live-schema.json

SUPABASE_ACCESS_TOKEN='scoped-token' \
SUPABASE_PROJECT_REF='project-ref' \
scripts/operations/live-migration-reconciliation/export-management-metadata.sh \
  .tmp/live-migration-reconciliation/management
```

For the isolated BETA-BANK-004 probe:

```bash
psql "$ISOLATED_DATABASE_URL" -X \
  -v game_session_id="$ISOLATED_GAME_SESSION_ID" \
  -v player_id="$ISOLATED_PLAYER_ID" \
  -v staff_user_id="$ISOLATED_STAFF_USER_ID" \
  -f scripts/operations/live-migration-reconciliation/verify-idempotent-staff-ledger-adjustment.sql
```

The probe performs one adjustment, replays the identical request, verifies one ledger delta and one balance delta, verifies one completed idempotency row, checks conflicting reuse fails, emits a compact evidence object, and rolls back the transaction.

## Evidence handling

- Never commit database credentials, access tokens, connection strings, raw Auth provider secrets, production row data, or unreviewed Management API output.
- The Management API script performs broad key-name redaction, but a human must review the output before it is committed.
- Schema snapshots contain definitions and grants. Store them under the dedicated operations evidence directory only after confirming they contain no row data or secret values.
- A `live-only` or `divergent` migration status is blocking. Do not edit the live ledger. Reproduce the discrepancy in isolation and propose a forward-only correction.
