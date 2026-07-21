#!/usr/bin/env node

import { buildFullMarketEditorialReview } from "./lib/full-market-editorial-review.mjs";

const options = parseArguments(process.argv.slice(2));
const result = await buildFullMarketEditorialReview({
  repositoryRoot: process.cwd(),
  reportPath: options.reportPath,
  transformationPlanPath: options.transformationPlanPath,
});

process.stdout.write(`${JSON.stringify({
  schemaVersion: result.report.schemaVersion,
  packId: result.report.packId,
  version: result.report.version,
  structurallyValid: result.report.structurallyValid,
  editorialReady: result.report.editorialReady,
  activationAuthorized: result.report.activationAuthorized,
  counts: result.report.counts,
  reviewDigestSha256: result.report.reviewDigestSha256,
  transformationInstructionCount: result.transformationPlan.instructionCount,
}, null, 2)}\n`);

function parseArguments(args) {
  const parsed = {
    reportPath: "full-market-editorial-review.json",
    transformationPlanPath: "full-market-editorial-transformation-plan.json",
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--report") {
      parsed.reportPath = requiredValue(args[++index], "--report");
    } else if (value === "--transformation-plan") {
      parsed.transformationPlanPath = requiredValue(
        args[++index],
        "--transformation-plan",
      );
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return parsed;
}

function requiredValue(value, flag) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a path.`);
  }
  return value;
}
