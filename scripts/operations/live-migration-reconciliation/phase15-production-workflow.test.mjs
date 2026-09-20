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
    "POPULATED_STAGING_CERTIFIED_SHA: 2fc71be96e4126ee2253cb91afb2d9ebe5004c44",
    "phase15-staging-database-${{ env.SOURCE_COMMIT }}",
    "phase15-staging-runtime-${{ env.SOURCE_COMMIT }}",
    "phase15-staging-lifecycle-${{ env.SOURCE_COMMIT }}",
    "rollbackRehearsalPassed",
    "golden-five-browser-acceptance.json",
    "fixture-verification.json",
    "git merge-base --is-ancestor",
    "phase15-clean-replay-${{ env.SOURCE_COMMIT }}",
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
    "pitrEnabled",
    "recentCompletedBackup",
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

  assert.doesNotMatch(source, /continue-on-error:\s*true/u);
  assert.doesNotMatch(source, /update\s+cron\.job/iu);
  assert.doesNotMatch(source, /VERCEL_TOKEN|vercel deploy|vercel promote/u);
});
