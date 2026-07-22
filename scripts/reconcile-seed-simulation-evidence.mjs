import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const simulationRoot = path.join(repoRoot, "docs", "seed-content", "simulation");
const checkOnly = process.argv.includes("--check");

const configs = [
  { country: "northreach", simulationId: "econovaria.northreach.market-pilot.v1", input: "northreach_active_instruments_v1.json", script: "run_northreach_market_simulation_v1.py", summary: "summary-v1.json", rawFiles: ["output/raw_instrument_results.csv", "output/raw_paths.csv", "output/raw_portfolio_results.csv"], exactCommand: "python run_northreach_market_simulation_v1.py --input northreach_active_instruments_v1.json --output output --seeds 250 --cycles 60" },
  { country: "thaloris", simulationId: "thaloris-market-simulation-v1", input: "input-v1.json", script: "run_thaloris_market_simulation_v1.py", summary: "summary-v1.json", rawFiles: ["output/instrument-results.csv", "output/portfolio-results.csv"], exactCommand: "python run_thaloris_market_simulation_v1.py" },
  { country: "yrethia", simulationId: "yrethia-market-simulation-v1", input: "input-v1.json", script: "run_yrethia_market_simulation_v1.py", summary: "summary-v1.json", rawFiles: ["output/instrument-results.csv", "output/portfolio-results.csv"], exactCommand: "python run_yrethia_market_simulation_v1.py" },
  { country: "solvend", simulationId: "solvend-market-simulation-v1", input: "input-v1.json", script: "run_solvend_market_simulation_v1.py", summary: "summary-v1.json", rawFiles: [], exactCommand: "python run_solvend_market_simulation_v1.py" },
];

async function exists(filePath) {
  try { await stat(filePath); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function summarize(summary, input) {
  const scenarios = summary.scenarios ?? Object.keys(summary.scenarioStrategySummary ?? input.scenarios ?? {});
  const strategyNames = new Set();
  if (summary.scenarioStrategySummary) {
    for (const value of Object.values(summary.scenarioStrategySummary)) {
      for (const strategy of Object.keys(value ?? {})) strategyNames.add(strategy);
    }
  }
  for (const metric of summary.portfolioMetrics ?? []) if (metric.portfolio) strategyNames.add(metric.portfolio);
  const instrumentIds = new Set((input.instruments ?? []).map((record) => record.id));
  if (instrumentIds.size === 0 && Number.isInteger(summary.instrumentCount)) {
    for (let index = 0; index < summary.instrumentCount; index += 1) instrumentIds.add(`summary-${index}`);
  }
  return {
    seeds: summary.seeds ?? input.seeds ?? 250,
    cycles: summary.cycles ?? input.cycles ?? 60,
    instrumentCount: summary.instrumentCount ?? instrumentIds.size,
    scenarioCount: summary.scenarioCount ?? scenarios.length,
    strategyCount: summary.strategyCount ?? strategyNames.size,
    integrity: summary.integrity ?? {},
  };
}

async function retainedFiles(config, countryRoot) {
  const output = {};
  for (const fileName of [config.input, config.script, config.summary, "raw-evidence-manifest-v1.json"]) {
    const filePath = path.join(countryRoot, fileName);
    if (!(await exists(filePath))) throw new Error(`${config.country} retained evidence is missing ${fileName}.`);
    output[fileName] = await sha256(filePath);
  }
  return output;
}

async function buildRawEvidence(config, countryRoot) {
  const entries = [];
  for (const relativePath of config.rawFiles) {
    const filePath = path.join(countryRoot, relativePath);
    if (!(await exists(filePath))) throw new Error(`${config.country} rerun did not produce ${relativePath}.`);
    entries.push({ path: relativePath, sha256: await sha256(filePath), sizeBytes: (await stat(filePath)).size, repositoryRetained: false, artifactRetained: false });
  }
  return {
    schemaVersion: "econovaria-simulation-raw-evidence-v1",
    simulationId: config.simulationId,
    generatedAt: "2026-07-19",
    activationAuthorized: false,
    retentionStatus: entries.length > 0 ? "immutable-artifact-pending" : "summary-only-model-no-raw-output",
    repositoryPolicy: entries.length > 0
      ? "Large raw simulation rows are excluded from Git; retain them in an immutable workflow artifact before approval."
      : "This simulation produces a deterministic summary directly and has no separate raw-output files.",
    files: entries,
  };
}

function expectedManifest(config, summaryFacts, files, rawEvidence) {
  const retained = rawEvidence.retentionStatus === "immutable-workflow-artifact-retained";
  const pending = rawEvidence.retentionStatus === "immutable-artifact-pending";
  return {
    simulationId: config.simulationId,
    status: retained ? "executed-summary-and-raw-artifact-retained" : pending ? "executed-summary-retained-raw-artifact-pending" : "executed-summary-retained",
    activationAuthorized: false,
    seeds: summaryFacts.seeds,
    cycles: summaryFacts.cycles,
    instrumentCount: summaryFacts.instrumentCount,
    scenarioCount: summaryFacts.scenarioCount,
    strategyCount: summaryFacts.strategyCount,
    integrity: summaryFacts.integrity,
    files,
    evidenceRetention: {
      status: rawEvidence.retentionStatus,
      rawEvidenceManifest: "raw-evidence-manifest-v1.json",
      repositoryRetained: rawEvidence.files.every((entry) => entry.repositoryRetained === true),
      immutableArtifactRetained: retained,
      requiredForApproval: rawEvidence.files.length > 0,
      ...(retained ? { artifact: rawEvidence.artifact } : {}),
    },
    exactCommand: config.exactCommand,
  };
}

async function compareOrWrite(filePath, expected) {
  let current = null;
  try { current = await readFile(filePath, "utf8"); } catch {}
  if (current === expected) return false;
  if (checkOnly) {
    console.error(`Simulation evidence drift: ${path.relative(repoRoot, filePath)}`);
    return true;
  }
  await writeFile(filePath, expected, "utf8");
  return true;
}

let differences = 0;
for (const config of configs) {
  const countryRoot = path.join(simulationRoot, config.country);
  const input = await readJson(path.join(countryRoot, config.input));
  const summary = await readJson(path.join(countryRoot, config.summary));
  const rawEvidencePath = path.join(countryRoot, "raw-evidence-manifest-v1.json");
  let rawEvidence;
  if (checkOnly) {
    rawEvidence = await readJson(rawEvidencePath);
  } else {
    rawEvidence = await buildRawEvidence(config, countryRoot);
    if (await compareOrWrite(rawEvidencePath, `${JSON.stringify(rawEvidence, null, 2)}\n`)) differences += 1;
  }
  const files = await retainedFiles(config, countryRoot);
  const manifest = expectedManifest(config, summarize(summary, input), files, rawEvidence);
  if (await compareOrWrite(path.join(countryRoot, "run-manifest-v1.json"), `${JSON.stringify(manifest, null, 2)}\n`)) differences += 1;
}

if (checkOnly && differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Reconciled"} retained evidence for ${configs.length} market simulations.`);
