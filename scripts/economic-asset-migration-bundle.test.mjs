#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const builder = path.join(root, "scripts/build-economic-asset-migration-bundle.mjs");

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "economic-asset-bundle-"));
  await writeFile(path.join(directory, "20260806120000_first_v2.sql"), [
    "-- first",
    "begin;",
    "set local lock_timeout = '5s';",
    "create table public.first_probe(id integer primary key);",
    "commit;",
    "",
  ].join("\n"));
  await writeFile(path.join(directory, "20260806120010_second_v2.sql"), [
    "-- second",
    "begin;",
    "set local statement_timeout = '120s';",
    "create table public.second_probe(id integer primary key);",
    "commit;",
    "",
  ].join("\n"));
  return directory;
}

function run(directory, mode, afterVersion = "") {
  const output = path.join(directory, `${mode}.sql`);
  const result = spawnSync(process.execPath, [
    builder,
    "--migrations-dir", directory,
    "--prefix", "2026080612",
    "--mode", mode,
    "--after-version", afterVersion,
    "--output", output,
  ], { encoding: "utf8" });
  return { ...result, output };
}

function assertOuterTransaction(sql, finalStatement) {
  assert.match(sql, /^\\set ON_ERROR_STOP on\n\nbegin;\n/u);
  assert.ok(sql.trimEnd().endsWith(finalStatement), `Expected outer ${finalStatement}`);
}

test("builder creates one atomic rollback rehearsal with exact ledger source text", async () => {
  const directory = await fixture();
  try {
    const result = run(directory, "rollback");
    assert.equal(result.status, 0, result.stderr);
    const sql = await readFile(result.output, "utf8");
    assertOuterTransaction(sql, "rollback;");
    assert.match(sql, /create table public\.first_probe/iu);
    assert.match(sql, /create table public\.second_probe/iu);
    assert.match(sql, /economic-asset-core-v2:20260806120000/iu);
    assert.match(sql, /economic-asset-core-v2:20260806120010/iu);
    assert.match(sql, /array\[\$migration_20260806120000\$/iu);
    assert.match(sql, /-- BEGIN 20260806120000_first_v2\.sql[\s\S]*-- END 20260806120000_first_v2\.sql/iu);
    assert.match(sql, /-- BEGIN 20260806120010_second_v2\.sql[\s\S]*-- END 20260806120010_second_v2\.sql/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("builder emits only the unapplied chronological tail", async () => {
  const directory = await fixture();
  try {
    const result = run(directory, "commit", "20260806120000");
    assert.equal(result.status, 0, result.stderr);
    const metadata = JSON.parse(result.stdout);
    assert.deepEqual(metadata.selectedVersions, ["20260806120010"]);
    const sql = await readFile(result.output, "utf8");
    assert.doesNotMatch(sql, /-- BEGIN 20260806120000_first_v2\.sql/iu);
    assert.match(sql, /-- BEGIN 20260806120010_second_v2\.sql/iu);
    assertOuterTransaction(sql, "commit;");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("prefix verification accepts an unapplied tail while still checking exact applied history", async () => {
  const directory = await fixture();
  try {
    const prefix = run(directory, "verify-prefix");
    assert.equal(prefix.status, 0, prefix.stderr);
    const prefixSql = await readFile(prefix.output, "utf8");
    assert.match(prefixSql, /ECONOMIC_ASSET_MIGRATION_PREFIX_MISMATCH/iu);
    assert.match(prefixSql, /remote_state as/iu);
    assert.match(prefixSql, /max\(m\.version\) as applied_through/iu);
    assert.match(prefixSql, /where s\.applied_through is not null[\s\S]*e\.version <= s\.applied_through/iu);
    assert.match(prefixSql, /row_number\(\) over \(order by e\.version\)/iu);
    assert.match(prefixSql, /cardinality\(r\.statements\) is distinct from 1/iu);
    assert.match(prefixSql, /r\.source_sha256 is distinct from e\.source_sha256/iu);
    assert.match(prefixSql, /r\.source_bytes is distinct from e\.source_bytes/iu);

    const full = run(directory, "verify-full");
    assert.equal(full.status, 0, full.stderr);
    const fullSql = await readFile(full.output, "utf8");
    assert.match(fullSql, /ECONOMIC_ASSET_MIGRATION_LEDGER_MISMATCH/iu);
    assert.match(fullSql, /expected_scope as \(\s*select e\.\* from expected_ranked e\s*\)/iu);
    assert.doesNotMatch(fullSql, /e\.version <= s\.applied_through/iu);
    assert.match(fullSql, /cardinality\(r\.statements\) is distinct from 1/iu);
    assert.match(fullSql, /r\.source_sha256 is distinct from e\.source_sha256/iu);
    assert.match(fullSql, /r\.source_bytes is distinct from e\.source_bytes/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("builder fails closed for an unknown applied-through version", async () => {
  const directory = await fixture();
  try {
    const result = run(directory, "commit", "20260806129999");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /is not in the migration manifest/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
