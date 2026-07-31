import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const adminRoot = resolve(root, "admin");
const readAdmin = (path) => readFileSync(resolve(adminRoot, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const html = readAdmin("index.html");
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const expectedScripts = [
  "../runtime-config.env.js",
  "../frontend/src/core/runtime-config.js",
  "../frontend/src/core/admin-game-selection.js",
  "./auth-session-manager.js",
  "./session-gate.js",
  "./admin-auth.js",
  "./dist/admin-overview-terminal.js",
  "./asset-wiring.js",
  "./classroom-write-fallback.js",
  "./create-action-adapter.js",
  "./player-access-code-bridge.js",
  "./modal-accessibility.js",
  "./player-create-lifecycle.js",
  "./player-drawer-wiring.js",
  "./player-identity-wiring.js",
  "./player-create-ux.js",
  "./game-code-wiring.js",
  "./logout-confirmation.js",
  "./game-session-controls.js",
  "./admin-stabilization.js",
  "./interaction-quality.js",
  "./data-state-contracts.js",
  "./interaction-quality-control-reset.js",
  "./dist/admin-overview-boot.js",
  "./admin-bootstrap.js",
];

assert(
  JSON.stringify(scripts) === JSON.stringify(expectedScripts),
  `Admin script order drifted. Expected ${expectedScripts.join(", ")}; received ${scripts.join(", ")}.`,
);
assert(!html.includes("shape-accurate-skeletons.js"), "The removed duplicate Admin skeleton runtime is loaded.");
assert(!html.includes("game-code-modal-repair.js"), "A duplicate Game Code runtime controller is loaded.");
assert(
  html.includes('meta name="econovaria-admin-api-base" content=""'),
  "Admin API metadata must remain empty until runtime configuration validates it.",
);

for (const reference of scripts) {
  if (reference === "../runtime-config.env.js") continue;
  const path = resolve(adminRoot, reference);
  assert(existsSync(path), `Missing Admin script ${reference}.`);
  const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(syntax.status === 0, `JavaScript syntax check failed for ${reference}:\n${syntax.stderr || syntax.stdout}`);
}

const sessionManager = readAdmin("auth-session-manager.js");
const auth = readAdmin("admin-auth.js");
const boot = readAdmin("dist/admin-overview-boot.js");
const fallback = readAdmin("classroom-write-fallback.js");
const createAdapter = readAdmin("create-action-adapter.js");
const credentialBridge = readAdmin("player-access-code-bridge.js");
const playerCreateUx = readAdmin("player-create-ux.js");
const gameCodeWiring = readAdmin("game-code-wiring.js");
const logoutConfirmation = readAdmin("logout-confirmation.js");
const gameSessionControls = readAdmin("game-session-controls.js");

assert(sessionManager.includes("/status"), "Admin BFF status route is missing.");
assert(sessionManager.includes("/session/bootstrap"), "Admin granular authorization bootstrap is missing.");
assert(sessionManager.includes("ADMIN_PERMISSION_SET"), "Admin permission allowlist is missing.");
assert(sessionManager.includes("requestAuthorizationSummary"), "Admin authorization summary request is missing.");
assert(sessionManager.includes("statusPromise"), "Concurrent Admin status checks are not deduplicated.");
assert(sessionManager.includes('credentials: "include"'), "Admin BFF cookies are not included.");
assert(!sessionManager.includes("grant_type=refresh_token"), "Browser still refreshes Staff credentials directly.");
assert(!sessionManager.includes("accessToken"), "Browser session manager still stores a Staff access token.");
assert(!sessionManager.includes("refreshToken"), "Browser session manager still stores a Staff refresh token.");
assert(!/headers\s*:\s*\{[^}]*Authorization\s*:/s.test(sessionManager), "Browser session manager still sends Staff bearer authorization.");
assert(!/headers\.(?:set|append)\(\s*["']Authorization["']/i.test(sessionManager), "Browser session manager constructs a Staff bearer header.");
assert(!sessionManager.includes('permissions: ["*"]'), "Browser session manager restores wildcard authorization.");

assert(boot.includes("session?.authenticated"), "Admin boot does not use the safe authenticated session state.");
assert(boot.includes("session.permissions"), "Admin boot does not consume granular Staff permissions.");
assert(boot.includes("econovaria:admin-session-refreshed"), "Admin boot does not install authorization after session refresh.");
assert(boot.includes("installLegacySessionPermissionBoundary"), "Admin boot does not constrain legacy session assignments.");
assert(boot.includes("installLegacyStaffStateBoundary"), "Admin boot does not constrain legacy window state assignments.");
assert(boot.includes("sanitizeLegacySession"), "Admin boot does not sanitize legacy authorization state.");
assert(boot.includes("authorizedStaffSession"), "Admin boot does not propagate authenticated grants into nested legacy Staff state.");
assert(boot.includes("modelStaffSessionSource"), "Admin boot does not resolve the terminal's nested Staff authorization source.");
assert(boot.includes("staffSession: authorizedStaffSession("), "Admin terminal model can lose its nested granular Staff grants.");
assert(!boot.includes("session?.accessToken"), "Admin boot still requires a browser-readable Staff token.");
assert(!boot.includes('["*"]'), "Admin boot still restores wildcard authorization.");

assert(auth.includes("ADMIN_BFF_BASE"), "Admin transport does not target the BFF.");
assert(auth.includes("x-econovaria-csrf-token"), "Admin mutations do not carry the BFF CSRF token.");
assert(auth.includes('credentials: "include"'), "Admin requests omit the HttpOnly session cookie.");
assert(!auth.includes("Bearer"), "Admin shell still constructs a bearer credential.");
assert(auth.includes("completeInitialBootstrapRender(feature)"), "Authenticated Admin bootstrap completion is missing.");

assert(fallback.includes("econovaria:admin-request-lifecycle"), "Admin requests do not publish explicit lifecycle events.");
assert(fallback.includes("requestId") && fallback.includes('phase: "started"'), "Admin request correlation is incomplete.");
assert(fallback.includes("legacyClassroomFallbackRetired: true"), "Legacy classroom browser fallback retirement is not declared.");
assert(!fallback.includes("CLASSROOM_API_BASE"), "Admin browser still owns classroom-api authority.");
assert(!fallback.includes("classroom-api"), "Admin browser still references classroom-api.");
assert(!fallback.includes("accessToken"), "Admin browser write adapter still reads a Staff token.");
assert(!/headers\s*:\s*\{[^}]*Authorization\s*:/s.test(fallback), "Admin write adapter constructs bearer authorization.");
assert(!/headers\.(?:set|append)\(\s*["']Authorization["']/i.test(fallback), "Admin write adapter mutates bearer authorization.");
assert(!fallback.includes("retryStatuses"), "Admin write adapter still retries through a legacy boundary.");

assert(createAdapter.includes('playerIdentifier: formValue(form, "playerIdentifier")'), "Create Player omits Player ID.");
assert(createAdapter.includes('accessCode: formValue(form, "accessCode")'), "Create Player omits Access Code.");
assert(credentialBridge.includes("econovaria:player-access-code-issued"), "One-time Player credential event is missing.");
assert(credentialBridge.includes("const delegatedFetch = window.fetch.bind(window)"), "Credential bridge does not retain the prior transport owner.");
assert(credentialBridge.includes("function createContext(request, url)"), "Credential bridge has no bounded route predicate.");
assert(credentialBridge.includes('/^\\/api\\/admin\\/games\\/([^/]+)\\/players$/'), "Credential bridge is not bounded to the create-Player route.");
assert(credentialBridge.includes("if (!context) return delegatedFetch(request)"), "Credential bridge does not delegate nonmatching requests unchanged.");
assert(!credentialBridge.includes("Authorization"), "Player credential bridge bypasses the Admin BFF.");
assert(!credentialBridge.includes("STAFF_API_BASE"), "Player credential bridge still targets Staff API directly.");
assert(playerCreateUx.includes("data-admin-player-created-confirmation"), "Player creation confirmation is missing.");
assert(playerCreateUx.includes("dismissOnEscape: false"), "One-time credentials can be dismissed before acknowledgement.");

assert(gameCodeWiring.includes('const RESET_ACTION = "reset-game-code"'), "Game Code reset action constant is missing.");
assert(gameCodeWiring.includes("resetButton.dataset.adminTerminalAction = RESET_ACTION"), "Game Code rotation does not reuse the authenticated reset action.");
assert(gameCodeWiring.includes("readPersistedGameCode"), "Game Code wiring does not retrieve the persisted code.");
assert(gameCodeWiring.includes('method: "GET"'), "Game Code wiring does not use the authenticated read route.");
assert(gameCodeWiring.includes("Rotate Code"), "Share Game Code does not expose explicit rotation.");
assert(!gameCodeWiring.includes("GAME_CODE_CACHE_PREFIX"), "Game Code wiring still treats browser storage as the code authority.");
assert(!gameCodeWiring.includes("window.fetch ="), "Game Code wiring creates a second transport owner.");
assert(!gameCodeWiring.includes("MutationObserver"), "Game Code wiring adds an unbounded DOM observer.");

assert(logoutConfirmation.includes("data-econovaria-admin-logout-confirmation"), "Owned logout confirmation is missing.");
assert(logoutConfirmation.includes("event.stopImmediatePropagation()"), "Owned logout does not isolate legacy handlers.");
assert(logoutConfirmation.includes("clearLocalStateAndRedirect"), "Logout lacks a local-session fallback.");
assert(html.indexOf("./logout-confirmation.js") < html.indexOf("./game-session-controls.js"), "Logout confirmation must load before game-session controls.");
assert(gameSessionControls.includes('/api/admin/auth/sign-out'), "Dedicated Admin sign-out route is missing.");
assert(gameSessionControls.includes('url.searchParams.set("gameCode", gameCode)'), "Shared Player link omits the Game Code.");
assert(!gameSessionControls.includes("window.fetch ="), "Game-session controls replace the global transport.");

console.log("Admin shell HttpOnly BFF identity, granular authorization, retired classroom fallback, authenticated request, persisted Game Code, bounded Player credential, and logout contracts passed.");
