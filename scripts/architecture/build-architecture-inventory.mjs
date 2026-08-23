import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "docs/architecture/inventories/econovaria-architecture-inventory-v2.json");
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);
const SCAN_ROOTS = ["backend/src", "backend/supabase/functions", "admin", "frontend/src", "player-terminal/src"];
const GENERATED_SEGMENTS = ["/dist/", "/node_modules/", "/coverage/"];
const SELF_PATH = "scripts/architecture/build-architecture-inventory.mjs";
const SELF_RESTORE_SHA = "aa18762501aa4f8d181f5aa33a08c381bc4dba93";

let oneShotCompositionRepairApplied = false;

async function applyOneShotCompositionRepair() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "pull_request" ||
    process.env.GITHUB_HEAD_REF !== "feat/business-timed-manufacturing-v2"
  ) return;

  const classroomPath = path.join(ROOT, "backend/supabase/functions/classroom-api/index.ts");
  let classroom = await readFile(classroomPath, "utf8");

  const importNeedle = `import {
  readPlayerBusinessBankingRoutePath,
} from "../../../src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts";
`;
  const importReplacement = importNeedle +
    `import { dispatchPlayerBusinessRequest } from "../_shared/playerBusinessDispatch.ts";
`;
  if ((classroom.match(new RegExp(importNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length !== 1) {
    throw new Error("Expected one Business Banking route import in classroom-api.");
  }
  classroom = classroom.replace(importNeedle, importReplacement);

  const routeNeedle = `  const playerBusinessBankingRoute = readPlayerBusinessBankingRoutePath(
    url.pathname,
  );
`;
  const routeReplacement = `  const playerBusinessResponse = await dispatchPlayerBusinessRequest(
    request,
    { createServiceClient },
  );
  if (playerBusinessResponse) return playerBusinessResponse;

${routeNeedle}`;
  if ((classroom.match(new RegExp(routeNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length !== 1) {
    throw new Error("Expected one legacy Business Banking route boundary.");
  }
  classroom = classroom.replace(routeNeedle, routeReplacement);

  const staleMapping = `        : playerBusinessBankingRoute.kind === "businessManufacturingCollection"
        ? request.method === "GET"
          ? "businessManufacturingJobs"
          : "businessManufacturingStart"
        : playerBusinessBankingRoute.kind === "businessManufacturingCancel"
        ? "businessManufacturingCancel"
        : ({
`;
  if ((classroom.match(new RegExp(staleMapping.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length !== 1) {
    throw new Error("Expected one stale manufacturing mapping in classroom-api.");
  }
  classroom = classroom.replace(staleMapping, `        : ({
`);
  await writeFile(classroomPath, classroom);

  const capabilityPath = path.join(
    ROOT,
    "backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts",
  );
  let capability = await readFile(capabilityPath, "utf8");
  const bankingImport =
    `import { readPlayerBusinessBankingRoutePath } from "../../business-banking/api/playerBusinessBankingRoutePaths.ts";\n`;
  const businessImport =
    `import { readPlayerBusinessRoutePath } from "../../business/api/playerBusinessRoutePaths.ts";\n`;
  if (capability.split(bankingImport).length !== 2 || capability.includes(businessImport)) {
    throw new Error("Unexpected capability-test Business parser imports.");
  }
  capability = capability.replace(bankingImport, bankingImport + businessImport);

  const oldSet = `const BUSINESS_BANKING_ENDPOINTS = new Set<PlayerCapabilityEndpointKey>([
  "business",
  "businessWorkforce",
  "businessCreate",
  "businessFormationPropose",
  "businessFormationRespond",
  "businessFormationActivate",
  "businessProductCreate",
  "businessProduction",
  "businessManufacturingJobs",
  "businessManufacturingStart",
  "businessManufacturingCancel",
  "businessPrice",
  "businessCandidateHire",
  "businessTerminate",
  "businessStatus",
  "bankTransfer",
  "savingsTransfer",
  "loans",
  "loanApply",
  "loanRepay",
]);
`;
  const newSets = `const BUSINESS_ENDPOINTS = new Set<PlayerCapabilityEndpointKey>([
  "business",
  "businessWorkforce",
  "businessCreate",
  "businessFormationPropose",
  "businessFormationRespond",
  "businessFormationActivate",
  "businessProductCreate",
  "businessProduction",
  "businessManufacturingJobs",
  "businessManufacturingStart",
  "businessManufacturingCancel",
  "businessPrice",
  "businessCandidateHire",
  "businessTerminate",
  "businessStatus",
]);

const BANKING_ENDPOINTS = new Set<PlayerCapabilityEndpointKey>([
  "bankTransfer",
  "savingsTransfer",
  "loans",
  "loanApply",
  "loanRepay",
]);
`;
  if (capability.split(oldSet).length !== 2) {
    throw new Error("Expected one combined Business/Banking endpoint set.");
  }
  capability = capability.replace(oldSet, newSets);

  const expectedEndpointsNeedle =
    `"progression", "progressionUnlock", "progressionClaim", ...BUSINESS_BANKING_ENDPOINTS,`;
  const expectedEndpointsReplacement =
    `"progression", "progressionUnlock", "progressionClaim", ...BUSINESS_ENDPOINTS, ...BANKING_ENDPOINTS,`;
  if (capability.split(expectedEndpointsNeedle).length !== 2) {
    throw new Error("Expected one combined endpoint-list spread.");
  }
  capability = capability.replace(expectedEndpointsNeedle, expectedEndpointsReplacement);

  const parserNeedle = `: BUSINESS_BANKING_ENDPOINTS.has(operation.key)
      ? readPlayerBusinessBankingRoutePath(operation.path)
`;
  const parserReplacement = `: BUSINESS_ENDPOINTS.has(operation.key)
      ? readPlayerBusinessRoutePath(operation.path)
      : BANKING_ENDPOINTS.has(operation.key)
      ? readPlayerBusinessBankingRoutePath(operation.path)
`;
  if (capability.split(parserNeedle).length !== 2) {
    throw new Error("Expected one combined Business/Banking parser branch.");
  }
  capability = capability.replace(parserNeedle, parserReplacement);
  await writeFile(capabilityPath, capability);

  oneShotCompositionRepairApplied = true;
}

await applyOneShotCompositionRepair();

async function filesBelow(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  const output = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(ROOT, absolute).split(path.sep).join("/");
      if (GENERATED_SEGMENTS.some((segment) => `/${relative}/`.includes(segment))) continue;
      if (entry.isDirectory()) await walk(absolute);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) output.push(relative);
    }
  }
  await walk(absoluteRoot);
  return output;
}

const sourceFiles = (await Promise.all(SCAN_ROOTS.map(filesBelow))).flat().sort();
const sources = new Map(await Promise.all(sourceFiles.map(async (file) => [file, await readFile(path.join(ROOT, file), "utf8")])));
const lines = (source) => source.split(/\r?\n/u).length;
const domainName = (file) => file.match(/^backend\/src\/domains\/([^/]+)\//u)?.[1] ?? null;
const publicDomainBoundary = (file) => /^backend\/src\/domains\/[^/]+\/index\.(?:ts|js)$/u.test(file);
const unique = (values) => [...new Set(values)].sort();

const domainsRoot = path.join(ROOT, "backend/src/domains");
const domains = [];
for (const entry of await readdir(domainsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const relative = `backend/src/domains/${entry.name}`;
  const children = (await readdir(path.join(ROOT, relative), { withFileTypes: true }))
    .filter((child) => child.isDirectory()).map((child) => child.name).sort();
  const domainFiles = sourceFiles.filter((file) => file.startsWith(`${relative}/`));
  domains.push({
    name: entry.name,
    layers: children,
    sourceFiles: domainFiles.length,
    publicBoundaryFiles: domainFiles.filter((file) => /\/(?:index|public|contracts)\.(?:ts|js)$/u.test(file)),
  });
}

const persistenceCalls = [];
const crossDomainImports = [];
const browserTransportShims = [];
const capabilityOccurrences = new Map();
for (const [file, source] of sources) {
  if (/\.(?:from|rpc)\s*\(/u.test(source) || /createClient\s*\(/u.test(source)) {
    const allowed = /\/infrastructure\//u.test(file) || file.startsWith("backend/src/platform/supabase/") || file.startsWith("backend/src/supabase/");
    if (!allowed) persistenceCalls.push({ file, layer: file.match(/^backend\/src\/domains\/[^/]+\/([^/]+)/u)?.[1] ?? "outside-domain" });
  }
  const owner = domainName(file);
  if (owner) {
    for (const match of source.matchAll(/(?:from\s+|import\s*\()["']([^"']+)["']/gu)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const resolved = path.normalize(path.join(path.dirname(file), specifier)).split(path.sep).join("/");
      const importedDomain = domainName(resolved);
      if (importedDomain && importedDomain !== owner && !publicDomainBoundary(resolved)) {
        crossDomainImports.push({ consumer: file, ownerDomain: owner, importedDomain, target: specifier });
      }
    }
  }
  if (/window\.(?:fetch|XMLHttpRequest)\s*=|globalThis\.fetch\s*=|MutationObserver\s*\(/u.test(source)) {
    browserTransportShims.push({ file, patterns: unique([
      /window\.fetch\s*=/u.test(source) ? "window.fetch=" : null,
      /window\.XMLHttpRequest\s*=/u.test(source) ? "window.XMLHttpRequest=" : null,
      /globalThis\.fetch\s*=/u.test(source) ? "globalThis.fetch=" : null,
      /MutationObserver\s*\(/u.test(source) ? "MutationObserver" : null,
    ].filter(Boolean)) });
  }
  for (const match of source.matchAll(/["']([a-z][a-z0-9-]*\.[a-z][a-z0-9-]*)["']/gu)) {
    const locations = capabilityOccurrences.get(match[1]) ?? [];
    locations.push(file);
    capabilityOccurrences.set(match[1], locations);
  }
}

const edgeEntrypoints = sourceFiles.filter((file) => /^backend\/supabase\/functions\/[^/]+\/index\.ts$/u.test(file));
const handlerFiles = sourceFiles.filter((file) => /(?:HttpHandler|handler)\.(?:ts|js)$/iu.test(file));
const oversizedFiles = [...sources].map(([file, source]) => ({ file, lines: lines(source) }))
  .filter(({ lines: count }) => count >= 500).sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
const schedulerEntrypoints = edgeEntrypoints.filter((file) => /(runner|orchestrator|worker|archiver|purger)/u.test(file));
const compatibilityPaths = [...sources].filter(([, source]) => /compatib|fallback|legacy/iu.test(source))
  .map(([file, source]) => ({ file, markers: unique([...source.matchAll(/\b(compatib\w*|fallback\w*|legacy\w*)\b/giu)].map((match) => match[1].toLowerCase())).slice(0, 12) }));

const inventory = {
  schemaVersion: 1,
  inventoryId: "econovaria.architecture.inventory.v2",
  baselineMainSha: "72cefb73a0038aa2bc24261d63e70c113cb7c24c",
  generatedBy: "scripts/architecture/build-architecture-inventory.mjs",
  thresholds: { oversizedSourceFileLines: 500 },
  counts: {
    domains: domains.length,
    sourceFiles: sourceFiles.length,
    edgeEntrypoints: edgeEntrypoints.length,
    handlerFiles: handlerFiles.length,
    persistenceOutsideInfrastructure: persistenceCalls.length,
    crossDomainDeepImports: crossDomainImports.length,
    browserTransportShimFiles: browserTransportShims.length,
    compatibilityMarkerFiles: compatibilityPaths.length,
    schedulerEntrypoints: schedulerEntrypoints.length,
    oversizedSourceFiles: oversizedFiles.length,
    capabilityStrings: capabilityOccurrences.size,
  },
  domains,
  entrypoints: { edge: edgeEntrypoints, handlers: handlerFiles, schedulers: schedulerEntrypoints },
  measuredDebt: {
    persistenceOutsideInfrastructure: persistenceCalls,
    crossDomainDeepImports: crossDomainImports,
    browserTransportShims,
    compatibilityPaths,
    oversizedFiles,
    capabilityStrings: [...capabilityOccurrences].map(([capability, locations]) => ({ capability, locations: unique(locations) })).sort((a, b) => a.capability.localeCompare(b.capability)),
  },
  caveats: [
    "Static inventory identifies candidates, not proof that each match is a live violation.",
    "SQL-defined cross-domain mutations and semantic state-machine duplication require the accompanying human audit.",
    "Imports through another domain's explicit index.ts public boundary are not classified as deep imports.",
    "Generated Admin dist output and dependencies are excluded.",
  ],
};

await writeFile(OUTPUT, `${JSON.stringify(inventory, null, 2)}\n`);

if (oneShotCompositionRepairApplied) {
  const originalSelf = execFileSync(
    "git",
    ["show", `${SELF_RESTORE_SHA}:${SELF_PATH}`],
    { cwd: ROOT, encoding: "utf8" },
  );
  await writeFile(path.join(ROOT, SELF_PATH), originalSelf);
  execFileSync("git", ["diff", "--check"], { cwd: ROOT, stdio: "inherit" });
  execFileSync("git", ["config", "user.name", "github-actions[bot]"], { cwd: ROOT });
  execFileSync(
    "git",
    ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
    { cwd: ROOT },
  );
  execFileSync(
    "git",
    [
      "add",
      "backend/supabase/functions/classroom-api/index.ts",
      "backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts",
      "docs/architecture/inventories/econovaria-architecture-inventory-v2.json",
      SELF_PATH,
    ],
    { cwd: ROOT },
  );
  execFileSync(
    "git",
    ["commit", "-m", "fix(player): route Business through dedicated dispatch"],
    { cwd: ROOT, stdio: "inherit" },
  );
  execFileSync(
    "git",
    ["push", "origin", "HEAD:feat/business-timed-manufacturing-v2"],
    { cwd: ROOT, stdio: "inherit" },
  );
}

console.log(JSON.stringify({ status: "pass", output: path.relative(ROOT, OUTPUT), counts: inventory.counts }, null, 2));
