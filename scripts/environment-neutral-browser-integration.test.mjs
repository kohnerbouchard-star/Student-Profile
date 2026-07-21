import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionProjectRef = "cgiukdjwicykrmtkhudh";
const productionPublishableKey = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
const textExtensions = new Set([".html", ".js", ".mjs", ".json", ".css"]);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const result = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const childRelative = path.join(relativePath, entry.name);
    if (entry.isDirectory()) result.push(...walk(childRelative));
    else if (textExtensions.has(path.extname(entry.name))) result.push(childRelative);
  }
  return result;
}

function assertOrdered(source, orderedFragments, label) {
  let previous = -1;
  for (const fragment of orderedFragments) {
    const position = source.indexOf(fragment);
    assert.notEqual(position, -1, `${label} is missing ${fragment}`);
    assert.ok(position > previous, `${label} loads ${fragment} out of order`);
    previous = position;
  }
}

test("deployable browser surface contains no committed production binding", () => {
  const files = ["index.html", ...walk("frontend"), ...walk("auth"), ...walk("admin"), ...walk("player-terminal")];
  for (const relativePath of files) {
    const source = read(relativePath);
    assert.equal(source.includes(productionProjectRef), false, `${relativePath} embeds the production project ref`);
    assert.equal(source.includes(productionPublishableKey), false, `${relativePath} embeds the production publishable key`);
  }
});

test("all browser API consumers use the validated runtime authority", () => {
  for (const relativePath of [
    "frontend/src/core/constants.js",
    "auth/reset-password.js",
    "admin/auth-session-manager.js",
    "player-terminal/host-runtime.js",
    "admin/player-access-code-bridge.js",
    "admin/admin-auth.js",
    "admin/classroom-write-fallback.js",
  ]) {
    assert.match(read(relativePath), /EconovariaRuntimeConfig/, `${relativePath} does not consume runtime config`);
  }
});

test("entry points load deployment config and validator before consumers", () => {
  assertOrdered(read("index.html"), [
    'src="runtime-config.env.js"',
    'src="frontend/src/core/runtime-config.js"',
    'src="frontend/src/core/constants.js"',
  ], "root login");
  assertOrdered(read("auth/reset-password.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./reset-password.js"',
  ], "password recovery");
  assertOrdered(read("player-terminal/index.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./host-runtime.js"',
  ], "player terminal");
  assertOrdered(read("admin/index.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./auth-session-manager.js"',
  ], "admin console");
});

test("admin API metadata is populated only by validated runtime config", () => {
  assert.match(read("admin/index.html"), /name="econovaria-admin-api-base" content=""/);
  assert.match(read("frontend/src/core/runtime-config.js"), /adminApiMeta\.content = runtimeConfig\.adminApiUrl/);
});
