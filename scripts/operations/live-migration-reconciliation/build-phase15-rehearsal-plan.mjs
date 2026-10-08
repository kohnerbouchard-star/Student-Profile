#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPhase15Migrations, PHASE15_END, PHASE15_CUTOFF, PHASE15_COMMON_COUNT, PRODUCTION_PRELUDE } from "./build-phase15-forward-bundle.mjs";
import { verifyLedger, verifyLedgerPrefix } from "./verify-phase15-ledger.mjs";

const directory = fileURLToPath(new URL("../../../backend/supabase/migrations/", import.meta.url));
export const NONCE_SUFFIX = Object.freeze({
  order: 1,
  filename: "20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1.sql",
  version: "20260921044500",
  name: "reconcile_internal_runner_nonce_service_role_authority_v1",
  sourceSha256: "5c561f2bd09a2c010cb36650242c29a04d3b2ad8920043c1055db6f350d38d54",
  rawSha256: "5eeaa1f631f4f532835b92f344bdafe62d6ee0690e785991e9e419f025841466",
  statementCount: 1,
});

// Independently approved suffixes; immutable Phase15 manifests/certificates stay unchanged.
export const APPROVED_SUFFIXES = Object.freeze([NONCE_SUFFIX,
  Object.freeze({"order": 2,"filename": "20261004145731_add_loan_liability_contract_v1.sql","version": "20261004145731","name": "add_loan_liability_contract_v1","sourceSha256": "68db868ce5dcaeb2cc166be3e8a2f007e56564906fa8cf9bf0793ba716fd28ea","rawSha256": "9aaafa96b25d981d1bfece7ed1f64c185a0f8c0c35ca774fa09a23adfcacd5e0","statementCount": 1}),
  Object.freeze({"order": 3,"filename": "20261004202506_reconcile_loan_liability_purge_graph_v1.sql","version": "20261004202506","name": "reconcile_loan_liability_purge_graph_v1","sourceSha256": "87385e44df78a4649f35ed3e39630c83a30fe3ec0b895e4f4d5508e7005ce9b8","rawSha256": "b8d24a799eba7ef55f93132888daf8bdbb75d12e78bc17c272dceb39e2a3c456","statementCount": 1}),
  Object.freeze({"order":4,"filename":"20261004221307_prepare_business_loan_bindings_v1.sql","version":"20261004221307","name":"prepare_business_loan_bindings_v1","sourceSha256":"cd36eee2482087b584e8fbe4edb3235178ab1d255364937d1edbfd2c0df1917c","rawSha256":"7bf22dd6bd3d10881b52a2cab44f127d836064bf15e66b291c724ac54a094ea7","statementCount":1}),
  Object.freeze({"order":5,"filename":"20261004235046_add_private_business_loan_sales_assessment_v1.sql","version":"20261004235046","name":"add_private_business_loan_sales_assessment_v1","sourceSha256":"1a48a858950985ae579c09a310ced25ae8741f63d84530d70d00f8917c925e69","rawSha256":"26a09c87287ff685493d8a5aec4f9e5478cd6ff49c9cb925104939bb5cc4021d","statementCount":1}),
  Object.freeze({"order":6,"filename":"20261005004013_add_gated_business_loan_submission_v1.sql","version":"20261005004013","name":"add_gated_business_loan_submission_v1","sourceSha256":"d77267442bf98917b2531c394285128d909e3dd76bd3b04f32f4b6980a061956","rawSha256":"e9ab53f6d86cfe0712c5366ee8f174b7331a23ddcb210056d0bd4bd3f6b77ab2","statementCount":1}),
  Object.freeze({"order":7,"filename":"20261005212732_system_account_recovery_v1.sql","version":"20261005212732","name":"system_account_recovery_v1","sourceSha256":"eea1adcd5992a8bc6b40fe1d7f4ca196cd07fb38b0af4d1cf4698a17bda6b9fe","rawSha256":"05bde9fe9bb9e6a0f3024e8f0ab2b189cc75e513e1bcc70fd933600f5a0e0d93","statementCount":1}),
  Object.freeze({"order":8,"filename":"20261007221252_system_account_recovery_targets_v2.sql","version":"20261007221252","name":"system_account_recovery_targets_v2","sourceSha256":"4a67f0a36dc310c1bc98a121364148bb9221923e173026e2b749a207866c6b0a","rawSha256":"3f2fab06e884df2b463809f1e953f6d9926cd07314a108c52cfc74830284b474","statementCount":1})
]);

export async function buildRehearsalPlan(bundle, migrationsDirectory = directory) {
  const expected = await loadPhase15Migrations(bundle.environment, migrationsDirectory);
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.cutoff, PHASE15_CUTOFF);
  assert.equal(bundle.commonMigrationCount, PHASE15_COMMON_COUNT);
  assert.equal(bundle.preludeMigrationCount, bundle.environment === "production" ? PRODUCTION_PRELUDE.length : 0);
  assert.equal(bundle.migrationCount, expected.length);
  assert.deepEqual(bundle.migrations, expected.map(({ order, filename, version, name, sourceSha256, outerTransactionStripped }) => ({
    order, filename, version, name, sourceSha256, statementCount: 1, outerTransactionStripped,
  })), "Immutable bundle identity/order/digest mismatch.");
  const later = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql") && name.slice(0, 14) > PHASE15_END).sort();
  assert.deepEqual(later, APPROVED_SUFFIXES.map(row => row.filename), "Unapproved or missing post-bundle suffix.");
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  for (const suffix of APPROVED_SUFFIXES) {
    const source = await readFile(path.join(migrationsDirectory, suffix.filename));
    assert.equal(digest(source), suffix.rawSha256, "Suffix raw digest mismatch.");
    assert.equal(digest(source.toString("utf8").replaceAll("\r\n", "\n").trim()), suffix.sourceSha256);
  }
  return { schemaVersion: 1, bundle, suffix: { schemaVersion: 1, environment: bundle.environment,
    migrationCount: APPROVED_SUFFIXES.length, migrations: APPROVED_SUFFIXES } };
}

export function partitionRehearsalLedger(plan, live) {
  const expected = [...plan.bundle.migrations, ...plan.suffix.migrations];
  assert.ok(Array.isArray(live), "Ledger must be an array.");
  assert.ok(live.length <= expected.length, "Unexpected post-bundle ledger entries.");
  assert.deepEqual(live.map((row) => String(row.version)), expected.slice(0, live.length).map((row) => row.version), "Ledger is not a contiguous bundle-plus-suffix prefix.");
  const manifest = { schemaVersion: 1, environment: plan.bundle.environment, migrations: expected };
  if (live.length === expected.length) verifyLedger(manifest, live);
  else if (live.length) verifyLedgerPrefix(manifest, live);
  const bundleRows = live.slice(0, plan.bundle.migrationCount);
  const suffixRows = live.slice(plan.bundle.migrationCount);
  return {
    bundleRows, suffixRows,
    suffixLedgerVerified: suffixRows.length === plan.suffix.migrationCount,
    pendingSuffix: plan.suffix.migrations.slice(suffixRows.length).map((row) => row.filename),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestPath, ledgerPath] = process.argv.slice(2);
  assert.ok(manifestPath, "Usage: build-phase15-rehearsal-plan.mjs MANIFEST [LEDGER]");
  const plan = await buildRehearsalPlan(JSON.parse(await readFile(manifestPath, "utf8")));
  const value = ledgerPath ? partitionRehearsalLedger(plan, JSON.parse(await readFile(ledgerPath, "utf8"))) : plan;
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
