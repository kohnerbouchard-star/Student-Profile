import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ALL_SCENARIOS, REQUIRED_FAILURE_SCENARIOS, REQUIRED_FLOW_SCENARIOS } from "./beta-e2e-pilot-catalog.mjs";
import { scanSensitive, validateConnectedDefinition, validateTemplates } from "./beta-e2e-pilot-validation.mjs";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const templates = () => ({
  definition: structuredClone(read("docs/operations/templates/beta-e2e-pilot.definition.template.json")),
  fixture: structuredClone(read("docs/operations/templates/beta-e2e-pilot.fixture.template.json")),
});

test("catalog contains exactly 52 unique scenarios", () => {
  assert.equal(REQUIRED_FLOW_SCENARIOS.length, 36);
  assert.equal(REQUIRED_FAILURE_SCENARIOS.length, 16);
  assert.equal(ALL_SCENARIOS.length, 52);
  assert.equal(new Set(ALL_SCENARIOS).size, 52);
});

test("repository templates pass and remain non-executing", () => {
  const { definition, fixture } = templates();
  assert.deepEqual(validateTemplates(definition, fixture), []);
  assert.equal(definition.connectedExecutionAuthorized, false);
  assert.equal(definition.productionModified, false);
});

test("sensitive evidence keys are rejected", () => {
  assert.ok(scanSensitive({ password: "not-allowed" }).length > 0);
  assert.ok(scanSensitive({ nested: { sessionToken: "not-allowed" } }).length > 0);
});

test("connected definition requires immutable exact identities", () => {
  const definition = {
    schemaVersion: 1,
    status: "approved",
    environment: "isolated-staging",
    releaseCommit: "1".repeat(40),
    sourceRunId: "29751531178",
    sourceArtifactId: "8464765629",
    artifactSetSha256: "2".repeat(64),
    supabaseProjectRef: "abcdefghijklmnopqrst",
    frontendIdentity: "staging-site",
    migrationHead: "20260720235900",
    expectedScenarioCount: 52,
    executionMode: "continuous-single-release",
    syntheticOnly: true,
    connectedExecutionAuthorized: true,
    productionModified: false,
    containsSecretValues: false,
  };
  assert.deepEqual(validateConnectedDefinition(definition), []);
  definition.releaseCommit = "short";
  assert.ok(validateConnectedDefinition(definition).some((message) => message.includes("release SHA")));
});

test("synthetic contracts cannot be mislabeled connected acceptance", () => {
  const { definition, fixture } = templates();
  definition.connectedExecutionAuthorized = true;
  assert.ok(validateTemplates(definition, fixture).some((message) => message.includes("non-executing")));
});
