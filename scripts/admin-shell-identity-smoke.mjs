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
const runtimeBootstrapScripts = [
  "../runtime-config.env.js",
  "../frontend/src/core/runtime-config.js",
];
const expectedAdminScripts = [
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
  "./game-session-controls.js",
  "./admin-stabilization.js",
  "./interaction-quality.js",
  "./data-state-contracts.js",
  "./interaction-quality-control-reset.js",
  "./dist/admin-overview-boot.js",
  "./shape-accurate-skeletons.js",
  "./admin-bootstrap.js",
];
const expectedScripts = [...runtimeBootstrapScripts, ...expectedAdminScripts];

assert(
  JSON.stringify(scripts) === JSON.stringify(expectedScripts),
  `Admin script order drifted. Expected ${expectedScripts.join(", ")}; received ${scripts.join(", ")}.`,
);
assert(
  html.includes('meta name="econovaria-admin-api-base" content=""'),
  "Admin API metadata must be empty until validated runtime configuration initializes it.",
);

for (const reference of scripts) {
  if (reference === "../runtime-config.env.js") continue;
  const path = resolve(adminRoot, reference);
  assert(existsSync(path), `Missing admin script ${reference}.`);
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(result.status === 0, `JavaScript syntax check failed for ${reference}:\n${result.stderr || result.stdout}`);
}

const runtimeConfig = readFileSync(resolve(root, "frontend/src/core/runtime-config.js"), "utf8");
const sessionManager = readFileSync(resolve(adminRoot, "auth-session-manager.js"), "utf8");
const auth = readFileSync(resolve(adminRoot, "admin-auth.js"), "utf8");
const boot = readFileSync(resolve(adminRoot, "dist/admin-overview-boot.js"), "utf8");
const assetWiring = readFileSync(resolve(adminRoot, "asset-wiring.js"), "utf8");
const fallback = readFileSync(resolve(adminRoot, "classroom-write-fallback.js"), "utf8");
const createAdapter = readFileSync(resolve(adminRoot, "create-action-adapter.js"), "utf8");
const credentialBridge = readFileSync(resolve(adminRoot, "player-access-code-bridge.js"), "utf8");
const modalAccessibility = readFileSync(resolve(adminRoot, "modal-accessibility.js"), "utf8");
const createLifecycle = readFileSync(resolve(adminRoot, "player-create-lifecycle.js"), "utf8");
const drawerWiring = readFileSync(resolve(adminRoot, "player-drawer-wiring.js"), "utf8");
const identityWiring = readFileSync(resolve(adminRoot, "player-identity-wiring.js"), "utf8");
const playerCreateUx = readFileSync(resolve(adminRoot, "player-create-ux.js"), "utf8");
const gameSessionControls = readFileSync(resolve(adminRoot, "game-session-controls.js"), "utf8");
const stabilization = readFileSync(resolve(adminRoot, "admin-stabilization.js"), "utf8");
const interactionQuality = readFileSync(resolve(adminRoot, "interaction-quality.js"), "utf8");
const dataStateContracts = readFileSync(resolve(adminRoot, "data-state-contracts.js"), "utf8");
const interactionControlReset = readFileSync(resolve(adminRoot, "interaction-quality-control-reset.js"), "utf8");
const shapeSkeletons = readFileSync(resolve(adminRoot, "shape-accurate-skeletons.js"), "utf8");
const stabilizationCss = readFileSync(resolve(adminRoot, "css/admin-stabilization.css"), "utf8");
const gameSessionControlsCss = readFileSync(resolve(adminRoot, "css/game-session-controls.css"), "utf8");
const interactionQualityCss = readFileSync(resolve(adminRoot, "css/interaction-quality.css"), "utf8");
const dataStateCss = readFileSync(resolve(adminRoot, "css/data-state-contracts.css"), "utf8");
const shapeSkeletonCss = readFileSync(resolve(adminRoot, "css/shape-accurate-skeletons.css"), "utf8");
const skeletonMatrix = readFileSync(resolve(adminRoot, "docs/admin-shape-accurate-skeleton-matrix-2026-07-18.md"), "utf8");
const terminal = readFileSync(resolve(adminRoot, "dist/admin-overview-terminal.js"), "utf8");

