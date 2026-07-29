import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const WORKFLOW_PATH =
  ".github/workflows/production-admin-bootstrap-schema-reconcile.yml";
const MANIFEST_PATH =
  "docs/operations/evidence/production-admin-bootstrap-schema-reconciliation-v1.json";
const MIGRATION_PATH =
  "backend/supabase/migrations/20260729123000_reconcile_admin_bootstrap_join_code_v1.sql";
const ROADMAP_PATH =
  "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";

const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const migration = fs.readFileSync(MIGRATION_PATH, "utf8");
const roadmap = fs.readFileSync(ROADMAP_PATH, "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("manifest binds one forward-only bootstrap migration to production", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.roadmapItem, "BETA-PROD-ADMIN-LOGIN-005");
  assert.equal(manifest.targetProjectRef, "cgiukdjwicykrmtkhudh");
  assert.deepEqual(manifest.deniedProjectRefs, ["eecvbssdvarfcykcfrny"]);
  assert.deepEqual(manifest.canonicalMigration, {
    version: "20260729123000",
    name: "reconcile_admin_bootstrap_join_code_v1",
    path: MIGRATION_PATH,
    gitBlobSha: "1a12c63686b936a40f56403da5c162bf3c79b2df",
  });
  assert.equal(
    execFileSync("git", ["hash-object", MIGRATION_PATH], {
      encoding: "utf8",
    }).trim(),
    manifest.canonicalMigration.gitBlobSha,
  );

  assert.equal(manifest.staffSecurityPrerequisiteRequired, true);
  assert.equal(manifest.gameSessionSchemaWritesAllowed, true);
  assert.equal(manifest.databaseFunctionWritesAllowed, false);
  assert.equal(manifest.applicationRowWritesAllowed, false);
  assert.equal(manifest.authMetadataWritesAllowed, false);
  assert.equal(manifest.edgeFunctionDeploymentAllowed, false);
  assert.equal(manifest.credentialRotationAllowed, false);
  assert.equal(manifest.destructiveChangesAllowed, false);
  assert.equal(manifest.rollbackStrategy, "forward-only-idempotent-rerun");
  assert.deepEqual(manifest.requiredBootstrapColumns, [
    "id",
    "name",
    "status",
    "game_join_code",
    "game_join_code_status",
    "created_at",
    "updated_at",
  ]);
  assert.equal(
    manifest.requiredBootstrapConstraint,
    "game_sessions_readable_join_code_valid",
  );
  assert.equal(
    manifest.requiredBootstrapIndex,
    "game_sessions_active_readable_join_code_unique",
  );
});

test("migration is additive, transaction-bounded, and row-preserving", () => {
  assert.match(migration, /^begin;\s*/iu);
  assert.match(migration, /\s*commit;\s*$/iu);
  assert.match(
    migration,
    /alter table public\.game_sessions\s+add column if not exists game_join_code text null/iu,
  );
  assert.match(migration, /game_sessions_readable_join_code_valid/iu);
  assert.match(migration, /game_sessions_active_readable_join_code_unique/iu);
  assert.match(
    migration,
    /comment on column public\.game_sessions\.game_join_code/iu,
  );

  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update\s+(?:public\.)?\w+|delete\s+from|truncate)\b/iu,
  );
  assert.doesNotMatch(
    migration,
    /\bdrop\s+(?:table|schema|database|column|constraint)\b/iu,
  );
  assert.doesNotMatch(
    migration,
    /\bcreate\s+(?:or\s+replace\s+)?function\b/iu,
  );
  assert.doesNotMatch(
    migration,
    /\balter\s+table\s+(?!public\.game_sessions\b)/iu,
  );
});

test("workflow is production-protected and temporarily self-triggers only on merged main", () => {
  assert.match(workflow, /^\s*workflow_dispatch:/mu);
  assert.match(workflow, /^\s*push:/mu);
  assert.match(workflow, /branches:\s*\n\s+- main/u);
  assert.match(
    workflow,
    /paths:\s*\n\s+- \.github\/workflows\/production-admin-bootstrap-schema-reconcile\.yml/u,
  );
  assert.match(workflow, /environment: production/u);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/u);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(
    workflow,
    /test "\$GITHUB_SHA" = "\$RUN_SOURCE_COMMIT"/u,
  );
  assert.match(
    workflow,
    /test "\$RUN_CONFIRM_PROJECT_REF" = "\$EXPECTED_PRODUCTION_PROJECT_REF"/u,
  );
  assert.match(
    workflow,
    /test "\$RUN_CONFIRM_ACTION" = "RECONCILE ADMIN BOOTSTRAP SCHEMA"/u,
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

test("workflow applies only the authorized schema repair and verifies runtime projection", () => {
  assert.match(
    workflow,
    /20260729123000_reconcile_admin_bootstrap_join_code_v1\.sql/u,
  );
  assert.match(workflow, /1a12c63686b936a40f56403da5c162bf3c79b2df/u);
  assert.match(workflow, /staffSecurityColumns/u);
  assert.match(workflow, /metadataMismatches/u);
  assert.match(workflow, /requiredBootstrapColumns/u);
  assert.match(workflow, /readableCodeConstraint/u);
  assert.match(workflow, /readableCodeIndex/u);
  assert.match(workflow, /invalidReadableCodes/u);
  assert.match(workflow, /ledgerRecordedOnce/u);
  assert.match(workflow, /notify pgrst, 'reload schema'/u);
  assert.match(
    workflow,
    /select=id,name,status,game_join_code,game_join_code_status,created_at,updated_at&limit=1/u,
  );

  assert.doesNotMatch(workflow, /supabase\s+db\s+push/iu);
  assert.doesNotMatch(workflow, /supabase\s+functions\s+deploy/iu);
  assert.doesNotMatch(workflow, /\bvercel\s+(?:deploy|promote)\b/iu);
  assert.doesNotMatch(workflow, /auth\.admin\.updateUserById/u);
  assert.doesNotMatch(workflow, /kohnerbouchard@gmail\.com/iu);
  assert.doesNotMatch(
    workflow,
    /\b(?:password|access_token|refresh_token)\s*[:=]\s*["'][^"']+["']/iu,
  );
});

test("release suite and roadmap own the remaining bootstrap convergence", () => {
  assert.match(
    packageJson.scripts["test:web-session-release"],
    /production-admin-bootstrap-schema-reconciliation-contract\.test\.mjs/u,
  );
  assert.match(roadmap, /BETA-PROD-ADMIN-LOGIN-005/u);
  assert.match(
    roadmap,
    /agent\/production-admin-bootstrap-schema-reconcile-v1/u,
  );
  assert.match(
    roadmap,
    /20260729123000_reconcile_admin_bootstrap_join_code_v1/u,
  );
  assert.match(roadmap, /30450963053/u);
  assert.match(roadmap, /one successful real administrator login/u);
});
