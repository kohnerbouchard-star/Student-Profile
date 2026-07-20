import { spawnSync } from "node:child_process";

const result = spawnSync("bash", ["scripts/seed-beta-final-verification-runner.sh"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
