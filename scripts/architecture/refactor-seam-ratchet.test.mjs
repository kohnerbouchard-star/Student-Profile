import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { BASELINE_PATH, CANDIDATES_PATH, SCAN_ROOTS, auditRefactorSeams, blobSha, measureSites, readSources, sourceKind, verifyRemoval } from "./refactor-seam-ratchet.mjs";

const SHA = "a".repeat(40);
const bridge = "backend/supabase/functions/admin-api/routes.ts";
const patch = "admin/bridge.js";
const original = new Map([[bridge, 'proxyClassroom(request, context, `/staff/${gameId}/contracts/${id}/progress`);'], [patch, "window.fetch = retainedFetch;"]]);
function fixture(t, entries = original) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ref005-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => { const text = typeof value === "string" ? value : JSON.stringify(value); fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); return { path: file, blobSha: blobSha(text) }; };
  for (const file of SCAN_ROOTS) file.endsWith(".html") ? write(file, "<!doctype html>") : fs.mkdirSync(path.join(root, file), { recursive: true });
  for (const [file, text] of entries) write(file, text);
  const baseline = { schemaVersion: 1, task: "REF-005", sourceSha: SHA, sites: measureSites(entries), removalTargets: [], removalRecords: [] };
  write(BASELINE_PATH, baseline); write(CANDIDATES_PATH, { reviews: [] });
  return { root, write, baseline, scan: () => auditRefactorSeams(root) };
}
test("REF005: measured existing seams pass; deterministic order and whitespace do not change identity", (t) => {
  const f = fixture(t); assert.deepEqual(f.scan().failures, []);
  assert.deepEqual(measureSites(original), measureSites(new Map([...original].reverse())));
  f.write(bridge, '/* note */ proxyClassroom( request,\ncontext, `/staff/${gameId}/contracts/${id}/progress` );');
  assert.deepEqual(f.scan().failures, []);
});
test("REF005: debt can decrease without admitting a replacement site", (t) => {
  const f = fixture(t); f.write(bridge, "export const read = () => [];"); assert.deepEqual(f.scan().failures, []);
  f.write("backend/src/new.ts", original.get(bridge)); assert.match(f.scan().failures.join("\n"), /Unregistered seam/);
});
for (const [name, file, source] of [
  ["new proxy caller", "backend/src/new.ts", "proxyClassroom(req, ctx, '/new');"],
  ["new same-file proxy family", bridge, "proxyClassroom(req, ctx, '/new');"],
  ["new aliased bridge reference", bridge, "const forward = proxyClassroom;"],
  ["new literal import", "backend/src/new.ts", 'import { dispatch } from "../supabase/functions/classroom-api/messagingDispatch.ts";'],
  ["dynamic literal import", "backend/src/new.ts", 'await import("../supabase/functions/classroom-api/messagingDispatch.ts");'],
  ["direct Classroom transport", "api/new.js", 'fetch("https://example.invalid/functions/v1/classroom-api/new");'],
  ["new fetch monkey patch", "admin/new.js", "window.fetch = wrapper;"],
  ["second existing monkey patch", patch, "window.fetch = retainedFetch; window.fetch = retainedFetch;"],
  ["bracket monkey patch", "admin/new.js", 'globalThis["fetch"] = wrapper;'],
  ["reflective monkey patch", "admin/new.js", 'Object.defineProperty(window, "fetch", { value: wrapper });'],
  ["XMLHttpRequest monkey patch", "admin/new.js", "self.XMLHttpRequest = replacement;"],
]) test(`REF005 rejects ${name}`, (t) => { const f = fixture(t); f.write(file, source); assert.match(f.scan().failures.join("\n"), /Unregistered seam/); });
test("REF005: image/error defaults, transport reads, comments, tests and fixtures are not new runtime seams", (t) => {
  const f = fixture(t);
  f.write("admin/media.js", 'const image = value || "placeholder.png"; const message = error?.message ?? "Try again"; const delegated = window.fetch; // window.fetch = nope\n');
  f.write("admin/media.test.js", "window.fetch = fixtureFetch;"); f.write("backend/src/fixtures/caller.ts", "proxyClassroom(req, ctx, '/fake');");
  f.write("backend/src/auth/handlerTest.ts", "proxyClassroom(req, ctx, '/fake');");
  assert.deepEqual(f.scan().failures, []); assert.equal(f.scan().classifications.test_or_fixture, 3);
  assert.equal(sourceKind("admin/dist/bundle.js"), "generated");
});
test("REF005: selected removal targets cannot be forgotten by an empty baseline", (t) => {
  const f = fixture(t); f.write(CANDIDATES_PATH, { reviews: [{ path: patch, blobSha: blobSha(original.get(patch)), owner: "Admin", disposition: "compatibility_required" }] });
  assert.match(f.scan().failures.join("\n"), /Unregistered removal target/);
});
function removalFixture(t) {
  const f = fixture(t, new Map());
  const target = { path: "admin/retained.js", sourceBlobSha: blobSha("old code"), owner: "Admin Settings", disposition: "compatibility_required", referenceTerms: ["oldSettingsListener"] };
  const replacement = f.write("admin/settings.mjs", "export const save = () => true;\n");
  const evidence = f.write("docs/evidence/source-audit.txt", "Synthetic reviewed caller and external-retirement evidence; never live proof.\n");
  const surfaces = Object.fromEntries(["staticImports", "dynamicImports", "htmlBuild", "sqlRpcTriggers", "scheduledJobs", "externalRuntime"].map((name) => [name, { status: "VERIFIED_CLEAR", reason: "synthetic fixture only", evidence }]));
  const audit = { removedPath: target.path, replacementPath: replacement.path, owner: target.owner, surfaces };
  const callerEvidence = f.write("docs/evidence/callers.json", audit);
  const ownerDecision = f.write("docs/evidence/decision.json", { removedPath: target.path, replacementPath: replacement.path, owner: target.owner, disposition: "replaced", decision: "approve-removal", approver: "fixture-owner", approvedAt: "2026-09-23T00:00:00Z" });
  const testRef = f.write("admin/settings.test.mjs", 'import { save } from "./settings.mjs";\n');
  const result = f.write("docs/evidence/result.json", { sourceSha: SHA, status: "PASS" });
  const parityEvidence = f.write("docs/evidence/parity.json", { status: "PASS", sourceSha: SHA, command: "node --test admin/settings.test.mjs", test: testRef, result });
  const record = { path: target.path, sourceBlobSha: target.sourceBlobSha, owner: target.owner, originalDisposition: target.disposition, disposition: "replaced", canonicalReplacement: replacement, callerEvidence, ownerDecision, parityEvidence };
  return { ...f, target, record, audit, sources: new Map([[replacement.path, fs.readFileSync(path.join(f.root, replacement.path), "utf8")]]) };
}
test("REF005: complete hash-bound removal record passes structural validation only", (t) => {
  const f = removalFixture(t); assert.doesNotThrow(() => verifyRemoval(f.root, f.target, f.record, f.sources));
});
for (const field of ["canonicalReplacement", "callerEvidence", "ownerDecision", "parityEvidence"]) test(`REF005 removal requires ${field}`, (t) => {
  const f = removalFixture(t); delete f.record[field]; assert.throws(() => verifyRemoval(f.root, f.target, f.record, f.sources));
});
test("REF005: missing record, approved=true and incorrect ownership do not authorize deletion", (t) => {
  const f = removalFixture(t);
  assert.throws(() => verifyRemoval(f.root, f.target, undefined, f.sources), /Missing removal/);
  assert.throws(() => verifyRemoval(f.root, f.target, { approved: true }, f.sources), /Missing removal/);
  assert.throws(() => verifyRemoval(f.root, f.target, { ...f.record, owner: "Other" }, f.sources), /ownership/);
  f.baseline.removalTargets = [f.target]; f.write(BASELINE_PATH, f.baseline); assert.match(f.scan().failures.join("\n"), /Missing removal/);
});
test("REF005: unknown external use, stale evidence and remaining dynamic caller block removal", (t) => {
  const f = removalFixture(t); f.audit.surfaces.externalRuntime.status = "UNKNOWN";
  f.record.callerEvidence = f.write("docs/evidence/callers.json", f.audit);
  assert.throws(() => verifyRemoval(f.root, f.target, f.record, f.sources), /externalRuntime/);
  f.audit.surfaces.externalRuntime.status = "VERIFIED_CLEAR"; f.record.callerEvidence = f.write("docs/evidence/callers.json", f.audit);
  f.sources.set("admin/bootstrap.js", 'await import("./retained.js");');
  assert.throws(() => verifyRemoval(f.root, f.target, f.record, f.sources), /Remaining caller/);
  f.sources.delete("admin/bootstrap.js"); f.write("docs/evidence/source-audit.txt", "changed");
  assert.throws(() => verifyRemoval(f.root, f.target, f.record, f.sources), /stale evidence/);
});
for (const [name, file, source, code] of [
  ["direct balance mutation", "backend/src/domains/store/new.ts", 'client.from("account_balances").update({ amount: 9 });', "directBalanceMutationOutsideEconomy"],
  ["direct inventory mutation", "backend/src/domains/store/new.ts", 'client.from("inventory_holdings").delete();', "directInventoryMutationOutsideInventory"],
  ["browser database access", "admin/new.js", 'supabase.rpc("write_balance");', "directBrowserDatabaseAccess"],
  ["unscoped simulation", "backend/src/domains/stocks/new.ts", 'client.from("stock_market_ticks").select("*");', "unscopedLiveSimulationPersistence"],
]) test(`REF005 retains original zero-tolerance guard: ${name}`, (t) => {
  const f = fixture(t, new Map()); f.write(file, source);
  f.write("docs/architecture/inventories/econovaria-architecture-inventory-v2.json", { counts: { persistenceOutsideInfrastructure: 0, crossDomainDeepImports: 0, compatibilityMarkerFiles: 0, oversizedSourceFiles: 0 }, measuredDebt: { crossDomainDeepImports: [], browserTransportShims: [], oversizedFiles: [] }, thresholds: { oversizedSourceFileLines: 500 } });
  f.write("scripts/architecture/architecture-ratchet-v2-baseline.json", { maximums: { [code]: 0 }, retiredBrowserMarkers: [], httpHandlerLineBudget: 500 });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./architecture-ratchet-v2.mjs", import.meta.url))], { cwd: f.root, encoding: "utf8" });
  assert.equal(result.status, 1); assert.match(result.stderr, new RegExp(code));
});

