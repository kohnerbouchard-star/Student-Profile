#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const releaseWorkflow = readFileSync(
  ".github/workflows/production-git-release.yml",
  "utf8",
);
const verifier = readFileSync(
  ".github/workflows/vercel-git-production-verify.yml",
  "utf8",
);
const health = readFileSync("api/_runtime-health.js", "utf8");

assert.equal(config.git?.deploymentEnabled?.main, false);
assert.equal(config.git?.deploymentEnabled?.["release/production"], true);

for (const marker of [
  "Publish parity-verified source to release/production",
  "contents: write",
  "git merge-base --is-ancestor origin/release/production HEAD",
  'git push origin "$SOURCE_COMMIT:refs/heads/$RELEASE_BRANCH"',
  "production-release-branch-${{ github.sha }}",
  "Staging post-cutoff ledger does not match repository migration manifest.",
  "Production post-cutoff ledger does not match repository migration manifest.",
]) {
  assert.ok(releaseWorkflow.includes(marker), `missing Git release marker: ${marker}`);
}

for (const forbidden of [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "vercel deploy",
  "vercel promote",
  "vercel pull",
]) {
  assert.ok(
    !releaseWorkflow.includes(forbidden),
    `tokenless release workflow contains forbidden Vercel CLI dependency: ${forbidden}`,
  );
}

for (const marker of [
  "repository_dispatch:",
  "vercel.deployment.success",
  "github.event.client_payload.git.sha",
  "github.event.client_payload.url",
  "release/production",
  "https://www.econovaria.com/api/health",
  "sourceCommit",
]) {
  assert.ok(verifier.includes(marker), `missing production verification marker: ${marker}`);
}

assert.ok(
  health.includes("environment.VERCEL_GIT_COMMIT_SHA"),
  "runtime health must accept Vercel Git commit SHA",
);

console.log("vercel git release contract: ok");
