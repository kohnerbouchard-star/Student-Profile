import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(
  repositoryRoot,
  ".github/workflows/canonical-fx-authority-v1.yml",
);
const workflow = await readFile(workflowPath, "utf8");
const rootPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const backendPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "backend/package.json"), "utf8"),
);
const edgeRootTypecheck = await readFile(
  path.join(repositoryRoot, "backend/scripts/typecheckAllEdgeRoots.mjs"),
  "utf8",
);
const databaseAcceptance = await readFile(
  path.join(repositoryRoot, "scripts/canonical-fx-authority-database.mjs"),
  "utf8",
);

const requiredPaths = [
  ".github/workflows/canonical-fx-authority-v1.yml",
  "backend/package.json",
  "backend/package-lock.json",
  "backend/scripts/typecheckAllEdgeRoots.mjs",
  "backend/src/domains/fx/**",
  "backend/src/domains/storylines/services/storyEffectEngine.ts",
  "backend/src/domains/storylines/services/storyWorldFxEffectContracts.test.ts",
  "backend/supabase/config.toml",
  "backend/supabase/edge-function-manifest.json",
  "backend/supabase/functions/fx-orchestrator/**",
  "backend/supabase/migrations/20260825223806_canonical_fx_authority_v1.sql",
  "docs/roadmaps/canonical-fx-authority-scope-v1.md",
  "docs/roadmaps/business-v2-development-execution-plan-v1.md",
  "docs/roadmaps/business-v2-development-execution-log-v1.md",
  "scripts/canonical-fx-authority-contract.mjs",
  "scripts/canonical-fx-authority-database.mjs",
  "scripts/edge-function-inventory/**",
  "scripts/local-edge-runtime-contract.test.mjs",
];

for (const repositoryPath of requiredPaths) {
  assert.ok(
    workflow.includes(`- "${repositoryPath}"`),
    `Canonical FX workflow does not cover ${repositoryPath}.`,
  );
}

for (const requiredFragment of [
  "branches:\n      - feat/business-player-store-cutover-v2",
  "permissions:\n  contents: read",
  "ref: ${{ github.event.pull_request.head.sha }}",
  "persist-credentials: false",
  "fetch-depth: 0",
  "EXPECTED_PR_NUMBER: \"671\"",
  "test \"$EVENT_PR_NUMBER\" = \"$EXPECTED_PR_NUMBER\"",
  "test \"$(git rev-parse HEAD)\" = \"$EXPECTED_HEAD_SHA\"",
  "git cat-file -e \"$EXPECTED_BASE_SHA^{commit}\"",
  "test \"$GITHUB_HEAD_REF\" = \"$EXPECTED_HEAD_REF\"",
  "test \"$GITHUB_BASE_REF\" = \"$EXPECTED_BASE_REF\"",
  "test \"$EXPECTED_DRAFT\" = \"true\"",
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  "denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed",
  "node-version: \"22.23.1\"",
  "deno-version: v2.9.3",
  "npm install --global npm@10.9.8",
  "npm ci --ignore-scripts",
  "npm ci --prefix backend --ignore-scripts",
  "node scripts/canonical-fx-authority-contract.mjs",
  "npm run security:secrets",
  "npm run audit:migrations",
  "npm run test:auth-boundaries",
  "node --test scripts/edge-function-inventory/validate.test.mjs",
  "git diff --check \"$EXPECTED_BASE_SHA...$EXPECTED_HEAD_SHA\"",
  "npm --prefix backend run test:fx",
  "src/domains/storylines/services/storyEffectEngine.test.ts",
  "src/domains/storylines/services/storyWorldFxEffectContracts.test.ts",
  "npm --prefix backend run test:player-world",
  "npm --prefix backend run test:world-runtime",
  "npm --prefix backend run test:player-banking-public",
  "npm --prefix backend run test:economic-ledger-invariants",
  "npm --prefix backend run test:stock-market-calendar",
  "npm --prefix backend run test:player-market-assets",
  "npm --prefix backend run test:player-store-public",
  "npm --prefix backend run typecheck:all",
  "docker info >/dev/null",
  "npx --no-install supabase start --workdir backend",
  "node scripts/canonical-fx-authority-database.mjs",
  "npx --no-install supabase db lint --workdir backend --local --level warning",
  "npx --no-install supabase stop --workdir backend --no-backup || true",
]) {
  assert.ok(
    workflow.includes(requiredFragment),
    `Canonical FX workflow is missing required contract fragment: ${requiredFragment}`,
  );
}

