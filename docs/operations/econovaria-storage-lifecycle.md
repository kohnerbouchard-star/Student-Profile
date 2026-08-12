# Econovaria storage and license lifecycle

This document is the repository authority for raw stock tick archival, compact candle retention, license expiration, hard-confirmed game deletion, and storage health monitoring.

## Architecture

```text
Stock runtime (1-minute market ticks)
  -> PostgreSQL hot tail
  -> stock-tick-archiver
  -> R2 Parquet object
  -> HEAD + full GET + SHA-256 verification
  -> verified archive manifest
  -> guarded PostgreSQL purge
  -> 5-minute and hourly candles
  -> daily rollup and bounded candle retention
```

R2 objects are game-scoped:

```text
<environment>/game_session=<uuid>/year=<yyyy>/month=<mm>/day=<dd>/hour=<hh>/ticks.parquet
```

The complete prefix for one game can therefore be deleted without touching another game:

```text
<environment>/game_session=<uuid>/
```

## Retention contract

- Raw one-minute ticks remain in PostgreSQL as a bounded hot tail. The archive state defaults to four hours, and the latest occupied clock hour is retained for compatibility with current-tick readers.
- Five-minute candles remain for 48 hours.
- Hourly candles remain for 30 days.
- Daily candles are the long-term compact chart history.
- Raw archived ticks remain in R2 until the corresponding game is hard-confirmed for deletion.
- `cron.job_run_details` remains for seven days.
- `pg_net` response history uses the extension-managed TTL.

## Required Edge Function secrets

Set these names in every hosted environment. Never commit their values.

```text
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

The workers also use the hosted Supabase-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values.

## Edge Function authorization

Both functions use custom database-owned scheduler authentication, so Supabase platform JWT verification must remain disabled.

- `stock-tick-archiver` validates the Vault-held `econovaria-stock-runtime-scheduler-v1` token through `verify_runtime_scheduler_token_v1`.
- `game-data-purger` validates the dedicated Vault-held `econovaria-game-data-purge-scheduler-v1` token through the same private verifier.
- Neither endpoint accepts a browser session as authorization.

## Environment configuration after migration

The migrations are environment-neutral. Run these once per hosted environment after deploying the functions and secrets. Substitute the real project ref and environment name.

```sql
select public.configure_game_data_purge_environment_v1(
  'staging',
  'econovaria-stock-history'
);

select public.configure_stock_tick_archive_scheduler_v1(
  'https://<project-ref>.supabase.co/functions/v1/stock-tick-archiver'
);

select public.configure_stock_candle_retention_scheduler_v1();
select public.configure_game_license_expiration_scheduler_v1();

select public.configure_game_data_purge_scheduler_v1(
  'https://<project-ref>.supabase.co/functions/v1/game-data-purger'
);

