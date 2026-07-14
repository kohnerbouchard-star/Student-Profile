import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(resolve(root, path));
}

function readText(path) {
  return read(path).toString("utf8");
}

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
  assert(
    actual === expected,
    `${path} drifted from accepted v606. Expected ${expected}; received ${actual}.`,
  );
}

const html = readText("admin/index.html");
const scriptSources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const styleSources = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((match) => match[1]);

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
  "./dist/admin-overview-boot.js",
];

assert(
  JSON.stringify(scriptSources) === JSON.stringify(expectedScripts),
  `Admin script order drifted: ${JSON.stringify(scriptSources)}.`,
);

for (const requiredStyle of [
  "./css/page-shell.css",
  "./css/admin-overview-terminal.css",
  "./css/admin-overview-integrity.css",
  "./css/player-create-confirmation.css",
]) {
  assert(styleSources.includes(requiredStyle), `Missing required admin stylesheet ${requiredStyle}.`);
}

const scopedRuntimeFiles = {
  "admin/player-drawer-wiring.js": [
    "admin-terminal-player-real-data-v604",
    "data-admin-terminal-player-drawer",
    "data-admin-player-drawer-authoritative",
  ],
  "admin/player-identity-wiring.js": [
    "player-settings-editor",
    "data-admin-player-profile-identity-editor",
    "data-admin-player-create-credential-field",
  ],
  "admin/player-create-ux.js": [
    "data-admin-player-created-confirmation",
    "data-admin-terminal-player-form",
  ],
  "admin/asset-wiring.js": [
    "ORIGINAL_CURRENCY_ICONS",
    "ORIGINAL_PLAYER_ACTION_ICONS",
    "ORIGINAL_MODAL_VIDEOS",
  ],
};

for (const [path, requiredTokens] of Object.entries(scopedRuntimeFiles)) {
  const source = readText(path);
  for (const token of requiredTokens) {
    assert(source.includes(token), `${path} is missing its expected scope token ${token}.`);
  }
  assert(!source.includes("document.body.innerHTML"), `${path} replaces the complete document body.`);
  assert(!source.includes("document.documentElement.innerHTML"), `${path} replaces the complete document root.`);
}

const drawer = readText("admin/player-drawer-wiring.js");
assert(!drawer.includes("Math.random"), "Player drawer wiring generates synthetic values.");
assert(!drawer.includes("window.fetch ="), "Player drawer wiring adds a network wrapper.");
assert(!drawer.includes("<style"), "Player drawer wiring injects an unreviewed global stylesheet.");

const identity = readText("admin/player-identity-wiring.js");
assert(!identity.includes("data-admin-player-identity-manager"), "Removed standalone Player IDs manager returned.");
assert(!identity.includes("openIdentityManager"), "Removed standalone identity workflow returned.");
assert(!identity.includes("window.fetch ="), "Player identity wiring adds a network wrapper.");

const lifecycle = readText("admin/player-create-lifecycle.js");
assert(!lifecycle.includes("markExpandedPlayerDetail"), "Add Player lifecycle still mutates expanded player drawers.");
assert(!lifecycle.includes("mountExpandedPlayerSettings"), "Add Player lifecycle still mounts removed inline settings.");

const createUx = readText("admin/player-create-ux.js");
assert(!createUx.includes("window.fetch ="), "Player creation UX adds a network wrapper.");
assert(createUx.includes("Leave blank to auto-generate"), "Automatic credential guidance is missing.");

const confirmationCss = readText("admin/css/player-create-confirmation.css");
for (const forbidden of [
  /(^|[},\s])body\s*\{/m,
  /(^|[},\s])html\s*\{/m,
  /\.admin-terminal-shell\s*\{/m,
  /\[data-admin-section\]\s*\{/m,
]) {
  assert(!forbidden.test(confirmationCss), "Player-created confirmation CSS contains an unscoped global selector.");
}
assert(
  confirmationCss.includes("[data-admin-player-created-confirmation]"),
  "Player-created confirmation CSS is not bounded to its modal.",
);

console.log("Accepted v606 core files and post-merge visual scope boundaries passed.");
