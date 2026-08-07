import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const paths = [
  "admin/admin-bootstrap.js",
  "admin/progression-review-client.js",
  "admin/progression-review-loader.js",
  "admin/progression-review-surface.js",
  "admin/v2/src/app.js",
  "admin/v2/src/core/navigation-registry.js",
  "admin/v2/src/routes/progression/ProgressionClient.js",
  "admin/v2/src/routes/progression/ProgressionController.js",
  "admin/v2/src/routes/progression/ProgressionCorrectionEditor.js",
  "admin/v2/src/routes/progression/ProgressionModel.js",
  "admin/v2/src/routes/progression/ProgressionRoute.js",
  "admin/v2/src/routes/progression/ProgressionTables.js",
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
const v2Html = readFileSync("admin/v2.html", "utf8");
const v2App = readFileSync("admin/v2/src/app.js", "utf8");
const v2Navigation = readFileSync("admin/v2/src/core/navigation-registry.js", "utf8");
const v2Client = readFileSync("admin/v2/src/routes/progression/ProgressionClient.js", "utf8");
const v2Controller = readFileSync("admin/v2/src/routes/progression/ProgressionController.js", "utf8");
const v2Editor = readFileSync("admin/v2/src/routes/progression/ProgressionCorrectionEditor.js", "utf8");
const v2Model = readFileSync("admin/v2/src/routes/progression/ProgressionModel.js", "utf8");
const v2Route = readFileSync("admin/v2/src/routes/progression/ProgressionRoute.js", "utf8");
const v2Tables = readFileSync("admin/v2/src/routes/progression/ProgressionTables.js", "utf8");
const v2Css = readFileSync("admin/v2/styles/routes/progression.css", "utf8");
const v2Test = readFileSync("scripts/admin-v2-progression.test.mjs", "utf8");

assert.match(client, /adminBffApiUrl/);
assert.match(client, /supabasePublishableKey/);
assert.match(client, /apikey:\s*publishableKey/);
assert.match(client, /x-econovaria-device-id/);
assert.match(client, /x-econovaria-game-id/);
assert.match(client, /x-econovaria-csrf-token/);
assert.match(client, /getUsableSession/);
assert.match(client, /credentials:\s*"include"/);
assert.match(client, /cache:\s*"no-store"/);
assert.match(client, /redirect:\s*"error"/);
assert.match(client, /referrerPolicy:\s*"no-referrer"/);
assert.match(client, /x-idempotency-key/);
assert.doesNotMatch(client, /AdminAuthSessionManager/);
assert.doesNotMatch(client, /authorization/i);
assert.doesNotMatch(client, /Bearer/);
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

assert.match(
  v2Navigation,
  /id:\s*"progression"[\s\S]*?permission:\s*"progression\.review"[\s\S]*?migration:\s*"v2"/,
);
assert.match(v2App, /createProgressionApiClient/);
assert.match(v2App, /createProgressionController/);
assert.match(v2App, /progression:\s*Object\.freeze/);
assert.match(v2Html, /styles\/routes\/progression\.css/);
assert.match(v2Client, /\/progression\/corrections/);
assert.match(v2Client, /Idempotency-Key/);
assert.match(v2Client, /idempotencyKey/);
assert.match(v2Client, /credentials:\s*"include"/);
assert.match(v2Client, /cache:\s*"no-store"/);
assert.match(v2Client, /redirect:\s*"error"/);
assert.doesNotMatch(v2Client, /Authorization|Bearer/);
assert.match(v2Controller, /progression\.review/);
assert.match(v2Controller, /outcome === "replayed"/);
assert.match(v2Controller, /pendingIdempotency/);
assert.match(v2Editor, /Apply audited correction/);
assert.match(v2Editor, /separate pending-review queue/);
assert.match(v2Tables, /Correction history/);
assert.match(v2Tables, /Achievement detail is not exposed/);
assert.match(v2Model, /achievementCount/);
assert.doesNotMatch(`${v2Editor}\n${v2Route}\n${v2Tables}`, /window\.prompt|innerHTML\s*\+=|MutationObserver/);
assert.match(v2Css, /@media \(max-width: 760px\)/);
assert.match(v2Css, /@media \(forced-colors: active\)/);
assert.match(v2Test, /zero, normal, and high records/);
assert.match(v2Test, /progression_game_paused/);
assert.match(v2Test, /Correction already recorded/);

assert.doesNotMatch(
  JSON.stringify({ client, surface, player, progressionRoutes }),
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
);
assert.doesNotMatch(
  JSON.stringify({ v2Client, v2Controller, v2Editor, v2Model, v2Route, v2Tables }),
  /(?:^|[^\\])[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
);

const v2Result = spawnSync(
  process.execPath,
  ["--test", "scripts/admin-v2-progression.test.mjs"],
  { encoding: "utf8" },
);
assert.equal(
  v2Result.status,
  0,
  `Admin UI V2 Progression tests failed:\n${v2Result.stderr || v2Result.stdout}`,
);

console.log("Admin and Player Progression source, privacy, accessibility, secure BFF, and Admin UI V2 contracts passed.");
