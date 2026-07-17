import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { PlayerApi } from "../src/api/player-api.js";
import { resolveCapabilities } from "../src/api/capabilities.js";
import { renderShell } from "../src/components/layout.js";
import { renderMarketplacePage } from "../src/pages/marketplace-page.js";
import { previewData } from "../src/data/preview-data.js";

const writes = [];
const writeApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  allowedImageHosts: [],
  playerSessionToken: "ps_distinct",
  apiCall: async (context) => {
    writes.push(context);
    await delay(20);
    return { ok: true, accepted: context.payload.storeItemId };
  }
});

const firstPurchase = writeApi.execute("storePurchase", { storeItemId: "item-a", quantity: 1 });
const secondPurchase = writeApi.execute("storePurchase", { storeItemId: "item-b", quantity: 1 });
assert.notEqual(firstPurchase, secondPurchase, "Distinct payloads must remain distinct logical writes.");
await Promise.all([firstPurchase, secondPurchase]);
assert.deepEqual(writes.map((item) => item.payload.storeItemId).sort(), ["item-a", "item-b"]);
assert.notEqual(writes[0].idempotencyKey, writes[1].idempotencyKey, "Distinct logical writes require distinct idempotency keys.");

let attempts = 0;
const retryKeys = [];
const retryApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  allowedImageHosts: [],
  playerSessionToken: "ps_retry",
  apiCall: async (context) => {
    retryKeys.push(context.idempotencyKey);
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error("timeout"), { code: "REQUEST_TIMEOUT" });
    return { ok: true };
  }
});
await assert.rejects(retryApi.execute("bankTransfer", { recipientPlayerId: "CARD-200", amount: 25 }), (error) => error.code === "REQUEST_TIMEOUT");
await retryApi.execute("bankTransfer", { recipientPlayerId: "CARD-200", amount: 25 });
assert.equal(retryKeys[0], retryKeys[1], "An ambiguous retry must reuse its original idempotency key.");

const merged = resolveCapabilities({
  config: { usePreviewData: false, capabilities: { routes: { store: true } } },
  dashboard: { capabilities: { routes: { market: true }, actions: { marketOrder: true } } },
  session: { capabilities: { actions: { storePurchase: true } } }
});
assert.equal(merged.routes.store, true);
assert.equal(merged.routes.market, true, "Runtime capability declarations must not mask dashboard declarations.");
assert.equal(merged.actions.marketOrder, true);
assert.equal(merged.actions.storePurchase, true, "Dashboard declarations must not mask session declarations.");

const data = structuredClone(previewData);
data.capabilities = resolveCapabilities({ config: { usePreviewData: true }, dashboard: {}, session: {} });
const shell = renderShell({
  route: "dashboard",
  data,
  pageHtml: '<section class="player-terminal-page">Dashboard</section>',
  ui: { sidebarCollapsed: false, notificationsOpen: true, mobileMenuOpen: false },
  config: { usePreviewData: true }
});
assert.ok(!shell.includes("↗") && !shell.includes("✓"), "Shell controls must use semantic SVG icons instead of raw glyphs.");
const marketplace = renderMarketplacePage(data, { marketplaceCategory: "All", marketplaceListingId: data.marketplace.listings[0].id });
assert.ok(!marketplace.includes("★"), "Marketplace ratings must use the shared SVG icon system.");
assert.ok(marketplace.includes("out of 5"), "Marketplace ratings must preserve accessible context.");

console.log("v7.5.1 correctness passed: logical writes, retry idempotency, capability merging, landmarks, identity input, and glyph cleanup are valid.");
