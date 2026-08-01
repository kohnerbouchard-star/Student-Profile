import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(`High-priority boundary ratchet failed: ${message}`);
}

const [
  backendPackageText,
  adminHtml,
  adminBootstrap,
  edgeResponse,
  adminCors,
  supabaseConfig,
  adminAuthManifestText,
  verificationFunction,
  recoveryFunction,
  passwordResetFunction,
  passwordResetProxy,
  verificationEmailSender,
  authStagingWorkflow,
  authProductionWorkflow,
] = await Promise.all([
  text("backend/package.json"),
  text("admin/index.html"),
  text("admin/admin-bootstrap.js"),
  text("backend/src/platform/supabase/edgeResponse.ts"),
  text("backend/supabase/functions/admin-api/cors.ts"),
  text("backend/supabase/config.toml"),
  text("backend/supabase/admin-auth-edge-function-manifest.json"),
  text("backend/supabase/functions/admin-email-verification/index.ts"),
  text("backend/supabase/functions/admin-password-recovery/index.ts"),
  text("backend/supabase/functions/password-reset-api/index.ts"),
  text("api/password-reset.js"),
  text("backend/src/domains/auth/application/staffSignupVerificationEmail.ts"),
  text(".github/workflows/admin-auth-surface-staging-candidate.yml"),
  text(".github/workflows/admin-auth-surface-production-promote.yml"),
]);

const backendPackage = JSON.parse(backendPackageText);
const adminAuthManifest = JSON.parse(adminAuthManifestText);
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
  adminAuthManifest.schemaVersion === 1 &&
    adminAuthManifest.manifestId === "econovaria.admin-auth-surfaces.v1",
  "Admin auth function manifest identity must remain canonical",
);
const functionBySlug = new Map(
  adminAuthManifest.functions.map((entry) => [entry.slug, entry]),
);
for (const [slug, verifyJwt] of [
  ["admin-email-verification", false],
  ["admin-password-recovery", false],
  ["password-reset-api", true],
]) {
  const entry = functionBySlug.get(slug);
  requireCondition(Boolean(entry), `Admin auth function manifest must include ${slug}`);
  requireCondition(entry.verifyJwt === verifyJwt, `${slug} verify_jwt contract drifted`);
  requireCondition(
    Array.isArray(entry.requiredEnvironments) &&
      entry.requiredEnvironments.includes("staging") &&
      entry.requiredEnvironments.includes("production"),
    `${slug} must be required in staging and production`,
  );
  requireCondition(
    supabaseConfig.includes(`[functions.${slug}]`) &&
      supabaseConfig.includes(`[functions.${slug}]\nverify_jwt = ${verifyJwt}`),
    `${slug} Supabase configuration must match the manifest`,
  );
}
requireCondition(
  !supabaseConfig.includes("[functions.admin-logout-api]"),
  "retired admin-logout-api must not remain in the canonical Supabase config",
);
requireCondition(
  adminAuthManifest.retiredFunctions.some((entry) =>
    entry.slug === "admin-logout-api" && entry.replacement === "web-session-api/logout"
  ),
  "Admin auth manifest must record the logout replacement",
);
requireCondition(
  adminAuthManifest.verificationEmailDelivery?.runtimeFunction === "bootstrap-api" &&
    adminAuthManifest.verificationEmailDelivery?.trackingLinkRewritesAllowed === false,
  "Verification email delivery must remain bound to bootstrap-api without link rewriting",
);
for (const requiredName of [
  "RESEND_API_KEY",
  "ECONOVARIA_AUTH_EMAIL_FROM",
  "ECONOVARIA_EMAIL_VERIFICATION_URL",
]) {
  requireCondition(
    adminAuthManifest.verificationEmailDelivery.requiredEnvironmentNames.includes(requiredName),
    `Verification email delivery must require ${requiredName}`,
  );
}
requireCondition(
  verificationFunction.includes("double-submit challenge") ||
    verificationFunction.includes("CHALLENGE_COOKIE"),
  "Admin email verification must retain its double-submit challenge",
);
requireCondition(
  recoveryFunction.includes("CHALLENGE_COOKIE") &&
    recoveryFunction.includes("token_hash"),
  "Admin password recovery must retain token and challenge validation",
);
requireCondition(
  passwordResetFunction.includes("resolveStaffForRequest") &&
    passwordResetFunction.includes("revokeAllSessions") &&
    passwordResetFunction.includes("complete_staff_password_reset_security_v2"),
  "Password reset API must retain Staff resolution, session revocation, and security transition",
);
requireCondition(
  passwordResetProxy.includes("/functions/v1/password-reset-api"),
  "Vercel password-reset proxy must target the canonical function",
);
requireCondition(
  verificationEmailSender.includes("/functions/v1/admin-email-verification"),
  "Verification email delivery must target the canonical review surface",
);

for (const [workflowName, workflow, expectedEnvironment, expectedProjectRef] of [
  ["staging", authStagingWorkflow, "staging", "eecvbssdvarfcykcfrny"],
  ["production", authProductionWorkflow, "production", "cgiukdjwicykrmtkhudh"],
]) {
  requireCondition(
    workflow.includes(`environment: ${expectedEnvironment}`),
    `Admin auth ${workflowName} workflow must use its protected environment`,
  );
  requireCondition(
    workflow.includes(expectedProjectRef),
    `Admin auth ${workflowName} workflow must bind the exact project ref`,
  );
  requireCondition(
    workflow.includes("supabase functions deploy") &&
      workflow.includes("--workdir backend") &&
      workflow.includes("--no-verify-jwt"),
    `Admin auth ${workflowName} workflow must deploy mixed JWT settings from tracked source`,
  );
  requireCondition(
    workflow.includes("node scripts/high-priority-boundary-ratchet.mjs") &&
      workflow.includes("scripts/verified-staff-onboarding-contract.test.mjs") &&
      workflow.includes("scripts/password-recovery-frontend-contract.test.mjs"),
    `Admin auth ${workflowName} workflow must rerun onboarding and recovery contracts`,
  );
  for (const secretName of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "ECONOVARIA_WEB_ALLOWED_ORIGINS",
    "ECONOVARIA_EMAIL_VERIFICATION_RETURN_URL",
    "ECONOVARIA_PASSWORD_RECOVERY_RETURN_URL",
  ]) {
    requireCondition(
      workflow.includes(secretName),
      `Admin auth ${workflowName} workflow must verify ${secretName}`,
    );
  }
}
requireCondition(
  authStagingWorkflow.includes('test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"') &&
    authStagingWorkflow.includes("admin-auth-staging-candidate.json"),
  "Admin auth staging deployment must bind current main and emit digest evidence",
);
requireCondition(
  authProductionWorkflow.includes("candidate_run_id") &&
    authProductionWorkflow.includes("staging_inventory_digest") &&
    authProductionWorkflow.includes("actions/download-artifact@v5") &&
    authProductionWorkflow.includes("Production auth source differs from staging"),
  "Admin auth production deployment must consume exact staging evidence",
);

console.log(JSON.stringify({
  status: "pass",
  checks: 55,
  boundaries: [
    "backend-crafting-smoke",
    "world-runtime-retention",
    "admin-csp-bootstrap",
    "admin-realtime-csp",
    "player-api-cors",
    "admin-api-cors",
    "admin-auth-function-inventory",
    "admin-email-verification",
    "admin-password-recovery",
    "admin-password-reset",
    "admin-verification-email-delivery",
    "retired-admin-logout",
    "admin-auth-staging-project-binding",
    "admin-auth-production-project-binding",
    "admin-auth-staging-digest-promotion",
  ],
}, null, 2));
