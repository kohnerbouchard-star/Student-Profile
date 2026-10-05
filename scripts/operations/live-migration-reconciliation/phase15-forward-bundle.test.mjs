import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, writeFile, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRehearsalPlan, partitionRehearsalLedger, NONCE_SUFFIX, APPROVED_SUFFIXES } from "./build-phase15-rehearsal-plan.mjs";
import test from "node:test";

import {
  buildForwardBundle,
  loadPhase15Migrations,
  PHASE15_COMMON_COUNT,
  PHASE15_END,
  PRODUCTION_PRELUDE,
  stripOuterTransaction,
} from "./build-phase15-forward-bundle.mjs";
import {
  normalizeSupabaseApplicationRestorePair,
  normalizeSupabaseHostedPair,
} from "./compare-schema-snapshots.mjs";
import { verifyLedger, verifyLedgerPrefix } from "./verify-phase15-ledger.mjs";

function immutableManifest(environment) {
  const text = execFileSync(process.execPath, [
    "scripts/operations/live-migration-reconciliation/build-phase15-forward-bundle.mjs",
    "--environment", environment, "--mode", "rollback", "--format", "manifest",
  ], { encoding: "utf8" });
  const digest = createHash("sha256").update(text).digest("hex");
  assert.equal(digest, environment === "staging"
    ? "75c84a56327ef8ca59090887a3f9bfcd187c8e7d8760935f365453a2d0f0591a"
    : "35b59274a80760d5b09d0aea3b89f2b3de0de2db30417d5e509b261f4cb4602f");
  return JSON.parse(text);
}

for (const environment of ["staging", "production"]) {
  test(`${environment} rehearsal preserves immutable bytes and accounts for suffix across ledger states`, async () => {
    const bundle = immutableManifest(environment);
    const before = JSON.stringify(bundle);
    const plan = await buildRehearsalPlan(bundle);
    assert.equal(JSON.stringify(bundle), before);
    assert.equal(plan.bundle.migrationCount, environment === "staging" ? 151 : 169);
    assert.deepEqual(plan.suffix.migrations, APPROVED_SUFFIXES);
    const rows = [...bundle.migrations, ...plan.suffix.migrations].map((row) => ({
      version: row.version, name: row.name, sha256: row.sourceSha256, statementCount: 1,
    }));
    for (const count of [0, 1, bundle.migrationCount - 1, ...Array.from({ length: APPROVED_SUFFIXES.length + 1 }, (_, i) => bundle.migrationCount + i)]) {
      const result = partitionRehearsalLedger(plan, rows.slice(0, count));
      assert.equal(result.bundleRows.length, Math.min(count, bundle.migrationCount));
      assert.equal(result.suffixRows.length, Math.max(0, count - bundle.migrationCount));
      assert.equal(result.suffixLedgerVerified, count === rows.length);
      assert.deepEqual(result.pendingSuffix, APPROVED_SUFFIXES.slice(Math.max(0, count - bundle.migrationCount)).map(row => row.filename));
    }
    for (const invalid of [
      [rows.at(-1)], rows.slice(1), [rows[1], rows[0]], [...rows, rows.at(-1)],
      [...rows.slice(0, -1), { ...rows.at(-1), version: "20990101000000" }],
      ...["sha256", "name", "statementCount"].map((field) => [
        ...rows.slice(0, -1), { ...rows.at(-1), [field]: field === "statementCount" ? 2 : "tampered" },
      ]),
    ]) assert.throws(() => partitionRehearsalLedger(plan, invalid));
    const altered = structuredClone(bundle);
    altered.migrations.reverse();
    await assert.rejects(buildRehearsalPlan(altered), /identity\/order\/digest mismatch/u);
  });
}

