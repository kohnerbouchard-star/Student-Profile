import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const adminRoot = resolve(root, "admin");
const html = readFileSync(resolve(adminRoot, "index.html"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const expectedScripts = [
  "./session-gate.js",
  "./admin-auth.js",
  "./dist/admin-overview-terminal.js",
  "./asset-wiring.js",
  "./classroom-write-fallback.js",
  "./create-action-adapter.js",
  "./player-identity-transport.js",
  "./player-access-code-bridge.js",
  "./player-create-lifecycle.js",
  "./player-identity-wiring.js",
  "./game-code-wiring.js",
  "./dist/admin-overview-boot.js",
];

assert(
  JSON.stringify(scripts) === JSON.stringify(expectedScripts),
  `Admin script order drifted. Expected ${expectedScripts.join(", ")}; received ${scripts.join(", ")}.`,
);

for (const reference of scripts) {
  const path = resolve(adminRoot, reference.replace(/^\.\//, ""));
  assert(existsSync(path), `Missing admin script ${reference}.`);
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(result.status === 0, `JavaScript syntax check failed for ${reference}:\n${result.stderr || result.stdout}`);
}

const auth = readFileSync(resolve(adminRoot, "admin-auth.js"), "utf8");
const boot = readFileSync(resolve(adminRoot, "dist/admin-overview-boot.js"), "utf8");
const assetWiring = readFileSync(resolve(adminRoot, "asset-wiring.js"), "utf8");
const fallback = readFileSync(resolve(adminRoot, "classroom-write-fallback.js"), "utf8");
const createAdapter = readFileSync(resolve(adminRoot, "create-action-adapter.js"), "utf8");
const identityTransport = readFileSync(resolve(adminRoot, "player-identity-transport.js"), "utf8");
const credentialBridge = readFileSync(resolve(adminRoot, "player-access-code-bridge.js"), "utf8");
const createLifecycle = readFileSync(resolve(adminRoot, "player-create-lifecycle.js"), "utf8");
const identityWiring = readFileSync(resolve(adminRoot, "player-identity-wiring.js"), "utf8");
const terminal = readFileSync(resolve(adminRoot, "dist/admin-overview-terminal.js"), "utf8");

assert(auth.includes("completeInitialBootstrapRender(feature)"), "Admin bootstrap completion is missing.");
assert(boot.includes("function installAuthenticatedAdminModelBridge()"), "Authenticated model bridge is missing.");
assert(boot.includes('Object.defineProperty(feature, "currentModel"'), "Authorization metadata is not preserved across model replacement.");
assert(assetWiring.includes("player-identity-motion.svg"), "Local player identity illustration is not wired.");
assert(assetWiring.includes("media-placeholder.svg"), "Local media fallback is not wired.");
assert(createAdapter.includes('playerIdentifier: formValue(form, "playerIdentifier")'), "Create adapter omits Player ID.");
assert(createAdapter.includes('accessCode: formValue(form, "accessCode")'), "Create adapter omits Access Code.");
assert(fallback.includes('"playerIdentifier"') && fallback.includes('"accessCode"'), "Fallback omits identity credentials.");
assert(identityTransport.includes("XMLHttpRequest"), "Direct credential transport does not bypass consumed fetch streams.");
assert(identityTransport.includes("/access-code/reset"), "Direct credential transport is not scoped to the identity route.");
assert(credentialBridge.includes("updatePlayerIdentity"), "Existing-player identity write bridge is missing.");
assert(credentialBridge.includes("data-admin-player-identifier-value"), "Credential dialog omits Player ID.");
assert(createLifecycle.includes("econovaria:player-access-code-issued"), "Create lifecycle does not observe successful credential saves.");
assert(createLifecycle.includes("data-admin-terminal-player-form"), "Create lifecycle is not bounded to the Add Player modal.");
assert(identityWiring.includes('name="playerIdentifier"'), "Admin create form has no Player ID field.");
assert(identityWiring.includes('name="accessCode"'), "Admin create form has no Access Code field.");
assert(identityWiring.includes("RFID/card Player ID"), "Admin UI does not explain the RFID identity contract.");
assert(identityWiring.includes("loadPlayers"), "RFID manager does not load the roster from the authenticated backend.");
assert(!identityWiring.includes("Internal record ID"), "Admin UI exposes an internal identifier label.");
assert(terminal.includes('document.addEventListener("click", handleTerminalOverviewClick)'), "Delegated admin click handler is missing.");
assert(terminal.includes("function applyAdminTerminalPermissionGating(root = document)"), "Admin permission gating is missing.");

for (const asset of [
  "assets/icons/rfid-card.svg",
  "assets/icons/media-placeholder.svg",
  "assets/media/player-identity-motion.svg",
  "window.ECONOVARIA_ADMIN_MOTION_BACKGROUND",
]) {
  const path = resolve(adminRoot, asset);
  assert(existsSync(path), `Missing repository-owned admin asset ${asset}.`);
}

console.log("Identity-aware admin shell contract passed.");
