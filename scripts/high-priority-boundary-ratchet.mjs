import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(`High-priority boundary ratchet failed: ${message}`);
}

const browserRoleAclMigrationPath =
  "backend/supabase/migrations/20260801084000_harden_browser_role_default_privileges_v1.sql";
const stockFunctionSlugs = Object.freeze([
  "stock-market-runner",
  "stock-market-read",
  "stock-market-seed-copy",
  "stock-market-player-read",
  "stock-market-trading",
]);

const [
  backendPackageText,
  adminHtml,
  adminBootstrap,
  edgeResponse,
  adminCors,
  browserRoleAclMigration,
  supabaseConfig,
  stockManifestText,
  stockStagingWorkflow,
  stockProductionWorkflow,
  ...stockFunctionSources
] = await Promise.all([
  text("backend/package.json"),
  text("admin/index.html"),
  text("admin/admin-bootstrap.js"),
  text("backend/src/platform/supabase/edgeResponse.ts"),
  text("backend/supabase/functions/admin-api/cors.ts"),
  text(browserRoleAclMigrationPath),
  text("backend/supabase/config.toml"),
  text("backend/supabase/stock-market-edge-function-manifest.json"),
  text(".github/workflows/stock-market-staging-candidate.yml"),
  text(".github/workflows/stock-market-production-promote.yml"),
  ...stockFunctionSlugs.map((slug) =>
    text(`backend/supabase/functions/${slug}/index.ts`)
  ),
]);

const backendPackage = JSON.parse(backendPackageText);
const stockManifest = JSON.parse(stockManifestText);
const backendSmoke = String(backendPackage.scripts?.["test:smoke"] || "");
const worldRuntime = String(backendPackage.scripts?.["test:world-runtime"] || "");

requireCondition(
  backendSmoke.includes("npm run test:player-crafting"),
  "backend smoke must execute the Player Crafting suite",
);
requireCondition(
  worldRuntime.includes("src/domains/campaign/tests/worldRuntimeMigration.test.ts"),
  "World runtime smoke must retain the migration contract test",
);
requireCondition(
  !/\son[a-z]+\s*=/i.test(adminHtml),
  "Admin HTML must not contain inline event-handler attributes",
);
requireCondition(
  /Content-Security-Policy/i.test(adminHtml) && /script-src 'self'/.test(adminHtml),
  "Admin HTML must enforce a self-only script CSP",
);
requireCondition(
  !/script-src[^;]*'unsafe-inline'/.test(adminHtml),
  "Admin script CSP must not permit unsafe-inline",
);
requireCondition(
  adminHtml.includes("wss://*.supabase.co"),
  "Admin CSP must preserve Supabase Realtime WebSockets",
);
requireCondition(
  /<script defer src="\.\/admin-bootstrap\.js"><\/script>/.test(adminHtml),
  "Admin HTML must load the deferred external bootstrap",
);
requireCondition(
  adminBootstrap.includes("bootstrapAdminCompatibilityModules") && adminBootstrap.includes("await import(modulePath)"),
  "Admin bootstrap must be deferred and load modules explicitly",
);
for (const modulePath of [
  "session-timeout-safe-exit.js",
  "modal-lifecycle-bridge.js",
  "keyboard-navigation.js",
  "scanner-auto-refresh.js",
  "settings-save-error-bridge.js",
  "marketplace-lifecycle-loader.js",
]) {
  requireCondition(
    adminBootstrap.includes(modulePath),
    `Admin bootstrap must retain ${modulePath}`,
  );
}
requireCondition(
  !edgeResponse.includes('"access-control-allow-origin": "*"'),
  "Player API responses must not expose wildcard CORS",
);
requireCondition(
  edgeResponse.includes("ECONOVARIA_BROWSER_ORIGIN"),
  "Player API CORS must be deployment-owned",
);
requireCondition(
  adminCors.includes("ECONOVARIA_ALLOWED_ORIGINS"),
  "Admin API CORS must support a deployment-owned allowlist",
);
requireCondition(
  adminCors.includes('url.pathname !== "/"') && adminCors.includes("url.username") && adminCors.includes("url.password"),
  "Admin API configured origins must reject path, credential, and insecure variants",
);
requireCondition(
  adminCors.includes('headers["Access-Control-Allow-Origin"] = origin'),
  "Admin API must return an origin only after allowlist validation",
);

requireCondition(
  browserRoleAclMigration.includes(
    "alter default privileges for role postgres in schema public",
  ),
  "browser-role ACL migration must correct the application migration owner's defaults",
);
requireCondition(
  !browserRoleAclMigration.includes(
    "alter default privileges for role supabase_admin in schema public",
  ),
  "browser-role ACL migration must not require unavailable supabase_admin membership",
);
for (const statement of [
  "revoke all privileges on all tables in schema public from anon, authenticated;",
  "revoke all privileges on all sequences in schema public from anon, authenticated;",
  "revoke execute on all functions in schema public from public, anon, authenticated;",
  "revoke create on schema public from public, anon, authenticated;",
  "grant all privileges on all tables in schema public to service_role;",
  "grant all privileges on all sequences in schema public to service_role;",
  "grant execute on all functions in schema public to service_role;",
]) {
  requireCondition(
    browserRoleAclMigration.includes(statement),
    `browser-role ACL migration must retain: ${statement}`,
  );
}
requireCondition(
  browserRoleAclMigration.includes("has_table_privilege") &&
    browserRoleAclMigration.includes("browser role retains direct privilege"),
  "browser-role ACL migration must fail closed on residual table privileges",
);
requireCondition(
  !/grant\s+(?:all(?:\s+privileges)?|select|insert|update|delete|truncate|references|trigger|maintain|execute)\b[\s\S]{0,160}\bto\s+(?:anon|authenticated)\b/iu
    .test(browserRoleAclMigration),
  "browser-role ACL migration must not re-grant data or RPC privileges",
);