for (const requiredFragment of [
  'parsedDatabaseUrl.port !== "54322"',
  'parsedDatabaseUrl.search !== ""',
  'parsedDatabaseUrl.hash !== ""',
  'parsedDatabaseUrl.pathname !== "/postgres"',
  '"--echo-errors"',
  "begin;",
  "rollback;",
]) {
  assert.ok(
    databaseAcceptance.includes(requiredFragment),
    `Disposable database acceptance is missing its safety contract: ${requiredFragment}`,
  );
}

for (const jobName of [
  "exact-head-static",
  "backend-compatibility",
  "disposable-database",
]) {
  const job = workflowJob(workflow, jobName);
  for (const requiredFragment of [
    'EXPECTED_PR_NUMBER: "671"',
    "EVENT_PR_NUMBER: ${{ github.event.pull_request.number }}",
    "EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}",
    "EXPECTED_BASE_SHA: ${{ github.event.pull_request.base.sha }}",
    "EXPECTED_HEAD_REF: feat/canonical-fx-authority-v1",
    "EXPECTED_BASE_REF: feat/business-player-store-cutover-v2",
    "EXPECTED_DRAFT: ${{ github.event.pull_request.draft }}",
    "ref: ${{ github.event.pull_request.head.sha }}",
    "fetch-depth: 0",
    "persist-credentials: false",
    "set -euo pipefail",
    'test "$GITHUB_EVENT_NAME" = "pull_request"',
    'test "$EVENT_PR_NUMBER" = "$EXPECTED_PR_NUMBER"',
    'test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD_SHA"',
    'git cat-file -e "$EXPECTED_BASE_SHA^{commit}"',
    'test "$GITHUB_HEAD_REF" = "$EXPECTED_HEAD_REF"',
    'test "$GITHUB_BASE_REF" = "$EXPECTED_BASE_REF"',
    'test "$EXPECTED_DRAFT" = "true"',
  ]) {
    assert.ok(
      job.includes(requiredFragment),
      `${jobName} is missing its own exact-head fragment: ${requiredFragment}`,
    );
  }
}

assert.ok(
  workflowJob(workflow, "exact-head-static").includes(
    'git diff --check "$EXPECTED_BASE_SHA...$EXPECTED_HEAD_SHA"',
  ),
  "The static job must inspect committed PR whitespace against its exact base.",
);
assert.ok(
  workflowJob(workflow, "exact-head-static").includes(
    "node --test scripts/edge-function-inventory/validate.test.mjs",
  ),
  "The static job must certify Edge manifest/config/source parity.",
);
assert.ok(
  workflowJob(workflow, "backend-compatibility").includes(
    "npm --prefix backend run typecheck:all",
  ),
  "The Backend job must execute the all-root typecheck.",
);
assert.ok(
  workflowJob(workflow, "disposable-database").includes(
    "node scripts/canonical-fx-authority-database.mjs",
  ),
  "The disposable database job must execute behavioral acceptance.",
);

assert.equal(
  rootPackage.devDependencies?.supabase,
  "2.109.1",
  "Disposable database checks must use the lockfile-pinned Supabase CLI 2.109.1.",
);

assert.equal(
  backendPackage.scripts?.["typecheck:all"],
  "npm run typecheck && npm run typecheck:edge-all",
  "Backend typecheck:all must delegate every Edge root to one discovery check.",
);
assert.equal(
  backendPackage.scripts?.["typecheck:edge-all"],
  "node scripts/typecheckAllEdgeRoots.mjs",
  "Backend typecheck:edge-all must use the bounded discovery script.",
);
for (const requiredFragment of [
  "readdirSync(functionsRoot",
  'join(functionsRoot, entry.name, "index.ts")',
  '["admin-api", join(functionsRoot, "admin-api", "deno.json")]',
  '["classroom-api", join(functionsRoot, "classroom-api", "deno.json")]',
  '"--frozen"',
]) {
  assert.ok(
    edgeRootTypecheck.includes(requiredFragment),
    `Every-Edge-root typecheck is missing: ${requiredFragment}`,
  );
}