assert(runtimeConfig.includes("adminApiMeta.content = runtimeConfig.adminApiUrl"), "Validated runtime config does not populate Admin API metadata.");
assert(sessionManager.includes("EconovariaRuntimeConfig"), "Admin session manager does not consume validated runtime configuration.");
assert(auth.includes("EconovariaRuntimeConfig"), "Admin API bridge does not consume validated runtime configuration.");
assert(fallback.includes("EconovariaRuntimeConfig"), "Classroom fallback does not consume validated runtime configuration.");
assert(credentialBridge.includes("EconovariaRuntimeConfig"), "Credential bridge does not consume validated runtime configuration.");
assert(sessionManager.includes("grant_type=refresh_token"), "Admin refresh-token grant is missing.");
assert(sessionManager.includes("refreshPromise"), "Concurrent admin token refresh is not deduplicated.");
assert(auth.includes("completeInitialBootstrapRender(feature)"), "Admin bootstrap completion is missing.");
assert(boot.includes("function installAuthenticatedAdminModelBridge()"), "Authenticated model bridge is missing.");
assert(boot.includes('Object.defineProperty(feature, "currentModel"'), "Authorization metadata is not preserved across model replacement.");
assert(assetWiring.includes("ORIGINAL_MODAL_VIDEOS"), "Original admin modal video map is not wired.");
assert(!assetWiring.includes("replaceBrokenMotionMedia"), "Modal videos are still replaced with the generic identity illustration.");
assert(assetWiring.includes("media-placeholder.svg"), "Local media fallback is not wired.");
assert(createAdapter.includes('playerIdentifier: formValue(form, "playerIdentifier")'), "Create adapter omits Player ID.");
assert(createAdapter.includes('accessCode: formValue(form, "accessCode")'), "Create adapter omits Access Code.");
assert(fallback.includes('"playerIdentifier"') && fallback.includes('"accessCode"'), "Fallback omits identity credentials.");
assert(fallback.includes("econovaria:admin-request-lifecycle"), "Authenticated request owner does not emit explicit lifecycle events.");
assert(fallback.includes("requestId") && fallback.includes('phase: "started"'), "Admin request lifecycle lacks request-scoped correlation.");
assert(!html.includes("player-identity-transport.js"), "Header-stripping identity transport is still loaded.");
assert(!html.includes("player-identity-roster-transport.js"), "Unsafe roster DOM replacement transport is still loaded.");
assert(credentialBridge.includes("updatePlayerIdentity"), "Existing-player identity write bridge is missing.");
assert(credentialBridge.includes("`${LOCAL_API_PREFIX}/games/"), "Existing-player identity updates do not use the authenticated local admin route.");
assert(credentialBridge.includes("econovaria:player-access-code-issued"), "Credential bridge no longer emits the one-time credential event.");
assert(!credentialBridge.includes("renderAccessCodeDialog"), "Credential bridge recreates the duplicate credential dialog.");
assert(!credentialBridge.includes("data-admin-player-access-code-dialog"), "Credential bridge still owns credential presentation markup.");
assert(!credentialBridge.includes("style.cssText"), "Credential bridge still creates inline-styled credential UI.");
assert(createLifecycle.includes("econovaria:player-access-code-issued"), "Create lifecycle does not observe successful credential saves.");
assert(createLifecycle.includes("data-admin-terminal-player-form"), "Create lifecycle is not bounded to the Add Player modal.");
assert(createLifecycle.includes("guardDelegatedCreateAction"), "Delegated create actions do not enforce form validation.");
assert(!createLifecycle.includes("markExpandedPlayerDetail"), "Create lifecycle still mutates the player drawer.");
assert(!createLifecycle.includes("mountExpandedPlayerSettings"), "Create lifecycle still mounts removed inline settings.");

assert(modalAccessibility.includes("focusableElements"), "Admin modal controller has no focusable-control boundary.");
assert(modalAccessibility.includes('event.key === "Tab"'), "Admin modal controller does not trap keyboard focus.");
assert(modalAccessibility.includes('event.key === "Escape"'), "Admin modal controller does not define Escape behavior.");
assert(modalAccessibility.includes("restoreFocus"), "Admin modal controller does not restore focus.");
assert(!modalAccessibility.includes("MutationObserver"), "Admin modal controller adds unnecessary DOM observation.");
assert(!modalAccessibility.includes("window.fetch ="), "Admin modal controller adds a request wrapper.");

assert(drawerWiring.includes("admin-terminal-player-drawer-tabs-v301"), "Original v606 player drawer shell is not restored.");
assert(drawerWiring.includes("data-admin-terminal-player-drawer"), "Player drawer is missing the original delegated-event boundary.");
assert(drawerWiring.includes("select-player-drawer-tab"), "Player drawer tabs are not wired to the original delegated action.");
for (const label of ["Overview", "Bank Accounts", "Assets", "Liabilities", "Inventory", "Logs"]) {
  assert(drawerWiring.includes(`"${label}"`), `Player drawer is missing the ${label} tab.`);
}
assert(drawerWiring.includes("data-admin-player-drawer-authoritative"), "Restored player drawer is not marked as authoritative-data only.");
assert(!drawerWiring.includes("Math.random"), "Player drawer generates synthetic values.");
assert(!drawerWiring.includes("window.fetch ="), "Player drawer adds another fetch wrapper.");

