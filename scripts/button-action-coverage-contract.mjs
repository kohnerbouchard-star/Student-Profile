import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_ACTION_CAPABILITIES } from "../player-terminal/src/api/capabilities.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = resolve(
  ROOT,
  "docs/operations/contracts/button-action-coverage-v1.json",
);
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
const registeredActions = [...PLAYER_ACTION_CAPABILITIES].sort();
const ledgerActions = Object.keys(ledger.playerActions ?? {}).sort();

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

const allowedReleaseEvidence = new Set(
  ledger.releasePolicy?.allowedEvidence ?? [],
);
const releaseBlockers = ledgerActions.filter(
  (action) => !allowedReleaseEvidence.has(ledger.playerActions[action]?.evidence),
);
if (ledger.adminEvidence?.allMutationButtons !== "connected_browser") {
  releaseBlockers.push("admin.allMutationButtons");
}

const summary = {
  schemaVersion: ledger.schemaVersion,
  registeredPlayerActions: registeredActions.length,
  evidenceCounts: Object.fromEntries(
    [...knownEvidence].map((evidence) => [
      evidence,
      ledgerActions.filter(
        (action) => ledger.playerActions[action]?.evidence === evidence,
      ).length,
    ]),
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
    `Button release gate blocked: ${releaseBlockers.length} action(s) lack connected browser evidence.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Button coverage ledger is complete for ${registeredActions.length} Player actions.`,
  );
}
