import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = mkdtempSync(path.join(tmpdir(), "exact-migration-bundle-"));
const migration = path.join(root, "20260810130000_fixture_exact_migration_v1.sql");
writeFileSync(migration, "begin;\ncreate table public.fixture_exact_migration_v1(id integer);\ncommit;\n");

for (const mode of ["rollback", "commit", "verify"]) {
  const output = path.join(root, `${mode}.sql`);
  execFileSync(process.execPath, [
    "scripts/build-exact-migration-bundle.mjs",
    "--migration", migration,
    "--output", output,
    "--mode", mode,
    "--created-by", "release007-schema-convergence-v1",
  ], { stdio: "pipe" });
  const sql = readFileSync(output, "utf8");
  assert.match(sql, /20260810130000/);
  assert.match(sql, /fixture_exact_migration_v1/);
  if (mode === "rollback") assert.match(sql, /rollback;\s*$/);
  if (mode === "commit") {
    assert.match(sql, /insert into supabase_migrations\.schema_migrations/);
    assert.match(sql, /commit;\s*$/);
  }
  if (mode === "verify") {
    assert.match(sql, /EXACT_MIGRATION_SOURCE_MISMATCH/);
    assert.doesNotMatch(sql, /create table public\.fixture_exact_migration_v1/);
  }
}

console.log("Exact migration bundle checks passed.");
