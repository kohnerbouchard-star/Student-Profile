import assert from "node:assert/strict";
import { previewData } from "../src/data/preview-data.js";
import { PLAYER_ENDPOINTS, resolveEndpoint } from "../src/api/endpoints.js";
import { PreviewTransport } from "../src/api/preview-transport.js";
import { ApiConnectionPendingError } from "../src/api/errors.js";
import { AdapterTransport } from "../src/api/adapter-transport.js";
import { normalizePlayerSessionHandoff } from "../src/api/session-handoff.js";
import { ECONOVARIA_COUNTRY_REGIONS, ECONOVARIA_MAP_SIZE, countryRegionPath } from "../src/data/map-regions.js";

import { renderDashboardPage } from "../src/pages/dashboard-page.js";
import { renderNewsPage } from "../src/pages/news-page.js";
import { renderMarketPage } from "../src/pages/market-page.js";
import { renderPortfolioPage } from "../src/pages/portfolio-page.js";
import { renderBusinessPage } from "../src/pages/business-page.js";
import { renderContractsPage } from "../src/pages/contracts-page.js";
import { renderStorePage } from "../src/pages/store-page.js";
import { renderMarketplacePage } from "../src/pages/marketplace-page.js";
import { renderInventoryPage } from "../src/pages/inventory-page.js";
import { renderCraftingPage } from "../src/pages/crafting-page.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { renderLoansPage } from "../src/pages/loans-page.js";
import { renderMessagesPage } from "../src/pages/messages-page.js";
import { renderProgressionPage } from "../src/pages/progression-page.js";
import { renderProfilePage } from "../src/pages/profile-page.js";

const clone = (value) => structuredClone(value);

assert.equal(previewData.countries.length, 10, "World map should expose ten countries.");
assert.equal(ECONOVARIA_COUNTRY_REGIONS.length, 10, "Interactive map should expose ten clickable country regions.");
assert.deepEqual(ECONOVARIA_MAP_SIZE, { width: 1672, height: 941 }, "Interactive map coordinate space must match the map image.");
for (const region of ECONOVARIA_COUNTRY_REGIONS) {
  assert.ok(region.id && region.name, "Every country region requires identity metadata.");
  assert.ok(Array.isArray(region.polygons) && region.polygons.length > 0, `${region.name} requires polygon geometry.`);
  assert.ok(countryRegionPath(region.polygons).startsWith("M"), `${region.name} should compile to an SVG path.`);
}
assert.ok(previewData.news.items.length >= 5, "World intelligence should include multiple news events.");
assert.ok(previewData.market.assets.length >= 6, "Market preview should contain multiple assets.");
assert.ok(previewData.business.products.length >= 3, "Business preview should contain a compact product line.");
assert.ok(previewData.marketplace.listings.length >= 5, "Marketplace preview should contain listings.");
assert.ok(previewData.crafting.recipes.length >= 3, "Crafting preview should contain bounded recipes.");
assert.ok(previewData.loans.offers.length >= 3, "Loan preview should contain multiple offers.");
assert.ok(previewData.messages.threads.length >= 3, "Messaging preview should contain multiple thread types.");
assert.ok(previewData.progression.skills.length >= 3, "Progression preview should contain skill modules.");
assert.ok(previewData.contracts.items.some((item) => item.status === "Submitted"), "Submitted contracts are required.");
assert.ok(previewData.inventory.items.length > 0, "Inventory preview cannot be empty.");

assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.businessPrice, { productId: "prod-scanner" }), "/business/products/prod-scanner/pricing");
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.marketplacePurchase, { listingId: "listing-1" }), "/marketplace/listings/listing-1/purchase");
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.craftItem, { recipeId: "recipe-1" }), "/crafting/recipes/recipe-1/craft");
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.loanRepay, { loanId: "LN-8804" }), "/banking/loans/LN-8804/payments");
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.messageSend, { threadId: "thread-1" }), "/messages/threads/thread-1/messages");
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.progressionUnlock, { skillId: "skill-1" }), "/progression/skills/skill-1/unlock");
assert.throws(() => resolveEndpoint(PLAYER_ENDPOINTS.contractSubmit), /Missing endpoint parameter: contractId/);
assert.throws(() => resolveEndpoint(PLAYER_ENDPOINTS.country, { countryId: "" }), /Missing endpoint parameter: countryId/);

const ui = {
  newsCategory: "All",
  newsItemId: previewData.news.items[0].id,
  marketSector: "All",
  marketAssetId: previewData.market.assets[0].id,
  contractTab: "Available",
  storeCategory: "All",
  marketplaceCategory: "All",
  marketplaceListingId: "listing-1",
  inventoryCategory: "All",
  messageThreadId: "thread-1",
  loanOfferId: "loan-offer-1",
  craftingRecipeId: "recipe-1",
  progressionTab: "Overview"
};

const renderedPages = {
  dashboard: renderDashboardPage(previewData),
  news: renderNewsPage(previewData, ui),
  market: renderMarketPage(previewData, ui),
  portfolio: renderPortfolioPage(previewData),
  business: renderBusinessPage(previewData, ui),
  contracts: renderContractsPage(previewData, ui),
  store: renderStorePage(previewData, ui),
  marketplace: renderMarketplacePage(previewData, ui),
  inventory: renderInventoryPage(previewData, ui),
  crafting: renderCraftingPage(previewData, ui),
  banking: renderBankingPage(previewData),
  loans: renderLoansPage(previewData, ui),
  messages: renderMessagesPage(previewData, ui),
  progression: renderProgressionPage(previewData, ui),
  profile: renderProfilePage(previewData, { usePreviewData: true, apiBaseUrl: "/api/player", simulatePreviewWrites: false })
};

