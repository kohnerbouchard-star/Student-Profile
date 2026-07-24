#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateFullMarketUniverse,
} from "./lib/full-market-universe-validator.mjs";

export * from "./lib/full-market-universe-validator.mjs";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--repository-root") {
      options.repositoryRoot = argv[++index];
    } else if (token === "--manifest") {
      options.manifestPath = argv[++index];
    } else if (token === "--market-root") {
      options.marketRoot = argv[++index];
    } else if (token === "--report") {
      options.reportPath = argv[++index];
    } else if (token === "--require-editorial-ready") {
      options.requireEditorialReady = true;
    } else if (token === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(
    `Usage: node scripts/validate-full-market-universe.mjs [options]\n\n` +
      `Options:\n` +
      `  --repository-root <path>       Repository root (default: current directory)\n` +
      `  --manifest <path>              Manifest path relative to repository root\n` +
      `  --market-root <path>           Market content root relative to repository root\n` +
      `  --report <path>                Write deterministic JSON report\n` +
      `  --require-editorial-ready      Fail when editorial findings remain\n` +
      `  --help                         Show this help\n`,
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = await validateFullMarketUniverse(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.structurallyValid ||
    (options.requireEditorialReady && !report.editorialReady)) {
    process.exitCode = 1;
  }
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
