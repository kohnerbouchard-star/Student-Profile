import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REGISTER, physicalLines, fileKind, classifyCandidate, captureRevision, auditSnapshot } from "./refactor-candidate-audit.mjs";

const inventoryPath = "docs/architecture/inventories/econovaria-architecture-inventory-v2.json";
const policyPath = "ops/legacy-runtime/live-runtime-inventory.json";
const entry = (p, source = "", oid = "a".repeat(40)) => ({ path: p, source, oid, mode: "100644", bytes: Buffer.byteLength(source) });
const review = (p, disposition = "unknown") => ({ path: p, blobSha: "a".repeat(40), disposition, safeToDelete: false, owner: "fixture", reason: "fixture review", confidence: "fixture only", externalUsage: "UNKNOWN", removalConditions: ["separate proof"], symbols: [], sourceEvidence: [] });
function fixture(extra) {
  return { sha: "b".repeat(40), tree: "c".repeat(40), files: new Map([
    [inventoryPath, entry(inventoryPath, JSON.stringify({ counts: {}, measuredDebt: {}, entrypoints: {} }))],
    [policyPath, entry(policyPath, JSON.stringify({ observationPolicy: { preDisableQuietWindowDays: 14, postDisableMonitoringDays: 7, preDeleteRecoveryWindowDays: 30 } }))], ...extra.map((row) => [row.path, row]),
  ]) };
}

