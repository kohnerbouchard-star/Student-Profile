import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const migrationRoot = resolve(root, "backend/supabase/migrations");
const functionRoot = resolve(root, "backend/supabase/functions");

const canonicalMigrations = new Map([
  ["20260812044346_stock_tick_hot_cold_archive_foundation_v2.sql", "35a3c34aa98077850a6bb0a6c2b086902689e6d27cd84f8dd995af848d0f058a"],
  ["20260812072131_harden_stock_tick_archive_service_contract_v2.sql", "df8442b8aeef23091e3d090377c5e616416e556cfaae5ab1f72c4069ab2936c9"],
  ["20260812072445_drop_redundant_stock_tick_asset_desc_index_v1.sql", "144a04ed0834712f156eba99e8c6e88e320cbd90af39ce429805021090b29bd0"],
  ["20260812211829_temporarily_drop_stock_tick_ticker_index_for_prod_compaction_v1.sql", "b05ebd2eccd78d843b515a430828d0c724920392ee652ff02d202c4320b0a4eb"],
  ["20260812211914_restore_compacted_stock_tick_ticker_index_prod_v1.sql", "ffb135d20f55fc7826482c03176d6ae13b671e4dff1c03342cc57e096d2f06a9"],
  ["20260812212415_add_hardened_game_license_purge_foundation_prod_v1.sql", "54eb4b82ccf3aca66cbab96f693bb6c2a495976593a7e277f8defc5ea7b00a8c"],
  ["20260812212602_add_hardened_game_purge_internal_contracts_prod_v1.sql", "2660894752b4ca00a77d37681f3d101d3704ef4e71804ba513bfc703ae531e4b"],
  ["20260812212656_add_hardened_game_purge_operator_controls_prod_v1.sql", "e1d87b95b07ceb30f2854b216905a64c90c4cf93e8a433675c6a8fcd479e691b"],
  ["20260812213109_bound_stock_candle_retention_prod_v1.sql", "7ebf3852aab62daea0888b1d68af355d85501687297c60d007ec05d86ec35b4c"],
  ["20260812213226_drop_exact_duplicate_marketplace_reference_indexes_v1.sql", "b5564d56bbabd007914102752196a483b1dd6a65b5747617eddbc3c65900691d"],
  ["20260812214220_add_platform_storage_health_monitor_v1.sql", "f699213adfd861278d0e250d769aa912435d3e469fc0255baa3bbfd7290e1ec1"],
]);

const sourceContracts = [
  {
    path: resolve(functionRoot, "stock-tick-archiver/index.ts"),
    markers: [
      "x-econovaria-scheduler-token",
      "verify_runtime_scheduler_token_v1",
      "parquetWriteBuffer",
      "register_verified_stock_tick_archive",
      "purge_verified_stock_tick_archive",
      "r2_sha256_mismatch",
    ],
  },
  {
    path: resolve(functionRoot, "game-data-purger/index.ts"),
    markers: [
      "x-econovaria-purge-scheduler-token",
      "claim_confirmed_game_data_purge_v1",
      "execute_game_data_purge_db_batch_v2",
      "finalize_game_data_purge_v1",
      "0967d19098bfcc7b013c5f1bed9fcb2918126fe432e779ad4c8465be6f87eaeb",
      "72aa93c5ab2a84f915a3e025879bb71db9b740256e17f295107e1039870eadb0",
      "7c146263607baaf025a4153f5c2007d9e4c955e19e4532f5d530b7248741b8f3",
    ],
  },
  {
    path: resolve(migrationRoot, "20260813090000_reconcile_storage_lifecycle_runtime_cleanup_v1.sql"),
    markers: [
      "configure_game_data_purge_environment_v1",
      "configure_stock_tick_archive_retention_scheduler_v1",
      "configure_cron_history_retention_v1",
      "GAME_DATA_PURGE_LEVER_MUST_BE_DISARMED",
      "revoke all on function public.activate_meridian_customs_security_intrusion_from_full_game_v1()",
    ],
  },
];

let failed = false;

for (const [fileName, expected] of canonicalMigrations) {
  const path = resolve(migrationRoot, fileName);
  try {
    const bytes = await readFile(path);
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expected) {
      failed = true;
      console.error(`HASH_MISMATCH ${fileName}\n  expected ${expected}\n  actual   ${actual}`);
    } else {
      console.log(`OK migration ${fileName}`);
    }
  } catch (error) {
    failed = true;
    console.error(`MISSING_MIGRATION ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const contract of sourceContracts) {
  try {
    const source = await readFile(contract.path, "utf8");
    for (const marker of contract.markers) {
      if (!source.includes(marker)) {
        failed = true;
        console.error(`MISSING_MARKER ${contract.path}: ${marker}`);
      }
    }
    if (/AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(source)) {
      failed = true;
      console.error(`SECRET_MATERIAL_DETECTED ${contract.path}`);
    }
    console.log(`OK source contract ${contract.path}`);
  } catch (error) {
    failed = true;
    console.error(`MISSING_SOURCE ${contract.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exit(1);
console.log("Supabase storage lifecycle reconciliation source is complete and deterministic.");
