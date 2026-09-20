import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/phase15-controlled-production.yml";

test("production promotion is bound to exact successful Phase 15 staging evidence", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const marker of [
    "workflow_run:",
    "Phase 15 Controlled Staging Convergence",
    "types: [completed]",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    "POPULATED_STAGING_APPLY_SHA: 2fc71be96e4126ee2253cb91afb2d9ebe5004c44",
    "POPULATED_STAGING_APPLY_RUN_ID: 35509654209",
    "phase15-staging-database-${{ env.SOURCE_COMMIT }}",
    "phase15-staging-runtime-${{ env.SOURCE_COMMIT }}",
    "phase15-staging-lifecycle-${{ env.SOURCE_COMMIT }}",
    "rollbackRehearsalPassed",
    "supabase-hosted-live-v1",
    "rehearse-live-shaped-upgrade.sh",
    "fixture-credential-authority.json",
    "publishable-key-only",
    "fixtureLifecycleAction",
    "fixtureLifecycleState",
    "fxAuthorityState",
    "bankingFxReadiness",
    "bounded-latest-snapshot-copy-v1",
    "golden-five-browser-acceptance.json",
    "fixture-verification.json",
    "git merge-base --is-ancestor",
    "phase15-clean-replay-${{ env.SOURCE_COMMIT }}",
    "scripts/staging/golden-five-browser-acceptance.mjs",
    "backend/src/domains/storylines/infrastructure/stockMarketStoryNewsWriter.ts",
    "backend/src/domains/storylines/infrastructure/stockMarketStoryNewsWriter.test.ts",
    "backend/src/domains/world/services/playerWorldRuntimeService.ts",
    "backend/src/domains/world/services/playerWorldRuntimeService.test.ts",
  ]) assert.ok(source.includes(marker), `missing staging authority marker: ${marker}`);

  assert.match(source, /certify-staging:[\s\S]*?environment: staging/u);
  assert.match(source, /converge-production-database:[\s\S]*?needs: certify-staging[\s\S]*?environment: production/u);
  assert.match(source, /converge-production-runtime:[\s\S]*?needs: \[certify-staging, converge-production-database\][\s\S]*?environment: production/u);
  assert.match(source, /publish-production-release:[\s\S]*?needs: \[certify-staging, converge-production-runtime\][\s\S]*?environment: production/u);
});

test("production writes are recovery-gated and runtime/release evidence is exact", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const marker of [
    "/database/backups",
    "supabase db dump",
    "--role-only",
    "--data-only",
    "--schema public,private",
    "application-data.sql",
    "full-logical-export-plus-application-restore-proof-v1",
    "platformDataDumpIncluded",
    "managedPlatformDataIncluded",
    "managedPlatformRestoreRequiresCurrentTargetVersion",
    "restoreScope",
    "openssl enc -aes-256-cbc",
    "supabase start --workdir \"$restore_project\"",
    "docker exec \"$db_container\" psql -U supabase_admin",
    "select rolsuper from pg_roles where rolname = current_user",
    "--single-transaction",
    "restoreValidated",
    "schemaMatched",
    "offsiteUploaded",
    "supabase-cli-logical-backup-v2",
    "phase15-production-recovery-${{ env.SOURCE_COMMIT }}",
    "supabase db advisors",
    "auth_leaked_password_protection",
    "rls_enabled_no_policy",
    "unindexed_foreign_keys",
    "unused_index",
    "--fail-on error",
    "PHASE15_LIVE_APPLY_AUTHORIZED: production",
    "run-phase15-live-convergence.sh",
    "Recover an interrupted production scheduler maintenance lease",
    "phase15-scheduler-auto-restore-v1",
    "Deploy every canonical production function from the manifest",
    "--staging",
    "--production",
    "digestMismatches",
    "git push origin \"$SOURCE_COMMIT:refs/heads/$RELEASE_BRANCH\"",
    "https://www.econovaria.com/api/health",
    "value.sourceCommit!==process.env.SOURCE_COMMIT",
  ]) assert.ok(source.includes(marker), `missing production safety marker: ${marker}`);

  assert.match(
    source,
    /Create and restore-verify encrypted logical production backup[\s\S]*Upload encrypted production recovery set before mutation[\s\S]*Finalize fail-closed production recovery gate[\s\S]*Run rollback proof and atomic production convergence/u,
  );
  assert.match(
    source,
    /--file "\$plain_root\/data\.sql"[\s\S]*--file "\$plain_root\/application-data\.sql"[\s\S]*roles\.sql schema\.sql data\.sql application-data\.sql backup-manifest\.json/u,
  );
  assert.match(
    source,
    /docker cp "\$validation_root\/application-data\.sql"[\s\S]*--file \/tmp\/phase15-application-data\.sql/u,
  );
  assert.doesNotMatch(source, /--file \/tmp\/phase15-data\.sql/u);
  assert.match(
    source,
    /compare-schema-snapshots\.mjs[\s\S]*--left "\$recovery_root\/restored-schema\.json"[\s\S]*--right "\$recovery_root\/remote-schema\.json"[\s\S]*--profile supabase-hosted-live-v1/u,
  );
  assert.doesNotMatch(
    source,
    /compare-schema-snapshots\.mjs[\s\S]*--left "\$recovery_root\/remote-schema\.json"[\s\S]*--right "\$recovery_root\/restored-schema\.json"/u,
  );
  assert.doesNotMatch(source, /continue-on-error:\s*true/u);
  assert.doesNotMatch(source, /update\s+cron\.job/iu);
  assert.doesNotMatch(source, /VERCEL_TOKEN|vercel deploy|vercel promote/u);
});
