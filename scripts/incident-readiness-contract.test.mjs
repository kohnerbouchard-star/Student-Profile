import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  INCIDENT_READINESS_PATHS,
  IncidentReadinessValidationError,
  validateIncidentReadiness,
} from "./incident-readiness-contract.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "econovaria-incident-readiness-"));
  for (const relativePath of Object.values(INCIDENT_READINESS_PATHS)) {
    const content = await readFile(path.join(REPO_ROOT, relativePath), "utf8");
    await write(root, relativePath, content);
  }
  return root;
}

async function expectRejected(mutator, expectedMessages) {
  const root = await createFixture();
  try {
    await mutator(root);
    await assert.rejects(
      validateIncidentReadiness({ repoRoot: root }),
      (error) => {
        assert.ok(error instanceof IncidentReadinessValidationError);
        for (const message of expectedMessages) {
          assert.ok(
            error.errors.some((entry) => entry.includes(message)),
            `missing error containing ${JSON.stringify(message)} in ${JSON.stringify(error.errors)}`,
          );
        }
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts the complete repository incident-readiness contract", async () => {
  const result = await validateIncidentReadiness({ repoRoot: REPO_ROOT });
  assert.equal(result.status, "ready");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.policyId, "ECON-INCIDENT-READINESS-V1");
  assert.deepEqual(result.severities, ["P0", "P1", "P2", "P3"]);
  assert.ok(result.roles.includes("incidentCommander"));
  assert.ok(result.roles.includes("classroomLead"));
});

test("blocks a policy that omits a required severity and correction property", async () => {
  await expectRejected(async (root) => {
    const policyPath = path.join(root, INCIDENT_READINESS_PATHS.policy);
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    delete policy.severities.P0;
    policy.mandatoryControls.requiredCorrectionProperties = policy.mandatoryControls.requiredCorrectionProperties
      .filter((value) => value !== "idempotent");
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  }, ["severities.P0 is required", "must include \"idempotent\""]);
});

test("blocks an incident issue form that loses the privacy warning", async () => {
  await expectRejected(async (root) => {
    const templatePath = path.join(root, INCIDENT_READINESS_PATHS.issueTemplate);
    const content = await readFile(templatePath, "utf8");
    await writeFile(templatePath, content
      .replace("Sanitized coordination record only", "Coordination record")
      .replace("Do not include credentials", "Add incident information"));
  }, ["Sanitized coordination record only", "Do not include credentials"]);
});

test("blocks a workflow that stops executing the validator", async () => {
  await expectRejected(async (root) => {
    const workflowPath = path.join(root, INCIDENT_READINESS_PATHS.workflow);
    const content = await readFile(workflowPath, "utf8");
    await writeFile(workflowPath, content.replace(
      "node scripts/incident-readiness-contract.mjs",
      "echo validator-disabled",
    ));
  }, ["node scripts/incident-readiness-contract.mjs"]);
});

test("blocks a continuity procedure that permits unsafe retry semantics", async () => {
  await expectRejected(async (root) => {
    const continuityPath = path.join(root, INCIDENT_READINESS_PATHS.continuity);
    const content = await readFile(continuityPath, "utf8");
    await writeFile(continuityPath, content
      .replace("Do not ask students to repeatedly submit", "Allow students to submit")
      .replace("stable idempotency key", "request reference"));
  }, ["Do not ask students to repeatedly submit", "stable idempotency key"]);
});
