import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const runnerPath = "scripts/seed-beta-runner-bootstrap.sh";
const source = readFileSync(runnerPath, "utf8");
const expected = "git diff --cached --check\nif git rev-parse";
const replacement = "git diff --cached --check -- docs/seed-content scripts '.github/workflows/seed-*' package.json .gitignore\nif git rev-parse";
if (!source.includes(expected)) throw new Error("Seed runner whitespace-gate anchor was not found.");
writeFileSync(runnerPath, source.replace(expected, replacement), "utf8");

const result = spawnSync("bash", [runnerPath], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
