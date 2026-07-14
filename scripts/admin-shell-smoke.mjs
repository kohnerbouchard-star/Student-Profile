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

function extractFunction(source, name) {
  const candidates = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of candidates) {
    start = source.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) return `[missing function: ${name}]`;
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) return `[missing body: ${name}]`;
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] || "";
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return `[unterminated function: ${name}]`;
}

function contextsFor(source, term, before = 1200, after = 5000) {
  const output = [];
  let index = source.indexOf(term);
  while (index >= 0) {
    output.push(source.slice(
      Math.max(0, index - before),
      Math.min(source.length, index + term.length + after),
    ));
    index = source.indexOf(term, index + term.length);
  }
  return output.length ? output.join("\n\n===== NEXT OCCURRENCE =====\n\n") : `[missing: ${term}]`;
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

assert(auth.includes("completeInitialBootstrapRender(feature)"), "The one-time bootstrap lifecycle completion is missing from admin-auth.js.");
assert(
  auth.indexOf("mount.innerHTML = feature.renderShell();") < auth.indexOf("completeInitialBootstrapRender(feature);"),
  "The bootstrap marker must be cleared only after the initial verification render.",
);
assert(!boot.includes("feature.renderShell ="), "admin-overview-boot.js must not monkey patch renderShell.");
assert(auth.includes('headers.delete("x-econovaria-admin-read")'), "The unused cross-origin admin read marker must be removed before forwarding.");
assert(auth.includes('headers.set("Authorization", `Bearer ${session.accessToken}`)'), "Forwarded admin requests must include the transferred bearer token.");
assert(auth.includes('headers.set("X-Econovaria-Game-Id", selectedGameId)'), "Forwarded admin requests must include the selected game ID.");
assert(!gameCode.includes("MutationObserver"), "Game-code wiring must not watch or rewrite the entire document.");
assert(gameCode.includes('const RESET_ACTION = "reset-game-code"'), "Game-code generation must use an explicit delegated terminal action.");
assert(gameCode.includes("scheduleShareModalDecoration"), "Game-code wiring must attach through the bounded share-panel lifecycle.");

console.log("ADMIN_INTERACTION_DIAGNOSTIC_BEGIN");
for (const name of [
  "handleTerminalOverviewClick",
  "renderAdminTerminalSectionFromButton",
  "canAdminTerminalAccessArea",
  "canAdminTerminalPerformAction",
  "applyAdminTerminalPermissionGating",
  "getAdminTerminalPermissionState",
  "normalizeAdminTerminalBootstrapPayload",
  "bindTerminalOverviewEvents",
]) {
  console.log(`\n--- FUNCTION ${name} ---\n${extractFunction(terminal, name)}`);
}
for (const term of [
  "permissions",
  "permissionAreas",
  "canAdminTerminalAccessArea",
  "canAdminTerminalPerformAction",
  "applyAdminTerminalPermissionGating",
  "staffSession",
]) {
  console.log(`\n--- CONTEXT ${term} ---\n${contextsFor(terminal, term)}`);
}
console.log("ADMIN_INTERACTION_DIAGNOSTIC_END");
console.log("Admin shell static smoke checks passed.");