assert(identityWiring.includes('name="playerIdentifier"'), "Admin create form has no Player ID field.");
assert(identityWiring.includes('name="accessCode"'), "Admin create form has no Access Code field.");
assert(identityWiring.includes("player-settings-editor"), "Edit Player Profile is not the identity editing surface.");
assert(identityWiring.includes("data-admin-player-profile-identity-editor"), "Edit Player Profile is not marked as identity-aware.");
assert(identityWiring.includes("confirm-player-settings-save"), "Edit Player Profile save action is not wired.");
assert(identityWiring.includes("Player ID / RFID card"), "Edit Player Profile does not expose the configurable RFID value.");
assert(identityWiring.includes("Leave blank to keep the current Access Code"), "Edit Player Profile does not preserve an unchanged Access Code.");
assert(identityWiring.includes("showCredentialDialog: false"), "Edit Player Profile no longer declares its no-popup intent at the bridge boundary.");
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
assert(playerCreateUx.includes("EconovariaAdminModalAccessibility"), "Player confirmation does not use the bounded modal controller.");
assert(playerCreateUx.includes("dismissOnEscape: false"), "One-time credentials can be dismissed before acknowledgement with Escape.");
assert(playerCreateUx.includes("dismissOnBackdrop: false"), "One-time credentials can be dismissed by accidental backdrop click.");
assert(playerCreateUx.includes("lastCreateOpener"), "Player confirmation does not retain its opening control for focus restoration.");
assert(!playerCreateUx.includes("window.fetch ="), "Player create UX adds another fetch wrapper.");

assert(gameSessionControls.includes("econovaria.admin.selected-game.v1"), "Selected-game control does not bind to the active Admin game.");
assert(gameSessionControls.includes("Players using this code join this game instance."), "Selected-game card does not explain the multiplayer target.");
assert(gameSessionControls.includes('url.searchParams.set("mode", "player")'), "Shared game link does not target Player login.");
assert(gameSessionControls.includes('url.searchParams.set("gameCode", gameCode)'), "Shared game link omits the selected Game Code.");
assert(gameSessionControls.includes('/api/admin/auth/sign-out'), "Dedicated Admin sign-out route is missing.");
assert(gameSessionControls.includes("event.stopImmediatePropagation()"), "Broken delegated logout handlers are not isolated.");
assert(gameSessionControls.includes("EconovariaAdminAuthSession?.clear?.()"), "Admin logout does not clear the session manager.");
assert(gameSessionControls.includes("createFallbackShareSurface"), "Share Game Access has no bounded fallback surface.");
assert(!gameSessionControls.includes("window.fetch ="), "Selected-game controls replace the global fetch transport.");
assert(gameSessionControlsCss.includes("pointer-events: auto !important"), "Selected-game controls do not restore pointer input.");
assert(gameSessionControlsCss.includes('width: min(620px, calc(100vw - 32px))'), "Share Game Access is not responsively bounded.");
assert(html.includes("./css/game-session-controls.css"), "Selected-game control stylesheet is not loaded.");
assert(html.includes("./game-session-controls.js"), "Selected-game controller is not loaded.");

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
assert(interactionQuality.includes("admin-qol-page-skeleton"), "Page skeleton host is missing.");
assert(interactionQuality.includes("econovaria:admin-request-lifecycle"), "Admin interaction controller does not consume explicit request lifecycle events.");
assert(interactionQuality.includes("requestContexts"), "Concurrent Admin requests do not retain request-scoped UI ownership.");
assert(!interactionQuality.includes("window.fetch ="), "Admin interaction controller still owns global transport interception.");
assert(!interactionQuality.includes("MutationObserver"), "Admin interaction controller still observes the complete DOM subtree.");
assert(interactionControlReset.includes("restoreCompletedControl"), "Completed actions do not restore their controls.");
assert(interactionControlReset.includes('removeAttribute("aria-disabled")'), "Completed controls do not clear stale disabled semantics.");
assert(interactionControlReset.includes("setScannerReady"), "Scanner does not restore its Ready state.");
assert(interactionControlReset.includes("Scan a player code. The result appears here."), "Scanner idle guidance drifted.");
assert(interactionQualityCss.includes(".admin-qol-field-error"), "Field error styling is missing.");
assert(interactionQualityCss.includes('[data-admin-qol-state="loading"]'), "Button processing styling is missing.");

