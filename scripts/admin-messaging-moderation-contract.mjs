import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const paths = [
  "admin/messaging-moderation-client.js",
  "admin/messaging-moderation-loader.js",
  "admin/messaging-moderation-surface.js",
  "admin/messaging-policy-client.js",
  "admin/messaging-policy-surface.js",
  "player-terminal/src/pages/messages-page.js",
  "player-terminal/src/api/backend-routes.js",
  "player-terminal/src/api/messaging-backend-routes.js",
  "player-terminal/src/api/payload-normalizer.js",
  "player-terminal/src/integrations/student-profile-capability-manifest.js",
];
for (const path of paths) {
  const check = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert.equal(check.status, 0, `${path} failed syntax validation:\n${check.stderr || check.stdout}`);
}

const moderationClient = readFileSync(paths[0], "utf8");
const moderationSurface = readFileSync(paths[2], "utf8");
const policyClient = readFileSync(paths[3], "utf8");
const policySurface = readFileSync(paths[4], "utf8");
const loader = readFileSync(paths[1], "utf8");
const stylesheet = readFileSync("admin/messaging-moderation.css", "utf8");
const adminIndex = readFileSync("admin/index.html", "utf8");
const messagesPage = readFileSync("player-terminal/src/pages/messages-page.js", "utf8");
const backendRoutes = readFileSync("player-terminal/src/api/backend-routes.js", "utf8");
const messagingRoutes = readFileSync("player-terminal/src/api/messaging-backend-routes.js", "utf8");
const capabilityManifest = readFileSync("player-terminal/src/integrations/student-profile-capability-manifest.js", "utf8");

for (const client of [moderationClient, policyClient]) {
  assert.match(client, /cache:\s*"no-store"/);
  assert.match(client, /authorization:\s*`Bearer/);
  assert.doesNotMatch(client, /window\.fetch\s*=/);
}
assert.match(moderationClient, /x-idempotency-key/);
assert.match(moderationClient, /x-request-id/);
assert.doesNotMatch(moderationClient, /playerUuid|ownerUuid/);

assert.match(moderationSurface, /econovaria:admin-route-mounted/);
assert.match(moderationSurface, /data-message-create/);
assert.match(moderationSurface, /data-thread-action/);
assert.match(moderationSurface, /data-message-action/);
assert.doesNotMatch(moderationSurface, /MutationObserver\s*\(|window\.prompt|window\.fetch\s*=/);
assert.doesNotMatch(moderationSurface, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

assert.match(policySurface, /playerThreadsEnabled/);
assert.match(policySurface, /defaultRetentionDays/);
assert.match(policySurface, /Attachments are disabled/);
assert.match(loader, /messaging-moderation-surface\.js/);
assert.match(loader, /messaging-policy-surface\.js/);
assert.match(loader, /econovaria:admin-route-mounted/);
assert.match(loader, /mountReady\(\)/);
assert.doesNotMatch(loader, /DOMContentLoaded|MutationObserver|window\.fetch\s*=/);
assert.match(stylesheet, /@media \(max-width:620px\)/);
assert.match(stylesheet, /@media \(forced-colors:active\)/);
assert.doesNotMatch(stylesheet, /(^|})button:disabled/);
assert.match(adminIndex, /admin-overview-boot\.js" onload="void import\('\.\/messaging-moderation-loader\.js'\)"/);
assert.match(adminIndex, /shape-accurate-skeletons\.js" onload="void import\('\.\/shape-accurate-skeleton-lifecycle\.js'\).*game-lifecycle-controls\.js/);
assert.doesNotMatch(adminIndex, /game-lifecycle-controls\.js'\)\.then\(\(\) =&gt; import\('\.\/messaging-moderation-loader\.js'\)/);
assert.doesNotMatch(adminIndex, /<script[^>]+src=["']\.\/messaging-moderation-loader\.js["']/);
assert.doesNotMatch(adminIndex, /<link[^>]+messaging-moderation\.css/);

assert.match(messagesPage, /data-endpoint="messageThreadCreate"/);
assert.match(messagesPage, /data-endpoint="messageSend"/);
assert.match(messagesPage, /data-endpoint="messageRead"/);
assert.match(messagesPage, /maxlength="1000"/);
assert.match(messagesPage, /Attachments are disabled/);
assert.match(messagesPage, /escapeHtml\(message\.body\)/);

assert.match(backendRoutes, /resolveMessagingBackendRequest/);
assert.match(backendRoutes, /hasMessagingBackendRoute/);
assert.match(backendRoutes, /backend-routes-core/);
assert.match(backendRoutes, /crafting-backend-routes/);
assert.match(backendRoutes, /messaging-backend-routes/);
assert.match(backendRoutes, /hasCorePlayerBackendRoute/);
assert.match(backendRoutes, /hasCraftingBackendRoute/);
assert.match(messagingRoutes, /\/players\/me\/messages\/threads/);
assert.match(messagingRoutes, /recipientPlayerId/);
assert.match(messagingRoutes, /UUID\.test/);
assert.match(capabilityManifest, /messageThreadCreate/);
assert.match(capabilityManifest, /messagePolicy/);
assert.match(capabilityManifest, /messageSend/);
assert.match(capabilityManifest, /messageRead/);

console.log("Admin and Player Messaging source, privacy, capability, independent boot, and attachment-disablement contracts passed.");
