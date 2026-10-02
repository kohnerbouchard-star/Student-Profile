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
  assert.deepEqual(later, [NONCE_SUFFIX.filename], "Unapproved or missing post-bundle suffix.");
  const source = await readFile(path.join(migrationsDirectory, NONCE_SUFFIX.filename));
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  assert.equal(digest(source), NONCE_SUFFIX.rawSha256, "Suffix raw digest mismatch.");
  assert.equal(digest(source.toString("utf8").replaceAll("\r\n", "\n").trim()), NONCE_SUFFIX.sourceSha256);
  return { schemaVersion: 1, bundle, suffix: { schemaVersion: 1, environment: bundle.environment, migrationCount: 1, migrations: [NONCE_SUFFIX] } };
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
