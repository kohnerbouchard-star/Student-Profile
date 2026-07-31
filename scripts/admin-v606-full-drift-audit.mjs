import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = (path) => readFileSync(resolve(root, path));
const readText = (path) => read(path).toString("utf8");
function gitBlobSha(path) {
  const content = read(path);
  const header = Buffer.from(`blob ${content.length}\0`, "utf8");
  return createHash("sha1").update(header).update(content).digest("hex");
}

const acceptedV606Blobs = {
  "admin/dist/admin-overview-terminal.js": "9cab7ea6b3e1d6b07b7b7c1c8c55ce7109804f98",
  "admin/css/admin-overview-terminal.css": "7a609ccff33d61fee96d2ea944e0d1a6059a6081",
  "admin/css/page-shell.css": "c4df8ae6d2500192a213b4b49829fe4b34f37f8b",
  "admin/css/admin-overview-integrity.css": "887ae8ffaff27e9013093f6aae92529134b80c18",
};
for (const [path, expected] of Object.entries(acceptedV606Blobs)) {
  const actual = gitBlobSha(path);
  assert(actual === expected, `${path} drifted from accepted v606. Expected ${expected}; received ${actual}.`);
}

const html = readText("admin/index.html");
const scriptSources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const styleSources = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((match) => match[1]);
const expectedScripts = [
  "../runtime-config.env.js", "../frontend/src/core/runtime-config.js", "../frontend/src/core/admin-game-selection.js",
  "./auth-session-manager.js", "./session-gate.js", "./admin-auth.js",
  "./dist/admin-overview-terminal.js", "./asset-wiring.js", "./classroom-write-fallback.js",
  "./create-action-adapter.js", "./player-access-code-bridge.js", "./modal-accessibility.js",
  "./player-create-lifecycle.js", "./player-drawer-wiring.js", "./player-identity-wiring.js",
  "./player-create-ux.js", "./game-code-wiring.js", "./logout-confirmation.js", "./game-session-controls.js", "./admin-stabilization.js",
  "./interaction-quality.js", "./data-state-contracts.js", "./interaction-quality-control-reset.js",
  "./dist/admin-overview-boot.js", "./admin-bootstrap.js",
];
assert(JSON.stringify(scriptSources) === JSON.stringify(expectedScripts), `Admin script order drifted: ${JSON.stringify(scriptSources)}.`);
assert(!html.includes("shape-accurate-skeletons.js"), "Removed duplicate Admin skeleton runtime returned to the active bundle.");
assert(html.includes('meta name="econovaria-admin-api-base" content=""'), "Admin API metadata is not reserved for validated runtime configuration.");
assert(!/<style(?:\s|>)/i.test(html), "Admin entrypoint contains an inline style block.");

const expectedStyles = [
  "./css/page-shell.css", "./css/admin-overview-terminal.css", "./css/admin-overview-integrity.css",
  "./css/session-gate.css", "./css/session-skeleton.css", "./css/responsive-card-grid.css",
  "./css/player-runtime-integration.css", "./css/player-create-confirmation.css",
  "./css/admin-stabilization.css", "./css/admin-stabilization-visual-finish.css",
  "./css/overview-quick-actions.css", "./css/interaction-quality.css",
  "./css/data-state-contracts.css", "./css/keyboard-navigation.css",
  "./css/game-lifecycle-controls.css", "./css/game-session-controls.css", "./css/admin-scroll-integrity.css", "./css/logout-confirmation.css",
];
assert(JSON.stringify(styleSources) === JSON.stringify(expectedStyles), `Admin stylesheet order drifted: ${JSON.stringify(styleSources)}.`);
assert(!html.includes("shape-accurate-skeletons.css"), "Removed shape-skeleton styles returned to the active bundle.");
assert(!html.includes("loading-scope-overrides.css"), "Removed shape-loader scope styles returned to the active bundle.");
const adminBootstrap = readText("admin/admin-bootstrap.js");
assert(html.includes("./admin-bootstrap.js"), "External Admin bootstrap is not loaded through the accepted script order.");
assert(adminBootstrap.includes("./keyboard-navigation.js"), "Keyboard navigation is not loaded through the accepted script order.");
assert(adminBootstrap.includes("./overview-quick-actions.js"), "Overview quick actions are not loaded through the accepted stabilization slot.");