test("rehearsal rejects changed, missing or unapproved suffix before host access", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "phase15-rehearsal-"));
  try {
    await cp("backend/supabase/migrations", directory, { recursive: true });
    const bundle = immutableManifest("staging");
    const suffixPath = path.join(directory, NONCE_SUFFIX.filename);
    const source = await readFile(suffixPath);
    const selectedByOldShell = (await readdir(directory)).filter((name) => name.endsWith(".sql") && name.slice(0, 14) >= "20260819062000" && name.slice(0, 14) <= NONCE_SUFFIX.version);
    assert.equal(selectedByOldShell.length, 152, "retain the original 151-versus-152 reproduction");
    await buildRehearsalPlan(bundle, directory);
    for (const registered of APPROVED_SUFFIXES.slice(1)) {
      const candidate = path.join(directory, registered.filename), original = await readFile(candidate);
      await writeFile(candidate, Buffer.concat([original, Buffer.from("\n")]));
      await assert.rejects(buildRehearsalPlan(bundle, directory), /raw digest mismatch/u);
      await rm(candidate);
      await assert.rejects(buildRehearsalPlan(bundle, directory), /missing post-bundle/u);
      await writeFile(candidate, original);
    }
    await writeFile(suffixPath, Buffer.concat([source, Buffer.from("\n")]));
    await assert.rejects(buildRehearsalPlan(bundle, directory), /raw digest mismatch/u);
    await rm(suffixPath);
    await assert.rejects(buildRehearsalPlan(bundle, directory), /missing post-bundle/u);
    await writeFile(suffixPath, source);
    await writeFile(path.join(directory, "20990101000000_unapproved.sql"), "select 1;");
    await assert.rejects(buildRehearsalPlan(bundle, directory), /Unapproved/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shell binds separate suffix evidence without changing immutable certificate accounting", async () => {
  const source = await readFile("scripts/operations/live-migration-reconciliation/rehearse-live-shaped-upgrade.sh", "utf8");
  assert.ok(source.indexOf('"$manifest_path" > "$plan_path"') < source.indexOf("supabase start"));
  assert.ok(source.indexOf("UNVERIFIED_REHEARSAL_LEDGER") < source.indexOf('echo "Applying $migration"'));
  assert.match(source, /\.bundle\.migrations\[\]\.version, \.suffix\.migrations\[\]\.version/u);
  assert.match(source, /or version > '20260920082200'/u);
  assert.match(source, /all_pending=\("\$\{pending_migrations\[@\]\}" "\$\{pending_suffix\[@\]\}"\)/u);
  assert.match(source, /postBundleSuffix:/u);
  assert.match(source, /certified_count="\$\{#selected_migrations\[@\]\}"/u);
  assert.match(source, /commonForwardMigrationCount: Number\(process.env.PHASE15_COMMON_FORWARD_COUNT\)/u);
  assert.match(source, /canonicalApplicationSchemaMatched: schemaComparisonExit === 0/u);
  assert.doesNotMatch(source, /Expected 151 forward migrations/u);
});

