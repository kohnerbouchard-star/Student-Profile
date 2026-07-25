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
  "./shape-accurate-skeletons.js",
  "./admin-bootstrap.js",
];

assert(
  JSON.stringify(scripts) === JSON.stringify(expectedScripts),
  `Admin script order drifted. Expected ${expectedScripts.join(", ")}; received ${scripts.join(", ")}.`,
);
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
const fallback = readAdmin("classroom-write-fallback.js");
const createAdapter = readAdmin("create-action-adapter.js");
const credentialBridge = readAdmin("player-access-code-bridge.js");
const playerCreateUx = readAdmin("player-create-ux.js");
const gameCodeWiring = readAdmin("game-code-wiring.js");
const logoutConfirmation = readAdmin("logout-confirmation.js");
const gameSessionControls = readAdmin("game-session-controls.js");

assert(sessionManager.includes("grant_type=refresh_token"), "Admin refresh-token grant is missing.");
assert(sessionManager.includes("refreshPromise"), "Concurrent Admin refresh is not deduplicated.");
assert(auth.includes("completeInitialBootstrapRender(feature)"), "Authenticated Admin bootstrap completion is missing.");
assert(fallback.includes("econovaria:admin-request-lifecycle"), "Admin requests do not publish explicit lifecycle events.");
assert(fallback.includes("requestId") && fallback.includes('phase: "started"'), "Admin request correlation is incomplete.");
assert(createAdapter.includes('playerIdentifier: formValue(form, "playerIdentifier")'), "Create Player omits Player ID.");
assert(createAdapter.includes('accessCode: formValue(form, "accessCode")'), "Create Player omits Access Code.");
assert(credentialBridge.includes("econovaria:player-access-code-issued"), "One-time Player credential event is missing.");
assert(!credentialBridge.includes("window.fetch ="), "Credential bridge creates a second transport owner.");
assert(playerCreateUx.includes("data-admin-player-created-confirmation"), "Player creation confirmation is missing.");
assert(playerCreateUx.includes("dismissOnEscape: false"), "One-time credentials can be dismissed before acknowledgement.");

assert(gameCodeWiring.includes("Generate Code"), "Share Game Code does not expose generation for empty codes.");
assert(gameCodeWiring.includes('dataset.adminTerminalAction = "reset-game-code"'), "Game Code generation does not reuse the authenticated reset action.");
assert(!gameCodeWiring.includes("window.fetch ="), "Game Code wiring creates a second transport owner.");
assert(!gameCodeWiring.includes("MutationObserver"), "Game Code wiring adds an unbounded DOM observer.");

assert(logoutConfirmation.includes("data-econovaria-admin-logout-confirmation"), "Owned logout confirmation is missing.");
assert(logoutConfirmation.includes("event.stopImmediatePropagation()"), "Owned logout does not isolate legacy handlers.");
assert(logoutConfirmation.includes("clearLocalStateAndRedirect"), "Logout lacks a local-session fallback.");
assert(html.indexOf("./logout-confirmation.js") < html.indexOf("./game-session-controls.js"), "Logout confirmation must load before game-session controls.");
assert(gameSessionControls.includes('/api/admin/auth/sign-out'), "Dedicated Admin sign-out route is missing.");
assert(gameSessionControls.includes('url.searchParams.set("gameCode", gameCode)'), "Shared Player link omits the Game Code.");
assert(!gameSessionControls.includes("window.fetch ="), "Game-session controls replace the global transport.");

console.log("Admin shell single-owner identity, authenticated request, Player credential, Game Code, and logout contracts passed.");