select public.configure_runtime_history_retention_scheduler_v1();
select public.configure_platform_storage_health_scheduler_v1('staging');
```

Use `production` instead of `staging` for production. All configure functions replace the matching named cron rather than accumulating duplicate jobs.

The stock runtime scheduler must already exist before configuring archival because both stock functions deliberately share the same Vault scheduler credential.

## Purge authority is explicit

A generic migration must not decide which human operator receives destructive authority. Grant `game.purge` separately to an active `game_admin` through an audited administrative operation:

```sql
insert into public.staff_permission_grants (
  staff_user_id,
  permission,
  granted_at,
  granted_by_staff_user_id,
  reason
)
values (
  '<authorized-staff-uuid>',
  'game.purge',
  clock_timestamp(),
  '<authorizing-staff-uuid>',
  'Authorized hard-confirmed game data purge operator'
)
on conflict (staff_user_id, permission) do nothing;
```

## License expiration

`purchase_codes.license_duration_days` is optional and bounded from 1 through 3650 days. When present, a new entitlement receives `license_expires_at` from its activation timestamp. Existing entitlements with no explicit duration remain non-expiring.

The hourly expiration job:

1. Changes the entitlement to `expired`.
2. Disables or pauses the game and revokes the join code.
3. Creates a non-destructive purge-review request for non-protected games.
4. Sets purge eligibility seven days after license expiration.

Renewing the license before destructive execution cancels eligible, review, or confirmed requests.

## Hard-confirmed deletion sequence

No license event directly deletes data.

1. The license must be expired and the seven-day grace period complete.
2. An authorized operator generates a deterministic review manifest.
3. The manifest lists each direct table in child-before-parent order, row counts, indirect cascades, the exact R2 bucket/prefix, preserved canonical tables, and integrity blockers.
4. The manifest receives a SHA-256 review hash.
5. The global lever is armed only with the exact phrase:

   ```text
   ARM GAME DATA PURGE FOR 2 HOURS
   ```

6. A game-specific confirmation is issued. It includes the game UUID, the review-hash prefix, and a random challenge.
7. Confirmation cannot occur for 60 seconds and expires after 30 minutes.
8. Confirmation recomputes the manifest. Any changed row count, blocker, registry, FK graph, or delete order rejects the confirmation.
9. The worker deletes only the exact R2 game prefix and verifies that it is empty.
10. Database rows are deleted in resumable 20-table transactions.
11. Entitlement and `game_sessions` deletion occurs only in the atomic finalizer.
12. A completed receipt survives after the game is gone.
13. The global lever automatically disarms after one successful purge.

The canonical source game is `data_purge_protected=true` and cannot enter this flow.

## Current deterministic schema contract

The contract on current `main`, including `story_cash_adjustments` and `story_event_execution_claims`, is:

```text
registry tables:       135
registry SHA-256:       6eb63825741b7118bc5acdc2ecef45101e7963b502ee3b0daf2b5f05a33d3f31
foreign-key edges:     216
FK graph SHA-256:       0f48f84c8fd0e71f2cbbfba90f2ded8bba0e6b0a8842e92add335dabb4314840
direct delete tables:  131
delete-order SHA-256:   8c60cbaf1ad690cfaf1f360148fb36035ec6492e232c8d8fc3d642961ecf4a0a
finalize cursor:        132
```

The earlier live-only contract was 133 tables / 213 edges / 129 direct deletes. It fails closed after the two new Story tables appear. The repository worker and canonical migration intentionally use the new current-main contract.

Whenever a migration adds or removes a game-scoped table or relevant FK, update all of the following in one reviewed change:

- `private.game_data_purge_table_registry` generation result
- `private.game_data_purge_delete_order_v1`
- SQL fingerprint constants
- `backend/supabase/functions/game-data-purger/index.ts`
- this runbook

Do not weaken a fingerprint or bypass schema drift merely to make a purge proceed.

## Health thresholds

`run_platform_storage_health_check_v1` maintains one constant-size snapshot per environment.

| Metric | Warning | Critical |
|---|---:|---:|
| Database | 350 MiB | 450 MiB |
| Raw tick relation | 150 MiB | 250 MiB |
| Candle relation | 200 MiB | 300 MiB |

A failed or stuck purge is critical. Stuck archives, pending confirmation, purge-eligible expired licenses, untracked expired entitlements, missing/inactive required crons, or recent cron failures are warnings.

## Verification

```sql
select public.get_game_data_purge_registry_digest_v1();
select public.get_game_data_purge_fk_graph_digest_v1();
select public.get_game_data_purge_delete_order_digest_v1();
select public.get_platform_storage_health_v1();

select jobid, jobname, schedule, active
from cron.job
where jobname like 'econovaria-%'
order by jobname;

select status, count(*), sum(row_count), sum(compressed_bytes)
from private.stock_tick_archives
group by status
order by status;

select timeframe, count(*), min(bucket_start), max(bucket_start)
from public.stock_price_candles
group by timeframe
order by timeframe;
```

A normal idle purge-worker response is:

```json
{"ok":true,"work":false,"reason":"no_confirmed_armed_purge"}
```

## Live migration lineage

The original containment was installed live before repository reconciliation. Production and staging therefore have different historical migration IDs for equivalent final behavior. Those one-time live IDs are evidence, not replay inputs. The repository migrations beginning `20260813100000` are the forward-only canonical path.

Never edit the hosted `supabase_migrations.schema_migrations` ledger to make the histories appear identical. Use the repository reconciliation migrations and normal migration tooling.
