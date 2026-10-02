import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/phase15-controlled-production.yml";

const pushPredicate = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const productionPredicate = "github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main'";
const holds = [
  ["database-replay.yml", "replay", ["live-shaped-rehearsal"], pushPredicate],
  ["phase15-controlled-staging.yml", "static-contract", [
    "certify-source", "converge-staging-database", "converge-staging-runtime", "exercise-staging",
  ], pushPredicate],
  ["phase15-controlled-production.yml", "static-contract", [
    "certify-staging", "converge-production-database", "converge-production-runtime", "publish-production-release",
  ], productionPredicate],
];

function assertQualificationHold(source, filename, active, held, predicate) {
  const [events, jobs] = source.split(/^jobs:\s*$/mu);
  assert.ok(jobs, `${filename}: missing jobs`);
  const blocks = [...jobs.matchAll(/^  ([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/gmu)];
  assert.deepEqual(blocks.map((match) => match[1]), [active, ...held], `${filename}: unreviewed job set`);
  const byName = new Map(blocks.map((match) => [match[1], match[2]]));
  assert.doesNotMatch(byName.get(active), /^    (?:if|environment):/mu, `${filename}: local/static job gated`);
  assert.match(byName.get(active), /steps:\n/u);
  for (const job of held) {
    const condition = byName.get(job).match(/^    if: >-\n((?:      [^\n]*\n)+)/mu)?.[1];
    assert.equal(condition?.trim().replace(/\s+/gu, " "), `false && (${predicate})`, `${filename}/${job}: hold bypass or changed predicate`);
    assert.ok(byName.get(active).includes(`${job}: NOT_RUN — owner-approved U1 hold.`), `${filename}/${job}: missing disclosure`);
  }
  assert.doesNotMatch(events, /^  (?:workflow_run|repository_dispatch|schedule):/mu, `${filename}: automatic chain or bypass trigger`);
  if (filename !== "database-replay.yml") assert.doesNotMatch(events, /^  workflow_dispatch:/mu);
  assert.match(events, /^  pull_request:/mu);
  assert.match(events, /^  push:/mu);
}

test("U1 holds every hosted job while static and disposable jobs stay enabled", async () => {
  for (const [filename, active, held, predicate] of holds) {
    const source = await readFile(`.github/workflows/${filename}`, "utf8");
    assertQualificationHold(source, filename, active, held, predicate);
  }
});

test("U1 hold contract rejects per-job bypasses, new jobs and restored event chaining", async () => {
  for (const [filename, active, held, predicate] of holds) {
    const source = await readFile(`.github/workflows/${filename}`, "utf8");
    const verify = (value) => assertQualificationHold(value, filename, active, held, predicate);
    for (const job of held) {
      const start = source.indexOf(`  ${job}:\n`);
      const guard = source.indexOf("false &&", start);
      for (const bypass of ["true &&", "vars.U1_RELEASE_ALLOWED &&", "false ||"]) {
        assert.throws(() => verify(source.slice(0, guard) + source.slice(guard).replace("false &&", bypass)));
      }
    }
    assert.throws(() => verify(source.replace(`  ${active}:\n`, `  ${active}:\n    if: false\n`)));
    assert.throws(() => verify(`${source}\n  unreviewed-hosted-job:\n    runs-on: ubuntu-latest\n`));
    assert.throws(() => verify(source.replace("on:\n", "on:\n  workflow_run:\n    workflows: [Phase 15 Controlled Staging Convergence]\n    types: [completed]\n")));
  }
});

test("dormant production promotion retains exact successful Phase 15 staging evidence", async () => {
  const source = await readFile(workflowPath, "utf8");
  for (const marker of [
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
    "supabase-application-restore-v1",
    "schemaComparisonProfile",
    "comparison_status=0",
    "phase15-production-database-evidence/restore-schema-comparison.json",
    "reset-default-privileges.sql",
    "pg_default_acl",
    "aclexplode",
    "disposableDefaultPrivilegesReset",
    "Disposable target default ACL reset left rows behind",
    "phase15-target-default-acls.dump",
    "pg_restore --list",
    "DEFAULT ACL public",
    "$NF == \"supabase_admin\"",
    'test "$target_default_acl_entry_count" -eq 3',
    "pg_restore",
    "--use-list=/tmp/phase15-target-default-acls.selected.list",
    "--file=/tmp/phase15-target-default-acls.sql",
    "disposableTargetDefaultPrivilegesRestoredAfterSchema",
    "disposableTargetDefaultPrivilegeEntryCount",
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
  assert.match(
    source,
    /pg_dump -U supabase_admin[\s\S]*--file \/tmp\/phase15-target-default-acls\.dump[\s\S]*--file \/tmp\/phase15-reset-default-privileges\.sql[\s\S]*--file \/tmp\/phase15-schema\.sql[\s\S]*--file \/tmp\/phase15-target-default-acls\.sql/u,
  );
  assert.match(
    source,
    /--file \/tmp\/phase15-roles\.sql[\s\S]*--file \/tmp\/phase15-reset-default-privileges\.sql[\s\S]*--file \/tmp\/phase15-schema\.sql/u,
  );
  assert.doesNotMatch(source, /--file \/tmp\/phase15-data\.sql/u);
  assert.doesNotMatch(
    source,
    /WHERE pg_catalog\.pg_get_userbyid\(default_acl\.defaclrole\) = 'postgres'/u,
  );
  assert.doesNotMatch(
    source,
    /grep -F ' DEFAULT ACL '/u,
  );
  assert.doesNotMatch(
    source,
    /\$0 ~ \/ DEFAULT ACL \/ && \$NF/u,
  );
  assert.match(
    source,
    /compare-schema-snapshots\.mjs[\s\S]*--left "\$recovery_root\/restored-schema\.json"[\s\S]*--right "\$recovery_root\/remote-schema\.json"[\s\S]*--profile supabase-application-restore-v1/u,
  );
  assert.doesNotMatch(
    source,
    /compare-schema-snapshots\.mjs[\s\S]*--left "\$recovery_root\/remote-schema\.json"[\s\S]*--right "\$recovery_root\/restored-schema\.json"/u,
  );
  assert.doesNotMatch(source, /continue-on-error:\s*true/u);
  assert.doesNotMatch(source, /update\s+cron\.job/iu);
  assert.doesNotMatch(source, /VERCEL_TOKEN|vercel deploy|vercel promote/u);
});
