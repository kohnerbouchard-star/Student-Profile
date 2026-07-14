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

function sourceContext(source, term, before = 800, after = 1800) {
  const index = source.indexOf(term);
  if (index < 0) return `[missing: ${term}]`;
  return source.slice(Math.max(0, index - before), Math.min(source.length, index + term.length + after));
}

const html = readFileSync(indexPath, "utf8");
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((match) => match[1]);

const expectedScripts = [
  "./session-gate.js",
  "./admin-auth.js",
  "./dist/admin-overview-terminal.js",
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

console.log("ADMIN_INTERACTION_DIAGNOSTIC_BEGIN");
for (const term of [
  'document.addEventListener("click"',
  "data-admin-section",
  "dataset.adminSection",
  "adminOverviewTerminal =",
  "renderShell:",
  "bind",
  "attach",
]) {
  console.log(`\n--- ${term} ---\n${sourceContext(terminal, term)}`);
}
console.log(`\n--- terminal tail ---\n${terminal.slice(-12000)}`);
console.log("ADMIN_INTERACTION_DIAGNOSTIC_END");
console.log("Admin shell static smoke checks passed.");
