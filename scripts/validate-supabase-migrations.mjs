import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATION_ROOT = path.resolve("backend/supabase/migrations");
const FILE_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const CREATE_TABLE_PATTERN = /\bcreate\s+table\s+(?!if\s+not\s+exists\b)(?:public\.)?([a-z_][a-z0-9_]*)/gi;

const files = (await readdir(MIGRATION_ROOT))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const versions = new Map();
const tableOwners = new Map();
const failures = [];

for (const file of files) {
  const match = file.match(FILE_PATTERN);
  if (!match) {
    failures.push(`${file}: expected 14-digit timestamp and snake_case name`);
    continue;
  }

  const [, version] = match;
  if (versions.has(version)) {
    failures.push(`${file}: migration version also used by ${versions.get(version)}`);
  }
  versions.set(version, file);

  const source = await readFile(path.join(MIGRATION_ROOT, file), "utf8");
  for (const tableMatch of source.matchAll(CREATE_TABLE_PATTERN)) {
    const table = tableMatch[1].toLowerCase();
    if (tableOwners.has(table)) {
      failures.push(`${file}: creates public.${table}, already created by ${tableOwners.get(table)}`);
    } else {
      tableOwners.set(table, file);
    }
  }
}

// Applied migrations keep the exact production versions. Only files that were
// already authored as transactions, plus new forward migrations, are checked
// for explicit transaction boundaries. The applied notification migration is
// deliberately excluded because historical SQL should not change after it is
// deployed.
for (const file of [
  "20260713144033_create_admin_audit_log_flags_v1.sql",
  "20260713144209_issue_contract_rewards_atomic_v1.sql",
  "20260713223157_harden_admin_data_api_tables_v1.sql",
  "20260713223526_complete_admin_control_surfaces_v1.sql",
  "20260713224905_harden_security_definer_rpc_privileges_v1.sql",
  "20260717165000_add_storyline_schema_v1.sql",
  "20260717165100_add_demo_storyline_seed_rpc_v1.sql",
  "20260717165200_harden_story_notification_scope_v1.sql",
  "20260717165300_accept_player_contract_atomic_v1.sql",
  "20260717165500_add_player_stock_watchlist_v1.sql",
]) {
  if (!files.includes(file)) {
    failures.push(`${file}: required critical migration is missing`);
    continue;
  }
  const source = (await readFile(path.join(MIGRATION_ROOT, file), "utf8")).trim().toLowerCase();
  if (!source.startsWith("begin;") || !source.endsWith("commit;")) {
    failures.push(`${file}: critical migration must be transaction wrapped`);
  }
}

if (failures.length > 0) {
  throw new Error(`Migration validation failed:\n- ${failures.join("\n- ")}`);
}

console.log(JSON.stringify({
  status: "pass",
  migrationCount: files.length,
  uniqueVersions: versions.size,
  canonicalTableCreations: tableOwners.size,
}, null, 2));
