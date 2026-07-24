import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "20260724.3";
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const bytes = (relativePath) => readFileSync(path.join(root, relativePath));
const text = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const signature = (relativePath, expected) => {
  assert.ok(bytes(relativePath).subarray(0, expected.length).equals(expected), relativePath + " has an invalid image signature");
};

[
  "assets/brand/econovaria-logo.png",
  "assets/brand/econovaria-icon.png",
  "assets/brand/favicon-32.png",
  "player-terminal/assets/econovaria-icon.png",
  "player-terminal/assets/favicon-32.png",
  "admin/assets/econovaria-icon.png",
  "admin/assets/favicon-32.png",
].forEach((relativePath) => signature(relativePath, png));

const logoBytes = bytes("assets/brand/econovaria-logo.png");
assert.equal(logoBytes.readUInt32BE(16), 1200, "login logo width must match the approved upload");
assert.equal(logoBytes.readUInt32BE(20), 675, "login logo height must match the approved upload");

const login = text("index.html");
const player = text("player-terminal/index.html");
const playerLayout = text("player-terminal/src/components/layout.js");
const admin = text("admin/index.html");
const adminCss = text("admin/css/admin-stabilization-visual-finish.css");

assert.match(login, new RegExp("econovaria-logo\\.png\\?v=" + version));
assert.match(login, /assets\/brand\/favicon-32\.png\?v=20260724\.2/);
assert.match(player, /\.\/assets\/favicon-32\.png\?v=20260724\.2/);
assert.match(admin, /\.\/assets\/favicon-32\.png\?v=20260724\.2/);
assert.match(login, /rel="shortcut icon"/);
assert.match(player, /rel="shortcut icon"/);
assert.match(admin, /rel="shortcut icon"/);
assert.match(playerLayout, /econovaria-icon\.png\?v=20260724\.2/);
assert.match(adminCss, /econovaria-icon\.png\?v=20260724\.2/);
assert.doesNotMatch(login, /econovaria-logo\.(?:jpg|webp)/);
assert.match(text("scripts/local-staging-gateway.py"), /validate_brand_assets\(root\)/);

console.log("Econovaria brand assets verified across Login, Player, Admin, and local staging.");
