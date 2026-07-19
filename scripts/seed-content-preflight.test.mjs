import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  describeSimulationFiles,
  preflightSeedContent,
  resolveDeclaredPath,
  validateDefinitionArrayUniqueness,
  validateDocumentPrivacy,
} from "./seed-content-preflight-lib.mjs";
import { parseArguments } from "./seed-content-preflight.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("current PR #163 design catalog is structurally valid and reports readiness blockers", async () => {
  const report = await preflightSeedContent({ repoRoot, environment: "test", mode: "design" });
  assert.equal(report.summary.errors, 0);
  assert.ok(report.summary.blockers > 0);
  assert.equal(report.stagingReady, false);
  const codes = new Set(report.issues.map((entry) => entry.code));
  assert.equal(codes.has("UNIVERSE_FILE_MISSING"), false);
  assert.equal(codes.has("UNIVERSE_CLAIMS_UNVERIFIED"), false);
  assert.equal(codes.has("SIMULATION_CHECKSUM_MISMATCH"), false);
  assert.equal(codes.has("SIMULATION_DECLARED_FILE_MISSING"), false);
  assert.ok(codes.has("SIMULATION_RAW_EVIDENCE_NOT_RETAINED"));
  assert.ok(codes.has("ACTIVE_MARKET_COUNTRIES_INCOMPLETE"));
  assert.ok(codes.has("LOCATION_MAP_PENDING"));
  assert.ok(codes.has("ARRIVAL_PACKAGES_INCOMPLETE"));
});

test("preflight report is deterministic for unchanged inputs", async () => {
  const first = await preflightSeedContent({ repoRoot, environment: "test", mode: "design" });
  const second = await preflightSeedContent({ repoRoot, environment: "test", mode: "design" });
  assert.deepEqual(second, first);
});

test("production environment fails closed for the unauthorized design pack", async () => {
  const report = await preflightSeedContent({ repoRoot, environment: "production", mode: "design" });
  assert.ok(report.summary.errors > 0);
  assert.ok(report.issues.some((entry) => entry.code === "ENVIRONMENT_NOT_ALLOWED"));
  assert.ok(report.issues.some((entry) => entry.code === "PRODUCTION_NOT_AUTHORIZED"));
});

test("staging mode remains blocked until executable content is complete", async () => {
  const report = await preflightSeedContent({ repoRoot, environment: "staging", mode: "staging" });
  assert.equal(report.stagingReady, false);
  assert.ok(report.summary.blockers > 0 || report.summary.errors > 0);
  assert.ok(report.issues.some((entry) => entry.code === "RUNTIME_ACTIVATION_DISABLED"));
  assert.ok(report.issues.some((entry) => entry.code === "ACTIVE_MARKET_COUNTRIES_INCOMPLETE"));
  assert.ok(report.issues.some((entry) => entry.code === "SIMULATION_RAW_EVIDENCE_NOT_RETAINED"));
  assert.equal(report.issues.some((entry) => entry.code === "UNIVERSE_NOT_STAGING_READY"), false);
});

test("reusable definitions reject runtime ownership fields and UUID values", () => {
  const issues = validateDocumentPrivacy({
    productionAuthorized: false,
    playerUuid: "b18d8dd2-0136-4b4b-9e15-f15bb61ba017",
  });
  assert.ok(issues.some((entry) => entry.code === "PROHIBITED_RUNTIME_FIELD"));
  assert.ok(issues.some((entry) => entry.code === "RUNTIME_UUID_EMBEDDED"));
});

test("definition arrays reject duplicate stable keys", () => {
  const issues = validateDefinitionArrayUniqueness([{ id: "item.one.v1" }, { id: "item.one.v1" }], ["id"]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "DUPLICATE_DEFINITION_KEY");
});

test("declared paths cannot escape the content root", () => {
  assert.throws(() => resolveDeclaredPath("/tmp/content", "../outside.json"), /escapes its root/);
  assert.equal(resolveDeclaredPath("/tmp/content", "records/items.json"), "/tmp/content/records/items.json");
});

test("operator must provide an explicit valid environment", () => {
  assert.throws(() => parseArguments([]), /--environment is required/);
  assert.throws(() => parseArguments(["--environment", "classroom"]), /Unknown environment/);
  assert.deepEqual(parseArguments(["--environment", "test", "--mode", "design", "--format", "json"]), {
    environment: "test",
    mode: "design",
    format: "json",
  });
});

test("simulation manifests normalize both supported checksum schemas", () => {
  assert.deepEqual(describeSimulationFiles({
    files: {
      "input-v1.json": "a".repeat(64),
      "summary.json": "b".repeat(64),
    },
  }), [
    { declaredPath: "input-v1.json", checksum: "a".repeat(64) },
    { declaredPath: "summary.json", checksum: "b".repeat(64) },
  ]);

  assert.deepEqual(describeSimulationFiles({
    runCommand: "python run_market.py --input input.json --output output",
    scriptSha256: "c".repeat(64),
    inputSha256: "d".repeat(64),
    rawOutputChecksums: { "summary.json": "e".repeat(64) },
  }), [
    { declaredPath: "run_market.py", checksum: "c".repeat(64) },
    { declaredPath: "input.json", checksum: "d".repeat(64) },
    { declaredPath: path.join("output", "summary.json"), checksum: "e".repeat(64) },
  ]);
});
