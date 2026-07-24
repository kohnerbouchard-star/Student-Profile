import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ADMIN_ROOT = path.resolve("admin");
const LIMITS = Object.freeze({
  fetchAssignments: 7,
  mutationObservers: 11,
});
const SCOPED_FETCH_ASSIGNMENTS = Object.freeze({
  "game-creation-runtime-bridge.js": Object.freeze({
    maximum: 1,
    requiredContracts: Object.freeze([
      "isGameCreationRequest",
      "X-Idempotency-Key",
      "XMLHttpRequest",
      "sendGameCreationRequest",
      "CREATE_PATH_SUFFIXES",
    ]),
  }),
});

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory);
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry);
    const details = await stat(absolutePath);
    if (details.isDirectory()) {
      files.push(...await listJavaScriptFiles(absolutePath));
    } else if (details.isFile() && entry.endsWith(".js")) {
      files.push(absolutePath);
    }
  }

  return files;
}

const files = await listJavaScriptFiles(ADMIN_ROOT);
let fetchAssignments = 0;
let scopedFetchAssignments = 0;
let mutationObservers = 0;
const scopedViolations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const assignmentCount = source.match(/window\.fetch\s*=/g)?.length ?? 0;
  const scopedContract = SCOPED_FETCH_ASSIGNMENTS[path.basename(file)];

  if (scopedContract && assignmentCount > 0) {
    const missingContracts = scopedContract.requiredContracts.filter(
      (contract) => !source.includes(contract),
    );
    if (assignmentCount > scopedContract.maximum) {
      scopedViolations.push(
        `${path.basename(file)} has ${assignmentCount} fetch assignments; scoped maximum is ${scopedContract.maximum}`,
      );
    }
    if (missingContracts.length > 0) {
      scopedViolations.push(
        `${path.basename(file)} is missing scoped fetch contracts: ${missingContracts.join(", ")}`,
      );
    }
    scopedFetchAssignments += assignmentCount;
  } else {
    fetchAssignments += assignmentCount;
  }

  mutationObservers += source.match(/MutationObserver\s*\(/g)?.length ?? 0;
}

const measurements = { fetchAssignments, scopedFetchAssignments, mutationObservers };
const violations = Object.entries({ fetchAssignments, mutationObservers })
  .filter(([name, value]) => value > LIMITS[name])
  .map(([name, value]) => `${name} increased to ${value}; allowed maximum is ${LIMITS[name]}`)
  .concat(scopedViolations);

if (violations.length > 0) {
  throw new Error(`Admin architecture ratchet failed:\n- ${violations.join("\n- ")}`);
}

console.log(JSON.stringify({
  status: "pass",
  measurements,
  limits: LIMITS,
  scopedFetchAllowlist: SCOPED_FETCH_ASSIGNMENTS,
  note: "Broad fetch wrappers remain capped at seven. The separately reported game-creation transport is restricted to one idempotency-bound POST /games bridge and does not increase the broad-wrapper allowance.",
}, null, 2));
