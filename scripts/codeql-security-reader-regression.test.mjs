import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const owners = [
  "backend/src/security/adminBffRequestAuth.ts",
  "backend/src/security/adminBffOidcVerification.ts",
  "backend/src/security/adminBffTargetPolicy.ts",
  "backend/src/security/adminBffCrypto.ts",
];

// Execute the real contract with read-time faults. Runtime sources remain untouched.
function runContract({ target, mode } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "codeql-owner-regression-"));
  const preload = path.join(directory, "preload.cjs");
  const trace = path.join(directory, "reads.jsonl");
  writeFileSync(preload, `
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { syncBuiltinESMExports } = require("node:module");
const original = fs.readFileSync;
const root = ${JSON.stringify(root)};
const target = ${JSON.stringify(target ?? null)};
const mode = ${JSON.stringify(mode ?? null)};
fs.readFileSync = function (file, ...args) {
  const absolute = file instanceof URL ? fileURLToPath(file) : path.resolve(String(file));
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify(relative) + "\\n");
  if (relative === target && mode === "missing") {
    const error = new Error("Missing required owner: " + relative);
    error.code = "ENOENT";
    throw error;
  }
  const source = original.call(this, file, ...args);
  if (relative === target && mode === "forbidden") return String(source) + "\\naudience.includes(\\n";
  if (relative === target && mode === "remove-positive") return String(source).replaceAll("maximumUnbiasedByte", "removedPositiveMarker");
  // A tempting unrelated source must never be consulted to replace required owners.
  if (relative === "backend/src/security/unrelated.ts") return "maximumUnbiasedByte audience.includes(";
  return source;
};
syncBuiltinESMExports();
`);
  try {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--require", preload, "--test", "scripts/codeql-security-remediation.test.mjs"], {
      cwd: root, env, encoding: "utf8", timeout: 30000,
    });
    assert.ifError(result.error);
    assert.ok(result.stdout || result.stderr, "Child contract must report its result");
    const reads = readFileSync(trace, "utf8").trim().split("\n").map(JSON.parse);
    return { ...result, reads, output: result.stdout + result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("CodeQL contract reads exactly the four installed BFF owners", () => {
  const result = runContract();
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.reads.filter((file) => file.startsWith("backend/src/security/")), owners);
});

for (const owner of owners) {
  test(`CodeQL contract rejects forbidden audience matching in ${owner}`, () => {
    const result = runContract({ target: owner, mode: "forbidden" });
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, /audience/);
    assert.ok(result.reads.includes(owner));
  });
  test(`CodeQL contract fails closed when ${owner} is missing`, () => {
    const result = runContract({ target: owner, mode: "missing" });
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, /Missing required owner/);
  });
}

test("unrelated source cannot introduce a forbidden BFF marker", () => {
  const result = runContract({ target: "backend/src/security/unrelated.ts", mode: "forbidden" });
  assert.equal(result.status, 0, result.output);
  assert.ok(!result.reads.includes("backend/src/security/unrelated.ts"));
});

test("unrelated source cannot replace a missing required positive marker", () => {
  const result = runContract({ target: "backend/src/domains/players/api/playerLoginHttpHandler.ts", mode: "remove-positive" });
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /maximumUnbiasedByte/);
  assert.ok(!result.reads.includes("backend/src/security/unrelated.ts"));
});
