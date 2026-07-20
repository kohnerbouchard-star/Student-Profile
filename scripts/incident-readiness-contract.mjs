import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const INCIDENT_READINESS_PATHS = Object.freeze({
  policy: "docs/operations/incident-readiness-policy.json",
  runbook: "docs/operations/incident-response-runbook.md",
  continuity: "docs/operations/classroom-continuity-and-economic-correction.md",
  communications: "docs/operations/incident-communications-templates.md",
  issueTemplate: ".github/ISSUE_TEMPLATE/incident.yml",
  workflow: ".github/workflows/incident-readiness.yml",
  amendment: "docs/roadmaps/econovaria-incident-readiness-amendment-2026-07-20.md",
});

const REQUIRED_SEVERITIES = Object.freeze(["P0", "P1", "P2", "P3"]);
const REQUIRED_ROLES = Object.freeze([
  "incidentCommander",
  "technicalLead",
  "dataIntegrityLead",
  "operationsLead",
  "classroomLead",
  "communicationsLead",
  "scribe",
]);

const REQUIRED_CORRECTION_PROPERTIES = Object.freeze([
  "game-scoped",
  "server-authoritative",
  "idempotent",
  "append-only or compensating",
  "audited",
  "reconcilable",
  "approved",
]);

const REQUIRED_FORBIDDEN_ACTIONS = Object.freeze([
  "direct production database correction as a normal path",
  "deleting or rewriting append-only ledger history",
  "reusing a failed write with a new idempotency key before outcome verification",
]);

export class IncidentReadinessValidationError extends Error {
  constructor(errors) {
    super(`Incident readiness validation failed with ${errors.length} error(s).`);
    this.name = "IncidentReadinessValidationError";
    this.errors = errors;
  }
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function includesCaseInsensitive(content, expected) {
  return String(content || "").toLowerCase().includes(String(expected).toLowerCase());
}

function requireText(errors, content, expected, label) {
  if (!includesCaseInsensitive(content, expected)) {
    errors.push(`${label} must include ${JSON.stringify(expected)}`);
  }
}

function requireArray(errors, value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return [];
  }
  return value;
}

function requireArrayValue(errors, values, expected, label) {
  if (!values.some((value) => String(value).toLowerCase() === expected.toLowerCase())) {
    errors.push(`${label} must include ${JSON.stringify(expected)}`);
  }
}

function validatePolicy(policy, errors) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    errors.push("incident policy must be a JSON object");
    return;
  }
  if (policy.schemaVersion !== 1) errors.push("incident policy schemaVersion must equal 1");
  if (policy.policyId !== "ECON-INCIDENT-READINESS-V1") {
    errors.push("incident policy policyId must equal ECON-INCIDENT-READINESS-V1");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(policy.effectiveDate || ""))) {
    errors.push("incident policy effectiveDate must be YYYY-MM-DD");
  }

  const severities = policy.severities || {};
  for (const severity of REQUIRED_SEVERITIES) {
    const entry = severities[severity];
    if (!entry || typeof entry !== "object") {
      errors.push(`incident policy severities.${severity} is required`);
      continue;
    }
    if (!hasText(entry.name)) errors.push(`incident policy severities.${severity}.name is required`);
    requireArray(errors, entry.declareWhenAny, `incident policy severities.${severity}.declareWhenAny`);
    const acknowledgement = Number(entry.initialAcknowledgementMinutes);
    if (!Number.isFinite(acknowledgement) || acknowledgement <= 0) {
      errors.push(`incident policy severities.${severity}.initialAcknowledgementMinutes must be positive`);
    }
    const internalUpdate = Number(entry.internalUpdateMinutes);
    if (!Number.isFinite(internalUpdate) || internalUpdate <= 0) {
      errors.push(`incident policy severities.${severity}.internalUpdateMinutes must be positive`);
    }
    if (["P0", "P1"].includes(severity)) {
      requireArray(errors, entry.automaticStopConditions, `incident policy severities.${severity}.automaticStopConditions`);
    }
  }

  const roles = policy.roles || {};
  for (const role of REQUIRED_ROLES) {
    if (!roles[role] || typeof roles[role] !== "object") {
      errors.push(`incident policy roles.${role} is required`);
      continue;
    }
    requireArray(errors, roles[role].accountableFor, `incident policy roles.${role}.accountableFor`);
  }

  const controls = policy.mandatoryControls || {};
  requireArray(errors, controls.p0P1TwoPersonApproval, "incident policy mandatoryControls.p0P1TwoPersonApproval");
  const forbidden = requireArray(errors, controls.forbiddenActions, "incident policy mandatoryControls.forbiddenActions");
  for (const expected of REQUIRED_FORBIDDEN_ACTIONS) {
    requireArrayValue(errors, forbidden, expected, "incident policy mandatoryControls.forbiddenActions");
  }
  const correctionProperties = requireArray(
    errors,
    controls.requiredCorrectionProperties,
    "incident policy mandatoryControls.requiredCorrectionProperties",
  );
  for (const expected of REQUIRED_CORRECTION_PROPERTIES) {
    requireArrayValue(errors, correctionProperties, expected, "incident policy mandatoryControls.requiredCorrectionProperties");
  }

  const closure = requireArray(errors, policy.closureRequirements, "incident policy closureRequirements");
  for (const expected of [
    "containment remains effective",
    "authoritative state and economic invariants pass",
    "corrective actions have owners and due dates",
  ]) {
    requireArrayValue(errors, closure, expected, "incident policy closureRequirements");
  }
}

