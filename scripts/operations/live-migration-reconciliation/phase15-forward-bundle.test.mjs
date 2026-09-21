import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
