import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { auditRuntimeSourceSize, measuredLines, POLICY_PATH, RUNTIME_SOURCE_ROOTS } from "./runtime-source-size-ratchet.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const evidence = "docs/operations/evidence/example/review.md";
const lines = (count) => Array(count).fill("x").join("\n");
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "econ-size-ratchet-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), value); };
  write(evidence, "review evidence\n");
  write("api/entry.js", lines(499));
  const policy = { schemaVersion: 1, oversizedAtLines: 500, exceptions: [] };
  return { root, write, policy, audit: () => auditRuntimeSourceSize({ root, policy, roots: ["api"] }) };
}
function exception(file = "api/entry.js", maxLines = 510) {
  return { path: file, maxLines, owner: "Runtime", reason: "Reviewed boundary", reviewEvidence: evidence, removalCondition: "Split the owner" };
}

test("current complete runtime scope has zero oversized files and the old inventory ceilings are zero", () => {
  const policy = JSON.parse(readFileSync(path.join(repo, POLICY_PATH), "utf8"));
  const baseline = JSON.parse(readFileSync(path.join(repo, "scripts/architecture/architecture-ratchet-v2-baseline.json"), "utf8"));
  assert.equal(baseline.maximums.oversizedSourceFiles, 0);
  assert.equal(baseline.maximums.oversizedHttpHandlers, 0);
  assert.equal(baseline.httpHandlerLineBudget, 500);
  assert.deepEqual(auditRuntimeSourceSize({ root: repo, policy }).failures, []);
  assert.deepEqual(RUNTIME_SOURCE_ROOTS, ["backend/src", "backend/supabase/functions", "admin", "frontend/src", "player-terminal/src", "api", "auth", "player-terminal/host-runtime.js"]);
});

test("exact existing comparator treats 499 as pass and 500 as oversized, including CRLF and trailing newline", (t) => {
  const f = fixture(t);
  assert.equal(measuredLines(lines(499)), 499);
  assert.equal(measuredLines(lines(499) + "\n"), 500);
  assert.equal(measuredLines(lines(499).replaceAll("\n", "\r\n") + "\r\n"), 500);
  assert.deepEqual(f.audit().failures, []);
  f.write("api/entry.js", lines(500));
  assert.match(f.audit().failures.join("\n"), /api\/entry\.js has 500 measured lines/);
});

test("new nested JS/TS/JSX is covered; tools, styles and generated files are outside scope", (t) => {
  const f = fixture(t);
  for (const extension of ["js", "mjs", "cjs", "jsx", "ts", "tsx", "mts", "cts"]) f.write(`api/nested/new.${extension}`, lines(500));
  f.write("api/node_modules/vendor.js", lines(900));
  f.write("api/dist/bundle.js", lines(900));
  f.write("api/style.css", lines(900));
  f.write("tools/runner.js", lines(900));
  const result = f.audit();
  assert.equal(result.files, 9);
  assert.equal(result.failures.length, 8);
  assert.match(result.failures.join("\n"), /api\/nested\/new\.jsx/);
  assert.match(result.failures.join("\n"), /api\/nested\/new\.mts/);
});

test("reviewed exact-path exception permits bounded debt but rejects growth and a renamed replacement", (t) => {
  const f = fixture(t);
  f.write("api/entry.js", lines(510)); f.policy.exceptions.push(exception());
  assert.deepEqual(f.audit().failures, []);
  f.write("api/entry.js", lines(511)); assert.match(f.audit().failures.join("\n"), /grew to 511/);
  f.write("api/entry.js", lines(505)); assert.match(f.audit().failures.join("\n"), /lower its exception maximum/);
  f.policy.exceptions[0].maxLines = 505; assert.deepEqual(f.audit().failures, []);
  f.write("api/entry.js", lines(506)); assert.match(f.audit().failures.join("\n"), /grew to 506/);
  f.write("api/entry.js", lines(505));
  renameSync(path.join(f.root, "api/entry.js"), path.join(f.root, "api/renamed.js"));
  assert.match(f.audit().failures.join("\n"), /api\/renamed\.js has 505/);
  assert.match(f.audit().failures.join("\n"), /Stale runtime size exception/);
});

test("completed reduction requires removing its stale exception and then passes", (t) => {
  const f = fixture(t); f.policy.exceptions.push(exception());
  assert.match(f.audit().failures.join("\n"), /Stale runtime size exception/);
  f.policy.exceptions = []; assert.deepEqual(f.audit().failures, []);
});

test("exception metadata, exact paths, existing evidence and duplicate entries fail closed", (t) => {
  const f = fixture(t); f.write("api/entry.js", lines(500));
  for (const bad of [
    { ...exception(), path: "api/*.js" }, { ...exception(), path: "../escape.js" },
    { ...exception(), reason: "" }, { ...exception(), maxLines: 499 },
    { ...exception(), reviewEvidence: "docs/operations/evidence/missing.md" },
  ]) { f.policy.exceptions = [bad]; assert.throws(() => f.audit()); }
  f.policy.exceptions = [exception(), exception()]; assert.throws(() => f.audit(), /duplicate/);
});

test("symlinks cannot hide source files and missing roots fail closed", (t) => {
  const f = fixture(t); symlinkSync("entry.js", path.join(f.root, "api/link.js"));
  assert.throws(() => f.audit(), /Source symlink/);
  assert.throws(() => auditRuntimeSourceSize({ root: f.root, policy: f.policy, roots: ["missing"] }), /ENOENT/);
});

test("aggregate architecture audit retains existing gates and registers both new guards and their tests", () => {
  const scripts = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")).scripts;
  const aggregate = scripts["audit:architecture"];
  for (const required of ["admin-architecture-ratchet.mjs", "audit:architecture-inventory", "architecture-ratchet-v2.mjs", "runtime-source-size-ratchet.mjs", "player-write-policy-ratchet.mjs", "runtime-source-size-ratchet.test.mjs", "player-write-policy-ratchet.test.mjs", "refactor-seam-ratchet.test.mjs"]) assert.ok(aggregate.includes(required), `missing aggregate registration: ${required}`);
});

test("supplementary guard matches the unchanged inventory generator at its exact boundary", (t) => {
  const f = fixture(t);
  for (const directory of ["backend/src/domains", "backend/supabase/functions", "admin", "frontend/src", "player-terminal/src", "docs/architecture/inventories"]) mkdirSync(path.join(f.root, directory), { recursive: true });
  f.write("admin/under.js", lines(499));
  f.write("frontend/src/equal.ts", lines(499).replaceAll("\n", "\r\n") + "\r\n");
  const generator = path.join(repo, "scripts/architecture/build-architecture-inventory.mjs");
  const result = spawnSync(process.execPath, [generator], { cwd: f.root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(readFileSync(path.join(f.root, "docs/architecture/inventories/econovaria-architecture-inventory-v2.json"), "utf8"));
  assert.deepEqual(inventory.measuredDebt.oversizedFiles, [{ file: "frontend/src/equal.ts", lines: 500 }]);
  const supplemental = auditRuntimeSourceSize({ root: f.root, policy: f.policy, roots: ["admin", "frontend/src"] });
  assert.equal(supplemental.failures.length, 1);
  assert.match(supplemental.failures[0], /frontend\/src\/equal\.ts has 500/);
});
