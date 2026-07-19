import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const reportJsonPath = path.join(seedRoot, "reviews", "core-content-coverage-audit-v1.json");
const reportMarkdownPath = path.join(seedRoot, "reviews", "core-content-coverage-audit-v1.md");
const checkOnly = process.argv.includes("--check");

const domains = {
  contracts: { targetMin: 50, arrayKeys: ["contracts"], root: "contracts" },
  bankingProducts: { targetMin: 8, targetMax: 12, arrayKeys: ["products", "bankingProducts"], root: "banking" },
  levels: { targetMin: 10, arrayKeys: ["levels"], root: "progression" },
  achievements: { targetMin: 20, arrayKeys: ["achievements"], root: "progression" },
  standaloneEvents: { targetMin: 25, arrayKeys: ["events"], root: "events" },
  eventChains: { targetMin: 10, arrayKeys: ["chains", "eventChains"], root: "events" },
  crisisArcs: { targetMin: 5, arrayKeys: ["crisisArcs"], root: "events" },
  interactions: { targetMin: 40, targetMax: 60, arrayKeys: ["interactions"], root: "interactions" },
  newsTemplates: { targetMin: 25, targetMax: 30, arrayKeys: ["news", "templates", "newsTemplates"], root: "news" },
  tutorials: { targetMin: 10, targetMax: 12, arrayKeys: ["tutorials"], root: "tutorials" },
  notificationTemplates: { targetMin: 25, targetMax: 30, arrayKeys: ["notifications", "templates", "notificationTemplates"], root: "notifications" },
};

async function exists(filePath) {
  try { await stat(filePath); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(root) {
  if (!(await exists(root))) return [];
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(filePath));
    else if (entry.isFile()) output.push(filePath);
  }
  return output.sort();
}

async function countDomain(domain) {
  const root = path.join(seedRoot, domain.root);
  const files = await listFiles(root);
  let machineReadableRecords = 0;
  let proseDefinitions = 0;
  const sources = [];

  for (const filePath of files) {
    const relative = path.relative(seedRoot, filePath).split(path.sep).join("/");
    if (filePath.endsWith(".json")) {
      const document = JSON.parse(await readFile(filePath, "utf8"));
      let count = 0;
      for (const key of domain.arrayKeys) {
        if (Array.isArray(document?.[key])) count += document[key].length;
      }
      if (count > 0) {
        machineReadableRecords += count;
        sources.push({ path: relative, type: "machine-readable", count });
      }
    } else if (filePath.endsWith(".md") && path.basename(filePath).toLowerCase() !== "readme.md") {
      proseDefinitions += 1;
      sources.push({ path: relative, type: "prose-definition", count: 1 });
    }
  }

  return { machineReadableRecords, proseDefinitions, sources };
}

function statusFor(config, count) {
  if (count < config.targetMin) return "below-target";
  if (config.targetMax && count > config.targetMax) return "above-original-target-review-scale";
  return "target-met";
}

async function itemCount() {
  const manifestPath = path.join(seedRoot, "items", "catalog-manifest-v1.json");
  if (!(await exists(manifestPath))) return null;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return {
    totalItemDefinitions: manifest.totalItemDefinitions,
    status: manifest.status,
    numericPricesApproved: manifest.validation?.numericPricesApproved ?? false,
    recipesApproved: manifest.validation?.recipesApproved ?? false,
    productionImportApproved: manifest.validation?.productionImportApproved ?? false,
  };
}

const coverage = {};
let totalGap = 0;
for (const [name, config] of Object.entries(domains)) {
  const counted = await countDomain(config);
  const gap = Math.max(0, config.targetMin - counted.machineReadableRecords);
  totalGap += gap;
  coverage[name] = {
    targetMin: config.targetMin,
    ...(config.targetMax ? { targetMax: config.targetMax } : {}),
    machineReadableRecords: counted.machineReadableRecords,
    proseDefinitions: counted.proseDefinitions,
    machineReadableGap: gap,
    status: statusFor(config, counted.machineReadableRecords),
    sources: counted.sources,
  };
}

const report = {
  schemaVersion: "econovaria-core-content-coverage-audit-v1",
  generatedAt: "2026-07-19",
  productionAuthorized: false,
  countingPolicy: {
    targetMeasure: "machine-readable reusable definitions",
    proseFiles: "reported separately and do not satisfy executable-content targets",
    runtimeStatus: "coverage does not authorize runtime activation",
  },
  summary: {
    domainsChecked: Object.keys(coverage).length,
    domainsMeetingMachineReadableTarget: Object.values(coverage).filter((entry) => entry.status === "target-met").length,
    totalMachineReadableGap: totalGap,
  },
  itemCatalog: await itemCount(),
  coverage,
};

function markdown(document) {
  const rows = Object.entries(document.coverage).map(([name, entry]) =>
    `| ${name} | ${entry.targetMin}${entry.targetMax ? `–${entry.targetMax}` : "+"} | ${entry.machineReadableRecords} | ${entry.proseDefinitions} | ${entry.machineReadableGap} | ${entry.status} |`
  ).join("\n");
  return `# Core Content Coverage Audit v1\n\nStatus: design coverage audit  \nProduction authorization: false\n\n## Summary\n\n- domains checked: ${document.summary.domainsChecked};\n- machine-readable targets met: ${document.summary.domainsMeetingMachineReadableTarget};\n- total machine-readable record gap: ${document.summary.totalMachineReadableGap}.\n\nProse files are reported separately and do not satisfy machine-readable content targets. Coverage does not authorize runtime activation.\n\n| Domain | Target | Machine-readable | Prose | Gap | Status |\n|---|---:|---:|---:|---:|---|\n${rows}\n\n## Item catalog\n\nThe physical item catalog contains ${document.itemCatalog?.totalItemDefinitions ?? 0} definitions. Numeric prices approved: ${document.itemCatalog?.numericPricesApproved ?? false}. Recipes approved: ${document.itemCatalog?.recipesApproved ?? false}. Production import approved: ${document.itemCatalog?.productionImportApproved ?? false}.\n`;
}

async function compareOrWrite(filePath, expected) {
  let current = null;
  try { current = await readFile(filePath, "utf8"); } catch {}
  if (current === expected) return false;
  if (checkOnly) {
    console.error(`Core-content coverage drift: ${path.relative(repoRoot, filePath)}`);
    return true;
  }
  await writeFile(filePath, expected, "utf8");
  return true;
}

const differences = [
  await compareOrWrite(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`),
  await compareOrWrite(reportMarkdownPath, markdown(report)),
].filter(Boolean).length;

if (checkOnly && differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Recorded"} core-content coverage: ${report.summary.domainsMeetingMachineReadableTarget}/${report.summary.domainsChecked} targets met; gap ${report.summary.totalMachineReadableGap}.`);
