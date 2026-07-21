import fs from "node:fs";
import path from "node:path";

function parse(argv) {
  const out = { execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--execute") out.execute = true;
    else if (arg?.startsWith("--")) out[arg.slice(2)] = argv[++i];
  }
  return out;
}

const args = parse(process.argv.slice(2));
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "ops/legacy-runtime/route-allowlist.json"), "utf8"));
const plan = config.authProbePlans?.[args.runtime];
if (!args["base-url"] || !args.runtime || !plan) {
  console.error("Use --base-url <url> --runtime <configured-runtime>.");
  process.exitCode = 1;
} else if (args.execute) {
  console.error("This repository probe is plan-only; connected execution requires a separately approved operator procedure.");
  process.exitCode = 1;
} else {
  const url = `${args["base-url"].replace(/\/$/, "")}/functions/v1/${args.runtime}${plan.path}`;
  console.log(JSON.stringify({
    mode: "plan-only",
    runtime: args.runtime,
    method: plan.method,
    url,
    probes: ["no-token", "deliberately-invalid-token"],
    realCredentialsAccepted: false
  }, null, 2));
}
