#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { compareLedger, compareSchema, parseArgs, rawRoutineDiffs, readJson, required } from "./live-parity-lib.mjs";
import { hydratePolicy, normalizeEvidence, validatePolicy } from "./live-parity-normalize.mjs";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = String(options.mode || "report");
  if (!new Set(["report","enforce"]).has(mode)) throw new Error("--mode must be report or enforce");
  const policyPath = required(options, "policy");
  const [basePolicy, stagingRaw, productionRaw, stagingLedger, productionLedger] = await Promise.all([
    readJson(policyPath), readJson(required(options,"stagingSchema")), readJson(required(options,"productionSchema")),
    readJson(required(options,"stagingLedger")), readJson(required(options,"productionLedger")),
  ]);
  const policy = await hydratePolicy(basePolicy, policyPath);
  validatePolicy(policy);
  const ledger = compareLedger(stagingLedger, productionLedger, policy);
  const rawRoutines = rawRoutineDiffs(stagingRaw, productionRaw);
  const staging = normalizeEvidence(stagingRaw, "staging", policy);
  const production = normalizeEvidence(productionRaw, "production", policy);
  const differences = compareSchema(staging, production);
  const result = {
    schemaVersion:"econovaria.release-integrity-v2.live-parity.v1", policyId:policy.policyId, mode, ledger,
    approvedStagingOnlyTables:policy.allowedStagingOnlyTables || [],
    approvedStagingOnlyRoutines:policy.approvedStagingOnlyRoutines || [],
    approvedProductionOnlyRoutines:policy.approvedProductionOnlyRoutines || [],
    approvedStagingOnlyRoutineGrants:policy.approvedStagingOnlyRoutineGrants || [],
    rawRoutineDifferences:rawRoutines, unapprovedDifferenceCount:differences.length, differences:differences.slice(0,500),
  };
  const pass = ledger.historical.status === "PASS" && ledger.postCutoff.status === "PASS" && differences.length === 0;
  result.status = pass ? "PASS" : mode === "report" ? "REPORT" : "BLOCKED";
  const serialized = `${JSON.stringify(result,null,2)}\n`;
  if (options.output) await writeFile(path.resolve(String(options.output)), serialized, "utf8");
  process.stdout.write(serialized);
  if (mode === "enforce" && !pass) process.exitCode = 2;
}
main().catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exitCode = 1; });
