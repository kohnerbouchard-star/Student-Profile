#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { preflightSeedContent, validateEnvironment } from "./seed-content-preflight-lib.mjs";

export function parseArguments(argv) {
  const options = { environment: null, mode: "design", format: "text" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--environment") options.environment = argv[++index] ?? null;
    else if (argument === "--mode") options.mode = argv[++index] ?? null;
    else if (argument === "--format") options.format = argv[++index] ?? null;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.help) return options;
  if (!options.environment) throw new Error("--environment is required; no environment fallback is permitted.");
  validateEnvironment(options.environment, options.mode);
  if (!["json", "text"].includes(options.format)) throw new Error("--format must be text or json.");
  return options;
}

export function formatTextReport(report) {
  const lines = [
    `Seed content preflight: ${report.pack?.packId ?? "unknown pack"} ${report.pack?.version ?? "unknown version"}`,
    `Environment: ${report.environment}`,
    `Mode: ${report.mode}`,
    `JSON files checked: ${report.summary.jsonFilesChecked}`,
    `Errors: ${report.summary.errors}; blockers: ${report.summary.blockers}; warnings: ${report.summary.warnings}`,
  ];
  for (const entry of report.issues) {
    lines.push(`[${entry.severity.toUpperCase()}] ${entry.code} ${entry.path}: ${entry.message}`);
  }
  lines.push(report.stagingReady ? "Result: STAGING_READY" : report.summary.errors > 0 ? "Result: FAILED" : "Result: DESIGN_VALID_WITH_BLOCKERS");
  return lines.join("\n");
}

function usage() {
  return [
    "Usage: node scripts/seed-content-preflight.mjs --environment <local|test|staging|production> [--mode <design|staging>] [--format <text|json>]",
    "",
    "design mode validates the current non-executable catalog and reports known blockers.",
    "staging mode exits non-zero until every staging blocker is closed.",
  ].join("\n");
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 64;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.dirname(scriptDirectory);
  const report = await preflightSeedContent({ repoRoot, environment: options.environment, mode: options.mode });
  console.log(options.format === "json" ? JSON.stringify(report, null, 2) : formatTextReport(report));
  if (report.summary.errors > 0) process.exitCode = 1;
  else if (options.mode === "staging" && report.summary.blockers > 0) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