test("physical lines do not add a phantom final line", () => {
  assert.deepEqual(["", "a", "a\n", "a\n\n", "a\r\nb"].map(physicalLines), [0, 1, 1, 2, 2]);
});
test("categories keep test, fixture, generated, scripts and migrations separate", () => {
  const paths = ["admin/a.test.js", "backend/src/a/fixtures/a.ts", "admin/dist/a.js", "scripts/a.mjs", "backend/supabase/migrations/a.sql", "backend/legacy/a.ts"];
  assert.deepEqual(paths.map((p) => fileKind(p)), ["test", "fixture", "generated_output", "script", "migration_history", "historical_path"]);
});
test("nested tooling and config files are not application source", () => {
  assert.equal(fileKind("player-terminal/tools/verify-pr-scope.mjs"), "script");
  assert.equal(fileKind("backend/scripts/typecheckAllEdgeRoots.mjs"), "script");
  assert.equal(fileKind("player-terminal/playwright.config.js"), "configuration_or_data");
});
test("a legacy filename or no importer cannot produce confirmed dead", () => {
  assert.equal(classifyCandidate(entry("admin/legacy-v1.js")), "unknown");
  assert.equal(classifyCandidate(entry("admin/a.test.js", "fallback")), "generated_or_fixture");
});
test("reviewed defensive fallback remains protected and stale review fails", () => {
  const p = "admin/Media.js";
  assert.equal(classifyCandidate(entry(p, 'image.addEventListener("error", fallback);'), review(p, "defensive_fallback")), "defensive_fallback");
  assert.throws(() => classifyCandidate(entry(p, "", "f".repeat(40)), review(p)), /Stale review/);
  assert.throws(() => classifyCandidate(entry(p), { ...review(p), safeToDelete: true }), /deletion approval/);
  assert.throws(() => classifyCandidate(entry(p), review(p, "confirmed_dead")), /deletion approval/);
});
test("variable dynamic loader preserves literal module references without claiming execution", () => {
  const p = "admin/bridge.js";
  const report = auditSnapshot(fixture([entry(p, "// fallback"), entry("admin/boot.js", 'const modules=["./bridge.js"]; for(const modulePath of modules) await import(modulePath);')]), { schemaVersion: 1, task: "REF-003", reviews: [review(p, "compatibility_required")] });
  assert.equal(report.reviewed[0].literalReferences[0].path, "admin/boot.js");
  assert(report.candidates.every((r) => !r.safeToDelete));
});
test("external handler and test-only references are not zero-consumer proof", () => {
  const p = "backend/supabase/functions/worker/index.ts";
  const report = auditSnapshot(fixture([entry(p, "Deno.serve(handler);"), entry("scripts/worker.test.mjs", "// worker/index.ts fallback")]), { schemaVersion: 1, task: "REF-003", reviews: [review(p)] });
  assert.equal(report.reviewed[0].literalReferences[0].kind, "test");
  assert.equal(report.dispositions.confirmed_dead, 0);
  assert(report.candidates.find((r) => r.path === p).flags.includes("http_entrypoint"));
});
test("duplicate generic basenames do not produce false worker references", () => {
  const p = "backend/supabase/functions/worker/index.ts";
  const report = auditSnapshot(fixture([entry(p, "Deno.serve(handler);"), entry("backend/src/index.ts"), entry("scripts/other.test.mjs", "// unrelated index.ts"), entry("scripts/worker.test.mjs", "// worker/index.ts")]), { schemaVersion: 1, task: "REF-003", reviews: [review(p)] });
  assert.deepEqual(report.reviewed[0].literalReferences.map((r) => r.path), ["scripts/worker.test.mjs"]);
});
test("missing evidence fails rather than yielding a completed register", () => {
  assert.throws(() => auditSnapshot(fixture([]), { schemaVersion: 1, task: "REF-003", reviews: [review("missing.js")] }), /missing review/);
});
test("immutable Git census ignores dirty and untracked files and does not follow symlinks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ref003-fixture-"));
  try {
    const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    git("init", "-q"); fs.writeFileSync(path.join(dir, "a.txt"), "original\n");
    fs.writeFileSync(path.join(dir, "binary.dat"), Buffer.from([0, 255]));
    fs.symlinkSync("missing-target", path.join(dir, "link")); git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
    fs.writeFileSync(path.join(dir, "a.txt"), "dirty\n"); fs.writeFileSync(path.join(dir, "untracked"), "ignore");
    const result = captureRevision(dir);
    assert.equal(result.files.size, 3); assert.equal(result.files.get("a.txt").source, "original\n");
    assert.equal(result.files.get("binary.dat").source, null); assert.equal(result.files.get("link").mode, "120000");
    assert.equal(captureRevision(dir).tree, result.tree);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("small historical files and binary archives remain visible without deletion approval", () => {
  const binary = { ...entry("backend/legacy/book.xlsx"), source: null };
  const report = auditSnapshot(fixture([entry("backend/legacy/note.md", "provenance"), binary]), { schemaVersion: 1, task: "REF-003", reviews: [] });
  assert.equal(report.historicalPathCandidates, 2);
  assert(report.candidates.every((r) => r.disposition === "unknown" && !r.safeToDelete));
  assert.equal(report.candidates.find((r) => r.path === binary.path).physicalLines, null);
});
test("an unreviewed record exposes missing evidence instead of a fake caller clearance", () => {
  const report = auditSnapshot(fixture([entry("admin/old.js", "// fallback")]), { schemaVersion: 1, task: "REF-003", reviews: [] });
  const row = report.candidates[0];
  assert.equal(row.symbolReview, "NOT_REVIEWED"); assert.equal(row.consumerAudit.jobs, "NOT_REVIEWED");
  assert.equal(row.replacement, "NOT_SELECTED"); assert.equal(row.inboundRoots, "NOT_REVIEWED");
  assert.deepEqual(row.evidenceQuery.args, ["scripts/architecture/refactor-candidate-audit.mjs", report.sourceSha]);
});
test("changed supporting caller invalidates a hash-bound source review", () => {
  const p = "admin/bridge.js", caller = "admin/boot.js";
  const rule = { ...review(p), sourceEvidence: [caller], sourceEvidenceBlobs: { [caller]: "a".repeat(40) } };
  const snap = fixture([entry(p), entry(caller, 'import("./bridge.js")')]);
  const rules = { schemaVersion: 1, task: "REF-003", reviews: [rule] };
  assert.equal(auditSnapshot(snap, rules).supportingSourceBindings, 1);
  snap.files.get(caller).oid = "f".repeat(40);
  assert.throws(() => auditSnapshot(snap, rules), /Stale supporting source/);
});
test("an archive disposition requires a reviewed blob and never changes safeToDelete", () => {
  const p = "backend/legacy/example.js";
  const report = auditSnapshot(fixture([entry(p)]), { schemaVersion: 1, task: "REF-003", reviews: [review(p, "historical_archive")] });
  assert.equal(report.candidates[0].disposition, "historical_archive");
  assert.equal(report.candidates[0].safeToDelete, false);
});

test("event-only consumers are retained as literal evidence without a filename reference", () => {
  const p = "admin/saver.js", term = "econovaria:attendance-reward-saved";
  const rule = { ...review(p, "compatibility_required"), referenceTerms: [term] };
  const snap = fixture([entry(p, `document.dispatchEvent(new CustomEvent("${term}"));`), entry("admin/view.js", `document.addEventListener("${term}", refresh);`)]);
  const report = auditSnapshot(snap, { schemaVersion: 1, task: "REF-003", reviews: [rule] });
  assert.deepEqual(report.reviewed[0].literalReferences.map((r) => r.path), ["admin/view.js"]);
  assert.deepEqual(report.reviewed[0].literalReferences[0].matchedReferenceTerms, [term]);
  assert.deepEqual(report.candidates.find((r) => r.path === p).referenceTerms, [term]);
  assert.equal(report.referenceTermReviewCount, 1); assert.equal(report.dispositions.confirmed_dead, 0);
});
test("event text in docs and tests is not reclassified as an application caller", () => {
  const p = "admin/saver.js", term = "econovaria:settings-context-changed";
  const snap = fixture([entry(p, `// ${term}`), entry("docs/event.md", term), entry("scripts/event.test.mjs", term)]);
  const report = auditSnapshot(snap, { schemaVersion: 1, task: "REF-003", reviews: [{ ...review(p), referenceTerms: [term] }] });
  assert.deepEqual(report.reviewed[0].literalReferences.map((r) => r.kind), ["documentation", "test"]);
  assert.equal(report.candidates.find((r) => r.path === p).disposition, "unknown");
});
test("empty, malformed and absent event terms cannot manufacture consumer evidence", () => {
  const p = "admin/saver.js", snap = fixture([entry(p, "known-event")]);
  for (const referenceTerms of [[""], [" "], [null], ["missing-event"], "known-event"]) {
    assert.throws(() => auditSnapshot(snap, { schemaVersion: 1, task: "REF-003", reviews: [{ ...review(p), referenceTerms }] }), /[Rr]eference term/);
  }
});

// Called by the existing retirement suite; direct invocation above runs only synthetic unit fixtures.
export function registerRepositoryCandidateAudit() {
  test("REF-003 reviewed source and full tracked census are reproducible", () => {
    const snapshot = captureRevision(process.cwd());
    const rules = JSON.parse(snapshot.files.get(REGISTER).source);
    const report = auditSnapshot(snapshot, rules);
    assert.equal(report.trackedFiles, Object.values(report.denominators).reduce((n, row) => n + row.files, 0));
    assert.equal(report.candidateCount, Object.values(report.dispositions).reduce((a, b) => a + b, 0));
    assert.equal(report.candidateRecordsSha256, auditSnapshot(snapshot, rules).candidateRecordsSha256);
    for (const item of rules.reviews) assert.equal(report.candidates.find((r) => r.path === item.path).disposition, item.disposition);
    assert(snapshot.files.get("admin/v2/src/components/AdminMedia.js").source.includes('image.addEventListener("error"'));
    assert(snapshot.files.get("admin/admin-bootstrap.js").source.includes("await import(modulePath)"));
    assert(snapshot.files.get("backend/supabase/functions/stock-market-runner/index.ts").source.includes("Deno.serve"));
    assert.equal(report.dispositions.confirmed_dead, 0);
    assert.equal(report.historicalPathCandidates, report.denominators.historical_path.files);
    for (const row of report.candidates) assert(row.evidenceQuery && row.confidence && row.consumerAudit && row.replacement);
    const { candidates, reviewed, ...summary } = report;
    console.log("REF003_CENSUS " + JSON.stringify(summary));
    for (const row of reviewed) console.log("REF003_REVIEW " + JSON.stringify({ path: row.path, disposition: row.path, literalReferences: row.literalReferences }));
  });
}