const scopedRuntimeFiles = {
  "admin/player-drawer-wiring.js": ["admin-terminal-player-real-data-v604", "data-admin-terminal-player-drawer", "data-admin-player-drawer-authoritative"],
  "admin/player-identity-wiring.js": ["player-settings-editor", "data-admin-player-profile-identity-editor", "data-admin-player-create-credential-field"],
  "admin/player-create-ux.js": ["data-admin-player-created-confirmation", "data-admin-terminal-player-form", "EconovariaAdminModalAccessibility", "dismissOnEscape: false", "dismissOnBackdrop: false"],
  "admin/modal-accessibility.js": ["focusableElements", 'event.key === "Tab"', 'event.key === "Escape"', "restoreFocus"],
  "admin/keyboard-navigation.js": ["[data-admin-section]", '[role="tab"]', "[data-admin-terminal-action]", "ArrowDown", "ArrowUp", "Home", "End", "data-admin-input-modality"],
  "admin/asset-wiring.js": ["ORIGINAL_CURRENCY_ICONS", "ORIGINAL_PLAYER_ACTION_ICONS", "ORIGINAL_MODAL_VIDEOS"],
  "admin/logout-confirmation.js": ["data-econovaria-admin-logout-confirmation", "event.stopImmediatePropagation()", "clearLocalStateAndRedirect", "EconovariaAdminGameSessionControls?.selectedGameContext?.()"],
  "admin/game-session-controls.js": ["econovaria.admin.selected-game.v1", "share-current-game", "data-econovaria-admin-logout", "/api/admin/auth/sign-out", "createFallbackShareSurface"],
  "admin/admin-stabilization.js": ["reconcileKnownButtons", "reconcileNumericFormatting", "admin-terminal-ui-icon", "admin-terminal-export-history-button-v601", "admin-terminal-logs-export-icon"],
  "admin/interaction-quality.js": ["setAriaCurrent", "aria-current", "focusPrimaryModalControl", "showStateConfirmModal", "createStateButton"],
  "admin/data-state-contracts.js": ["data-econovaria-state", "data-econovaria-error-code", "aria-live", "aria-busy", "classifyErrorCode"],
  "admin/create-action-adapter.js": ["data-econovaria-action-source", "data-econovaria-action", "data-admin-terminal-action"],
  "admin/player-access-code-bridge.js": ["data-admin-terminal-player-form", "data-admin-terminal-player-credentials", "data-admin-terminal-player-access-code"],
};
for (const [path, tokens] of Object.entries(scopedRuntimeFiles)) {
  const content = readText(path);
  for (const token of tokens) assert(content.includes(token), `${path} lost required token: ${token}`);
}

const adminOverview = readText("admin/dist/admin-overview-terminal.js");
assert(adminOverview.includes("data-admin-terminal-selected-game-code"), "Selected game code label is not source-owned by the accepted Admin shell.");
assert(adminOverview.includes("data-admin-terminal-selected-game-share"), "Selected game share control is not source-owned by the accepted Admin shell.");
assert(adminOverview.includes("data-admin-terminal-simulation-state"), "Simulation state is not source-owned by the accepted Admin shell.");
assert(adminOverview.includes("data-admin-terminal-realtime-state"), "Realtime state is not source-owned by the accepted Admin shell.");
assert(adminOverview.includes("data-admin-terminal-export-history"), "Export history is not source-owned by the accepted Admin shell.");
assert(adminOverview.includes("data-admin-terminal-notification-status"), "Notification status is not source-owned by the accepted Admin shell.");
assert(!adminOverview.includes('data-econovaria-action="admin-terminal-quick-attendance-scan"'), "Legacy quick attendance action returned to the active terminal bundle.");
assert(!adminOverview.includes('data-econovaria-action="admin-terminal-quick-add-player"'), "Legacy quick add-player action returned to the active terminal bundle.");

console.log("Admin v606 accepted-source, script-order, style-order, runtime-token, and retired-action drift audit passed.");
