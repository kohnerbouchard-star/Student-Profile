import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildForwardBundle,
  loadPhase15Migrations,
  PHASE15_COMMON_COUNT,
  PRODUCTION_PRELUDE,
  stripOuterTransaction,
} from "./build-phase15-forward-bundle.mjs";
import { verifyLedger } from "./verify-phase15-ledger.mjs";

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

test("staging and production selections bind the certified 150 plus exact prelude", async () => {
  const staging = await loadPhase15Migrations("staging");
  const production = await loadPhase15Migrations("production");
  assert.equal(staging.length, PHASE15_COMMON_COUNT);
  assert.equal(production.length, PHASE15_COMMON_COUNT + PRODUCTION_PRELUDE.length);
  assert.deepEqual(production.slice(0, PRODUCTION_PRELUDE.length).map((row) => row.filename), PRODUCTION_PRELUDE);
  assert.deepEqual(production.slice(PRODUCTION_PRELUDE.length).map((row) => row.filename), staging.map((row) => row.filename));
  assert.equal(staging.at(-1).filename, "20260920082100_phase15_close_live_shaped_schema_parity_v1.sql");
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

test("ledger verifier rejects source, name, and statement-count drift", async () => {
  const manifest = {
    schemaVersion: 1,
    environment: "staging",
    migrations: [{ version: "20260920082100", name: "close", sourceSha256: "a".repeat(64) }],
  };
  const valid = [{ version: "20260920082100", name: "close", sha256: "a".repeat(64), statementCount: 1 }];
  assert.equal(verifyLedger(manifest, valid).ok, true);
  assert.throws(() => verifyLedger(manifest, [{ ...valid[0], name: "renamed" }]), /name mismatch/u);
  assert.throws(() => verifyLedger(manifest, [{ ...valid[0], sha256: "b".repeat(64) }]), /digest mismatch/u);
  assert.throws(() => verifyLedger(manifest, [{ ...valid[0], statementCount: 2 }]), /one immutable source/u);
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
});