test("actual shell application loop separates bundle/suffix logs and fails on suffix error", async () => {
  const source = await readFile("scripts/operations/live-migration-reconciliation/rehearse-live-shaped-upgrade.sh", "utf8");
  const loop = source.slice(source.indexOf('all_pending=('), source.indexOf('\nfailed_migration=""\ncapture_local_snapshot'));
  const fixture = await mkdtemp(path.join(tmpdir(), "phase15-shell-"));
  try {
    for (const environment of ["staging", "production"]) {
      const plan = await buildRehearsalPlan(immutableManifest(environment));
      for (const [bundlePending, suffixPending, failSuffix] of [[true, true, false], [false, true, false], [false, false, false], [false, true, true]]) {
        await writeFile(path.join(fixture, "plan.json"), JSON.stringify(plan));
        const script = `set -euo pipefail
repo_root="$PWD"
container="unused-stub-target"
plan_path="$FIXTURE/plan.json"
applied_path="$FIXTURE/applied"
suffix_applied_path="$FIXTURE/suffix-applied"
certified_path="$FIXTURE/certified"
failure_path="$FIXTURE/failure.json"
: > "$applied_path"
: > "$suffix_applied_path"
rm -f "$failure_path"
mapfile -t selected_migrations < <(jq -r '.bundle.migrations[].filename' "$plan_path")
pending_migrations=()
pending_suffix=()
if test "$BUNDLE_PENDING" = true; then pending_migrations=("\${selected_migrations[@]}"); fi
if test "$SUFFIX_PENDING" = true; then mapfile -t pending_suffix < <(jq -r '.suffix.migrations[].filename' "$plan_path"); fi
docker() {
  cat > /dev/null
  if test "$FAIL_SUFFIX" = true && [[ "$failed_migration" == 20260921044500_* ]]; then return 1; fi
}
${loop}
test "$certified_count" -eq "\${#selected_migrations[@]}"
test "$suffix_certified_count" -eq ${APPROVED_SUFFIXES.length}
`;
        const execute = () => execFileSync("bash", ["-c", script], { encoding: "utf8", env: {
          ...process.env, FIXTURE: fixture, PHASE15_ENVIRONMENT: environment,
          BUNDLE_PENDING: String(bundlePending), SUFFIX_PENDING: String(suffixPending), FAIL_SUFFIX: String(failSuffix),
        } });
        if (failSuffix) {
          assert.throws(execute);
          const failure = JSON.parse(await readFile(path.join(fixture, "failure.json"), "utf8"));
          assert.equal(failure.failedMigration, NONCE_SUFFIX.filename);
          assert.equal(failure.errorClass, "MIGRATION_APPLICATION_FAILED");
        } else execute();
        const lines = async (name) => (await readFile(path.join(fixture, name), "utf8")).split("\n").filter(Boolean);
        assert.equal((await lines("applied")).length, bundlePending ? plan.bundle.migrationCount : 0);
        assert.deepEqual(await lines("suffix-applied"), suffixPending && !failSuffix ? APPROVED_SUFFIXES.map(row => row.filename) : []);
      }
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("outer transaction normalization preserves comments and procedural BEGIN blocks", () => {
  const source = `-- retained\nbegin;\ncreate function public.sample() returns void language plpgsql as $$\nbegin\n  null;\nend;\n$$;\ncommit;`;
  const result = stripOuterTransaction(source, "sample.sql");
  assert.equal(result.stripped, true);
  assert.match(result.body, /^-- retained/u);
  assert.match(result.body, /\$\$\nbegin\n  null;/u);
  assert.doesNotMatch(result.body, /\ncommit;\s*$/iu);

  const unwrapped = stripOuterTransaction("create table public.sample(id integer);", "plain.sql");
  assert.equal(unwrapped.stripped, false);
});

test("outer transaction normalization fails closed on an incomplete wrapper", () => {
  assert.throws(
    () => stripOuterTransaction("-- migration\nbegin;\nselect 1;", "broken.sql"),
    /no final COMMIT/u,
  );
});

test("staging and production selections bind the certified 151 plus exact prelude", async () => {
  const staging = await loadPhase15Migrations("staging");
  const production = await loadPhase15Migrations("production");
  assert.equal(staging.length, PHASE15_COMMON_COUNT);
  assert.equal(production.length, PHASE15_COMMON_COUNT + PRODUCTION_PRELUDE.length);
  assert.deepEqual(production.slice(0, PRODUCTION_PRELUDE.length).map((row) => row.filename), PRODUCTION_PRELUDE);
  assert.deepEqual(production.slice(PRODUCTION_PRELUDE.length).map((row) => row.filename), staging.map((row) => row.filename));
  assert.equal(PHASE15_END, "20260920082200");
  assert.equal(staging.at(-1).filename, "20260920082200_phase15_close_database_advisor_findings_v1.sql");
  assert.equal(
    staging.some((row) => row.filename.includes("20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1")),
    false,
  );
});

test("bundles are one fail-closed transaction with exact ledger sources and economic assertions", async () => {
  const migrations = await loadPhase15Migrations("staging");
  const rollback = buildForwardBundle({ environment: "staging", mode: "rollback", migrations });
  const apply = buildForwardBundle({ environment: "staging", mode: "apply", migrations });
  assert.match(rollback, /^\\set ON_ERROR_STOP on\nbegin isolation level repeatable read;/u);
  assert.match(rollback, /PHASE15_ECONOMIC_INVARIANT_DRIFT/u);
  assert.match(rollback, /pg_catalog\.trim_scale\(coalesce\(sum\(balance\), 0\)::numeric\)::text/u);
  assert.match(rollback, /phase15_account_balances_before/u);
  assert.match(rollback, /PHASE15_EXISTING_ACCOUNT_PROJECTION_DRIFT/u);
  assert.match(rollback, /PHASE15_INVALID_NEW_ACCOUNT_PROJECTION/u);
  assert.match(rollback, /current_row\.balance is distinct from 0::numeric/u);
  assert.match(rollback, /current_row\.bank_account_id is null/u);
  assert.match(rollback, /'existingEconomicFieldsMatched', true/u);
  assert.match(rollback, /'newRowsAreCanonicalUnpostedZeroBalances', true/u);
  assert.match(rollback, /PHASE15_EXPECTED_LEDGER_VERSION_ALREADY_PRESENT/u);
  assert.match(rollback, /economicInvariantsMatched/u);
  assert.match(rollback, /rollback;\s*$/u);
  assert.match(apply, /commit;\s*$/u);
  for (const migration of migrations) {
    assert.match(rollback, new RegExp(`values \\('${migration.version}',`, "u"));
    assert.match(rollback, new RegExp(`\\$phase15_${migration.version}_0\\$`, "u"));
  }
});

test("bundle construction accepts only a contiguous certified suffix", async () => {
  const migrations = await loadPhase15Migrations("staging");
  const suffix = migrations.slice(-1);
  const rollback = buildForwardBundle({
    environment: "staging",
    mode: "rollback",
    migrations: suffix,
    startIndex: migrations.length - 1,
    totalMigrationCount: migrations.length,
  });
  assert.match(rollback, new RegExp(`values \\('${suffix[0].version}',`, "u"));
  assert.doesNotMatch(rollback, new RegExp(migrations.at(-2).version, "u"));
  assert.match(rollback, /'migrationCount', 1/u);
  assert.match(rollback, /'certifiedMigrationCount', 151/u);
  assert.match(rollback, /'startIndex', 150/u);
  assert.throws(
    () => buildForwardBundle({
      environment: "staging",
      mode: "rollback",
      migrations: suffix,
      startIndex: migrations.length - 2,
      totalMigrationCount: migrations.length,
    }),
    /suffix migrations/u,
  );
});

test("ledger verifier rejects drift and accepts only an immutable contiguous prefix", () => {
  const manifest = {
    schemaVersion: 1,
    environment: "staging",
    migrations: [
      { filename: "first.sql", version: "20260920082100", name: "close", sourceSha256: "a".repeat(64) },
      { filename: "second.sql", version: "20260920082200", name: "advisor", sourceSha256: "b".repeat(64) },
    ],
  };
  const first = { version: "20260920082100", name: "close", sha256: "a".repeat(64), statementCount: 1 };
  const second = { version: "20260920082200", name: "advisor", sha256: "b".repeat(64), statementCount: 1 };
  assert.equal(verifyLedger(manifest, [first, second]).ok, true);
  assert.equal(verifyLedgerPrefix(manifest, [first]).verificationMode, "contiguous-prefix");
  assert.throws(() => verifyLedger(manifest, [{ ...first, name: "renamed" }, second]), /name mismatch/u);
  assert.throws(() => verifyLedger(manifest, [{ ...first, sha256: "c".repeat(64) }, second]), /digest mismatch/u);
  assert.throws(() => verifyLedger(manifest, [{ ...first, statementCount: 2 }, second]), /one immutable source/u);
  assert.throws(() => verifyLedgerPrefix(manifest, [second]), /contiguous certified prefix/u);
  assert.throws(() => verifyLedgerPrefix(manifest, [first, second]), /incomplete ledger/u);
});

test("live runner quiesces schedulers behind a self-restoring maintenance lease", async () => {
  const source = await readFile(
    "scripts/operations/live-migration-reconciliation/run-phase15-live-convergence.sh",
    "utf8",
  );
  assert.match(source, /phase15-scheduler-auto-restore-v1/u);
  assert.match(source, /cron\.alter_job\(jobid, active => false\)/u);
  assert.match(source, /cron\.alter_job\(job_row\.jobid, active => true\)/u);
  assert.match(source, /run_row\.status = 'running'/u);
  assert.match(source, /sleep 30/u);
  assert.match(source, /trap cleanup_runtime_schedulers EXIT/u);
  assert.match(source, /restore_runtime_schedulers\n/u);
  assert.doesNotMatch(source, /update\s+cron\.job/iu);
  assert.match(source, /--profile supabase-hosted-live-v1/u);
});

test("live-shaped rehearsal accepts only an exact ledger or immutable contiguous prefix", async () => {
  const rehearsal = await readFile(
    "scripts/operations/live-migration-reconciliation/rehearse-live-shaped-upgrade.sh",
    "utf8",
  );
  const stagingWorkflow = await readFile(
    ".github/workflows/phase15-controlled-staging.yml",
    "utf8",
  );
  assert.match(rehearsal, /default_transaction_read_only=on/u);
  assert.match(rehearsal, /verify-phase15-ledger\.mjs/u);
  assert.match(rehearsal, /PARTIAL_REMOTE_MIGRATION_LEDGER/u);
  assert.match(rehearsal, /execution_mode="forward-rehearsal"/u);
  assert.match(rehearsal, /execution_mode="forward-suffix-rehearsal"/u);
  assert.match(rehearsal, /--mode prefix/u);
  assert.match(rehearsal, /execution_mode="already-current"/u);
  assert.match(rehearsal, /certifiedMigrationCount/u);
  assert.match(stagingWorkflow, /value\.certifiedMigrationCount !== expectedApplied/u);
  assert.match(stagingWorkflow, /value\.remoteLedgerPresentCount === expectedApplied/u);
  assert.match(stagingWorkflow, /value\.remoteLedgerVerified === true/u);
  assert.match(stagingWorkflow, /value\.appliedMigrationCount === 0/u);
});

test("hosted schema normalization accepts only the exact Supabase-managed role topology", () => {
  const common = [
    { role: "anon", member: "authenticator", grantor: "supabase_admin", adminOption: false },
  ];
  const canonical = {
    authorization: {
      roleMemberships: [
        ...common,
        { role: "supabase_functions_admin", member: "postgres", grantor: "supabase_admin", adminOption: false },
        { role: "supabase_realtime_admin", member: "postgres", grantor: "supabase_admin", adminOption: false },
      ],
    },
  };
  const hosted = {
    authorization: {
      roleMemberships: [
        ...common,
        { role: "postgres", member: "cli_login_postgres", grantor: "supabase_admin", adminOption: false },
      ],
    },
  };
  const normalized = normalizeSupabaseHostedPair(canonical, hosted);
  assert.deepEqual(normalized.left, normalized.right);
  assert.equal(normalized.validation.profile, "supabase-hosted-live-v1");

  const unexpected = normalizeSupabaseHostedPair(canonical, {
      authorization: {
        roleMemberships: [
          ...hosted.authorization.roleMemberships,
          { role: "postgres", member: "unexpected_login", grantor: "supabase_admin", adminOption: false },
        ],
      },
    });
  assert.notDeepEqual(unexpected.left, unexpected.right);
  assert.throws(
    () => normalizeSupabaseHostedPair(canonical, {
      authorization: {
        roleMemberships: [
          ...common,
          { role: "postgres", member: "cli_login_postgres", grantor: "wrong_grantor", adminOption: false },
        ],
      },
    }),
    /role-membership topology mismatch/u,
  );
});


test("application restore normalization preserves exact application schema authority", () => {
  const structural = {
    schemas: [{ name: "public" }, { name: "private" }],
    relations: [],
    columns: [],
    constraints: [],
    indexes: [],
    routines: [],
    triggers: [],
  };
  const commonMembership = {
    role: "anon",
    member: "authenticator",
    grantor: "supabase_admin",
    adminOption: false,
  };
  const authorization = ({ memberships, superuser, globalAcl }) => ({
    schemaGrants: [],
    schemaOwners: [{ schema: "public", owner: "postgres" }],
    relationOwners: [],
    routineOwners: [],
    roleAttributes: [{ role: "postgres", superuser }],
    roleMemberships: [commonMembership, ...memberships],
    rowSecurity: [],
    policies: [],
    tableGrants: [],
    routineGrants: [],
    defaultPrivileges: [
      { role: "postgres", schema: "public", objectType: "r", acl: "{=r/postgres}" },
      { role: "postgres", schema: "", objectType: "r", acl: globalAcl },
    ],
  });
  const canonical = {
    schemaVersion: "v2",
    structural,
    authorization: authorization({
      superuser: true,
      globalAcl: "{canonical}",
      memberships: [
        {
          role: "supabase_functions_admin",
          member: "postgres",
          grantor: "supabase_admin",
          adminOption: false,
        },
        {
          role: "supabase_realtime_admin",
          member: "postgres",
          grantor: "supabase_admin",
          adminOption: false,
        },
      ],
    }),
  };
  const hosted = {
    schemaVersion: "v2",
    structural,
    authorization: authorization({
      superuser: false,
      globalAcl: "{hosted}",
      memberships: [
        {
          role: "postgres",
          member: "cli_login_postgres",
          grantor: "supabase_admin",
          adminOption: false,
        },
      ],
    }),
  };
  const normalized = normalizeSupabaseApplicationRestorePair(canonical, hosted);
  assert.deepEqual(normalized.left, normalized.right);
  assert.equal(normalized.validation.profile, "supabase-application-restore-v1");
  assert.equal(normalized.validation.hostedTopology.profile, "supabase-hosted-live-v1");
  assert.deepEqual(
    normalized.validation.excludedManagedAuthorizationKeys,
    ["roleAttributes", "roleMemberships"],
  );
  assert.deepEqual(
    normalized.validation.excludedGlobalDefaultPrivilegeRows,
    { canonical: 1, hosted: 1 },
  );

  const changedOwner = structuredClone(hosted);
  changedOwner.authorization.schemaOwners[0].owner = "different_owner";
  const different = normalizeSupabaseApplicationRestorePair(canonical, changedOwner);
  assert.notDeepEqual(different.left, different.right);
});

test("REF025c2-1 is an independently registered fourth suffix without rewriting prior identities", () => {
  assert.equal(APPROVED_SUFFIXES.length, 6);
  assert.equal(APPROVED_SUFFIXES[3].filename, "20261004221307_prepare_business_loan_bindings_v1.sql");
  assert.equal(APPROVED_SUFFIXES[3].order, 4);
  assert.equal(APPROVED_SUFFIXES[3].statementCount, 1);
});

test("REF025c2-2a registers only the private assessment fifth suffix", () => {
  assert.equal(APPROVED_SUFFIXES[4].filename, "20261004235046_add_private_business_loan_sales_assessment_v1.sql");
  assert.equal(APPROVED_SUFFIXES[4].order, 5);
  assert.equal(APPROVED_SUFFIXES[4].statementCount, 1);
});

test("REF025c2-2b registers the gated submission sixth suffix", () => {
  assert.equal(APPROVED_SUFFIXES[5].filename, "20261005004013_add_gated_business_loan_submission_v1.sql");
  assert.equal(APPROVED_SUFFIXES[5].order, 6);
  assert.equal(APPROVED_SUFFIXES[5].statementCount, 1);
});
