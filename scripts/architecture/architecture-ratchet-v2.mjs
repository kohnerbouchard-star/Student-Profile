import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const inventory = await readJson("docs/architecture/inventories/econovaria-architecture-inventory-v2.json");
const baseline = await readJson("scripts/architecture/architecture-ratchet-v2-baseline.json");
const failures = [];
const measurements = {
  persistenceOutsideInfrastructure: inventory.counts.persistenceOutsideInfrastructure,
  crossDomainDeepImports: inventory.counts.crossDomainDeepImports,
  crossDomainInfrastructureImports: inventory.measuredDebt.crossDomainDeepImports.filter(({ target }) => target.includes("/infrastructure/")).length,
  browserTransportMonkeyPatchFiles: inventory.measuredDebt.browserTransportShims.filter(({ file, patterns }) =>
    !/\.(?:test|spec)\./u.test(file) && patterns.some((pattern) => ["window.fetch=", "window.XMLHttpRequest=", "globalThis.fetch="].includes(pattern))).length,
  compatibilityMarkerFiles: inventory.counts.compatibilityMarkerFiles,
  oversizedSourceFiles: inventory.counts.oversizedSourceFiles,
  oversizedHttpHandlers: inventory.measuredDebt.oversizedFiles.filter(({ file }) => /(?:HttpHandler|handler)\.(?:ts|js)$/iu.test(file)).length,
  directBalanceMutationOutsideEconomy: 0,
  directInventoryMutationOutsideInventory: 0,
  unscopedLiveSimulationPersistence: 0,
  directBrowserDatabaseAccess: 0,
};

const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".html"]);
async function filesBelow(relativeRoot) {
  const output = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", "coverage"].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (sourceExtensions.has(path.extname(entry.name))) output.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  const absolute = path.join(root, relativeRoot);
  if ((await stat(absolute)).isDirectory()) await walk(absolute);
  else output.push(relativeRoot);
  return output;
}

const backendFiles = await filesBelow("backend/src");
const browserFiles = (await Promise.all(["index.html", "frontend", "admin", "player-terminal", "auth"].map(filesBelow))).flat();
const simulationTables = /["'](?:stock_market_ticks|stock_market_events|economic_simulation_[a-z_]+|game_session_storylines|story_event_resolutions)["']/u;
for (const file of backendFiles) {
  if (/\.(?:test|spec)\./u.test(file)) continue;
  const source = await readFile(path.join(root, file), "utf8");
  const domain = file.match(/^backend\/src\/domains\/([^/]+)\//u)?.[1] ?? "outside-domain";
  if (domain !== "economy" && /\.from\(["']account_balances["']\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\s*\(/u.test(source)) {
    measurements.directBalanceMutationOutsideEconomy += 1;
  }
  if (domain !== "inventory" && /\.from\(["']inventory_holdings["']\)[\s\S]{0,500}\.(?:insert|update|upsert|delete)\s*\(/u.test(source)) {
    measurements.directInventoryMutationOutsideInventory += 1;
  }
  if (simulationTables.test(source) && /\.(?:from|rpc)\s*\(/u.test(source) && !/(?:game_session_id|gameSessionId)/u.test(source)) {
    measurements.unscopedLiveSimulationPersistence += 1;
  }
}

for (const file of browserFiles) {
  if (/\.(?:test|spec)\./u.test(file)) continue;
  const source = await readFile(path.join(root, file), "utf8");
  if (/(?:createClient\s*\(|supabase\s*\.\s*(?:from|rpc)\s*\()/u.test(source)) measurements.directBrowserDatabaseAccess += 1;
  for (const marker of baseline.retiredBrowserMarkers) {
    if (source.includes(marker)) failures.push(`retired browser marker ${marker} reintroduced in ${file}`);
  }
}

for (const [name, maximum] of Object.entries(baseline.maximums)) {
  const value = measurements[name];
  if (!Number.isInteger(value)) failures.push(`measurement ${name} is missing`);
  else if (value > maximum) failures.push(`${name} increased to ${value}; baseline maximum is ${maximum}`);
}
if (inventory.thresholds.oversizedSourceFileLines !== baseline.httpHandlerLineBudget) {
  failures.push("inventory and ratchet HTTP/source line budgets diverged");
}

if (failures.length) {
  console.error(`Architecture v2 ratchet failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "pass", baselineMainSha: baseline.baselineMainSha, measurements, maximums: baseline.maximums }, null, 2));
}
