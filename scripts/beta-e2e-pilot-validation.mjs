import fs from "node:fs";
import { ALL_SCENARIOS, REQUIRED_FLOW_SCENARIOS, REQUIRED_FAILURE_SCENARIOS, FULL_SHA, PROJECT_REF, PLACEHOLDER, SENSITIVE_KEY } from "./beta-e2e-pilot-catalog.mjs";

const definitionPath = "docs/operations/templates/beta-e2e-pilot.definition.template.json";
const fixturePath = "docs/operations/templates/beta-e2e-pilot.fixture.template.json";

function read(path) { return JSON.parse(fs.readFileSync(path, "utf8")); }

export function scanSensitive(value, trail = []) {
  const failures = [];
  if (Array.isArray(value)) value.forEach((item, index) => failures.push(...scanSensitive(item, [...trail, index])));
  else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key) && nested) failures.push(`${[...trail, key].join(".")}: sensitive key is prohibited`);
      failures.push(...scanSensitive(nested, [...trail, key]));
    }
  }
  return failures;
}

export function validateTemplates(definition, fixture) {
  const failures = [];
  if (ALL_SCENARIOS.length !== 52) failures.push(`catalog must contain 52 scenarios, found ${ALL_SCENARIOS.length}`);
  if (new Set(ALL_SCENARIOS).size !== 52) failures.push("scenario IDs must be unique");
  if (REQUIRED_FLOW_SCENARIOS.length !== 36) failures.push("catalog must contain 36 flow scenarios");
  if (REQUIRED_FAILURE_SCENARIOS.length !== 16) failures.push("catalog must contain 16 failure scenarios");
  if (definition.schemaVersion !== 1 || definition.status !== "planned") failures.push("definition template must remain planned schema v1");
  if (definition.environment !== "isolated-staging" || definition.syntheticOnly !== true) failures.push("definition must be isolated and synthetic-only");
  if (definition.connectedExecutionAuthorized !== false || definition.productionModified !== false) failures.push("definition must remain non-executing and non-production");
  if (definition.expectedScenarioCount !== 52 || definition.executionMode !== "continuous-single-release") failures.push("definition must require one continuous 52-scenario release");
  if (fixture.environment !== "isolated-staging" || fixture.containsProductionData !== false) failures.push("fixture must remain isolated and production-data-free");
  if (fixture.expectedPlayerCount !== 30 || fixture.maximumPlayerCount !== 40) failures.push("fixture player bounds must remain 30/40");
  for (const [name, document] of Object.entries({ definition, fixture })) {
    if (document.containsSecretValues !== false) failures.push(`${name}: containsSecretValues must be false`);
    failures.push(...scanSensitive(document).map((failure) => `${name}: ${failure}`));
  }
  return failures;
}

export function validateConnectedDefinition(definition) {
  const failures = [];
  if (!FULL_SHA.test(definition.releaseCommit ?? "")) failures.push("full release SHA is required");
  if (!PROJECT_REF.test(definition.supabaseProjectRef ?? "")) failures.push("staging project ref is invalid");
  for (const field of ["sourceRunId", "sourceArtifactId"]) if (!/^[0-9]+$/.test(String(definition[field] ?? ""))) failures.push(`${field} must be numeric`);
  if (!/^[a-f0-9]{64}$/.test(definition.artifactSetSha256 ?? "")) failures.push("artifact-set SHA-256 is required");
  if (PLACEHOLDER.test(JSON.stringify(definition))) failures.push("connected definition contains placeholders");
  if (definition.connectedExecutionAuthorized !== true) failures.push("connected execution approval is required");
  return failures;
}

const definition = read(definitionPath);
const fixture = read(fixturePath);
const failures = validateTemplates(definition, fixture);
if (failures.length) {
  console.error("Beta E2E pilot validation failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Beta E2E pilot contract passed: 36 flow + 16 failure scenarios, one immutable release, synthetic 30/40-player bounds.");
}
