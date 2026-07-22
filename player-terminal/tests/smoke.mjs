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
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.craftItem, { recipeId: "recipe-1" }), "/crafting/jobs");
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.loanRepay, { loanId: "LN-8804" }), "/banking/loans/LN-8804/payments");
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.messageSend, { threadId: "thread-1" }), "/messages/threads/thread-1/messages");
assert.equal(resolveEndpoint(PLAYER_ENDPOINTS.progressionUnlock, { skillId: "skill-1" }), "/progression/skills/skill-1/unlock");

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
    assert.ok(html.includes('data-dashboard-action="open-business"'), "Dashboard should expose business navigation.");
    assert.ok(html.includes('data-dashboard-action="open-banking"'), "Dashboard should expose banking navigation.");
  }
}

const previewTransport = new PreviewTransport({ data: clone(previewData), simulateWrites: false });
await assert.rejects(
  previewTransport.request({ endpointKey: "storePurchase", payload: { itemId: "store-item-1" } }),
  ApiConnectionPendingError,
  "Preview transport should fail closed for unconfigured writes."
);

const adapterTransport = new AdapterTransport({ adapter: null });
await assert.rejects(
  adapterTransport.request({ endpointKey: "dashboard" }),
  ApiConnectionPendingError,
  "Adapter transport should fail closed before the live adapter is installed."
);

assert.deepEqual(
  normalizePlayerSessionHandoff({ gameCode: "eco-1", playerIdentifier: "player-1", accessCode: "secret" }),
  { gameCode: "ECO-1", playerIdentifier: "PLAYER-1", accessCode: "secret" },
  "Session handoff should normalize game and player identifiers without altering access codes."
);

console.log("Player Terminal smoke checks passed.");
