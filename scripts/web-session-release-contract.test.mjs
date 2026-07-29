import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRYPOINT = "backend/supabase/functions/web-session-api/index.ts";
const CANDIDATE_WORKFLOW = ".github/workflows/production-web-session-hotfix.yml";
const DEPLOY_WORKFLOW = ".github/workflows/production-web-session-deploy.yml";
const SECRET_WORKFLOW = ".github/workflows/production-web-session-secrets.yml";
const TRUSTED_IP_REPAIR_WORKFLOW = ".github/workflows/production-web-session-trusted-ip-repair.yml";
const DATABASE_WORKFLOW = ".github/workflows/production-web-session-database-reconcile.yml";
const AUTHORIZATION = "docs/operations/evidence/production-web-session-recovery-v1.json";
const DATABASE_AUTHORIZATION = "docs/operations/evidence/production-web-session-database-reconciliation-v1.json";
const RELATIVE_IMPORT = /(?:from\s+|import\s*)["'](\.{1,2}\/[^"']+)["']/gu;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function normalizeModulePath(fromFile, specifier) {
  const resolved = path.normalize(path.join(path.dirname(fromFile), specifier));
  assert.ok(!resolved.startsWith(".."), `module import escapes repository: ${fromFile} -> ${specifier}`);
  return resolved;
}

function moduleGraph(entrypoint) {
  const pending = [entrypoint];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    const absolute = path.join(ROOT, current);
    assert.ok(fs.existsSync(absolute), `missing local module: ${current}`);
    const source = fs.readFileSync(absolute, "utf8");
    assert.doesNotMatch(source, /raw\.githubusercontent\.com/iu, `private remote import in ${current}`);
    assert.doesNotMatch(source, /data:text\/javascript/iu, `data URL module import in ${current}`);
    assert.doesNotMatch(source, /await\s+import\s*\(/u, `top-level dynamic import is prohibited in ${current}`);
    visited.add(current);
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      pending.push(normalizeModulePath(current, match[1]));
    }
  }
  return visited;
}

test("web-session source is a complete repository-local module graph", () => {
  const graph = moduleGraph(ENTRYPOINT);
  assert.ok(graph.size >= 8, `unexpectedly small web-session graph: ${graph.size}`);
});

test("staging candidate is main-bound and built from the tracked Git tree", () => {
  const workflow = read(CANDIDATE_WORKFLOW);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /git archive/u);
  assert.match(workflow, /"\$source_commit:backend"/u);
  assert.match(workflow, /trackedGitTreeOnly:\s*true/u);
  assert.match(workflow, /SOURCE_FUNCTION_NAME:\s*web-session-api/u);
  assert.match(workflow, /CANDIDATE_FUNCTION_NAME:\s*web-session-api/u);
  assert.match(workflow, /test "\$SOURCE_FUNCTION_NAME" = "\$CANDIDATE_FUNCTION_NAME"/u);
  assert.doesNotMatch(workflow, /web-session-api-repair-candidate/u);
  assert.match(workflow, /environment:\s*staging/u);
  assert.match(workflow, /--project-ref "\$EXPECTED_STAGING_PROJECT_REF"/u);
  assert.match(workflow, /\/health/u);
  assert.match(workflow, /Invalid input: `400 controlled`/u);
});

test("production deployment is manual, protected, reproducible and bounded", () => {
  const workflow = read(DEPLOY_WORKFLOW);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s*push:/mu);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /environment:\s*production/u);
  assert.match(workflow, /EXPECTED_PRODUCTION_PROJECT_REF:\s*cgiukdjwicykrmtkhudh/u);
  assert.match(workflow, /DENIED_STAGING_PROJECT_REF:\s*eecvbssdvarfcykcfrny/u);
  assert.match(workflow, /candidate_run_id:/u);
  assert.match(workflow, /candidate_digest:/u);
  assert.match(workflow, /git archive/u);
  assert.match(workflow, /cmp --silent/u);
  assert.match(workflow, /trackedGitTreeOnly:\s*true/u);
  assert.match(workflow, /sha256sum\s+--check/u);
  assert.match(workflow, /Verify deployed production source equals staging candidate/u);
  assert.match(workflow, /\/functions\/\$FUNCTION_NAME\/body/u);
  assert.match(workflow, /canonicalSourceDigest/u);
  assert.match(workflow, /Production deployed source equals staging/u);
  assert.match(workflow, /supabase functions deploy "\$FUNCTION_NAME"/u);
  assert.match(workflow, /--project-ref "\$EXPECTED_PRODUCTION_PROJECT_REF"/u);
  assert.match(workflow, /--no-verify-jwt/u);
  assert.match(workflow, /--use-api/u);
  assert.match(workflow, /\/health/u);
  assert.match(workflow, /api\/admin-session\/login/u);
  assert.match(workflow, /Unexpected Vercel proxy status/u);
  assert.match(workflow, /Real administrator login: `required before incident closure`/u);
});

