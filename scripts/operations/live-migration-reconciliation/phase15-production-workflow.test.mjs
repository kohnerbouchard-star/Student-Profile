import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/phase15-controlled-production.yml";
const stagingWorkflowPath = ".github/workflows/phase15-controlled-staging.yml";

test("production candidate gates cover every final repair authority path", async () => {
  const production = await readFile(workflowPath, "utf8");
  const staging = await readFile(stagingWorkflowPath, "utf8");
  const repairAuthorityPaths = [
    "docs/operations/contracts/player-cross-cutting/pr-731.json",
    "scripts/business-phase10-player-store-cutover-contract.mjs",
    "scripts/player-cross-cutting-authority.test.mjs",
  ];
  const mergedBaseAuthorityPaths = [
    "api/_admin-bff-proxy.js",
    "docs/operations/contracts/player-cross-cutting/pr-732.json",
    "scripts/auth-boundary-contract.test.mjs",
    "scripts/vercel-auth-proxy-contract.test.mjs",
    "backend/supabase/migrations/20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1.sql",
    "docs/operations/contracts/player-cross-cutting/pr-733.json",
    "scripts/internal-runner-auth-contract.test.mjs",
  ];

  for (const path of repairAuthorityPaths) {
    assert.ok(
      production.split(path).length - 1 >= 2,
      `production trigger and bounded source gate must both cover ${path}`,
    );
    assert.ok(
      staging.split(path).length - 1 >= 2,
      `staging pull-request and main-push triggers must both cover ${path}`,
    );
  }
  for (const path of mergedBaseAuthorityPaths) {
    assert.ok(
      production.includes(path),
      `production bounded source gate must cover reviewed merged-base path ${path}`,
    );
  }
});

test("production promotion is bound to exact successful Phase 15 staging and acceptance evidence", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const marker of [
    "workflow_run:",
    "Phase 15 Controlled Staging Convergence",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    "POPULATED_STAGING_APPLY_SHA: 2fc71be96e4126ee2253cb91afb2d9ebe5004c44",
    "POPULATED_STAGING_APPLY_RUN_ID: 35509654209",
    "git merge-base --is-ancestor",
    "phase15-staging-database-${{ env.SOURCE_COMMIT }}",
    "phase15-staging-runtime-${{ env.SOURCE_COMMIT }}",
    "phase15-staging-lifecycle-${{ env.SOURCE_COMMIT }}",
    "phase15-clean-replay-${{ env.SOURCE_COMMIT }}",
    "player-multiplayer-load-${{ env.SOURCE_COMMIT }}",
    "phase15-economic-acceptance-${{ env.SOURCE_COMMIT }}",
    "phase15-load-summary.json",
    "phase15-economic-summary.json",
    "expectedConcurrentPlayers: 30",
    "maximumConcurrentPlayers: 40",
    "readPathsPerPlayer: 7",
    "phase15-acceptance-runtime-contract.json",
    "phase15-acceptance-certificate.mjs",
    "--require-pass",
    "phase15-advisor-exceptions.mjs validate",
    "PHASE15_ADVISOR_EVIDENCE_KEY_V1",
    "staging-advisors-raw.json.enc",
    "retention-days: 90",
  ]) assert.ok(source.includes(marker), `missing staging/acceptance authority marker: ${marker}`);

  assert.match(source, /certify-staging:[\s\S]*?needs: static-contract[\s\S]*?environment: staging/u);
  assert.match(
    source,
    /prepare-production-recovery:[\s\S]*?needs: certify-staging[\s\S]*?environment: production/u,
  );
  assert.match(
    source,
    /verify-production-recovery-custody:[\s\S]*?needs: \[certify-staging, prepare-production-recovery\][\s\S]*?environment: production/u,
  );
  assert.match(
    source,
    /converge-production-database:[\s\S]*?needs: \[certify-staging, prepare-production-recovery, verify-production-recovery-custody\][\s\S]*?environment: production/u,
  );
  assert.match(
    source,
    /converge-production-runtime:[\s\S]*?needs: \[certify-staging, converge-production-database\][\s\S]*?environment: production/u,
  );
  assert.match(
    source,
    /publish-production-release:[\s\S]*?needs: \[certify-staging, converge-production-runtime\][\s\S]*?environment: production/u,
  );
  assert.match(
    source,
    /verify-production-authenticated-runtime:[\s\S]*?needs: \[certify-staging, publish-production-release\][\s\S]*?environment: production/u,
  );
});

