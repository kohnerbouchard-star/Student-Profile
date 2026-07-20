import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const inventory = readJson("ops/legacy-runtime/live-runtime-inventory.json");
const routes = readJson("ops/legacy-runtime/route-allowlist.json");
const credentials = readJson("ops/legacy-runtime/credential-rotation-matrix.json");
const traffic = readJson("ops/legacy-runtime/traffic-evidence-request.json");
const runtimeDocuments = (inventory.runtimeRecordFiles ?? []).map((relativePath) => ({
  relativePath,
  document: readJson(relativePath),
}));
const runtimeRecords = runtimeDocuments.flatMap(({ document }) => document.runtimes ?? []);

const failures = [];
const requireValue = (condition, message) => { if (!condition) failures.push(message); };

requireValue(inventory.schemaVersion >= 2, "inventory schemaVersion must be at least 2");
requireValue(inventory.snapshot?.liveFunctionCount === 10, "inventory must record ten active Supabase functions");
requireValue(inventory.observationPolicy?.preDisableQuietWindowDays === 14, "quiet window must be 14 days");
requireValue(inventory.observationPolicy?.postDisableMonitoringDays === 7, "post-disable monitoring must be 7 days");
requireValue(inventory.observationPolicy?.preDeleteRecoveryWindowDays === 30, "recovery window must be 30 days");
requireValue(runtimeDocuments.length === 4, "inventory must reference four bounded runtime record documents");
for (const { relativePath, document } of runtimeDocuments) {
  requireValue(document.schemaVersion >= 1, `${relativePath} must have a schemaVersion`);
  requireValue(Array.isArray(document.runtimes) && document.runtimes.length > 0, `${relativePath} must contain runtime records`);
}

const runtimeByName = new Map();
for (const runtime of runtimeRecords) {
  runtimeByName.set(runtime.name, runtime);
  for (const member of runtime.members ?? []) {
    const memberName = typeof member === "string" ? member : member?.name;
    if (memberName) runtimeByName.set(memberName, runtime);
  }
}
const requiredRuntimes = [
  "server", "make-server-0dbf686f", "admin-api-staging", "admin-api", "classroom-api",
  "stock-market-runner", "stock-market-seed-copy", "stock-market-read",
  "stock-market-trading", "stock-market-player-read", "silent-haze-ca17",
  "stock-market-sim", "stock-market-simulation", "stock-market-game-api", "stock-market-data",
];
for (const name of requiredRuntimes) {
  const runtime = runtimeByName.get(name);
  requireValue(runtime, `missing runtime ${name}`);
  if (!runtime) continue;
  for (const field of ["retirementDisposition", "rollbackInstructions", "owner", "evidenceStatus"]) {
    requireValue(Boolean(runtime[field]), `${name} missing ${field}`);
  }
}
requireValue(runtimeByName.get("server")?.verifyJwt === false, "server verifyJwt must remain recorded as false");
requireValue(runtimeByName.get("admin-api-staging")?.retirementDisposition === "retain-tombstone-then-delete", "staging tombstone disposition must be explicit");
requireValue(runtimeByName.get("silent-haze-ca17")?.deployedVersion === "unknown", "Cloudflare version must remain unknown until evidence exists");

requireValue(Array.isArray(routes.forbiddenBrowserMarkers) && routes.forbiddenBrowserMarkers.includes("workers.dev"), "route allow-list must forbid workers.dev");
requireValue(routes.serviceOnlyTransports?.length === 5, "all five stock transports must be service-only");

requireValue(credentials.secretValuesAllowed === false, "credential matrix must prohibit secret values");
const requiredCredentialFields = ["credentialName", "consumers", "owner", "rotationSequence", "rollbackOwner", "revocationAuthority", "status"];
for (const credential of credentials.credentials ?? []) {
  for (const field of requiredCredentialFields) {
    const value = credential[field];
    requireValue(Boolean(value) && (!Array.isArray(value) || value.length > 0), `credential ${credential.credentialName ?? "unknown"} missing ${field}`);
  }
}
for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "STOCK_MARKET_RUNNER_SECRET"]) {
  requireValue(credentials.credentials?.some((entry) => entry.credentialName === name), `missing credential ${name}`);
}
requireValue(traffic.mode === "read-only" && traffic.destructiveActionsAuthorized === false, "traffic request must be read-only and non-destructive");
requireValue(traffic.supabase?.requestedData?.every((entry) => !entry.maximumHoursPerExport || entry.maximumHoursPerExport <= 24), "Supabase request window exceeds 24 hours");
requireValue(traffic.cloudflare?.requestedData?.every((entry) => !entry.maximumHoursPerExport || entry.maximumHoursPerExport <= 24), "Cloudflare request window exceeds 24 hours");

const serialized = JSON.stringify({ inventory, runtimeDocuments, routes, credentials, traffic }).toLowerCase();
for (const forbidden of ["service_role_key=", "authorization: bearer ", "cookie:", "set-cookie:"]) {
  requireValue(!serialized.includes(forbidden), `evidence contains forbidden secret-like marker ${forbidden}`);
}

if (failures.length) {
  console.error("Legacy runtime audit failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log(`Legacy runtime audit passed for ${runtimeRecords.length} runtime groups, ${requiredRuntimes.length} named runtimes, and ${credentials.credentials.length} credential records.`);
}
