import { runReferenceMarketSimulation } from "./referenceMarketSimulation.ts";

declare const Deno: {
  readonly args: readonly string[];
  writeTextFile(path: string, data: string): Promise<void>;
};

const outputPath = readArgument("--output") ??
  "full-financial-markets-reference-simulation.json";
const seed = readArgument("--seed") ??
  "financial-market-reference-simulation.v1";
const report = runReferenceMarketSimulation(seed);

await Deno.writeTextFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(
  {
    schemaVersion: report.schemaVersion,
    seed: report.seed,
    accepted: report.accepted,
    digest: report.digest,
    metrics: report.metrics,
    rejectionReasons: report.rejectionReasons,
  },
  null,
  2,
));

if (!report.accepted) {
  throw new Error(
    `Reference simulation rejected: ${report.rejectionReasons.join(",")}`,
  );
}

function readArgument(flag: string): string | null {
  const index = Deno.args.indexOf(flag);
  if (index < 0) return null;
  const value = Deno.args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}
