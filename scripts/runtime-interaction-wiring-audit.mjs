import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_ENDPOINTS } from "../player-terminal/src/api/endpoints.js";
import { hasPlayerBackendRoute } from "../player-terminal/src/api/backend-routes.js";
import { hasMarketplaceBackendRoute } from "../player-terminal/src/api/marketplace-backend-routes.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAYER_ROOT = join(ROOT, "player-terminal", "src");
const ADMIN_ROOT = join(ROOT, "admin");
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".html"]);
const DEFERRED_PLAYER_BEHAVIOR = Object.freeze({
  messageAttachment: "Attachments are intentionally disabled and render as disabled controls.",
  limitOrders: "The main stock backend supports immediate market orders only; the UI must show a truthful pending state.",
});

function extension(path) {
  const index = path.lastIndexOf(".");
  return index >= 0 ? path.slice(index) : "";
}

async function filesUnder(directory) {
  const output = [];
  async function visit(path) {
    const entry = await stat(path);
    if (entry.isDirectory()) {
      for (const child of await readdir(path)) await visit(join(path, child));
      return;
    }
    if (SOURCE_EXTENSIONS.has(extension(path))) output.push(path);
  }
  await visit(directory);
  return output.sort();
}

async function loadSources(directory) {
  const files = await filesUnder(directory);
  return Promise.all(files.map(async (path) => ({
    path,
    displayPath: relative(ROOT, path).replaceAll("\\", "/"),
    source: await readFile(path, "utf8"),
  })));
}

function literalAttributes(sources, attribute) {
  const values = new Map();
  const pattern = new RegExp(`${attribute}=["']([^"']+)["']`, "g");
  for (const file of sources) {
    for (const match of file.source.matchAll(pattern)) {
      const value = match[1];
      if (value.includes("${") || value.includes("<%")) continue;
      const entries = values.get(value) || [];
      entries.push(file.displayPath);
      values.set(value, entries);
    }
  }
  return values;
}

function literalCalls(sources) {
  const results = new Map();
  const patterns = [
    /\bexecuteEndpoint\(\s*["']([^"']+)["']/g,
    /\bapi\.(?:execute|request)\(\s*["']([^"']+)["']/g,
    /\brequest\(\s*["']([^"']+)["']/g,
  ];
  for (const file of sources) {
    for (const pattern of patterns) {
      for (const match of file.source.matchAll(pattern)) {
        const entries = results.get(match[1]) || [];
        entries.push(file.displayPath);
        results.set(match[1], entries);
      }
    }
  }
  return results;
}

function countLiteral(sources, value) {
  let count = 0;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`["']${escaped}["']`, "g");
  for (const file of sources) count += [...file.source.matchAll(pattern)].length;
  return count;
}

function fail(message, failures) {
  failures.push(message);
}

const [playerSources, adminSources] = await Promise.all([
  loadSources(PLAYER_ROOT),
  loadSources(ADMIN_ROOT),
]);
const playerEndpoints = literalAttributes(playerSources, "data-endpoint");
const playerLocalActions = literalAttributes(playerSources, "data-player-local-action");
const playerActions = literalAttributes(playerSources, "data-player-action");
const playerCalls = literalCalls(playerSources);
const adminActions = literalAttributes(adminSources, "data-admin-terminal-action");
const failures = [];
const warnings = [];

for (const [endpoint, files] of playerEndpoints) {
  if (!Object.hasOwn(PLAYER_ENDPOINTS, endpoint)) {
    fail(`Player form endpoint ${endpoint} is not registered (${files.join(", ")}).`, failures);
  }
}

for (const [endpoint, files] of playerCalls) {
  if (!Object.hasOwn(PLAYER_ENDPOINTS, endpoint)) {
    fail(`Player API call ${endpoint} is not registered (${files.join(", ")}).`, failures);
  }
}

for (const endpoint of Object.keys(PLAYER_ENDPOINTS)) {
  if (!hasPlayerBackendRoute(endpoint) && !hasMarketplaceBackendRoute(endpoint)) {
    fail(`Player endpoint ${endpoint} has no connected Student-Profile backend route.`, failures);
  }
}

for (const [action, files] of playerLocalActions) {
  const occurrences = countLiteral(playerSources, action);
  if (occurrences < 2) {
    warnings.push(`Player local action ${action} appears only at its render site (${files.join(", ")}).`);
  }
}

for (const [action, files] of playerActions) {
  const occurrences = countLiteral(playerSources, action);
  if (occurrences < 2) {
    warnings.push(`Player delegated action ${action} appears only at its render site (${files.join(", ")}).`);
  }
}

for (const [action, files] of adminActions) {
  const occurrences = countLiteral(adminSources, action);
  if (occurrences < 2) {
    warnings.push(`Admin action ${action} has one literal occurrence (${files.join(", ")}); browser smoke must prove its delegated handler.`);
  }
}

const playerButtonCount = playerSources.reduce(
  (count, file) => count + [...file.source.matchAll(/<button\b/gi)].length,
  0,
);
const adminButtonCount = adminSources.reduce(
  (count, file) => count + [...file.source.matchAll(/<button\b/gi)].length,
  0,
);
const summary = {
  player: {
    sourceFiles: playerSources.length,
    buttonTemplates: playerButtonCount,
    formEndpoints: [...playerEndpoints.keys()].sort(),
    endpointCalls: [...playerCalls.keys()].sort(),
    registeredEndpoints: Object.keys(PLAYER_ENDPOINTS).sort(),
    localActions: [...playerLocalActions.keys()].sort(),
    delegatedActions: [...playerActions.keys()].sort(),
  },
  admin: {
    sourceFiles: adminSources.length,
    buttonTemplates: adminButtonCount,
    delegatedActions: [...adminActions.keys()].sort(),
  },
  deferred: DEFERRED_PLAYER_BEHAVIOR,
  warnings,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error(`Runtime interaction wiring audit failed with ${failures.length} error(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `Runtime interaction wiring audit passed: ${playerButtonCount} Player and ${adminButtonCount} Admin button templates inspected; ` +
    `${Object.keys(PLAYER_ENDPOINTS).length} Player endpoints have connected route mappings.`,
  );
}