function validateRunbook(content, errors) {
  const label = "incident response runbook";
  for (const required of [
    "## 2. Severity model",
    "### P0 — Critical",
    "### P1 — High",
    "### P2 — Moderate",
    "### P3 — Low",
    "## 3. Incident roles and authority",
    "### Incident Commander",
    "### Data Integrity Lead",
    "### Classroom Lead",
    "## 5. Response lifecycle",
    "### 5.3 Contain",
    "### 5.4 Preserve evidence",
    "### 5.7 Correct and reconcile",
    "### 5.8 Validate",
    "## 6. Handoffs",
    "## 8. Post-incident review",
    "## 10. Return-to-service checklist",
    "Never infer that a timed-out or disconnected economic write failed",
    "two-person approval",
  ]) requireText(errors, content, required, label);
}

function validateContinuity(content, errors) {
  const label = "classroom continuity procedure";
  for (const required of [
    "## 2. Fallback activation",
    "## 3. Universal classroom rules",
    "## 4. Approved continuity log",
    "### 5.2 Attendance",
    "### 5.3 Contracts",
    "### 5.4 Store and purchasing",
    "### 5.6 Market and portfolio",
    "### 5.7 Banking and ledger",
    "## 6. Economic correction principles",
    "## 7. Correction manifest",
    "## 8. Correction workflow",
    "### Step 5 — Execute in bounded batches",
    "### Step 6 — Verify invariants",
    "## 9. Return-to-classroom procedure",
    "Do not ask students to repeatedly submit",
    "compensating entries",
    "stable idempotency key",
    "no cross-game writes",
  ]) requireText(errors, content, required, label);
}

function validateCommunications(content, errors) {
  const label = "incident communications templates";
  for (const required of [
    "## 2. Internal incident declaration",
    "## 4. Classroom read-only or pause notice",
    "## 6. Stakeholder status update",
    "## 7. Ambiguous-write notice",
    "## 9. Correction approval request",
    "## 10. Recovery notice",
    "## 12. Incident resolved and monitoring",
    "omit student names, Access Codes",
    "Retry guidance",
    "Next update",
    "confirmed facts",
    "working hypotheses",
    "unknowns",
  ]) requireText(errors, content, required, label);
}

