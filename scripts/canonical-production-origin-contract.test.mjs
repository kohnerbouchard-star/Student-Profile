import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_ORIGIN = "https://econovaria.com";
const LEGACY_ORIGIN = "https://econovaria.vercel.app";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const canonicalOnlyFiles = [
  "backend/src/platform/supabase/edgeResponse.ts",
  "backend/supabase/functions/admin-email-verification/index.ts",
  "backend/supabase/functions/admin-password-recovery/index.ts",
  "backend/supabase/auth-email-template-manifest.json",
  ".github/workflows/admin-password-recovery-release.yml",
  "docs/operations/release-requests/admin-password-recovery-release-v1.json",
  "scripts/password-recovery-frontend-contract.test.mjs",
  "scripts/admin-bff-request-auth.test.mjs",
];

test("active Auth and browser source uses the custom Econovaria origin", () => {
  for (const relativePath of canonicalOnlyFiles) {
    const source = read(relativePath);
    assert.ok(
      source.includes(CANONICAL_ORIGIN),
      `${relativePath} is missing the canonical origin`,
    );
    assert.equal(
      source.includes(LEGACY_ORIGIN),
      false,
      `${relativePath} still emits the legacy origin`,
    );
  }
});

test("Auth email environment routes target the custom domain", () => {
  const manifest = JSON.parse(
    read("backend/supabase/auth-email-template-manifest.json"),
  );
  assert.equal(
    manifest.environments.staging.appSignInUrl,
    `${CANONICAL_ORIGIN}/?mode=admin`,
  );
  assert.equal(
    manifest.environments.production.appSignInUrl,
    `${CANONICAL_ORIGIN}/?mode=admin`,
  );
  assert.equal(
    manifest.environments.production.recoveryReviewUrl,
    `${CANONICAL_ORIGIN}/auth/recovery-start.html`,
  );
});

test("production CORS provisioning prefers the custom domain and retains bounded migration aliases", () => {
  const workflow = read(".github/workflows/production-web-session-secrets.yml");
  const expected = [
    CANONICAL_ORIGIN,
    "https://www.econovaria.com",
    LEGACY_ORIGIN,
    "https://econovaria-econovaria.vercel.app",
    "https://econovaria-git-main-econovaria.vercel.app",
  ].join(",");
  assert.ok(workflow.includes(`PRODUCTION_ORIGIN: ${CANONICAL_ORIGIN}`));
  assert.ok(workflow.includes(`PRODUCTION_ALLOWED_ORIGINS: ${expected}`));
  assert.equal(workflow.includes("ECONOVARIA_WEB_ALLOWED_ORIGINS=*"), false);
});

test("the domain cutover keeps the legacy origin only as an explicit migration fallback", () => {
  const workflow = read(".github/workflows/econovaria-domain-cutover.yml");
  assert.ok(workflow.includes(`PRODUCTION_ORIGIN: ${CANONICAL_ORIGIN}`));
  assert.ok(workflow.includes(`LEGACY_PRODUCTION_ORIGIN: ${LEGACY_ORIGIN}`));
  assert.ok(workflow.includes("WWW_ORIGIN: https://www.econovaria.com"));
});