for (const [name, html] of Object.entries(renderedPages)) {
  assert.ok(html.includes("player-terminal-page"), `${name} should render a player page root.`);
  if (name === "dashboard") {
    assert.ok(html.includes("player-terminal-country-overlay"), "Dashboard should render the country-border overlay.");
    assert.ok(html.includes("player-terminal-map-instruction"), "Dashboard should render a compact non-blocking map instruction.");
    assert.ok(!html.includes("player-terminal-country-summary"), "Dashboard must not render the obsolete bottom map summary overlay.");
    assert.equal((html.match(/data-player-country=/g) || []).length, 11, "Dashboard should expose ten map regions plus the country-intelligence control.");
  }
  assert.ok(html.length > 900, `${name} rendered output is unexpectedly short.`);
  assert.ok(!/\bundefined\b/.test(html), `${name} rendered output contains an undefined value.`);
}

for (const progressionTab of ["Skills", "Achievements", "Licenses"]) {
  const html = renderProgressionPage(previewData, { ...ui, progressionTab });
  assert.ok(html.length > 1000 && !/\bundefined\b/.test(html), `Progression ${progressionTab} view should render cleanly.`);
}

const emptyCases = [];
{
  const data = clone(previewData);
  data.news.items = [];
  emptyCases.push(["news", renderNewsPage(data, ui), "No active intelligence"]);
}
{
  const data = clone(previewData);
  data.market.assets = [];
  emptyCases.push(["market", renderMarketPage(data, ui), "No assets are listed"]);
}
{
  const data = clone(previewData);
  data.portfolio.history = [];
  data.portfolio.allocation = [];
  data.portfolio.countryExposure = [];
  data.market.assets = data.market.assets.map((asset) => ({ ...asset, owned: 0 }));
  emptyCases.push(["portfolio", renderPortfolioPage(data), "No active positions"]);
}
{
  const data = clone(previewData);
  data.store.items = [];
  emptyCases.push(["store", renderStorePage(data, ui), "No store items available"]);
}
{
  const data = clone(previewData);
  data.inventory.items = [];
  emptyCases.push(["inventory", renderInventoryPage(data, ui), "No items in this category"]);
}
{
  const data = clone(previewData);
  data.banking.transactions = [];
  emptyCases.push(["banking", renderBankingPage(data), "No transactions yet"]);
}
{
  const data = clone(previewData);
  data.messages.threads = [];
  emptyCases.push(["messages", renderMessagesPage(data, ui), "No conversations yet"]);
}
{
  const data = clone(previewData);
  data.crafting.recipes = [];
  emptyCases.push(["crafting", renderCraftingPage(data, ui), "No recipes available"]);
}

for (const [name, html, expected] of emptyCases) {
  assert.ok(html.includes(expected), `${name} should render its empty-state copy.`);
  assert.ok(!/\bundefined\b/.test(html), `${name} empty state contains an undefined value.`);
}

const transport = new PreviewTransport();
for (const key of [
  "session", "dashboard", "countries", "news", "market", "portfolio", "business", "store",
  "marketplace", "contracts", "inventory", "crafting", "banking", "loans", "messages",
  "progression", "notifications"
]) {
  const value = await transport.request({ endpointKey: key, method: "GET", path: PLAYER_ENDPOINTS[key].path });
  assert.deepEqual(value, previewData[key]);
}

for (const request of [
  { endpointKey: "marketOrder", method: "POST", path: "/market/orders", payload: { assetId: "asset-1", quantity: 1 } },
  { endpointKey: "bankTransfer", method: "POST", path: "/banking/transfers", payload: { amount: 100 } },
  { endpointKey: "businessProduction", method: "POST", path: "/business/production-runs", payload: { quantity: 10 } },
  { endpointKey: "marketplacePurchase", method: "POST", path: "/marketplace/listings/listing-1/purchase", payload: { quantity: 1 } },
  { endpointKey: "craftItem", method: "POST", path: "/crafting/recipes/recipe-1/craft", payload: { quantity: 1 } },
  { endpointKey: "loanApply", method: "POST", path: "/banking/loans/applications/loan-offer-1", payload: { amount: 5000 } },
  { endpointKey: "messageSend", method: "POST", path: "/messages/threads/thread-1/messages", payload: { body: "Test" } },
  { endpointKey: "progressionUnlock", method: "POST", path: "/progression/skills/skill-1/unlock", payload: {} }
]) {
  await assert.rejects(transport.request(request), ApiConnectionPendingError);
}


const handoff = normalizePlayerSessionHandoff({ session: { token: "ps_test", gameSessionId: "game-1" } });
assert.equal(handoff.playerSessionToken, "ps_test");
assert.equal(handoff.gameSessionId, "game-1");

let adapterContext = null;
const adapter = new AdapterTransport(async (context) => {
  adapterContext = context;
  return { ok: true };
}, {
  playerSessionToken: "ps_test",
  gameSessionId: "game-1",
  playerSessionId: "session-1",
  accessToken: ""
});
await adapter.request({ endpointKey: "dashboard", method: "GET", path: "/dashboard" });
assert.equal(adapterContext.session.playerSessionToken, "ps_test");
assert.equal(adapterContext.session.gameSessionId, "game-1");
assert.equal(adapterContext.endpointKey, "dashboard");

console.log("Smoke test passed: v7.4 routes, read models, write boundaries, session handoff, generic API adapter, and interactive map contract are valid.");
