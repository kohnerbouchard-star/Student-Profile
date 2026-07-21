import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const client = readFileSync("admin/messaging-moderation-client.js", "utf8");
const surface = readFileSync("admin/messaging-moderation-surface.js", "utf8");
const loader = readFileSync("admin/messaging-moderation-loader.js", "utf8");
const stylesheet = readFileSync("admin/messaging-moderation.css", "utf8");
const adminIndex = readFileSync("admin/index.html", "utf8");
const messagesPage = readFileSync("player-terminal/src/pages/messages-page.js", "utf8");
const backendRoutes = readFileSync("player-terminal/src/api/backend-routes.js", "utf8");
const capabilityManifest = readFileSync("player-terminal/src/integrations/student-profile-capability-manifest.js", "utf8");

for (const path of [
  "admin/messaging-moderation-client.js",
  "admin/messaging-moderation-loader.js",
  "admin/messaging-moderation-surface.js",
  "player-terminal/src/pages/messages-page.js",
  "player-terminal/src/api/backend-routes.js",
  "player-terminal/src/api/payload-normalizer.js",
  "player-terminal/src/integrations/student-profile-capability-manifest.js",
]) {
  const check = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert.equal(check.status, 0, `${path} failed syntax validation:\n${check.stderr || check.stdout}`);
}

assert.match(client, /cache:\s*"no-store"/);
assert.match(client, /x-idempotency-key/);
assert.match(client, /x-request-id/);
assert.match(client, /authorization:\s*`Bearer/);
assert.doesNotMatch(client, /playerUuid|gameSessionId|ownerUuid/);
assert.doesNotMatch(client, /window\.fetch\s*=/);

assert.match(surface, /econovaria:admin-route-mounted/);
assert.match(surface, /event\.target !== preview/);
assert.match(surface, /data-message-create/);
assert.match(surface, /data-thread-action/);
assert.match(surface, /data-message-action/);
assert.match(surface, /data-\$\{kind\}-reason/);
assert.doesNotMatch(surface, /MutationObserver\s*\(/);
assert.doesNotMatch(surface, /window\.prompt|\bprompt\s*\(/);
assert.doesNotMatch(surface, /window\.fetch\s*=/);
assert.doesNotMatch(surface, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

assert.match(loader, /document\.createElement\("link"\)/);
assert.match(loader, /messaging-moderation\.css/);
assert.match(loader, /import\(new URL\("\.\/messaging-moderation-surface\.js"/);
assert.doesNotMatch(loader, /createElement\("style"\)|style\.cssText|MutationObserver|window\.fetch\s*=/);

assert.match(stylesheet, /@media \(max-width:620px\)/);
assert.match(stylesheet, /@media \(forced-colors:active\)/);
assert.doesNotMatch(stylesheet, /(^|})button:disabled/);
assert.match(adminIndex, /inventory-redemption-queue-loader\.js/);
assert.match(adminIndex, /messaging-moderation-loader\.js/);
assert.doesNotMatch(adminIndex, /<link[^>]+messaging-moderation\.css/);

assert.match(messagesPage, /data-player-form="message-read"/);
assert.match(messagesPage, /data-endpoint="messageRead"/);
assert.match(messagesPage, /maxlength="1000"/);
assert.match(messagesPage, /This announcement is read-only/);
assert.match(backendRoutes, /\/players\/me\/messages\/threads\/\$\{/);
assert.match(backendRoutes, /threadId/);
assert.match(capabilityManifest, /messageSend:\s*"messageSend"/);
assert.match(capabilityManifest, /messageRead:\s*"messageRead"/);

console.log("Admin and Player messaging source, architecture, privacy, and capability contracts passed.");
