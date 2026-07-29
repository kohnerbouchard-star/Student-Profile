import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const WORKFLOW_PATH =
  ".github/workflows/production-admin-staff-security-reconcile.yml";
const MANIFEST_PATH =
  "docs/operations/evidence/production-admin-staff-security-reconciliation-v1.json";
const MIGRATION_PATH =
  "backend/supabase/migrations/20260726091000_add_staff_security_state_v2.sql";
const METADATA_SCRIPT_PATH =
  "scripts/security/reconcile-staff-security-metadata.mjs";
const ROADMAP_PATH =
  "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";

const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const migration = fs.readFileSync(MIGRATION_PATH, "utf8");
const metadataScript = fs.readFileSync(METADATA_SCRIPT_PATH, "utf8");
const roadmap = fs.readFileSync(ROADMAP_PATH, "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("manifest binds the one canonical forward migration to production", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.roadmapItem, "BETA-PROD-ADMIN-LOGIN-005");
  assert.equal(manifest.targetProjectRef, "cgiukdjwicykrmtkhudh");
  assert.deepEqual(manifest.deniedProjectRefs, ["eecvbssdvarfcykcfrny"]);
  assert.deepEqual(manifest.canonicalMigration, {
    version: "20260726091000",
    name: "add_staff_security_state_v2",
    path: MIGRATION_PATH,
    gitBlobSha: "9146d65204f7fcc045247ca5593f3e88e984ac36",
  });
  assert.equal(
    execFileSync("git", ["hash-object", MIGRATION_PATH], {
      encoding: "utf8",
    }).trim(),
    manifest.canonicalMigration.gitBlobSha,
  );

  assert.equal(manifest.staffSchemaWritesAllowed, true);
  assert.equal(manifest.authAppMetadataWritesAllowed, true);
  assert.equal(manifest.applicationRowWritesAllowed, false);
  assert.equal(manifest.edgeFunctionDeploymentAllowed, false);
  assert.equal(manifest.credentialRotationAllowed, false);
  assert.equal(manifest.destructiveChangesAllowed, false);
  assert.equal(manifest.rollbackStrategy, "forward-only-idempotent-rerun");
  assert.equal(manifest.requiredStaffColumns.length, 8);
  assert.equal(manifest.requiredStaffConstraints.length, 6);
  assert.equal(manifest.requiredAuthMetadataKeys.length, 5);
});

test("canonical migration remains additive, bounded, and Staff-only", () => {
  assert.match(migration, /^begin;\s*/iu);
  assert.match(migration, /\s*commit;\s*$/iu);
  assert.match(migration, /alter table public\.staff_users/iu);
  for (const column of manifest.requiredStaffColumns) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, "u"));
  }
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?staff_users\b/iu,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:drop\s+(?:table|schema|database)|truncate|drop\s+column)\b/iu,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:create|alter|drop)\s+table\s+(?!public\.staff_users\b)/iu,
  );
});

test("workflow requires merged main, exact project confirmation, and production protection", () => {
  assert.match(workflow, /^\s*workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request):/mu);
  assert.match(workflow, /environment: production/u);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/u);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(
    workflow,
    /test "\$\{\{ inputs\.confirm_project_ref \}\}" = "\$EXPECTED_PRODUCTION_PROJECT_REF"/u,
  );
  assert.match(
    workflow,
    /test "\$\{\{ inputs\.confirm_action \}\}" = "RECONCILE ADMIN STAFF SECURITY"/u,
  );
  assert.match(
    workflow,
    /test "\$EXPECTED_PRODUCTION_PROJECT_REF" != "\$DENIED_STAGING_PROJECT_REF"/u,
  );
  assert.match(workflow, /git merge-base --is-ancestor HEAD origin\/main/u);
  assert.match(
    workflow,
    /Production database URL is not bound to the expected project/u,
  );
  assert.match(workflow, /persist-credentials: false/u);
});

test("workflow applies only the canonical schema and controlled metadata repair", () => {
  assert.match(
    workflow,
    /20260726091000_add_staff_security_state_v2\.sql/u,
  );
  assert.match(workflow, /9146d65204f7fcc045247ca5593f3e88e984ac36/u);
  assert.match(
    workflow,
    /reconcile-staff-security-metadata\.mjs[\s\\]*\n\s+--apply[\s\\]*\n\s+--allow-production/u,
  );
  assert.match(
    workflow,
    /ECONOVARIA_PRODUCTION_CHANGE_CONFIRMATION: cgiukdjwicykrmtkhudh/u,
  );
  assert.match(workflow, /notify pgrst, 'reload schema'/u);
  assert.match(workflow, /requiredColumnsPresent/u);
  assert.match(workflow, /requiredConstraintsPresent/u);
  assert.match(workflow, /metadataMismatches/u);
  assert.match(workflow, /ledgerRecordedOnce/u);
  assert.match(workflow, /staff-security-postgrest\.json/u);

  assert.doesNotMatch(workflow, /supabase\s+db\s+push/iu);
  assert.doesNotMatch(workflow, /supabase\s+functions\s+deploy/iu);
  assert.doesNotMatch(workflow, /\bvercel\s+(?:deploy|promote)\b/iu);
  assert.doesNotMatch(workflow, /kohnerbouchard@gmail\.com/iu);
  assert.doesNotMatch(workflow, /\b(?:password|access_token|refresh_token)\s*[:=]\s*["'][^"']+["']/iu);
});

test("metadata operator is locked and denies accidental production mutation", () => {
  assert.equal(
    packageJson.devDependencies["@supabase/supabase-js"],
    "2.111.0",
  );
  assert.match(
    packageJson.scripts["test:web-session-release"],
    /production-admin-staff-security-reconciliation-contract\.test\.mjs/u,
  );
  assert.match(metadataScript, /process\.argv\.includes\("--apply"\)/u);
  assert.match(
    metadataScript,
    /process\.argv\.includes\("--allow-production"\)/u,
  );
  assert.match(
    metadataScript,
    /Production project reconciliation is denied without --allow-production/u,
  );
  assert.match(
    metadataScript,
    /ECONOVARIA_PRODUCTION_CHANGE_CONFIRMATION/u,
  );
  assert.match(metadataScript, /auth\.admin\.updateUserById/u);
  assert.doesNotMatch(metadataScript, /console\.log\([^)]*authUserId/u);

  const denied = spawnSync(
    process.execPath,
    [METADATA_SCRIPT_PATH, "--apply"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_URL: "https://cgiukdjwicykrmtkhudh.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_contract_fixture",
        ECONOVARIA_PROJECT_REF: "cgiukdjwicykrmtkhudh",
        ECONOVARIA_PRODUCTION_PROJECT_REFS: "cgiukdjwicykrmtkhudh",
      },
    },
  );
  assert.equal(denied.status, 1);
  assert.match(
    denied.stderr,
    /Production project reconciliation is denied without --allow-production/u,
  );
});

test("roadmap owns the production Staff security convergence", () => {
  assert.match(roadmap, /BETA-PROD-ADMIN-LOGIN-005/u);
  assert.match(
    roadmap,
    /agent\/production-admin-staff-security-reconcile-v1/u,
  );
  assert.match(
    roadmap,
    /20260726091000_add_staff_security_state_v2/u,
  );
});
