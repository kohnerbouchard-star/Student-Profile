import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const activeRoot = path.join(seedRoot, "markets", "active-subsets");
const outputPath = path.join(seedRoot, "simulation", "northreach", "northreach_active_instruments_v1.json");
const checkOnly = process.argv.includes("--check");

const sourceFiles = [
  "northreach-active-equity-enrichment-v1.json",
  "northreach-active-fixed-income-enrichment-v1.json",
  "northreach-active-collective-reference-enrichment-v1.json",
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

const instruments = [];
for (const fileName of sourceFiles) {
  const document = await readJson(path.join(activeRoot, fileName));
  if (!Array.isArray(document.records)) throw new Error(`${fileName} does not contain a records array.`);
  for (const record of document.records) instruments.push(record);
}

instruments.sort((left, right) => left.symbol.localeCompare(right.symbol));
const ids = new Set(instruments.map((record) => record.id));
const symbols = new Set(instruments.map((record) => record.symbol));
if (instruments.length !== 24 || ids.size !== 24 || symbols.size !== 24) {
  throw new Error(`Expected 24 unique Northreach instruments; found ${instruments.length} records, ${ids.size} IDs, and ${symbols.size} symbols.`);
}
if (instruments.some((record) => record.country !== "northreach" || record.currency !== "NRC" || record.exchange !== "FGX")) {
  throw new Error("Northreach simulation input contains a noncanonical country, currency, or exchange identity.");
}
if (instruments.filter((record) => record.tradable !== false).length !== 22) {
  throw new Error("Northreach simulation input must contain exactly 22 tradable instruments and two references.");
}

const output = `${JSON.stringify({
  schemaVersion: "econovaria-northreach-simulation-input-v1",
  generatedAt: "2026-07-19",
  country: "northreach",
  currency: "NRC",
  exchange: "FGX",
  activationAuthorized: false,
  sourceFiles: sourceFiles.map((fileName) => `../../markets/active-subsets/${fileName}`),
  instrumentCount: instruments.length,
  tradableInstrumentCount: instruments.filter((record) => record.tradable !== false).length,
  instruments,
}, null, 2)}\n`;

let current = null;
try { current = await readFile(outputPath, "utf8"); } catch {}
if (checkOnly) {
  if (current !== output) {
    console.error(`Northreach simulation input drift: ${path.relative(repoRoot, outputPath)}`);
    process.exitCode = 1;
  } else {
    console.log("Verified deterministic Northreach simulation input.");
  }
} else {
  await writeFile(outputPath, output, "utf8");
  console.log("Generated deterministic Northreach simulation input with 24 instruments.");
}
