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
] = await Promise.all([
  text("backend/package.json"),
  text("admin/index.html"),
  text("admin/admin-bootstrap.js"),
  text("backend/src/platform/supabase/edgeResponse.ts"),
  text("backend/supabase/functions/admin-api/cors.ts"),
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

console.log(JSON.stringify({
  status: "pass",
  checks: 16,
  boundaries: [
    "backend-crafting-smoke",
    "world-runtime-retention",
    "admin-csp-bootstrap",
    "admin-realtime-csp",
    "player-api-cors",
    "admin-api-cors",
  ],
}, null, 2));
