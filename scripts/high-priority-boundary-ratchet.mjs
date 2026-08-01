import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(`High-priority boundary ratchet failed: ${message}`);
}

const browserRoleAclMigrationPath =
  "backend/supabase/migrations/20260801084000_harden_browser_role_default_privileges_v1.sql";

const [
  backendPackageText,
  adminHtml,
  adminBootstrap,
  edgeResponse,
  adminCors,
  browserRoleAclMigration,
] = await Promise.all([
  text("backend/package.json"),
  text("admin/index.html"),
  text("admin/admin-bootstrap.js"),
  text("backend/src/platform/supabase/edgeResponse.ts"),
  text("backend/supabase/functions/admin-api/cors.ts"),
  text(browserRoleAclMigrationPath),
]);

const backendPackage = JSON.parse(backendPackageText);
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

for (const owner of ["postgres", "supabase_admin"]) {
  requireCondition(
    browserRoleAclMigration.includes(
      `alter default privileges for role ${owner} in schema public`,
    ),
    `browser-role ACL migration must correct ${owner} default privileges`,
  );
}
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

console.log(JSON.stringify({
  status: "pass",
  checks: 28,
  boundaries: [
    "backend-crafting-smoke",
    "world-runtime-retention",
    "admin-csp-bootstrap",
    "admin-realtime-csp",
    "player-api-cors",
    "admin-api-cors",
    "browser-role-existing-acls",
    "browser-role-default-acls",
    "service-role-runtime-authority",
  ],
}, null, 2));
