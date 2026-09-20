#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value !== undefined, `Invalid argument near ${key ?? "end"}.`);
    values.set(key, value);
  }
  assert(values.get("--manifest"), "--manifest is required.");
  assert(values.get("--live"), "--live is required.");
  return values;
}

export function verifyLedger(manifest, liveValue) {
  assert.equal(manifest?.schemaVersion, 1, "Unsupported Phase 15 manifest.");
  const expected = manifest.migrations || [];
  const live = Array.isArray(liveValue) ? liveValue : liveValue?.migrations;
  assert(Array.isArray(live), "Live ledger evidence must be an array.");
  assert.equal(live.length, expected.length, "Live Phase 15 ledger count does not match the manifest.");

  const byVersion = new Map(live.map((row) => [String(row.version), row]));
  assert.equal(byVersion.size, live.length, "Live Phase 15 ledger contains duplicate versions.");
  for (const migration of expected) {
    const row = byVersion.get(migration.version);
    assert(row, `Live ledger is missing ${migration.version}.`);
    assert.equal(String(row.name || ""), migration.name, `${migration.version} name mismatch.`);
    assert.equal(String(row.sha256 || "").toLowerCase(), migration.sourceSha256, `${migration.version} statement digest mismatch.`);
    assert.equal(Number(row.statementCount), 1, `${migration.version} must retain one immutable source statement.`);
  }
  return Object.freeze({
    ok: true,
    environment: manifest.environment,
    migrationCount: expected.length,
    firstMigration: expected.at(0)?.filename ?? null,
    lastMigration: expected.at(-1)?.filename ?? null,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(options.get("--manifest"), "utf8"));
  const live = JSON.parse(await readFile(options.get("--live"), "utf8"));
  process.stdout.write(`${JSON.stringify(verifyLedger(manifest, live), null, 2)}\n`);
}
