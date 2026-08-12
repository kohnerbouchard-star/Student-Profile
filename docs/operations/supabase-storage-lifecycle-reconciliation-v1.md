# Supabase storage and game-data lifecycle reconciliation v1

Status: production-derived source reconciliation. The production migration ledger is the canonical historical record. Do not edit the eleven ledger migrations after merge; use new forward-only migrations.

## Scope

This source set records the live architecture that moved raw one-minute stock history out of unbounded Postgres storage while preserving current market operation:

- one-minute stock ticks remain authoritative for the live simulation;
- only the bounded hot window remains in `stock_price_ticks`;
- verified Parquet objects are written to Cloudflare R2 under an environment- and game-scoped prefix;
- raw rows are purged only after object length and SHA-256 verification and manifest registration;
- five-minute candles roll into hourly and daily history under bounded retention;
- license expiration pauses access and creates a reviewable purge candidate after a seven-day grace period;
- destructive game-data deletion requires a deterministic manifest, review hash, global arm, game-specific phrase, cooling period, and an armed request-bound worker;
- platform storage health is measured hourly without retaining an unbounded monitoring history.

The repository contains no R2 objects, live database rows, API tokens, service-role keys, access-key IDs, or secret access keys.

## Canonical production migration identities

| Version | Name | SHA-256 |
|---|---|---|
| `20260812044346` | `stock_tick_hot_cold_archive_foundation_v2` | `35a3c34aa98077850a6bb0a6c2b086902689e6d27cd84f8dd995af848d0f058a` |
| `20260812072131` | `harden_stock_tick_archive_service_contract_v2` | `df8442b8aeef23091e3d090377c5e616416e556cfaae5ab1f72c4069ab2936c9` |
| `20260812072445` | `drop_redundant_stock_tick_asset_desc_index_v1` | `144a04ed0834712f156eba99e8c6e88e320cbd90af39ce429805021090b29bd0` |
| `20260812211829` | `temporarily_drop_stock_tick_ticker_index_for_prod_compaction_v1` | `b05ebd2eccd78d843b515a430828d0c724920392ee652ff02d202c4320b0a4eb` |
| `20260812211914` | `restore_compacted_stock_tick_ticker_index_prod_v1` | `ffb135d20f55fc7826482c03176d6ae13b671e4dff1c03342cc57e096d2f06a9` |
| `20260812212415` | `add_hardened_game_license_purge_foundation_prod_v1` | `54eb4b82ccf3aca66cbab96f693bb6c2a495976593a7e277f8defc5ea7b00a8c` |
| `20260812212602` | `add_hardened_game_purge_internal_contracts_prod_v1` | `2660894752b4ca00a77d37681f3d101d3704ef4e71804ba513bfc703ae531e4b` |
| `20260812212656` | `add_hardened_game_purge_operator_controls_prod_v1` | `c63447cfdcc216f9fb87fcb3478083ed9e7ee6968e0cce8e7f75ef3ded661f90` |
| `20260812213109` | `bound_stock_candle_retention_prod_v1` | `7ebf3852aab62daea0888b1d68af355d85501687297c60d007ec05d86ec35b4c` |
| `20260812213226` | `drop_exact_duplicate_marketplace_reference_indexes_v1` | `b5564d56bbabd007914102752196a483b1dd6a65b5747617eddbc3c65900691d` |
| `20260812214220` | `add_platform_storage_health_monitor_v1` | `f699213adfd861278d0e250d769aa912435d3e469fc0255baa3bbfd7290e1ec1` |

`20260813090000_reconcile_storage_lifecycle_runtime_cleanup_v1.sql` is a forward-only reconciliation migration. It removes the duplicate entitlement-duration trigger, closes two unintended Story `SECURITY DEFINER` RPC grants, adds environment-safe purge configuration, adds a reproducible stock-archive scheduler configurator, and bounds pg_cron run history.

## Required Edge Function configuration

Deploy these functions from the repository:

- `backend/supabase/functions/stock-tick-archiver/index.ts`
- `backend/supabase/functions/game-data-purger/index.ts`

Both functions use `verify_jwt = false` because they implement separate internal scheduler-token authentication. Do not expose them without their custom headers and database-side token verification.

Required Edge Function secret names in each Supabase project:

```text
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

Never place secret values in migrations, source files, documentation, logs, or pull-request comments.

## Post-deployment bindings

Run the following through an authenticated service-role deployment path after migrations and functions are deployed. Substitute the environment and project reference; do not substitute secrets into SQL.

```sql
select public.configure_game_data_purge_environment_v1(
  'production',
  'econovaria-stock-history'
);

