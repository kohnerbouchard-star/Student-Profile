import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const [vercelConfigText, workflow, healthRoute, buildSource] = await Promise.all([
  readFile(new URL("vercel.json", repositoryRoot), "utf8"),
  readFile(
    new URL(".github/workflows/vercel-attested-production-promote.yml", repositoryRoot),
    "utf8",
  ),
  readFile(new URL("api/_runtime-health.js", repositoryRoot), "utf8"),
  readFile(new URL("scripts/build-vercel-runtime-config.mjs", repositoryRoot), "utf8"),
]);
const vercelConfig = JSON.parse(vercelConfigText);

test("Hobby deployment stays within the 12 Serverless Function budget", async () => {
  const entries = await readdir(new URL("api/", repositoryRoot), {
    recursive: true,
    withFileTypes: true,
  });
  const deployable = entries.filter((entry) =>
    entry.isFile() &&
    entry.name.endsWith(".js") &&
    !entry.name.startsWith("_")
  );
  assert.ok(
    deployable.length <= 12,
    `Expected at most 12 deployable Vercel functions, found ${deployable.length}.`,
  );
  assert.equal(deployable.some((entry) => entry.name === "health.js"), false);
});

test("automatic main deployment is either disabled or bounded to the canonical Admin V2 cutover", () => {
  const deploymentEnabled = vercelConfig.git?.deploymentEnabled;
  const automaticMain = deploymentEnabled && typeof deploymentEnabled === "object"
    ? deploymentEnabled.main
    : deploymentEnabled;
  assert.ok(
    automaticMain === undefined || automaticMain === false || automaticMain === true,
    "main deployment policy must be default-enabled, explicitly enabled, or explicitly disabled",
  );
  if (automaticMain !== false) {
    assert.match(buildSource, /canonicalizeAdminV2\(outputRoot\)/u);
    assert.match(buildSource, /path\.join\(outputRoot, "admin", "v2\.html"\)/u);
    assert.match(buildSource, /path\.join\(outputRoot, "admin", "index\.html"\)/u);
    assert.deepEqual(
      vercelConfig.rewrites.filter((entry) =>
        entry.source === "/admin" || entry.source === "/admin/"
      ),
      [
        { source: "/admin", destination: "/admin/v2.html" },
        { source: "/admin/", destination: "/admin/v2.html" },
      ],
    );
  }
  assert.match(workflow, /release_integrity_run_id/u);
  assert.match(workflow, /edge_inventory_run_id/u);
  assert.match(workflow, /release-integrity-live-\$\{\{ inputs\.source_commit \}\}/u);
  assert.match(workflow, /edge-function-inventory-\$\{\{ inputs\.source_commit \}\}/u);
  assert.match(workflow, /enforce-attestation/u);
  assert.match(workflow, /edge\.sourceCommit !== process\.env\.SOURCE_COMMIT/u);
  assert.match(workflow, /edge\.ok !== true/u);
});

test("Vercel promotion uses an unaliased staged production deployment", () => {
  assert.match(workflow, /vercel@\$VERCEL_CLI_VERSION/u);
  assert.match(workflow, /deploy[\s\S]*--prebuilt[\s\S]*--prod[\s\S]*--skip-domain/u);
  assert.match(workflow, /--env "ECONOVARIA_SOURCE_SHA=\$SOURCE_COMMIT"/u);
  assert.match(workflow, /curl[\s\S]*\/api\/health[\s\S]*--deployment/u);
  assert.match(workflow, /promote[\s\S]*--yes/u);
  assert.match(workflow, /environment: production/u);
  assert.doesNotMatch(workflow, /\bhttpstat\b/u);
  assert.doesNotMatch(workflow, /vercel\s+--prod(?![\s\S]*--skip-domain)/u);
});

test("CSP permits only the two explicitly bound Supabase projects", () => {
  const serialized = JSON.stringify(vercelConfig.headers);
  assert.doesNotMatch(serialized, /\*\.supabase\.co/u);
  for (const projectRef of [
    "cgiukdjwicykrmtkhudh",
    "eecvbssdvarfcykcfrny",
  ]) {
    assert.match(serialized, new RegExp(`${projectRef}\\.supabase\\.co`, "u"));
  }
});

test("same-origin runtime health is bounded and secret-free", () => {
  assert.match(healthRoute, /web-session-api/u);
  assert.match(healthRoute, /player-web-session-api/u);
  assert.match(healthRoute, /ECONOVARIA_PROJECT_REF/u);
  assert.match(healthRoute, /ECONOVARIA_SUPABASE_URL/u);
  assert.match(healthRoute, /ECONOVARIA_SOURCE_SHA/u);
  assert.match(healthRoute, /Cache-Control/u);
  assert.doesNotMatch(healthRoute, /SUPABASE_SECRET_KEY|service_role|authorization/iu);
});

test("promotion requires exact source identity before and after alias movement", () => {
  const healthChecks = workflow.match(/\/api\/health/gu) || [];
  const sourceChecks = workflow.match(/sourceCommit !== process\.env\.SOURCE_COMMIT/gu) || [];
  assert.ok(healthChecks.length >= 2);
  assert.ok(sourceChecks.length >= 2);
  assert.match(workflow, /Promoted production health is not ready/u);
  assert.match(workflow, /--environment production[\s\S]*--since 5m/u);
});
