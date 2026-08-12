import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_ACTION_CAPABILITIES } from "../player-terminal/src/api/capabilities.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = resolve(
  ROOT,
  "docs/operations/contracts/button-action-coverage-v1.json",
);
const EXPECTED_ADMIN_MUTATION_COUNT = 39;
const releaseMode = process.argv.includes("--release");
const ledger = JSON.parse(await readFile(LEDGER_PATH, "utf8"));
const failures = [];
const knownEvidence = new Set([
  "connected_browser",
  "local_browser",
  "intentionally_disabled",
  "contract_only",
  "unverified",
]);
const mutationMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const registeredActions = [...PLAYER_ACTION_CAPABILITIES].sort();
const ledgerActions = Object.keys(ledger.playerActions ?? {}).sort();
const adminMutationEntries = Object.entries(ledger.adminMutationActions ?? {}).sort(
  ([left], [right]) => left.localeCompare(right),
);

function evidenceCounts(entries, readEvidence) {
  return Object.fromEntries(
    [...knownEvidence].map((evidence) => [
      evidence,
      entries.filter((entry) => readEvidence(entry) === evidence).length,
    ]),
  );
}

function resolveRepositoryPath(value, label) {
  const source = String(value ?? "").trim();
  if (!source || isAbsolute(source) || source.split(/[\\/]+/u).includes("..")) {
    failures.push(`${label} has an invalid repository path ${JSON.stringify(value)}.`);
    return null;
  }
  const resolved = resolve(ROOT, source);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${sep}`)) {
    failures.push(`${label} resolves outside the repository.`);
    return null;
  }
  return { source, resolved };
}

for (const action of registeredActions) {
  if (!Object.hasOwn(ledger.playerActions ?? {}, action)) {
    failures.push(`Player action ${action} has no button coverage entry.`);
  }
}
for (const action of ledgerActions) {
  if (!registeredActions.includes(action)) {
    failures.push(`Coverage ledger contains removed Player action ${action}.`);
  }
  const evidence = ledger.playerActions[action]?.evidence;
  if (!knownEvidence.has(evidence)) {
    failures.push(`Player action ${action} has invalid evidence ${String(evidence)}.`);
  }
}

if (ledger.schemaVersion !== 2) {
  failures.push(`Button coverage schemaVersion must be 2, received ${String(ledger.schemaVersion)}.`);
}
if (ledger.adminMutationExpectedCount !== EXPECTED_ADMIN_MUTATION_COUNT) {
  failures.push(
    `Admin mutation expected count must be ${EXPECTED_ADMIN_MUTATION_COUNT}, received ${String(ledger.adminMutationExpectedCount)}.`,
  );
}
if (adminMutationEntries.length !== EXPECTED_ADMIN_MUTATION_COUNT) {
  failures.push(
    `Admin mutation registry contains ${adminMutationEntries.length} entries; expected ${EXPECTED_ADMIN_MUTATION_COUNT}.`,
  );
}

const knownAdminEvidence = Object.entries(ledger.adminEvidence ?? {});
for (const [key, evidence] of knownAdminEvidence) {
  if (!knownEvidence.has(evidence)) {
    failures.push(`Admin shell evidence ${key} has invalid evidence ${String(evidence)}.`);
  }
}

for (const [action, entry] of adminMutationEntries) {
  const evidence = entry?.evidence;
  const domain = String(entry?.domain ?? "").trim();
  const functionName = String(entry?.functionName ?? "").trim();
  const method = String(entry?.method ?? "").trim().toUpperCase();
  if (!knownEvidence.has(evidence)) {
    failures.push(`Admin mutation ${action} has invalid evidence ${String(evidence)}.`);
  }
  if (!domain) failures.push(`Admin mutation ${action} has no domain.`);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(functionName)) {
    failures.push(`Admin mutation ${action} has invalid functionName ${JSON.stringify(functionName)}.`);
  }
  if (!mutationMethods.has(method)) {
    failures.push(`Admin mutation ${action} has invalid mutation method ${JSON.stringify(method)}.`);
  }

  const sourcePath = resolveRepositoryPath(entry?.sourcePath, `Admin mutation ${action} sourcePath`);
  if (sourcePath) {
    try {
      const source = await readFile(sourcePath.resolved, "utf8");
      if (!source.includes(functionName)) {
        failures.push(`Admin mutation ${action} function ${functionName} is absent from ${sourcePath.source}.`);
      }
      if (!source.includes(`method: "${method}"`) && !source.includes(`method: '${method}'`)) {
        failures.push(`Admin mutation ${action} method ${method} is absent from ${sourcePath.source}.`);
      }
    } catch (error) {
      failures.push(`Admin mutation ${action} source ${sourcePath.source} could not be read: ${error.message}`);
    }
  }

  if (evidence === "connected_browser" || evidence === "local_browser") {
    const evidencePath = resolveRepositoryPath(
      entry?.evidencePath,
      `Admin mutation ${action} evidencePath`,
    );
    if (evidencePath) {
      try {
        const evidenceSource = await readFile(evidencePath.resolved, "utf8");
        if (!/playwright|chromium|browser\.newContext|page\./iu.test(evidenceSource)) {
          failures.push(`Admin mutation ${action} browser evidence ${evidencePath.source} has no browser harness marker.`);
        }
      } catch (error) {
        failures.push(`Admin mutation ${action} evidence ${evidencePath.source} could not be read: ${error.message}`);
      }
    }
  }

  if (entry?.allowedActions !== undefined) {
    if (
      !Array.isArray(entry.allowedActions)
      || entry.allowedActions.length === 0
      || entry.allowedActions.some((value) => !String(value ?? "").trim())
    ) {
      failures.push(`Admin mutation ${action} has invalid allowedActions.`);
    }
  }
}

const allowedReleaseEvidence = new Set(
  ledger.releasePolicy?.allowedEvidence ?? [],
);
const releaseBlockers = ledgerActions
  .filter((action) => !allowedReleaseEvidence.has(ledger.playerActions[action]?.evidence))
  .map((action) => `player.${action}`);
for (const [key, evidence] of knownAdminEvidence) {
  if (!allowedReleaseEvidence.has(evidence)) releaseBlockers.push(`admin.${key}`);
}
for (const [action, entry] of adminMutationEntries) {
  if (!allowedReleaseEvidence.has(entry?.evidence)) {
    releaseBlockers.push(`adminMutation.${action}`);
  }
}

const summary = {
  schemaVersion: ledger.schemaVersion,
  registeredPlayerActions: registeredActions.length,
  playerEvidenceCounts: evidenceCounts(
    ledgerActions,
    (action) => ledger.playerActions[action]?.evidence,
  ),
  adminShellEvidence: Object.fromEntries(knownAdminEvidence),
  registeredAdminMutations: adminMutationEntries.length,
  adminMutationEvidenceCounts: evidenceCounts(
    adminMutationEntries,
    ([, entry]) => entry?.evidence,
  ),
  releaseBlockers,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) {
  console.error(`Button coverage contract failed with ${failures.length} error(s).`);
  process.exitCode = 1;
} else if (releaseMode && releaseBlockers.length > 0) {
  console.error(
    `Button release gate blocked: ${releaseBlockers.length} action(s) lack release-grade browser evidence.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Button coverage ledger is structurally complete for ${registeredActions.length} Player actions and ${adminMutationEntries.length} Admin mutations.`,
  );
}