test("production secret provisioning is main-bound and missing-only", () => {
  const workflow = read(SECRET_WORKFLOW);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s*push:/mu);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /environment:\s*production/u);
  assert.match(workflow, /ECONOVARIA_RATE_LIMIT_HMAC_SECRET/u);
  assert.match(workflow, /ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY/u);
  assert.match(workflow, /ECONOVARIA_WEB_ALLOWED_ORIGINS/u);
  assert.match(workflow, /ECONOVARIA_TRUSTED_CLIENT_IP_HEADER/u);
  assert.match(workflow, /TRUSTED_CLIENT_IP_HEADER:\s*cf-connecting-ip/u);
  assert.match(
    workflow,
    /test "\$TRUSTED_CLIENT_IP_HEADER" = "cf-connecting-ip"/u,
  );
  assert.doesNotMatch(workflow, /TRUSTED_CLIENT_IP_HEADER:\s*x-real-ip/u);
  assert.match(workflow, /if ! grep -q 'ECONOVARIA_RATE_LIMIT_HMAC_SECRET'/u);
  assert.match(workflow, /if ! grep -q 'ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY'/u);
  assert.doesNotMatch(workflow, /echo\s+"?\$rate_key/u);
  assert.doesNotMatch(workflow, /echo\s+"?\$session_key/u);
});

test("production web origins are exact across provisioning and repair", () => {
  const expected =
    "https://econovaria.vercel.app,https://econovaria-econovaria.vercel.app,https://econovaria-git-main-econovaria.vercel.app";
  for (const relativePath of [SECRET_WORKFLOW, TRUSTED_IP_REPAIR_WORKFLOW]) {
    const workflow = read(relativePath);
    assert.equal(
      workflow.includes(`PRODUCTION_ALLOWED_ORIGINS: ${expected}`),
      true,
    );
    assert.match(
      workflow,
      /ECONOVARIA_WEB_ALLOWED_ORIGINS=\$PRODUCTION_ALLOWED_ORIGINS/u,
    );
    assert.doesNotMatch(
      workflow,
      /ECONOVARIA_WEB_ALLOWED_ORIGINS=\*/u,
    );
  }

  const repair = read(TRUSTED_IP_REPAIR_WORKFLOW);
  assert.match(repair, /verify_origin_contract/u);
  assert.match(
    repair,
    /https:\/\/econovaria-git-preview-denied-econovaria\.vercel\.app/u,
  );
  assert.match(repair, /origin_not_allowed/u);
  assert.match(repair, /No production login attempt performed/u);
});

test("database reconciliation is main-bound, atomic, digest-bound and non-destructive", () => {
  const workflow = read(DATABASE_WORKFLOW);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s*push:/mu);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /environment:\s*production/u);
  assert.match(workflow, /SUPABASE_DB_URL/u);
  assert.match(workflow, /execFileSync\('git', \['hash-object'/u);
  assert.match(workflow, /web-session-reconciliation\.sql/u);
  assert.match(workflow, /'begin;'/u);
  assert.match(workflow, /'commit;'/u);
  assert.match(workflow, /supabase_migrations\.schema_migrations/u);
  assert.match(workflow, /on conflict \(version\) do nothing/u);
  assert.doesNotMatch(workflow, /on conflict \(version\) do update/u);
  assert.match(workflow, /Migration ledger conflict/u);
  assert.match(workflow, /ledgerRecordedOnce/u);
  assert.match(workflow, /psql\s+"\$SUPABASE_DB_URL"/u);
  assert.match(workflow, /Application-data SQL rejected/u);
  assert.match(workflow, /authenticatorDenied/u);
  assert.match(workflow, /relforcerowsecurity/u);

  const manifest = JSON.parse(read(DATABASE_AUTHORIZATION));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.targetProjectRef, "cgiukdjwicykrmtkhudh");
  assert.ok(manifest.deniedProjectRefs.includes("eecvbssdvarfcykcfrny"));
  assert.match(manifest.reconciliationVersion, /^\d{14}$/u);
  assert.match(manifest.reconciliationName, /^[a-z0-9_]{1,96}$/u);
  assert.equal(manifest.productionDataWritesAllowed, false);
  assert.equal(manifest.migrationLedgerWriteAllowed, true);
  assert.equal(manifest.destructiveChangesAllowed, false);
  assert.equal(manifest.orderedCanonicalMigrations.length, 6);
  for (const item of manifest.orderedCanonicalMigrations) {
    assert.match(item.path, /^backend\/supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/u);
    assert.match(item.gitBlobSha, /^[a-f0-9]{40}$/u);
    const actual = execFileSync("git", ["hash-object", item.path], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    assert.equal(actual, item.gitBlobSha, `migration digest mismatch: ${item.path}`);
  }
});

test("authorization manifest denies staging and limits production scope", () => {
  const manifest = JSON.parse(read(AUTHORIZATION));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.targetProjectRef, "cgiukdjwicykrmtkhudh");
  assert.ok(manifest.deniedProjectRefs.includes("eecvbssdvarfcykcfrny"));
  assert.equal(manifest.functionName, "web-session-api");
  assert.equal(manifest.stagingFunctionName, manifest.functionName);
  assert.equal(manifest.verifyJwt, false);
  assert.equal(manifest.customAuthenticationRequired, true);
  assert.equal(manifest.databaseChangesAllowed, true);
  assert.deepEqual(manifest.allowedDatabaseChanges, [
    "canonical web-session request-rate-limit contracts",
    "canonical authentication-throttle contracts",
  ]);
  assert.equal(manifest.otherFunctionsAllowed, false);
  assert.equal(manifest.productionDataWritesAllowed, false);
  assert.equal(manifest.secretValuesRecorded, false);
  assert.equal(manifest.productionDeployRequiresManualApproval, true);
});
