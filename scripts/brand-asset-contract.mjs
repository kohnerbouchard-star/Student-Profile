import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "20260724.2";
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const jpeg = Buffer.from([0xff,0xd8,0xff]);
const bytes = (p) => readFileSync(path.join(root, p));
const text = (p) => readFileSync(path.join(root, p), "utf8");
const signature = (p, s) => assert.ok(bytes(p).subarray(0, s.length).equals(s), `${p} has an invalid image signature`);

["assets/brand/econovaria-icon.png","assets/brand/favicon-32.png","player-terminal/assets/econovaria-icon.png","player-terminal/assets/favicon-32.png","admin/assets/econovaria-icon.png","admin/assets/favicon-32.png"].forEach((p) => signature(p, png));
signature("assets/brand/econovaria-logo.jpg", jpeg);
const login = text("index.html");
const player = text("player-terminal/index.html");
const playerLayout = text("player-terminal/src/components/layout.js");
const admin = text("admin/index.html");
const adminCss = text("admin/css/admin-stabilization-visual-finish.css");
assert.match(login, /econovaria-logo\.jpg\?v=20260724\.2/);
assert.match(login, /rel="shortcut icon"/);
assert.match(player, /rel="shortcut icon"/);
assert.match(admin, /rel="shortcut icon"/);
assert.match(playerLayout, /econovaria-icon\.png\?v=/);
assert.match(adminCss, /econovaria-icon\.png\?v=/);
assert.doesNotMatch(login, /econovaria-logo\.webp/);
assert.match(text("scripts/local-staging-gateway.py"), /validate_brand_assets\(root\)/);
console.log("Econovaria brand assets verified across Login, Player, Admin, and local staging.");