requireCondition(
  stockManifest.schemaVersion === 1 &&
    stockManifest.manifestId === "econovaria.stock-market-runtime.v1",
  "Stock market function manifest identity must remain canonical",
);
requireCondition(
  stockManifest.directLegacySecretRequestsAllowed === false,
  "Stock market function manifest must forbid legacy raw-secret requests",
);
requireCondition(
  stockManifest.productionDeploymentRequiresStagingDigest === true,
  "Stock market production deployment must require a staging digest",
);
const stockManifestBySlug = new Map(
  stockManifest.functions.map((entry) => [entry.slug, entry]),
);
for (const [index, slug] of stockFunctionSlugs.entries()) {
  const manifestEntry = stockManifestBySlug.get(slug);
  const source = stockFunctionSources[index];
  requireCondition(Boolean(manifestEntry), `Stock market manifest must include ${slug}`);
  requireCondition(
    manifestEntry.verifyJwt === false,
    `${slug} must deploy with verify_jwt=false`,
  );
  requireCondition(
    manifestEntry.authorizationModel ===
      "publishable-key-plus-hmac-sha256-plus-nonce",
    `${slug} must use the signed internal-runner authorization model`,
  );
  requireCondition(
    manifestEntry.runnerName === slug,
    `${slug} runner identity must match its function slug`,
  );
  requireCondition(
    supabaseConfig.includes(`[functions.${slug}]\nverify_jwt = false`),
    `${slug} Supabase configuration must disable platform JWT verification`,
  );
  requireCondition(
    source.includes("requirePublishableRequest") &&
      source.includes("authorizeInternalRunnerRequest") &&
      source.includes(`runnerName: "${slug}"`) &&
      source.includes('internalSecretHeader: "x-stock-market-runner-secret"') &&
      source.includes('Deno.env.get("STOCK_MARKET_RUNNER_SECRET")') &&
      source.includes('"claim_internal_runner_nonce_v2"'),
    `${slug} must retain publishable-key, HMAC, timestamp, and nonce authorization`,
  );
  requireCondition(
    !/request\.headers\.get\("x-stock-market-runner-secret"\)/u.test(source),
    `${slug} entrypoint must not accept the raw legacy secret directly`,
  );
}

for (const [workflowName, workflow, expectedEnvironment, expectedProjectRef] of [
  ["staging", stockStagingWorkflow, "staging", "eecvbssdvarfcykcfrny"],
  ["production", stockProductionWorkflow, "production", "cgiukdjwicykrmtkhudh"],
]) {
  requireCondition(
    workflow.includes(`environment: ${expectedEnvironment}`),
    `Stock market ${workflowName} workflow must use its protected environment`,
  );
  requireCondition(
    workflow.includes(expectedProjectRef),
    `Stock market ${workflowName} workflow must bind the exact project ref`,
  );
  requireCondition(
    workflow.includes("--no-verify-jwt") &&
      workflow.includes("supabase functions deploy") &&
      workflow.includes("--workdir backend"),
    `Stock market ${workflowName} workflow must deploy tracked sources with custom auth`,
  );
  requireCondition(
    workflow.includes("STOCK_MARKET_RUNNER_SECRET") &&
      workflow.includes("supabase secrets list"),
    `Stock market ${workflowName} workflow must verify the secret name without reading its value`,
  );
  requireCondition(
    workflow.includes("node scripts/high-priority-boundary-ratchet.mjs") &&
      workflow.includes("scripts/internal-runner-auth-contract.test.mjs") &&
      workflow.includes("scripts/trigger-stock-market-tick.test.mjs"),
    `Stock market ${workflowName} workflow must rerun signed authorization contracts`,
  );
}
requireCondition(
  stockStagingWorkflow.includes('test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"') &&
    stockStagingWorkflow.includes("stock-market-staging-candidate.json"),
  "Stock market staging deployment must bind current main and emit digest evidence",
);
requireCondition(
  stockProductionWorkflow.includes("candidate_run_id") &&
    stockProductionWorkflow.includes("staging_inventory_digest") &&
    stockProductionWorkflow.includes("actions/download-artifact@v5") &&
    stockProductionWorkflow.includes("Production source differs from staging"),
  "Stock market production promotion must consume and verify exact staging evidence",
);

console.log(JSON.stringify({
  status: "pass",
  checks: 80,
  boundaries: [
    "backend-crafting-smoke",
    "world-runtime-retention",
    "admin-csp-bootstrap",
    "admin-realtime-csp",
    "player-api-cors",
    "admin-api-cors",
    "browser-role-existing-acls",
    "browser-role-postgres-default-acls",
    "service-role-runtime-authority",
    "stock-market-function-inventory",
    "stock-market-publishable-identity",
    "stock-market-hmac-authentication",
    "stock-market-nonce-replay-protection",
    "stock-market-verify-jwt-contract",
    "stock-market-staging-project-binding",
    "stock-market-production-project-binding",
    "stock-market-staging-digest-promotion",
  ],
}, null, 2));
