import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const runnerPath = "scripts/seed-beta-runner-bootstrap.sh";
let source = readFileSync(runnerPath, "utf8");

const replacements = [
  [
    "git diff --cached --check\nif git rev-parse",
    "git diff --cached --check -- docs/seed-content scripts '.github/workflows/seed-*' package.json .gitignore\nif git rev-parse",
  ],
  [
    "rm -f .github/workflows/seed-beta-pack-bootstrap.yml",
    "rm -f .github/workflows/seed-beta-pack-bootstrap.yml\nrm -f .github/workflows/seed-beta-pack-execution.yml",
  ],
  [
    "git add package.json package-lock.json .gitignore scripts .github/workflows/seed-beta-pack-execution.yml docs/seed-content/executable/beta-pack-v1 docs/seed-content/reviews/executable-beta-pack-readiness-v1.md",
    "git add package.json package-lock.json .gitignore scripts docs/seed-content/executable/beta-pack-v1 docs/seed-content/reviews/executable-beta-pack-readiness-v1.md",
  ],
];

for (const [expected, replacement] of replacements) {
  if (!source.includes(expected)) throw new Error(`Seed runner patch anchor was not found: ${expected}`);
  source = source.replace(expected, replacement);
}
writeFileSync(runnerPath, source, "utf8");

const result = spawnSync("bash", [runnerPath], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
