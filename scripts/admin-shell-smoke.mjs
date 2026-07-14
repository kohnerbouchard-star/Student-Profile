import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const adminRoot = resolve(root, "admin");
const indexPath = resolve(adminRoot, "index.html");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localAssetPath(reference) {
  if (!reference.startsWith("./")) return null;
  return resolve(adminRoot, reference.slice(2));
}

const html = readFileSync(indexPath, "utf8");
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((match) => match[1]);

const expectedScripts = [
  "./session-gate.js",
  "./admin-auth.js",
  "./dist/admin-overview-terminal.js",
  "./create-action-adapter.js",
  "./classroom-write-fallback.js",
  "./player-access-code-bridge.js",
  "./game-code-wiring.js",
  "./dist/admin-overview-boot.js",
];

assert(
  JSON.stringify(scripts) === JSON.stringify(expectedScripts),
  `Admin script order drifted. Expected ${expectedScripts.join(", ")}; received ${scripts.join(", ")}.`,
);
assert(!html.includes("admin-api-base.js"), "Deprecated second API adapter is referenced.");
assert(!html.includes("bootstrap-state-fix.js"), "Unsafe bootstrap DOM patch is referenced.");
assert(
  styles.filter((value) => value.endsWith("admin-overview-integrity.css")).length === 1,
  "The integrity stylesheet must be loaded exactly once.",
);

for (const reference of [...scripts, ...styles]) {
  const path = localAssetPath(reference);
  if (path) assert(existsSync(path), `Missing admin asset: ${reference}`);
}

for (const reference of scripts) {
  const path = localAssetPath(reference);
  if (!path) continue;
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(
    result.status === 0,
    `JavaScript syntax check failed for ${reference}:\n${result.stderr || result.stdout}`,
  );
}

const auth = readFileSync(resolve(adminRoot, "admin-auth.js"), "utf8");
const boot = readFileSync(resolve(adminRoot, "dist/admin-overview-boot.js"), "utf8");
const createActionAdapter = readFileSync(resolve(adminRoot, "create-action-adapter.js"), "utf8");
const classroomFallback = readFileSync(resolve(adminRoot, "classroom-write-fallback.js"), "utf8");
const playerAccessCodeBridge = readFileSync(resolve(adminRoot, "player-access-code-bridge.js"), "utf8");
const gameCode = readFileSync(resolve(adminRoot, "game-code-wiring.js"), "utf8");
const terminal = readFileSync(resolve(adminRoot, "dist/admin-overview-terminal.js"), "utf8");

assert(
  auth.includes("completeInitialBootstrapRender(feature)"),
  "The one-time bootstrap lifecycle completion is missing from admin-auth.js.",
);
assert(
  auth.indexOf("mount.innerHTML = feature.renderShell();") <
    auth.indexOf("completeInitialBootstrapRender(feature);"),
  "The bootstrap marker must be cleared only after the initial verification render.",
);
assert(
  !boot.includes("feature.renderShell ="),
  "admin-overview-boot.js must not monkey patch renderShell.",
);
assert(
  boot.includes("function installAuthenticatedAdminModelBridge()"),
  "The authenticated model bridge is missing.",
);
assert(
  boot.includes('Object.defineProperty(feature, "currentModel"'),
  "Model replacement must preserve authenticated authorization fields.",
);
assert(
  boot.includes('permissions: Array.isArray(next.permissions)') && boot.includes('["*"]'),
  "The model bridge must preserve or restore administrator permissions.",
);
assert(
  boot.includes('roles: Array.isArray(next.roles)') && boot.includes('["game_admin"]'),
  "The model bridge must preserve or restore administrator roles.",
);
assert(
  boot.includes("adminRole: next.adminRole || authorization.adminRole"),
  "The model bridge must preserve the active administrator role.",
);
assert(
  boot.indexOf("installAuthenticatedAdminModelBridge();") <
    boot.indexOf("auth.attachTerminal({ mount, feature });"),
  "The authorization bridge must be installed before auth mounts the terminal.",
);
assert(
  auth.includes('headers.delete("x-econovaria-admin-read")'),
  "The unused cross-origin admin read marker must be removed before forwarding.",
);
assert(
  auth.includes('headers.set("Authorization", `Bearer ${session.accessToken}`)'),
  "Forwarded admin requests must include the transferred bearer token.",
);
assert(
  auth.includes('headers.set("X-Econovaria-Game-Id", selectedGameId)'),
  "Forwarded admin requests must include the selected game ID.",
);
assert(
  createActionAdapter.includes('source.action === "create-player"') &&
    createActionAdapter.includes('source.action === "create-contract"') &&
    createActionAdapter.includes('source.action === "save-store-item"'),
  "Create-action form payload normalization is incomplete.",
);
assert(
  createActionAdapter.includes('displayName: formValue(form, "displayName")') &&
    createActionAdapter.includes("title,") &&
    createActionAdapter.includes("name: itemName"),
  "Create-action adapter must preserve entered player, contract, and store fields.",
);
assert(
  classroomFallback.includes("const retryStatuses = new Set([400, 404, 501]);") &&
    classroomFallback.includes("const attendanceMatch = url.pathname.match(") &&
    classroomFallback.includes("CLASSROOM_API_BASE") &&
    classroomFallback.includes("/attendance/scan"),
  "Canonical classroom write fallback is missing or unbounded.",
);
assert(
  classroomFallback.includes("if (primary.ok || !retryStatuses.has(primary.status)) return primary;"),
  "Classroom fallback must preserve successful primary admin writes.",
);
assert(
  playerAccessCodeBridge.includes("/access-code/reset") &&
    playerAccessCodeBridge.includes("player_created_without_access_code") &&
    playerAccessCodeBridge.includes("data-admin-player-access-code-dialog"),
  "Player creation must issue and display a one-time access code when the create response omits one.",
);
assert(
  playerAccessCodeBridge.includes('headers.delete("X-CSRF-Token")') &&
    playerAccessCodeBridge.includes('headers.delete("X-Econovaria-CSRF")'),
  "Player access-code reset must strip admin-only CORS headers.",
);
assert(
  terminal.includes('document.addEventListener("click", handleTerminalOverviewClick)'),
  "The delegated admin click handler is not bound.",
);
assert(
  terminal.includes('const sectionButton = event.target.closest("[data-admin-section]")'),
  "Left-navigation clicks are not resolved from the delegated click target.",
);
assert(
  terminal.includes("function renderAdminTerminalSectionFromButton(sectionButton)"),
  "The active left-navigation renderer is missing.",
);
assert(
  terminal.includes("if (renderAdminTerminalSectionFromButton(sectionButton)) return;"),
  "Left-navigation clicks are not routed to the active section renderer.",
);
assert(
  terminal.includes("function applyAdminTerminalPermissionGating(root = document)"),
  "Admin controls are missing permission gating.",
);
assert(
  !gameCode.includes("MutationObserver"),
  "Game-code wiring must not watch or rewrite the entire document.",
);
assert(
  gameCode.includes('const RESET_ACTION = "reset-game-code"'),
  "Game-code generation must use an explicit delegated terminal action.",
);
assert(
  gameCode.includes("scheduleShareModalDecoration"),
  "Game-code wiring must attach through the bounded share-panel lifecycle.",
);

console.log("Admin shell interaction, create-action, classroom fallback, player access-code, and authorization smoke checks passed.");
