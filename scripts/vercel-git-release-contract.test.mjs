#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const releaseWorkflow = readFileSync(
  ".github/workflows/production-git-release.yml",
  "utf8",
);
const controlledProductionWorkflow = readFileSync(
  ".github/workflows/phase15-controlled-production.yml",
  "utf8",
);
const verifier = readFileSync(
  ".github/workflows/vercel-git-production-verify.yml",
  "utf8",
);
const health = readFileSync("api/_runtime-health.js", "utf8");
const edgeWorkflow = readFileSync(
  ".github/workflows/edge-function-inventory-converge.yml",
  "utf8",
);
const adminCutoverWorkflow = readFileSync(
  ".github/workflows/admin-v2-production-cutover.yml",
  "utf8",
);

// A code merge must not grant deployment authority. All environment reads and
// writes stay behind the explicit dispatch, with existing parity gates intact.
const releaseCondition =
  "github.event_name == 'workflow_dispatch' && inputs.release_authorized == true && github.ref == 'refs/heads/main'";
for (const [workflow, expectedJobs] of [
  [edgeWorkflow, ["staging", "production"]],
  [adminCutoverWorkflow, ["contract", "production"]],
  [releaseWorkflow, ["static-contract", "staging-evidence", "production-evidence", "enforce-parity", "publish-release-branch"]],
]) {
  assert.match(workflow, /workflow_dispatch:\n    inputs:\n      release_authorized:\n        description: [^\n]+\n        required: true\n        type: boolean\n        default: false/u);
  const jobs = [...workflow.slice(workflow.indexOf("\njobs:\n")).matchAll(/^  ([a-z-]+):\n([\s\S]*?)(?=^  [a-z-]+:\n|$(?![\s\S]))/gmu)];
  assert.deepEqual(jobs.map((job) => job[1]), expectedJobs);
  for (const [block, name] of jobs) {
    if (name === "static-contract" || name === "contract") continue;
    assert.equal(block.match(/^    if: (.+)$/mu)?.[1], releaseCondition, `${name} needs explicit release authority`);
  }
}
assert.equal((edgeWorkflow.match(/test "\$GITHUB_EVENT_NAME" = "workflow_dispatch"/gu) || []).length, 2);
assert.ok(releaseWorkflow.includes("event=workflow_dispatch&per_page=20"));
assert.match(edgeWorkflow, /production:\n[\s\S]*?needs: staging/u);
assert.match(releaseWorkflow, /publish-release-branch:\n[\s\S]*?needs: enforce-parity/u);
assert.match(releaseWorkflow, /publish-release-branch:\n[\s\S]*?environment: production/u);
assert.match(releaseWorkflow, /ssh-key: \$\{\{ secrets\.PHASE15_RELEASE_DEPLOY_KEY_V1 \}\}/u);
assert.match(releaseWorkflow, /persist-credentials: true/u);
assert.match(releaseWorkflow, /test -n "\$PHASE15_RELEASE_DEPLOY_KEY"/u);
assert.match(releaseWorkflow, /concurrency:\n  group: econovaria-production-release\n  cancel-in-progress: false/u);
assert.match(controlledProductionWorkflow, /concurrency:\n  group: econovaria-production-release\n  cancel-in-progress: false/u);

assert.equal(config.git?.deploymentEnabled?.main, false);
assert.equal(config.git?.deploymentEnabled?.["release/production"], true);

for (const marker of [
  "Publish parity-verified source to release/production",
  "contents: read",
  "PHASE15_RELEASE_DEPLOY_KEY_V1",
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

for (const forbidden of [
  "deployment-health.json",
  '"$deployment_origin/api/health"',
]) {
  assert.ok(
    !verifier.includes(forbidden),
    `production verifier must not depend on protected raw deployment health: ${forbidden}`,
  );
}

assert.ok(
  health.includes("environment.VERCEL_GIT_COMMIT_SHA"),
  "runtime health must accept Vercel Git commit SHA",
);

console.log("vercel git release contract: ok");
