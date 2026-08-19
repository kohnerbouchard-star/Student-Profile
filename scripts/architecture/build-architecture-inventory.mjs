import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "docs/architecture/inventories/econovaria-architecture-inventory-v2.json");
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);
const SCAN_ROOTS = ["backend/src", "backend/supabase/functions", "admin", "frontend/src", "player-terminal/src"];
const GENERATED_SEGMENTS = ["/dist/", "/node_modules/", "/coverage/"];

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
console.log(JSON.stringify({ status: "pass", output: path.relative(ROOT, OUTPUT), counts: inventory.counts }, null, 2));
