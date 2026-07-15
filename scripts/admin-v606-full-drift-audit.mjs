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
  "./admin-stabilization.js",
  "./interaction-quality.js",
  "./interaction-quality-control-reset.js",
  "./dist/admin-overview-boot.js",
];

assert(
  JSON.stringify(scriptSources) === JSON.stringify(expectedScripts),
  `Admin script order drifted: ${JSON.stringify(scriptSources)}.`,
);
assert(!/<style(?:\s|>)/i.test(html), "Admin entrypoint contains an inline style block.");

const expectedStyles = [
  "./css/page-shell.css",
  "./css/admin-overview-terminal.css",
  "./css/admin-overview-integrity.css",
  "./css/session-gate.css",
  "./css/player-runtime-integration.css",
  "./css/player-create-confirmation.css",
  "./css/admin-stabilization.css",
  "./css/admin-stabilization-visual-finish.css",
  "./css/interaction-quality.css",
];

for (const requiredStyle of expectedStyles) {
  assert(styleSources.includes(requiredStyle), `Missing required admin stylesheet ${requiredStyle}.`);
}
assert(
  JSON.stringify(styleSources) === JSON.stringify(expectedStyles),
  `Admin stylesheet order drifted: ${JSON.stringify(styleSources)}.`,
);

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
  "admin/admin-stabilization.js": [
    "reconcileKnownButtons",
    "reconcileNumericFormatting",
    "admin-terminal-ui-icon",
    "admin-terminal-export-history-button-v601",
    "admin-terminal-logs-export-icon",
  ],
  "admin/interaction-quality.js": [
    "validateForm",
    "setScannerProcessing",
    "setScannerCompleted",
    "setScannerError",
    "admin-qol-page-skeleton",
  ],
  "admin/interaction-quality-control-reset.js": [
    "restoreCompletedControl",
    "setScannerReady",
    "removeAttribute(\"aria-disabled\")",
    "Scan a player code. The result appears here.",
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
assert(
  !identity.includes('setAttribute("data-admin-player-identity-manager"'),
  "Removed standalone Player IDs manager is created again.",
);
assert(!identity.includes("openIdentityManager"), "Removed standalone identity workflow returned.");
assert(!identity.includes("window.fetch ="), "Player identity wiring adds a network wrapper.");
assert(!identity.includes('createElement("style")'), "Player identity wiring injects runtime CSS.");

const lifecycle = readText("admin/player-create-lifecycle.js");
assert(!lifecycle.includes("markExpandedPlayerDetail"), "Add Player lifecycle still mutates expanded player drawers.");
assert(!lifecycle.includes("mountExpandedPlayerSettings"), "Add Player lifecycle still mounts removed inline settings.");
assert(lifecycle.includes("guardDelegatedCreateAction"), "Delegated create actions bypass field validation.");

const createUx = readText("admin/player-create-ux.js");
assert(!createUx.includes("window.fetch ="), "Player creation UX adds a network wrapper.");
assert(!createUx.includes('createElement("style")'), "Player creation UX injects runtime CSS.");
assert(createUx.includes("Leave blank to auto-generate"), "Automatic credential guidance is missing.");

const stabilization = readText("admin/admin-stabilization.js");
assert(!stabilization.includes("window.fetch ="), "Admin stabilization adds a network wrapper.");
assert(!stabilization.includes('createElement("style")'), "Admin stabilization injects runtime CSS.");
assert(!stabilization.includes("document.body.innerHTML"), "Admin stabilization replaces the document body.");

for (const [glyph, iconName] of [
  ["↻", "history"],
  ["⇩", "download"],
  ["←", "arrow-left"],
  ["→", "arrow-right"],
]) {
  assert(
    stabilization.includes(`["${glyph}", "${iconName}"]`),
    `Admin stabilization does not replace the raw ${glyph} control glyph.`,
  );
  assert(
    stabilization.includes(`${iconName}:`) || stabilization.includes(`"${iconName}":`),
    `Admin stabilization is missing the ${iconName} SVG path.`,
  );
}

for (const path of [
  "admin/css/session-gate.css",
  "admin/css/player-runtime-integration.css",
  "admin/css/player-create-confirmation.css",
  "admin/css/admin-stabilization.css",
  "admin/css/admin-stabilization-visual-finish.css",
  "admin/css/interaction-quality.css",
]) {
  const source = readText(path);
  for (const forbidden of [
    /(^|[},\s])body\s*\{/m,
    /(^|[},\s])html\s*\{/m,
    /\.admin-terminal-shell\s*\{/m,
    /\[data-admin-section\]\s*\{/m,
  ]) {
    assert(!forbidden.test(source), `${path} contains an unscoped global selector.`);
  }
}

const integrationCss = readText("admin/css/player-runtime-integration.css");
assert(
  integrationCss.includes("[data-admin-player-profile-save-status]") &&
    integrationCss.includes("[data-admin-player-created-confirmation]"),
  "External player integration stylesheet is incomplete.",
);

const confirmationCss = readText("admin/css/player-create-confirmation.css");
assert(
  confirmationCss.includes("[data-admin-player-created-confirmation]"),
  "Player-created confirmation CSS is not bounded to its modal.",
);

const stabilizationCss = readText("admin/css/admin-stabilization.css");
assert(stabilizationCss.includes(".admin-terminal-modal-backdrop"), "Admin modal stabilization is missing.");
assert(stabilizationCss.includes(".admin-terminal-modal.is-contract-modal"), "Contract modal stabilization is missing.");
assert(
  !/#adminPreview\s*,[\s\S]{0,80}#adminPreview\s+\*/m.test(stabilizationCss) &&
    !/#adminPreview\s+\*\s*\{/m.test(stabilizationCss),
  "Admin stabilization applies a blanket box-sizing reset to the accepted page shell.",
);
assert(
  /\.admin-terminal-modal-backdrop\s*,\s*\.admin-terminal-modal-backdrop\s+\*\s*\{[\s\S]*?box-sizing:\s*border-box/m.test(stabilizationCss),
  "Modal-only border-box containment is missing.",
);

const visualFinishCss = readText("admin/css/admin-stabilization-visual-finish.css");
assert(
  visualFinishCss.includes("#adminPreview .admin-terminal-clickable-row::after"),
  "Clickable-row SVG affordance correction is missing.",
);
assert(
  !visualFinishCss.includes("#adminPreview *"),
  "Final visual corrections contain a blanket page-shell selector.",
);

const interactionQuality = readText("admin/interaction-quality.js");
assert(
  interactionQuality.includes("window.fetch = async function econovariaAdminQualityFetch"),
  "Interaction quality does not observe final admin request outcomes.",
);
assert(
  interactionQuality.includes("aria-invalid") && interactionQuality.includes("admin-qol-field-error"),
  "Field-level validation feedback is incomplete.",
);
assert(
  interactionQuality.includes('"Scanning"') &&
    interactionQuality.includes('"Completed"') &&
    interactionQuality.includes('"Scan failed"'),
  "Scanner processing, completion, or error copy is missing.",
);

const interactionControlReset = readText("admin/interaction-quality-control-reset.js");
assert(
  interactionControlReset.includes("restoreCompletedControl") &&
    interactionControlReset.includes('removeAttribute("aria-disabled")') &&
    interactionControlReset.includes("setScannerReady"),
  "Completed actions or scanner idle recovery are incomplete.",
);

const interactionQualityCss = readText("admin/css/interaction-quality.css");
assert(interactionQualityCss.includes(".admin-session-skeleton"), "Verification skeleton CSS is missing.");
assert(interactionQualityCss.includes(".admin-qol-page-skeleton"), "Page skeleton CSS is missing.");
assert(interactionQualityCss.includes(".admin-qol-field-error"), "Field error CSS is missing.");
assert(interactionQualityCss.includes('[data-admin-qol-state="loading"]'), "Button processing CSS is missing.");
assert(!interactionQualityCss.includes("#adminPreview *"), "Interaction quality contains a blanket page-shell reset.");
assert(html.includes("admin-session-skeleton"), "Verification gate does not render a skeleton.");
assert(!html.includes("Opening administrator console"), "Legacy verification text remains visible.");

console.log("Accepted v606 core files, text/icon integrity, validation states, skeleton loading, scanner recovery, completed-control restoration, and scoped admin stabilization boundaries passed.");