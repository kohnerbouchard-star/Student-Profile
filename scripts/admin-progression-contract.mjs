import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const paths = [
  "admin/admin-bootstrap.js",
  "admin/progression-review-client.js",
  "admin/progression-review-loader.js",
  "admin/progression-review-surface.js",
  "player-terminal/src/pages/progression-page.js",
  "player-terminal/src/api/backend-routes.js",
  "player-terminal/src/api/progression-backend-routes.js",
  "player-terminal/src/api/payload-normalizer.js",
  "player-terminal/src/api/response-normalizer.js",
];
for (const path of paths) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert.equal(result.status, 0, `${path} failed syntax validation:\n${result.stderr || result.stdout}`);
}
const client = readFileSync("admin/progression-review-client.js", "utf8");
const surface = readFileSync("admin/progression-review-surface.js", "utf8");
const loader = readFileSync("admin/progression-review-loader.js", "utf8");
const css = readFileSync("admin/progression-review.css", "utf8");
const adminIndex = readFileSync("admin/index.html", "utf8");
const adminBootstrap = readFileSync("admin/admin-bootstrap.js", "utf8");
const player = readFileSync("player-terminal/src/pages/progression-page.js", "utf8");
const routes = readFileSync("player-terminal/src/api/backend-routes.js", "utf8");
const progressionRoutes = readFileSync("player-terminal/src/api/progression-backend-routes.js", "utf8");
const payload = readFileSync("player-terminal/src/api/payload-normalizer.js", "utf8");

assert.match(client, /cache:\s*"no-store"/);
assert.match(client, /x-idempotency-key/);
assert.match(client, /authorization:\s*`Bearer/);
assert.doesNotMatch(client, /playerUuid|accessCode|sessionToken/);
assert.match(surface, /econovaria:admin-route-mounted/);
assert.match(surface, /data-progression-correction/);
assert.match(surface, /Apply audited correction/);
assert.doesNotMatch(surface, /innerHTML\s*\+=|window\.prompt|MutationObserver/);
assert.match(loader, /progression-review\.css/);
assert.match(css, /@media\(max-width:620px\)/);
assert.match(css, /@media\(forced-colors:active\)/);
assert.match(adminIndex, /admin-bootstrap\.js/);
assert.match(adminBootstrap, /"\.\/progression-review-loader\.js"/);
assert.match(player, /data-player-skill-unlock/);
assert.match(player, /data-player-reward-claim/);
assert.match(player, /Bounded from −100 to \+100/);
assert.match(player, /No guaranteed economic return/);
assert.match(routes, /progression-backend-routes\.js/);
assert.match(routes, /hasProgressionBackendRoute/);
assert.match(progressionRoutes, /\/players\/me\/progression\/skills\//);
assert.match(progressionRoutes, /\/players\/me\/progression\/rewards\//);
assert.match(payload, /endpointKey === "progressionUnlock" \|\| endpointKey === "progressionClaim"/);
assert.doesNotMatch(
  JSON.stringify({ client, surface, player, progressionRoutes }),
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
);
console.log("Admin and Player Progression source, privacy, accessibility, and composed-adapter contracts passed.");