assert.equal(
  [...workflow.matchAll(/npx --no-install supabase db reset --workdir backend --local/g)].length,
  2,
  "Every forward migration must be replayed from zero exactly twice.",
);

for (const forbiddenTrigger of [
  /^\s*push:/mu,
  /^\s*workflow_dispatch:/mu,
  /^\s*schedule:/mu,
  /^\s*workflow_run:/mu,
  /^\s*pull_request_target:/mu,
]) {
  assert.doesNotMatch(
    workflow,
    forbiddenTrigger,
    `Canonical FX certification must remain draft-PR-only: ${forbiddenTrigger}`,
  );
}

for (const forbiddenAuthority of [
  /\$\{\{\s*secrets\./iu,
  /^\s*environment:\s*(?:staging|production)\s*$/imu,
  /\bcontents:\s*write\b/iu,
  /\bid-token:\s*write\b/iu,
  /\bSUPABASE_(?:ACCESS_TOKEN|PROJECT_REF|SERVICE_ROLE_KEY|DB_PASSWORD)\b/iu,
  /\bsupabase\s+link\b/iu,
  /\bsupabase\s+db\s+push\b/iu,
  /\bsupabase\s+migration\s+(?:up|repair)\b/iu,
  /\bsupabase\s+functions\s+deploy\b/iu,
  /\bsupabase\s+secrets\s+(?:set|unset)\b/iu,
  /\bvercel\s+(?:deploy|promote|alias)\b/iu,
  /\b(?:curl|wget|ssh|scp|kubectl)\b/iu,
  /\bgh\s+(?:api|pr|workflow|run|release)\b/iu,
  /\bgit\s+(?:push|commit|merge|tag)\b/iu,
  /\bnpm\s+publish\b/iu,
  /https?:\/\//iu,
]) {
  assert.doesNotMatch(
    workflow,
    forbiddenAuthority,
    `Canonical FX certification contains hosted or mutating authority: ${forbiddenAuthority}`,
  );
}

const actionUses = workflow.match(/^\s*uses:\s*[^\s#]+/gmu) ?? [];
assert.ok(actionUses.length >= 7, "Pinned certification actions are missing.");
for (const actionUse of actionUses) {
  assert.match(
    actionUse,
    /@[a-f0-9]{40}$/u,
    `Certification action is not pinned to an immutable commit: ${actionUse.trim()}`,
  );
}

const allowedSupabaseCommands = new Set([
  "npx --no-install supabase start --workdir backend --exclude studio,imgproxy,inbucket,storage-api,edge-runtime,logflare,vector,supavisor",
  "npx --no-install supabase db reset --workdir backend --local",
  "npx --no-install supabase db lint --workdir backend --local --level warning",
  "npx --no-install supabase stop --workdir backend --no-backup || true",
]);

function workflowJob(source, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Workflow job ${jobName} is missing.`);
  const bodyStart = start + marker.length;
  const nextJob = source.slice(bodyStart).search(/\n  [a-z0-9_-]+:\n/u);
  return source.slice(start, nextJob < 0 ? source.length : bodyStart + nextJob);
}

const supabaseCommands = workflow
  .split(/\r?\n/u)
  .map((line) => line.trim().replace(/^run:\s*/u, ""))
  .filter((line) => line.startsWith("npx --no-install supabase "));

assert.ok(supabaseCommands.length >= 5, "Disposable database commands are missing.");
for (const command of supabaseCommands) {
  assert.ok(
    allowedSupabaseCommands.has(command),
    `Unapproved Supabase command in canonical FX certification: ${command}`,
  );
}

console.log(
  "Canonical FX authority workflow is exact-head, draft-PR-only, pinned, local-only, and non-deploying.",
);
