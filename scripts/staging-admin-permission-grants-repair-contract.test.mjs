#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/staging-admin-permission-grants-repair.yml",
);
const MANIFEST_PATH = path.join(
  ROOT,
  "docs/operations/evidence/staging-admin-permission-grants-repair-v1.json",
);
const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const migration = manifest.canonicalMigration;
const migrationPath = path.join(ROOT, migration.path);
const migrationSql = fs.readFileSync(migrationPath, "utf8");

test("staging permission-grants repair authorization is narrowly bounded", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(
    manifest.roadmapItem,
    "BETA-STAGING-ADMIN-PERMISSION-GRANTS-REPAIR-001",
  );
  assert.equal(manifest.targetProjectRef, "eecvbssdvarfcykcfrny");
  assert.deepEqual(manifest.deniedProjectRefs, ["cgiukdjwicykrmtkhudh"]);
  assert.equal(migration.version, "20260726095000");
  assert.equal(migration.name, "add_staff_permission_grants_v2");
  assert.equal(
    migration.path,
    "backend/supabase/migrations/20260726095000_add_staff_permission_grants_v2.sql",
  );
  assert.match(migration.gitBlobSha, /^[0-9a-f]{40}$/u);
  assert.equal(manifest.requiredPermissions.length, 19);
  assert.equal(new Set(manifest.requiredPermissions).size, 19);
  assert.equal(manifest.databaseSchemaWritesAllowed, true);
  assert.equal(manifest.migrationLedgerWritesAllowed, true);
  assert.equal(manifest.authAppMetadataWritesAllowed, true);
  assert.equal(manifest.applicationRowWritesAllowed, false);
  assert.equal(manifest.edgeFunctionDeploymentAllowed, false);
  assert.equal(manifest.secretMutationAllowed, false);
  assert.equal(manifest.vercelDeploymentAllowed, false);
  assert.equal(manifest.destructiveChangesAllowed, false);
  assert.equal(
    manifest.rollbackStrategy,
    "forward-only-idempotent-rerun",
  );
});

test("canonical migration identity and scope are immutable", () => {
  const actualBlob = execFileSync(
    "git",
    ["hash-object", migration.path],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  assert.equal(actualBlob, migration.gitBlobSha);
  assert.match(migrationSql, /^begin;\s*/iu);
  assert.match(migrationSql, /\s*commit;\s*$/iu);
  assert.match(
    migrationSql,
    /create table if not exists public\.staff_permission_grants/iu,
  );
  assert.match(
    migrationSql,
    /create or replace function public\.default_game_admin_permissions_v2\(\)/iu,
  );
  assert.match(
    migrationSql,
    /create trigger staff_users_seed_permissions_v2/iu,
  );
  assert.match(
    migrationSql,
    /create trigger staff_permission_grants_version_v2/iu,
  );
  assert.match(
    migrationSql,
    /insert into public\.staff_permission_grants/iu,
  );
  assert.doesNotMatch(
    migrationSql,
    /\b(?:drop\s+(?:table|schema|database)|truncate|drop\s+column)\b/iu,
  );
  for (const permission of manifest.requiredPermissions) {
    assert.match(migrationSql, new RegExp(`'${escapeRegex(permission)}'`, "u"));
  }
});

test("workflow is staging-only, exact-head, and single-migration", () => {
  for (const required of [
    "EXPECTED_STAGING_PROJECT_REF: eecvbssdvarfcykcfrny",
    "DENIED_PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh",
    "MIGRATION_VERSION: \"20260726095000\"",
    "EXPECTED_MIGRATION_BLOB: cac86d86cc9b8b0862ed471ca1f1c0d8de7a8bd0",
    "REPAIR STAGING ADMIN PERMISSION GRANTS",
    "git rev-parse origin/main",
    "reconcile-staff-security-metadata.mjs",
    "--apply",
    "notify pgrst, 'reload schema'",
    "Production touched: `false`",
  ]) {
    assert.ok(workflow.includes(required), `Missing workflow guard: ${required}`);
  }
  assert.match(
    workflow,
    /environment:\s*staging/u,
  );
  assert.doesNotMatch(
    workflow,
    /environment:\s*production/u,
  );
  assert.doesNotMatch(
    workflow,
    /\bsupabase\s+(?:db\s+push|migration\s+(?:up|repair))\b/iu,
  );
  assert.doesNotMatch(
    workflow,
    /apply-pending-via-psql|staging-migration-replay/iu,
  );
  assert.doesNotMatch(
    workflow,
    /\bsupabase\s+functions\s+deploy\b/iu,
  );
  assert.doesNotMatch(
    workflow,
    /\bvercel\b.*\bdeploy\b/iu,
  );
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
