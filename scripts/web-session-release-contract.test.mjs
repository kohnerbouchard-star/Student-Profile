import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRYPOINT = "backend/supabase/functions/web-session-api/index.ts";
const DEPLOY_WORKFLOW = ".github/workflows/production-web-session-deploy.yml";
const SECRET_WORKFLOW = ".github/workflows/production-web-session-secrets.yml";
const AUTHORIZATION = "docs/operations/evidence/production-web-session-recovery-v1.json";
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

test("production deployment is manual, protected, immutable and bounded", () => {
  const workflow = read(DEPLOY_WORKFLOW);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s*push:/mu);
  assert.match(workflow, /environment:\s*production/u);
  assert.match(workflow, /EXPECTED_PRODUCTION_PROJECT_REF:\s*cgiukdjwicykrmtkhudh/u);
  assert.match(workflow, /DENIED_STAGING_PROJECT_REF:\s*eecvbssdvarfcykcfrny/u);
  assert.match(workflow, /sha256sum\s+--check/u);
  assert.match(workflow, /supabase functions deploy "\$FUNCTION_NAME"/u);
  assert.match(workflow, /--project-ref "\$EXPECTED_PRODUCTION_PROJECT_REF"/u);
  assert.match(workflow, /--no-verify-jwt/u);
  assert.match(workflow, /--use-api/u);
  assert.match(workflow, /\/health/u);
  assert.match(workflow, /api\/admin-session\/login/u);
  assert.match(workflow, /Unexpected Vercel proxy status/u);
});

test("production secret provisioning is manual and missing-only", () => {
  const workflow = read(SECRET_WORKFLOW);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s*push:/mu);
  assert.match(workflow, /environment:\s*production/u);
  assert.match(workflow, /ECONOVARIA_RATE_LIMIT_HMAC_SECRET/u);
  assert.match(workflow, /ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY/u);
  assert.match(workflow, /ECONOVARIA_WEB_ALLOWED_ORIGINS/u);
  assert.match(workflow, /ECONOVARIA_TRUSTED_CLIENT_IP_HEADER/u);
  assert.match(workflow, /if ! grep -q 'ECONOVARIA_RATE_LIMIT_HMAC_SECRET'/u);
  assert.match(workflow, /if ! grep -q 'ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY'/u);
  assert.doesNotMatch(workflow, /echo\s+"?\$rate_key/u);
  assert.doesNotMatch(workflow, /echo\s+"?\$session_key/u);
});

test("authorization manifest denies staging and limits production scope", () => {
  const manifest = JSON.parse(read(AUTHORIZATION));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.targetProjectRef, "cgiukdjwicykrmtkhudh");
  assert.ok(manifest.deniedProjectRefs.includes("eecvbssdvarfcykcfrny"));
  assert.equal(manifest.functionName, "web-session-api");
  assert.equal(manifest.verifyJwt, false);
  assert.equal(manifest.databaseChangesAllowed, true);
  assert.deepEqual(manifest.allowedDatabaseChanges, [
    "canonical web-session request-rate-limit contracts",
    "canonical authentication-throttle contracts",
  ]);
  assert.equal(manifest.otherFunctionsAllowed, false);
  assert.equal(manifest.secretValuesRecorded, false);
  assert.equal(manifest.productionDeployRequiresManualApproval, true);
});
