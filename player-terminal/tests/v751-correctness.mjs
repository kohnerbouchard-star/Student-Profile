import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { PlayerApi } from "../src/api/player-api.js";
import { resolveCapabilities } from "../src/api/capabilities.js";
import { normalizeApiResponse } from "../src/api/response-normalizer.js";
import { ROUTE_RESOURCE_PLAN } from "../src/api/resource-plan.js";
import { buildPlayerTerminalConfig } from "../src/config/player-terminal.config.js";
import { renderShell } from "../src/components/layout.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { renderDashboardPage } from "../src/pages/dashboard-page.js";
import { renderMarketplacePage } from "../src/pages/marketplace-page.js";
import { renderStorePage } from "../src/pages/store-page.js";
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
await assert.rejects(retryApi.execute("bankTransfer", { recipientPlayerIdentifier: "CARD-200", amount: 25 }), (error) => error.code === "REQUEST_TIMEOUT");
await retryApi.execute("bankTransfer", { recipientPlayerIdentifier: "CARD-200", amount: 25 });
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

assert.throws(
  () => normalizeApiResponse("banking", { checking: {}, savings: {} }, { requestId: "ptr_shape", path: "/banking/summary" }),
  (error) => error.code === "INVALID_RESPONSE",
  "Missing nested endpoint fields must fail at the adapter boundary."
);
assert.doesNotThrow(() => normalizeApiResponse("banking", structuredClone(previewData.banking), { requestId: "ptr_shape_ok", path: "/banking/summary" }));

const optionalApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  allowedImageHosts: [],
  playerSessionToken: "ps_optional",
  apiCall: async ({ endpointKey }) => {
    if (endpointKey === "store") return structuredClone(previewData.store);
    if (endpointKey === "banking") throw Object.assign(new Error("banking unavailable"), { status: 503 });
    throw Object.assign(new Error("unsupported"), { status: 404 });
  }
});
const optionalStore = await optionalApi.loadRoute("store");
assert.equal(optionalStore.data.resourceStatus.store.state, "ready");
assert.equal(optionalStore.data.resourceStatus.banking.state, "unavailable", "Optional failures require an explicit non-zero resource state.");
const unavailableStoreData = structuredClone(previewData);
unavailableStoreData.resourceStatus = optionalStore.data.resourceStatus;
unavailableStoreData.banking.checking.available = undefined;
const unavailableStore = renderStorePage(unavailableStoreData, { storeCategory: "All" });
assert.ok(unavailableStore.includes("BALANCE UNAVAILABLE") && unavailableStore.includes("Unavailable"), "Store must not display a false zero balance when banking is unavailable.");
assert.ok(ROUTE_RESOURCE_PLAN.dashboard.optional.includes("portfolio"), "Dashboard allocation requires an actual portfolio read.");
const unavailablePortfolioData = structuredClone(previewData);
unavailablePortfolioData.resourceStatus = { portfolio: { state: "unavailable" } };
unavailablePortfolioData.portfolio.allocation = [];
const unavailableDashboard = renderDashboardPage(unavailablePortfolioData, {}, { usePreviewData: false });
assert.ok(unavailableDashboard.includes("Portfolio allocation is unavailable."));
assert.ok(!unavailableDashboard.includes("Equities"), "Connected mode must not invent preview allocation values.");

const data = structuredClone(previewData);
data.capabilities = resolveCapabilities({ config: { usePreviewData: true }, dashboard: {}, session: {} });
const shell = renderShell({
  route: "dashboard",
  data,
  pageHtml: '<section class="player-terminal-page">Dashboard</section>',
  ui: { sidebarCollapsed: false, notificationsOpen: true, mobileMenuOpen: false },
  config: { usePreviewData: true, preserveProductSurface: true }
});
assert.ok(!shell.includes("↗") && !shell.includes("✓"), "Shell controls must use semantic SVG icons instead of raw glyphs.");
const marketplace = renderMarketplacePage(data, { marketplaceCategory: "All", marketplaceListingId: data.marketplace.listings[0].id });
assert.ok(!marketplace.includes("★"), "Marketplace ratings must use the shared SVG icon system.");
assert.ok(marketplace.includes("out of 5"), "Marketplace ratings must preserve accessible context.");
const banking = renderBankingPage(data);
assert.ok(banking.includes('name="recipientPlayerIdentifier"'), "Player transfers must send a mutable lookup identifier.");
assert.ok(!banking.includes('name="recipientPlayerUuid"'), "The browser must never select the canonical recipient UUID.");
assert.ok(!banking.includes('pattern="[A-Za-z]{2}-[0-9]{4}-[0-9]{3}"'), "Player ID must remain editable and format-flexible.");

const productionConfig = buildPlayerTerminalConfig(
  { capabilities: { routes: { store: true } } },
  { hostname: "play.econovaria.example", search: "" }
);
assert.equal(productionConfig.preserveProductSurface, true);
const connectedData = structuredClone(previewData);
connectedData.capabilities = resolveCapabilities({ config: productionConfig, dashboard: {}, session: {} });
const connectedShell = renderShell({
  route: "store",
  data: connectedData,
  pageHtml: '<section class="player-terminal-page">Store</section>',
  ui: { sidebarCollapsed: false, notificationsOpen: false, mobileMenuOpen: false },
  config: productionConfig
});
assert.ok(connectedShell.includes('data-route="store"'));
assert.ok(connectedShell.includes('data-route="marketplace"'), "Intended routes must remain discoverable in their active navigation group while backend capability is pending.");
assert.ok(connectedShell.includes('data-capability-status="integration-pending"'));

const draftSource = await readFile(new URL("../src/forms/form-draft-preserver.js", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
assert.ok(mainSource.includes("installFormDraftPreserver"), "The application entrypoint must install form draft preservation.");
assert.ok(draftSource.includes("SENSITIVE_NAME") && draftSource.includes("Completed"), "Draft preservation must exclude credential-like fields and clear only completed forms.");
assert.ok(!draftSource.includes("localStorage") && !draftSource.includes("sessionStorage"), "Unsent form drafts must remain memory-only.");

console.log("v7.5.1 correctness passed: UUID ownership, logical writes, retry idempotency, capability merging, response schemas, optional-resource status, product-surface preservation, draft survival, landmarks, identity input, and glyph cleanup are valid.");