test("production mutation is fresh-runner recovery-gated and release publication is least privilege", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const marker of [
    "concurrency:",
    "group: econovaria-production-release",
    "PHASE15_BACKUP_ENCRYPTION_KEY_V1: ${{ secrets.PHASE15_BACKUP_ENCRYPTION_KEY_V1 }}",
    "test \"${#PHASE15_BACKUP_ENCRYPTION_KEY_V1}\" -ge 64",
    "supabase db dump",
    "--role-only",
    "--data-only",
    "--schema public,private",
    "application-data.sql",
    "restored-application-data.sql",
    "phase15-application-logical-recovery-v3",
    "supabase-cli-logical-backup-v3",
    "applicationObjectSchemas: [\"public\", \"private\", \"economy_private\"]",
    "applicationDataSchemas: [\"public\", \"private\"]",
    "managedAuthStorageDataRestoreVerified: false",
    "phase15-ledger.json",
    "phase15-ledger-verification.json",
    "scheduler-reconstruction.json",
    "compare-copy-data-evidence.mjs emit",
    "compare-copy-data-evidence.mjs compare",
    "copy-data-comparison.json",
    "openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -md sha256",
    "openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256",
    "phase15-production-recovery-${{ env.SOURCE_COMMIT }}",
    "phase15-production-recovery-custody-${{ env.SOURCE_COMMIT }}",
    "archiveFilesVerified: true",
    "applicationDataMatched: true",
    "migrationLedgerReconstructionVerified: true",
    "schedulerReconstructionVerified: true",
    "offsiteUploaded: true",
    "ORIGINAL_PRODUCTION_APPLY_RUN_ID: 35551077276",
    "ORIGINAL_PRODUCTION_APPLY_ARTIFACT_ID: 10619430098",
    "phase15-production-certificate.mjs",
    "Recheck protected main immediately before production mutation",
    "PHASE15_LIVE_APPLY_AUTHORIZED: production",
    "run-phase15-live-convergence.sh",
    "Recover an interrupted production scheduler maintenance lease",
    "phase15-scheduler-auto-restore-v1",
    "advisors-pre.json.enc",
    "advisors-post.json.enc",
    "Deploy every canonical production function from the manifest",
    "digestMismatches",
    "PHASE15_RELEASE_DEPLOY_KEY_V1: ${{ secrets.PHASE15_RELEASE_DEPLOY_KEY_V1 }}",
    "ssh-key: ${{ secrets.PHASE15_RELEASE_DEPLOY_KEY_V1 }}",
    "git push origin \"$SOURCE_COMMIT:refs/heads/$RELEASE_BRANCH\"",
    "https://www.econovaria.com/api/health",
    "value.sourceCommit!==process.env.SOURCE_COMMIT",
    "phase15-production-runtime-probe.mjs",
    "phase15-production-runtime-fixture-v1.json",
    "phase15-production-authenticated-runtime-${{ env.SOURCE_COMMIT }}",
    "value.authenticatedRuntime?.routes?.length !== 7",
    "value.authenticatedRuntime?.economics?.exactReplayRecognized !== true",
    "value.authenticatedRuntime?.economics?.balancesRestored !== true",
    "value.fixture?.realUserDataTouched !== false",
    "value.containment?.sessionsRevoked !== true",
    "value.containment?.credentialsRevoked !== true",
    "value.containment?.joinCodeCleared !== true",
    "value.containment?.paused !== true",
  ]) assert.ok(source.includes(marker), `missing production safety marker: ${marker}`);

  assert.match(
    source,
    /Upload encrypted production recovery set before mutation[\s\S]*verify-production-recovery-custody:[\s\S]*Converge populated production after recovery custody verification/u,
  );
  assert.match(
    source,
    /verify-production-recovery-custody:[\s\S]*runs-on: ubuntu-24\.04[\s\S]*Check out exact recovery-authorized main on a fresh runner[\s\S]*Download encrypted production recovery set[\s\S]*openssl enc -d/u,
  );
  assert.match(
    source,
    /--file "\$plain_root\/data\.sql"[\s\S]*--file "\$plain_root\/application-data\.sql"/u,
  );
  assert.match(
    source,
    /compare-schema-snapshots\.mjs[\s\S]*--left "\$recovery_root\/restored-schema\.json"[\s\S]*--right "\$recovery_root\/remote-schema\.json"[\s\S]*--profile supabase-application-restore-v1/u,
  );
  assert.match(
    source,
    /Fast-forward production release branch[\s\S]*verify-production-authenticated-runtime:[\s\S]*Exercise canonical authenticated production behavior/u,
  );
  assert.doesNotMatch(source, /continue-on-error:\s*true/u);
  assert.doesNotMatch(source, /update\s+cron\.job/iu);
  assert.doesNotMatch(source, /VERCEL_TOKEN|vercel deploy|vercel promote/u);
  assert.doesNotMatch(source, /permissions:[\s\S]{0,100}contents:\s*write/u);
  assert.doesNotMatch(source, /retention-days:\s*30/u);
  assert.doesNotMatch(source, /SUPABASE_DB_PASSWORD[\s\S]{0,300}(?:sha256|hmac)[\s\S]{0,300}backup/iu);
  // The runner context exists only after a job starts, so evidence paths stay on consuming steps.
  assert.doesNotMatch(
    source,
    /verify-production-authenticated-runtime:[\s\S]*?\n    env:\n(?:      [^\n]*\n)*?      [^\n]*runner\.temp/u,
    "runner context must not be referenced from job-level env",
  );
  assert.match(
    source,
    /Exercise canonical authenticated production behavior[\s\S]*?env:[\s\S]*?PHASE15_PRODUCTION_RUNTIME_EVIDENCE: \$\{\{ runner\.temp \}\}/u,
  );
  assert.match(
    source,
    /Require sanitized authenticated-runtime certificate[\s\S]*?env:[\s\S]*?PHASE15_PRODUCTION_RUNTIME_EVIDENCE: \$\{\{ runner\.temp \}\}/u,
  );
});
