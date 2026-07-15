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
  "./player-access-code-bridge.js",
  "./player-create-lifecycle.js",
  "./player-drawer-wiring.js",
  "./player-identity-wiring.js",
  "./player-create-ux.js",
  "./game-code-wiring.js",
  "./admin-stabilization.js",
  "./interaction-quality.js",
  "./interaction-quality-control-reset.js",
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
const credentialBridge = readFileSync(resolve(adminRoot, "player-access-code-bridge.js"), "utf8");
const createLifecycle = readFileSync(resolve(adminRoot, "player-create-lifecycle.js"), "utf8");
const drawerWiring = readFileSync(resolve(adminRoot, "player-drawer-wiring.js"), "utf8");
const identityWiring = readFileSync(resolve(adminRoot, "player-identity-wiring.js"), "utf8");
const playerCreateUx = readFileSync(resolve(adminRoot, "player-create-ux.js"), "utf8");
const stabilization = readFileSync(resolve(adminRoot, "admin-stabilization.js"), "utf8");
const interactionQuality = readFileSync(resolve(adminRoot, "interaction-quality.js"), "utf8");
const interactionControlReset = readFileSync(resolve(adminRoot, "interaction-quality-control-reset.js"), "utf8");
const stabilizationCss = readFileSync(resolve(adminRoot, "css/admin-stabilization.css"), "utf8");
const interactionQualityCss = readFileSync(resolve(adminRoot, "css/interaction-quality.css"), "utf8");
const terminal = readFileSync(resolve(adminRoot, "dist/admin-overview-terminal.js"), "utf8");

assert(auth.includes("completeInitialBootstrapRender(feature)"), "Admin bootstrap completion is missing.");
assert(boot.includes("function installAuthenticatedAdminModelBridge()"), "Authenticated model bridge is missing.");
assert(boot.includes('Object.defineProperty(feature, "currentModel"'), "Authorization metadata is not preserved across model replacement.");
assert(assetWiring.includes("ORIGINAL_MODAL_VIDEOS"), "Original admin modal video map is not wired.");
assert(!assetWiring.includes("replaceBrokenMotionMedia"), "Modal videos are still replaced with the generic identity illustration.");
assert(assetWiring.includes("media-placeholder.svg"), "Local media fallback is not wired.");
assert(createAdapter.includes('playerIdentifier: formValue(form, "playerIdentifier")'), "Create adapter omits Player ID.");
assert(createAdapter.includes('accessCode: formValue(form, "accessCode")'), "Create adapter omits Access Code.");
assert(fallback.includes('"playerIdentifier"') && fallback.includes('"accessCode"'), "Fallback omits identity credentials.");
assert(!html.includes("player-identity-transport.js"), "Header-stripping identity transport is still loaded.");
assert(!html.includes("player-identity-roster-transport.js"), "Unsafe roster DOM replacement transport is still loaded.");
assert(credentialBridge.includes("updatePlayerIdentity"), "Existing-player identity write bridge is missing.");
assert(credentialBridge.includes("`${LOCAL_API_PREFIX}/games/"), "Existing-player identity updates do not use the authenticated local admin route.");
assert(credentialBridge.includes("showCredentialDialog"), "Edit Player Profile cannot suppress the create-only credential dialog.");
assert(createLifecycle.includes("econovaria:player-access-code-issued"), "Create lifecycle does not observe successful credential saves.");
assert(createLifecycle.includes("data-admin-terminal-player-form"), "Create lifecycle is not bounded to the Add Player modal.");
assert(createLifecycle.includes("guardDelegatedCreateAction"), "Delegated create actions do not enforce form validation.");
assert(!createLifecycle.includes("markExpandedPlayerDetail"), "Create lifecycle still mutates the player drawer.");
assert(!createLifecycle.includes("mountExpandedPlayerSettings"), "Create lifecycle still mounts removed inline settings.");

assert(drawerWiring.includes("admin-terminal-player-drawer-tabs-v301"), "Original v606 player drawer shell is not restored.");
assert(drawerWiring.includes("data-admin-terminal-player-drawer"), "Player drawer is missing the original delegated-event boundary.");
assert(drawerWiring.includes("select-player-drawer-tab"), "Player drawer tabs are not wired to the original delegated action.");
for (const label of ["Overview", "Bank Accounts", "Assets", "Liabilities", "Inventory", "Logs"]) {
  assert(drawerWiring.includes(`"${label}"`), `Player drawer is missing the ${label} tab.`);
}
assert(drawerWiring.includes("data-admin-player-drawer-authoritative"), "Restored player drawer is not marked as authoritative-data only.");
assert(!drawerWiring.includes("Math.random"), "Player drawer generates synthetic data.");
assert(!drawerWiring.includes("window.fetch ="), "Player drawer adds another fetch wrapper.");