function validateIssueTemplate(content, errors) {
  const label = "incident issue template";
  for (const required of [
    "name: Incident coordination",
    "Sanitized coordination record only",
    "Do not include credentials",
    "Access Codes",
    "session tokens",
    "internal UUIDs",
    "player or student names",
    "private incident record",
    "id: incident_id",
    "id: severity",
    "id: status",
    "id: environments",
    "id: detected_at",
    "id: incident_commander",
    "id: containment",
    "id: retry_guidance",
    "id: classroom_guidance",
    "id: next_update",
    "id: redaction_confirmation",
  ]) requireText(errors, content, required, label);

  for (const forbiddenPrompt of [
    "label: Access Code",
    "label: Session token",
    "label: Internal UUID",
    "label: Player name",
    "label: Student name",
    "label: Secret value",
  ]) {
    if (includesCaseInsensitive(content, forbiddenPrompt)) {
      errors.push(`${label} must not request sensitive field ${JSON.stringify(forbiddenPrompt)}`);
    }
  }
}

function validateWorkflow(content, errors) {
  const label = "incident readiness workflow";
  for (const required of [
    "name: Incident Readiness",
    "pull_request:",
    "workflow_dispatch:",
    "actions/checkout",
    "actions/setup-node",
    "node-version: 22.23.1",
    "node --test scripts/incident-readiness-contract.test.mjs",
    "node scripts/incident-readiness-contract.mjs",
  ]) requireText(errors, content, required, label);
}

function validateAmendment(content, errors) {
  const label = "incident readiness roadmap amendment";
  for (const required of [
    "OPS-INCIDENT-001",
    "agent/incident-readiness-v1",
    "## Exclusive scope",
    "## Collision boundary",
    "## Acceptance criteria",
    "incident severity and declaration criteria",
    "classroom continuity and fallback procedures",
    "economic correction and reconciliation rules",
    "deterministic repository validator and CI workflow",
  ]) requireText(errors, content, required, label);

  if (!/\*\*Status:\*\* `(IN_PROGRESS|IMPLEMENTED_NOT_MERGED|VERIFIED_COMPLETE)`/.test(content)) {
    errors.push(`${label} must use an allowed active/completion status`);
  }
}

async function readRequiredFile(repoRoot, relativePath, errors) {
  try {
    return await readFile(path.join(repoRoot, relativePath), "utf8");
  } catch (error) {
    errors.push(`required incident readiness file is missing or unreadable: ${relativePath}`);
    return "";
  }
}

export async function validateIncidentReadiness({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  const entries = await Promise.all(
    Object.entries(INCIDENT_READINESS_PATHS).map(async ([key, relativePath]) => [
      key,
      await readRequiredFile(repoRoot, relativePath, errors),
    ]),
  );
  const files = Object.fromEntries(entries);

  let policy = null;
  if (files.policy) {
    try {
      policy = JSON.parse(files.policy);
    } catch (error) {
      errors.push(`incident policy must contain valid JSON: ${error.message}`);
    }
  }

  if (policy) validatePolicy(policy, errors);
  validateRunbook(files.runbook, errors);
  validateContinuity(files.continuity, errors);
  validateCommunications(files.communications, errors);
  validateIssueTemplate(files.issueTemplate, errors);
  validateWorkflow(files.workflow, errors);
  validateAmendment(files.amendment, errors);

  if (errors.length) throw new IncidentReadinessValidationError(errors);

  return Object.freeze({
    status: "ready",
    schemaVersion: policy.schemaVersion,
    policyId: policy.policyId,
    severities: [...REQUIRED_SEVERITIES],
    roles: [...REQUIRED_ROLES],
    validatedFiles: Object.values(INCIDENT_READINESS_PATHS),
  });
}

async function main() {
  try {
    const result = await validateIncidentReadiness();
    console.log(`Incident readiness contract passed: ${result.validatedFiles.length} files, ${result.severities.length} severities, ${result.roles.length} roles.`);
  } catch (error) {
    if (error instanceof IncidentReadinessValidationError) {
      console.error(error.message);
      for (const entry of error.errors) console.error(`- ${entry}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();