for (const state of ["loading", "loaded", "refreshing", "stale", "empty", "failed"]) {
  assert(dataStateContracts.includes(`"${state}"`), `Admin data-state contract ${state} is missing.`);
}
assert(dataStateContracts.includes("econovaria:admin-request-lifecycle"), "Admin data states do not consume explicit request lifecycle events.");
assert(dataStateContracts.includes("econovaria:admin-data-state-changed"), "Admin data states do not publish transition events.");
assert(dataStateContracts.includes("detail.pageRead !== true"), "Admin data states are not bounded to page reads.");
assert(!dataStateContracts.includes("window.fetch ="), "Admin data states add a global fetch wrapper.");
assert(!dataStateContracts.includes("MutationObserver"), "Admin data states add a DOM observer.");
assert(!dataStateContracts.includes("style.cssText"), "Admin data states create inline presentation.");
assert(dataStateCss.includes('[data-state="stale"]'), "Admin stale-state styling is missing.");
assert(dataStateCss.includes('[data-state="empty"]'), "Admin empty-state styling is missing.");
assert(dataStateCss.includes('[data-state="failed"]'), "Admin failed-state styling is missing.");
assert(html.includes("./css/data-state-contracts.css"), "Admin data-state stylesheet is not loaded.");
assert(html.includes("./data-state-contracts.js"), "Admin data-state controller is not loaded.");

for (const route of [
  "overview", "players", "contracts", "store", "marketplace", "attendance", "logs", "settings",
  "account-profile", "account-notifications", "account-security", "account-help", "account-games",
  "player-drawer", "contract-review", "scanner", "modal",
]) {
  assert(shapeSkeletons.includes(`"${route}"`) || shapeSkeletons.includes(`${route}:`), `Shape skeleton route ${route} is missing.`);
}
assert(shapeSkeletons.includes("ROUTE_ASSEMBLIES"), "Route-specific skeleton registry is missing.");
assert(shapeSkeletons.includes("clonePage"), "Shape skeletons do not reuse the mounted page shell.");
assert(shapeSkeletons.includes("renderSurface"), "Bounded drawer, modal, review, and scanner skeleton support is missing.");
assert(shapeSkeletons.includes("beginRefresh") && shapeSkeletons.includes("endRefresh"), "Background refresh presentation is missing.");
assert(shapeSkeletons.includes('setAttribute("aria-busy", "true")'), "Skeleton hosts are not marked busy.");
assert(shapeSkeletons.includes('setAttribute("aria-hidden", "true")') && shapeSkeletons.includes('setAttribute("inert", "")'), "Decorative skeleton clones are not hidden and inert.");
assert(!shapeSkeletons.includes("window.fetch ="), "Shape skeleton controller adds a global fetch wrapper.");
assert(!shapeSkeletons.includes("MutationObserver"), "Shape skeleton controller adds a DOM observer.");
assert(!shapeSkeletons.includes('createElement("style")') && !shapeSkeletons.includes("style.cssText"), "Shape skeleton controller creates runtime styles.");
assert(shapeSkeletonCss.includes("admin-shape-skeleton-stage"), "Shape skeleton stylesheet is missing the mounted-shell stage.");
assert(shapeSkeletonCss.includes("prefers-reduced-motion"), "Shape skeleton motion is not reduced-motion aware.");
assert(shapeSkeletonCss.includes("admin-session-skeleton__shell"), "Verification skeleton does not reproduce the Admin shell.");
assert(html.includes("./css/shape-accurate-skeletons.css"), "Shape skeleton stylesheet is not loaded.");
assert(html.includes("./shape-accurate-skeletons.js"), "Shape skeleton controller is not loaded.");
assert(html.includes("admin-session-skeleton__metrics") && html.includes("admin-session-skeleton__table-row"), "Verification skeleton lacks metric and table geometry.");
assert(skeletonMatrix.includes("Route-to-skeleton matrix") && skeletonMatrix.includes("Geometry tolerances"), "Skeleton route matrix or tolerances are undocumented.");
assert(!skeletonMatrix.includes("inventory-redemption review queue"), "Blocked inventory redemption work entered the skeleton tranche.");

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

console.log("Original v606 shell, selected multiplayer game controls, runtime configuration bootstrap, route-shaped loading shells, explicit six-state data lifecycles, responsive geometry, reduced motion, credential accessibility, explicit request lifecycles, scanner recovery, and completed-control restoration passed.");
