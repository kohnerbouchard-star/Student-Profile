import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "backend", "supabase", "migrations");
const LAST_APPLIED_VERSION = "20260714113345";

// These versions are already recorded by the production Supabase project.
// Keeping the canonical version prevents db push from replaying applied DDL.
const APPLIED_VERSION_BY_NAME = Object.freeze({
  create_admin_audit_log_flags_v1: "20260713144033",
  issue_contract_rewards_atomic_v1: "20260713144209",
  harden_admin_data_api_tables_v1: "20260713223157",
  complete_admin_control_surfaces_v1: "20260713223526",
  harden_security_definer_rpc_privileges_v1: "20260713224905",
  index_admin_control_surface_foreign_keys_v1: "20260713225007",
  add_configurable_player_identity_v1: "20260714072030",
  harden_configurable_player_identity_rpc_grants_v1: "20260714072127",
  fix_player_identity_rpc_column_ambiguity_v1: "20260714073723",
  add_story_notification_tables_v1: "20260714113345",
});

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .map((fileName) => {
    const match = /^(\d{14})_(.+)\.sql$/.exec(fileName);
    return match
      ? {
        fileName,
        version: match[1],
        name: match[2],
        sql: readFileSync(join(MIGRATIONS_DIR, fileName), "utf8"),
      }
      : { fileName, version: null, name: null, sql: "" };
  });

const failures = [];
const seenVersions = new Set();
const seenNames = new Set();

for (const migration of migrations) {
  if (!migration.version || !migration.name) {
    failures.push(`Invalid migration filename: ${migration.fileName}`);
    continue;
  }

  if (seenVersions.has(migration.version)) {
    failures.push(`Duplicate migration version: ${migration.version}`);
  }
  if (seenNames.has(migration.name)) {
    failures.push(`Duplicate migration name: ${migration.name}`);
  }
  seenVersions.add(migration.version);
  seenNames.add(migration.name);
}

for (const [name, expectedVersion] of Object.entries(APPLIED_VERSION_BY_NAME)) {
  const migration = migrations.find((candidate) => candidate.name === name);
  if (!migration) {
    failures.push(`Missing applied migration: ${expectedVersion}_${name}.sql`);
  } else if (migration.version !== expectedVersion) {
    failures.push(
      `Applied migration ${name} has version ${migration.version}; expected ${expectedVersion}`,
    );
  }
}

const retiredContractFoundation = migrations.find((migration) =>
  migration.name === "add_contracts_schema_v1"
);
if (retiredContractFoundation) {
  failures.push(
    `${retiredContractFoundation.fileName} would recreate contract tables already owned by repair_contracts_schema_v1`,
  );
}

const notificationCreators = migrations.filter((migration) =>
  /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.notifications\b/i.test(
    migration.sql,
  )
);
if (
  notificationCreators.length !== 1 ||
  notificationCreators[0]?.name !== "add_story_notification_tables_v1"
) {
  failures.push(
    `Expected one canonical notifications table creator; found ${notificationCreators.map((item) => item.fileName).join(", ") || "none"}`,
  );
}

for (
  const requiredNewMigration of [
    "add_storyline_schema_v1",
    "add_demo_storyline_seed_rpc_v1",
    "harden_story_notification_scope_v1",
  ]
) {
  const migration = migrations.find((candidate) =>
    candidate.name === requiredNewMigration
  );
  if (!migration) {
    failures.push(`Missing reconciled migration: ${requiredNewMigration}`);
  } else if (migration.version <= LAST_APPLIED_VERSION) {
    failures.push(
      `${migration.fileName} is backdated before production's latest applied migration`,
    );
  }
}

if (failures.length > 0) {
  console.error("Supabase migration history audit failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Supabase migration history audit passed (${migrations.length} migrations; production versions aligned).`,
  );
}
