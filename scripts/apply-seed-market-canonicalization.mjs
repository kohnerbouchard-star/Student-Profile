import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(repoRoot, "scripts", "generate-seed-market-universe.mjs");
const activeRoot = path.join(repoRoot, "docs", "seed-content", "markets", "active-subsets");
const checkOnly = process.argv.includes("--check");

const replacements = new Map([
  ["SPX", "SBX"],
  ["administrator.yrethia.spx.v1", "administrator.yrethia.sbx.v1"],
  ["DHX", "DHM"],
  ["administrator.thaloris.dhx.v1", "administrator.thaloris.dhm.v1"],
  ["Dusk Harbor Exchange", "Dusk Harbor Market"],
  ["ASX", "AUX"],
  ["administrator.solvend.asx.v1", "administrator.solvend.aux.v1"],
  ["Aurora Spire Exchange", "Aurora Exchange"],
]);

function replaceExactValues(value) {
  if (Array.isArray(value)) return value.map(replaceExactValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceExactValues(entry)]));
  }
  return typeof value === "string" && replacements.has(value) ? replacements.get(value) : value;
}

function patchGenerator(source) {
  let output = source;
  const importLine = 'import { overlayCuratedActiveIdentities } from "./seed-market-curated-overlay-lib.mjs";';
  if (!output.includes(importLine)) {
    const anchor = 'import { fileURLToPath } from "node:url";';
    if (!output.includes(anchor)) throw new Error("Generator import anchor not found.");
    output = output.replace(anchor, `${anchor}\n${importLine}`);
  }

  if (output.includes('commodity_reference: "R",')) output = output.replace('commodity_reference: "R",', 'commodity_reference: "C",');
  if (!output.includes('commodity_reference: "C",')) throw new Error("Commodity-reference class code was not canonicalized to C.");

  const oldBuild = 'const countryRecords = new Map(configs.map((config) => [config.key, buildCountry(config)]));\nconst validation = validate(countryRecords);';
  const newBuild = 'const countryRecords = new Map(configs.map((config) => [config.key, buildCountry(config)]));\nconst overlaySummary = await overlayCuratedActiveIdentities({\n  countryRecords,\n  activeRoot: path.join(repoRoot, "docs", "seed-content", "markets", "active-subsets"),\n});\nconst validation = validate(countryRecords);';
  if (output.includes(oldBuild)) output = output.replace(oldBuild, newBuild);
  if (!output.includes('const overlaySummary = await overlayCuratedActiveIdentities({')) throw new Error("Curated overlay call is missing from the generator.");

  const oldManifest = 'const manifest = {\n  allocationPerCountry,';
  const newManifest = 'const manifest = {\n  allocationPerCountry,\n  curatedActiveOverlay: overlaySummary,';
  if (output.includes(oldManifest) && !output.includes('curatedActiveOverlay: overlaySummary')) output = output.replace(oldManifest, newManifest);
  if (!output.includes('curatedActiveOverlay: overlaySummary')) throw new Error("Curated overlay evidence is missing from the manifest builder.");
  return output;
}

async function compareOrWrite(filePath, expected) {
  const actual = await readFile(filePath, "utf8");
  if (actual === expected) return false;
  if (checkOnly) {
    console.error(`Canonicalization drift: ${path.relative(repoRoot, filePath)}`);
    return true;
  }
  await writeFile(filePath, expected, "utf8");
  console.log(`Canonicalized ${path.relative(repoRoot, filePath)}`);
  return true;
}

let differences = 0;
const generatorSource = await readFile(generatorPath, "utf8");
if (await compareOrWrite(generatorPath, patchGenerator(generatorSource))) differences += 1;

for (const fileName of (await readdir(activeRoot)).filter((name) => name.endsWith(".json")).sort()) {
  const filePath = path.join(activeRoot, fileName);
  const document = JSON.parse(await readFile(filePath, "utf8"));
  const canonical = `${JSON.stringify(replaceExactValues(document))}\n`;
  if (await compareOrWrite(filePath, canonical)) differences += 1;
}

if (checkOnly && differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Applied"} seed-market canonicalization across the generator and active candidate records.`);