assert(identityWiring.includes('name="playerIdentifier"'), "Admin create form has no Player ID field.");
assert(identityWiring.includes('name="accessCode"'), "Admin create form has no Access Code field.");
assert(identityWiring.includes("player-settings-editor"), "Edit Player Profile is not the identity editing surface.");
assert(identityWiring.includes("data-admin-player-profile-identity-editor"), "Edit Player Profile is not marked as identity-aware.");
assert(identityWiring.includes("confirm-player-settings-save"), "Edit Player Profile save action is not wired.");
assert(identityWiring.includes("Player ID / RFID card"), "Edit Player Profile does not expose the configurable RFID value.");
assert(identityWiring.includes("Leave blank to keep the current Access Code"), "Edit Player Profile does not preserve an unchanged Access Code.");
assert(identityWiring.includes("showCredentialDialog: false"), "Edit Player Profile still opens a second credential popup.");
assert(!identityWiring.includes("data-admin-player-identity-settings-form"), "Removed inline player identity form is still present.");
assert(!identityWiring.includes('setAttribute("data-admin-player-identity-manager"'), "Standalone Player IDs action is still created.");
assert(!identityWiring.includes("openIdentityManager"), "Standalone identity manager workflow returned.");
assert(!identityWiring.includes("window.fetch ="), "Player settings wiring adds another fetch wrapper.");
assert(!identityWiring.includes("Internal record ID"), "Admin UI exposes an internal identifier label.");

assert(playerCreateUx.includes("generatePlayerIdentifier"), "Automatic Player ID generation is missing.");
assert(playerCreateUx.includes("generateAccessCode"), "Automatic Access Code generation is missing.");
assert(playerCreateUx.includes('removeAttribute("required")'), "Blank credential fields are still blocked by required validation.");
assert(playerCreateUx.includes("Leave blank to auto-generate"), "Add Player does not explain automatic credential generation.");
assert(playerCreateUx.includes("data-admin-player-created-confirmation"), "Player creation confirmation modal is missing.");
assert(playerCreateUx.includes("admin-terminal-modal-backdrop"), "Player confirmation does not use the v606 modal system.");
assert(playerCreateUx.includes("[data-admin-player-access-code-dialog]"), "Legacy credential overlay is not suppressed.");
assert(!playerCreateUx.includes("window.fetch ="), "Player create UX adds another fetch wrapper.");

assert(stabilization.includes("reconcileKnownButtons"), "Admin glyph reconciliation is missing.");
assert(stabilization.includes("reconcileNumericFormatting"), "Admin numeric-format reconciliation is missing.");
assert(stabilization.includes("admin-terminal-ui-icon"), "Admin stabilization does not use inline SVG icons.");
assert(stabilizationCss.includes(".admin-terminal-modal.is-contract-modal"), "Contract modal stabilization rules are missing.");
assert(stabilizationCss.includes("box-sizing: border-box"), "Admin box-model stabilization is missing.");
assert(html.includes("./css/admin-stabilization.css"), "Admin stabilization stylesheet is not loaded.");

assert(interactionQuality.includes("validateForm"), "Admin field validation is missing.");
assert(interactionQuality.includes("setScannerProcessing"), "Scanner processing state is missing.");
assert(interactionQuality.includes("setScannerCompleted"), "Scanner completed state is missing.");
assert(interactionQuality.includes("setScannerError"), "Scanner error state is missing.");
assert(interactionQuality.includes("admin-qol-page-skeleton"), "Page skeleton runtime is missing.");
assert(interactionQuality.includes("window.fetch = async function econovariaAdminQualityFetch"), "Admin request-state observer is missing.");
assert(interactionControlReset.includes("restoreCompletedControl"), "Completed actions do not restore their controls.");
assert(interactionControlReset.includes('removeAttribute("aria-disabled")'), "Completed controls do not clear stale disabled semantics.");
assert(interactionControlReset.includes("setScannerReady"), "Scanner does not restore its Ready state.");
assert(interactionControlReset.includes("Scan a player code. The result appears here."), "Scanner idle guidance drifted.");
assert(interactionQualityCss.includes(".admin-qol-field-error"), "Field error styling is missing.");
assert(interactionQualityCss.includes('[data-admin-qol-state="loading"]'), "Button processing styling is missing.");
assert(interactionQualityCss.includes(".admin-session-skeleton"), "Verification skeleton styling is missing.");
assert(html.includes("admin-session-skeleton"), "Verification gate does not render a skeleton.");
assert(!html.includes("Opening administrator console"), "Legacy verification copy is still visible.");
assert(html.includes("./css/interaction-quality.css"), "Interaction quality stylesheet is not loaded.");

assert(terminal.includes('document.addEventListener("click", handleTerminalOverviewClick)'), "Delegated admin click handler is missing.");
assert(terminal.includes("function applyAdminTerminalPermissionGating(root = document)"), "Admin permission gating is missing.");
assert(terminal.includes('actionName === "select-player-drawer-tab"'), "Original player drawer tab action was removed from the v606 bundle.");

for (const asset of [
  "assets/icons/rfid-card.svg",
  "assets/icons/media-placeholder.svg",
  "assets/videos/id-background.mp4",
  "assets/videos/player-background.mp4",
  "assets/videos/scanner-background.mp4",
  "assets/videos/contract-background.mp4",
  "assets/videos/store-background.mp4",
  "window.ECONOVARIA_ADMIN_MOTION_BACKGROUND",
]) {
  const path = resolve(adminRoot, asset);
  assert(existsSync(path), `Missing repository-owned admin asset ${asset}.`);
}

console.log("Original v606 shell, admin wiring, validation, request states, skeleton loading, scanner lifecycle, and completed-control restoration passed.");