select public.configure_stock_tick_archive_retention_scheduler_v1(
  'https://<PROJECT_REF>.supabase.co/functions/v1/stock-tick-archiver'
);

select public.configure_game_data_purge_scheduler_v1(
  'https://<PROJECT_REF>.supabase.co/functions/v1/game-data-purger'
);

select public.configure_game_license_expiration_scheduler_v1();
select public.configure_stock_candle_retention_scheduler_v1();
select public.configure_cron_history_retention_v1();
select public.configure_platform_storage_health_scheduler_v1('production');
```

Use `staging` for the staging purge environment and health scheduler. The purge environment configurator refuses changes while the global purge lever is armed and disarms the lever as part of configuration.

The one-minute stock runtime scheduler is configured separately by its existing runtime deployment contract. Do not reactivate it until the archive function, R2 credentials, archive retention cron, and health check all pass.

## Hard-confirm purge sequence

License expiration never directly deletes game data. It pauses/revokes the game and establishes a purge eligibility date seven days after expiration.

The authorized operator flow is:

1. Generate the v2 review and confirmation challenge with `issue_game_data_purge_confirmation_v2`.
2. Review the deterministic direct-delete order, indirect cascades, finalizer rows, exact R2 prefix, preserved canonical tables, blockers, and `reviewSha256`.
3. Arm the global lever with the exact arm phrase through `arm_game_data_purge_v1`.
4. Wait through the 60-second cooling period.
5. Confirm using `confirm_game_data_purge_v2` and the review-bound phrase.
6. The worker deletes and verifies the game-scoped R2 prefix before any database batch.
7. Database deletion advances in resumable batches and finalizes the entitlement and `game_sessions` root atomically.
8. Completion writes a persistent receipt and automatically disarms the global lever.

Never use the v1 issue/confirm functions for operator deletion. They remain non-executable by `service_role` so the manifest-bound v2 path is mandatory.

Current safety fingerprints embedded in the worker and database contracts:

```text
registry: 0967d19098bfcc7b013c5f1bed9fcb2918126fe432e779ad4c8465be6f87eaeb / 133 tables
FK graph: 72aa93c5ab2a84f915a3e025879bb71db9b740256e17f295107e1039870eadb0 / 213 edges
delete order: 7c146263607baaf025a4153f5c2007d9e4c955e19e4532f5d530b7248741b8f3 / 129 direct tables
```

Any schema or dependency change that affects those fingerprints must stop purge execution until the registry, deterministic review, tests, and worker constants are intentionally regenerated and reviewed.

## Verification

Run the repository source guard:

```bash
node scripts/operations/storage-lifecycle-reconciliation/verify-source.mjs
```

The guard verifies the production-ledger migration bytes by SHA-256 and checks the runtime authentication and safety markers. The dedicated GitHub Actions workflow also type-checks both Edge Functions using a temporary Deno lockfile.

After deployment, verify:

```sql
select public.run_platform_storage_health_check_v1('production');
select public.get_platform_storage_health_v1();
```

Expected steady-state conditions:

- required Econovaria crons exist and are active;
- no recent cron failures;
- archive manifests are `verified` or `purged`, not stale;
- the global game-data purge lever is disarmed unless an operator is actively performing one reviewed deletion;
- database, raw-tick, and candle sizes remain below the encoded warning thresholds;
- no expired entitlement is missing its reviewable purge request.

## Migration-history policy

Production migration identities above are immutable. Staging accumulated iterative migration history while the design was being proven. Do not rewrite or delete either live ledger. Reconcile by schema/function fingerprints and forward migrations, using the existing live-migration reconciliation tooling. A migration that is already represented by an immutable production identity must retain the exact bytes recorded here.

## Recovery and rollback

For an archive or storage incident:

1. disable the one-minute stock scheduler before allowing unbounded growth;
2. keep archive and purge manifests intact;
3. do not delete raw ticks unless the R2 object has been downloaded and SHA-256 verified;
4. disable only the failing cron by job name while diagnosing;
5. leave the game-data purge lever disarmed;
6. restore service with forward migrations or function redeployment rather than editing historical migrations.

For a purge incident, disarm immediately. A request that has entered R2 or database deletion is intentionally not cancellable; repair its blocker and resume from its recorded stage rather than bypassing the state machine.