test("REF005: the replacement cannot import the removed module", (t) => {
  const f = removalFixture(t); const text = 'import "./retained.js"; export const save = () => true;';
  f.record.canonicalReplacement = f.write("admin/settings.mjs", text); f.sources.set("admin/settings.mjs", text);
  assert.throws(() => verifyRemoval(f.root, f.target, f.record, f.sources), /Remaining caller/);
});
test("REF005: unrelated same-basename imports do not imply a removed-path caller", (t) => {
  const f = removalFixture(t); f.sources.set("admin/other/loader.js", 'import "./retained.js";');
  assert.doesNotThrow(() => verifyRemoval(f.root, f.target, f.record, f.sources));
});

test("REF005: unsafe target paths cannot escape the source checkout", (t) => {
  const f = fixture(t); f.baseline.removalTargets = [{ path: "../outside.js", sourceBlobSha: SHA, owner: "Admin", disposition: "unknown" }];
  f.write(BASELINE_PATH, f.baseline); assert.throws(f.scan, /Invalid removal target/);
});
export function registerRepositorySeamAudit() {
  test("REF005: repository census is deterministic and every selected seam/removal gate passes", () => {
    const first = measureSites(readSources(process.cwd())), second = measureSites(readSources(process.cwd()));
    assert.deepEqual(first, second); assert.deepEqual(auditRefactorSeams(process.cwd()).failures, []);
  });
}
