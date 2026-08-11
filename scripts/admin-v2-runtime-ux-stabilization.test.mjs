import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const shell = read("admin/v2/src/components/AdminShell.js");
const shellUx = read("admin/v2/src/shell-ux-enhancements.js");
const shellCss = read("admin/v2/styles/shell-ux.css");
const dom = read("admin/v2/src/components/dom.js");
const html = read("admin/v2.html");
const progressionEditor = read("admin/v2/src/routes/progression/ProgressionCorrectionEditor.js");
const progressionBackend = read("backend/supabase/functions/admin-api/progressionOperations.ts");
const messagingRateLimit = read("backend/src/security/staffMessagingRateLimitDispatch.ts");
const common = read("backend/supabase/functions/admin-api/common.ts");
const marketAssets = read("backend/supabase/functions/admin-api/marketAssetOperations.ts");
const adminApi = read("backend/supabase/functions/admin-api/index.ts");
const bff = read("api/_admin-bff-proxy.js");

test("Admin V2 top-left navigation is authoritative across viewports", () => {
  assert.match(shell, /MOBILE_NAVIGATION_QUERY/);
  assert.match(shell, /navigation\?\.setCollapsed\?\.|navigation\.setCollapsed|typeof navigation\?\.setCollapsed/);
  assert.match(shell, /data-admin-navigation-toggle/);
  assert.match(shell, /Collapse navigation/);
  assert.match(shell, /Expand navigation/);
  assert.match(shellCss, /\.admin-topbar__navigation-toggle\s*\{[\s\S]*?display:\s*inline-grid/);
  assert.match(shellCss, /\.admin-navigation__collapse\s*\{[\s\S]*?display:\s*none/);
});

test("share, notification, and administrator account actions are interactive", () => {
  assert.match(html, /v2\/styles\/shell-ux\.css/);
  assert.match(shellUx, /Share game access/);
  assert.match(shellUx, /Copy code/);
  assert.match(shellUx, /Copy player link/);
  assert.match(shellUx, /navigator\?\.clipboard|navigator\.clipboard/);
  assert.match(shellUx, /Notifications/);
  assert.match(shellUx, /Settings/);
  assert.match(shellUx, /Switch game/);
  assert.match(shellUx, /Sign out/);
  assert.match(shellUx, /EconovariaAdminAuthSession\?\.signOut/);
});

test("modal isolation remains compatible with strict style-src self CSP", () => {
  assert.match(html, /style-src 'self'/);
  assert.doesNotMatch(dom, /body\.style\.overflow|documentRef\.body\.style/);
  assert.match(dom, /admin-v2-modal-open/);
  assert.match(shellCss, /body\.admin-v2-modal-open\s*\{[\s\S]*?overflow:\s*hidden/);
});

test("Progression uses browser-safe scope validation and canonical mutation identity", () => {
  assert.match(progressionEditor, /pattern:\s*"\[A-Za-z0-9\]\[A-Za-z0-9\._:\\\\-\]\{0,159\}"/);
  const canonical = progressionBackend.indexOf('headers.get("idempotency-key")');
  const compatibility = progressionBackend.indexOf('headers.get("x-idempotency-key")');
  const requestId = progressionBackend.indexOf('headers.get("x-request-id")');
  assert.ok(canonical >= 0 && compatibility > canonical && requestId > compatibility);
});

test("staff messaging binds gateway client identity before rate limiting", () => {
  assert.match(messagingRateLimit, /bindGatewayTrustedClientIp/);
  assert.match(messagingRateLimit, /metadataRequest/);
  const bind = messagingRateLimit.indexOf("bindGatewayTrustedClientIp(");
  const readIp = messagingRateLimit.indexOf("readTrustedClientIp(\n    boundRequest");
  assert.ok(bind >= 0 && readIp > bind);
});

test("classroom proxy forwards the normalized trusted client IP without bypassing rate limits", () => {
  assert.match(common, /classroomTrustedClientIp/);
  assert.match(common, /ECONOVARIA_TRUSTED_CLIENT_IP_HEADER/);
  assert.match(common, /TRUSTED_IP_HEADERS/);
  assert.match(common, /bindGatewayTrustedClientIp/);
  assert.match(common, /readTrustedClientIp/);
  assert.match(common, /headers\.set\(trustedClient\.header, trustedClient\.value\)/);
  assert.doesNotMatch(common, /readPlayerRateLimitConfig/);
  assert.doesNotMatch(common, /rate.?limit.*(?:disable|bypass|skip)/i);
});

test("Market list projection stays below the BFF boundary by excluding chart history", () => {
  const selectBlock = marketAssets.match(/const MARKET_ASSET_SELECT = \[[\s\S]*?\]\.join\(","\);/)?.[0] || "";
  assert.ok(selectBlock);
  assert.doesNotMatch(selectBlock, /chart_history/);
  assert.match(selectBlock, /fundamentals/);
  assert.match(marketAssets, /suffix === "\/market\/assets"/);
  assert.match(adminApi, /handleMarketAssetReadOperation/);
  assert.match(adminApi, /marketAssetOperation[\s\S]*?handleGameRead/);
  assert.match(bff, /const MAX_BODY_BYTES = 1_048_576;/);
});
