import assert from "node:assert/strict";
import { test } from "node:test";
import * as readModel from "../src/api/read-model.js";

// Characterized through the unchanged public API on main c59ed0af before extraction.
// These are compatibility assertions, not new normalization/product policy.
const { normalizeTerminalBootstrap, mergeTerminalRead } = readModel;
const session = { playerId: "public-player", gameSessionId: "public-game", currencyCode: "ECO" };
const seed = () => normalizeTerminalBootstrap(session, null);
const snapshot = (me = {}, market = {}) => ({ gameSession: { marketStatus: "open" }, me, public: { market } });
const boot = (me, market) => normalizeTerminalBootstrap(session, snapshot(me, market));
function siblings(before, after, changed) {
  assert.notStrictEqual(after, before);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const key of Object.keys(before)) {
    if (!changed.includes(key)) assert.strictEqual(after[key], before[key], key);
  }
}
function read(key, body, data = seed()) { return mergeTerminalRead(data, key, body); }
function date(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

test("read-model public exports remain exactly the bootstrap, context and aggregate merge functions", () => {
  assert.deepEqual(Object.keys(readModel).sort(), ["mergeTerminalRead", "normalizeTerminalBootstrap", "readSessionContext"]);
  assert.deepEqual([normalizeTerminalBootstrap.length, mergeTerminalRead.length, readModel.readSessionContext.length], [2, 3, 1]);
});

test("Market bootstrap joins holdings, news and sector order without mutating the snapshot", () => {
  const me = { stocks: { holdings: [{ stockAssetId: "a", quantity: "3", averageCost: "4" }] } };
  const market = {
    stocks: [{ assetId: "a", ticker: " A ", currentPrice: "12", previousClose: 10, changePct: 2, sector: "Tech", countryCode: "AB", currentVolatility: 4, longRunVolatility: 3 },
      { assetId: "b", sector: "All", currentPrice: 5, changePct: -1 }],
    news: [{ id: "n", scope: "ticker", targetKey: "A", headline: "News" }]
  };
  const before = structuredClone({ me, market });
  const data = boot(me, market), asset = data.market.assets[0];
  assert.equal(data.market.status, "OPEN");
  assert.equal(data.market.selectedAssetId, "a");
  assert.deepEqual(data.market.sectors, ["All", "Tech", "All"]);
  assert.deepEqual([asset.owned, asset.averageCost, asset.risk, asset.outlook, asset.countryId], [3, 4, "High", "Positive", "ab"]);
  assert.deepEqual(asset.history, [10, 12]);
  assert.deepEqual(asset.newsIds, ["n"]);
  assert.deepEqual(data.dashboard.marketPulse, [{ symbol: "A", price: 12, change: 2 }, { symbol: "—", price: 5, change: -1 }]);
  assert.deepEqual({ me, market }, before);
});

test("Market reads preserve local details, selected ID and history tail while replacing the asset list", () => {
  const data = boot({}, { stocks: [{ assetId: "a", currentPrice: 1 }, { assetId: "b", currentPrice: 2 }] });
  Object.assign(data.market.assets[1], { history: [1, 2, 3, 4], watchlisted: true, owned: 7, averageCost: 6, pe: 8, yield: 9, newsIds: ["old"], description: "Existing" });
  data.market.selectedAssetId = "b";
  const pagination = { cursor: "opaque" };
  const next = read("market", { assets: [{ assetId: "b", currentPrice: 12, sector: "Tech" }], pagination, tickIndex: "4" }, data);
  assert.deepEqual(next.market.assets[0].history, [1, 2, 3, 12]);
  assert.deepEqual([next.market.assets[0].watchlisted, next.market.assets[0].owned, next.market.assets[0].averageCost, next.market.assets[0].pe, next.market.assets[0].yield], [true, 7, 6, 8, 9]);
  assert.deepEqual(next.market.assets[0].newsIds, ["old"]);
  assert.equal(next.market.assets[0].description, "Existing");
  assert.strictEqual(next.market.pagination, pagination);
  assert.equal(next.market.selectedAssetId, "b");
  assert.equal(next.market.tickIndex, 4);
  siblings(data, next, ["market", "dashboard"]);
  assert.deepEqual(data.market.assets[1].history, [1, 2, 3, 4]);
  const removed = read("market", { assets: [{ assetId: "c", isWatchlisted: false }] }, next);
  assert.equal(removed.market.selectedAssetId, "c");
  assert.equal(read("market", {}, removed).market.selectedAssetId, "");
});

test("Market detail uses finite server history, retains sibling assets and refuses unknown IDs", () => {
  const data = boot({}, { stocks: [{ assetId: "a", currentPrice: 5 }, { assetId: "b" }] });
  data.market.tickIndex = 9;
  const missing = read("marketAsset", { asset: { assetId: "missing" } }, data);
  assert.strictEqual(missing.market, data.market);
  const next = read("marketAsset", { asset: { assetId: "a", currentPrice: 7, commonEquity: {} }, history: [{ price: "4" }, { price: "bad" }, { price: null }] }, data);
  assert.deepEqual(next.market.assets[0].history, [4, 0]);
  assert.equal(next.market.assets[0].pe, 0);
  assert.equal(next.market.assets[0].yield, 0);
  assert.equal(next.market.tickIndex, 9);
  assert.strictEqual(next.market.assets[1], data.market.assets[1]);
  siblings(data, next, ["market"]);
});

test("Market watchlist merge changes only the matching asset", () => {
  const data = boot({}, { stocks: [{ assetId: "a" }, { assetId: "b" }] });
  const next = read("marketWatchlist", { assetId: "a", isWatchlisted: true }, data);
  assert.equal(next.market.assets[0].watchlisted, true);
  assert.equal(data.market.assets[0].watchlisted, false);
  assert.strictEqual(next.market.assets[1], data.market.assets[1]);
  siblings(data, next, ["market"]);
});

test("Banking chooses the session currency and keeps posted, held and available amounts distinct", () => {
  const data = seed();
  const next = read("banking", { currentBalances: [
    { accountKind: "checking", currencyCode: "USD", postedAmount: 900 },
    { accountType: " Checking ", accountKey: "local", currencyCode: " eco ", balance: "10.75", held: "2.25" },
    { accountKind: "savings", currencyCode: "ECO", postedAmount: "20", heldAmount: -3, availableAmount: "19" }
  ] }, data);
  assert.deepEqual([next.banking.checking.accountId, next.banking.checking.balance, next.banking.checking.pending, next.banking.checking.available], ["local", 10.75, 2.25, 8.5]);
  assert.deepEqual([next.banking.savings.balance, next.banking.savings.heldAmount, next.banking.savings.available], [20, 0, 19]);
  assert.deepEqual([next.dashboard.liquidBalance, next.dashboard.savingsBalance], [10.75, 20]);
  assert.equal(next.banking.balances.length, 3);
  assert.equal(next.banking.transfersConfigured, false);
  siblings(data, next, ["banking", "dashboard"]);
});

test("Banking absent local balances are unavailable rather than fabricated zeros", () => {
  const next = read("banking", { currentBalances: [{ accountKind: "checking", currencyCode: "USD", postedAmount: 900 }] });
  assert.equal(next.banking.checking.configured, false);
  assert.equal(next.banking.checking.accountId, "NOT CONFIGURED");
  assert.equal(next.banking.checking.balance, null);
  assert.equal(next.dashboard.liquidBalance, null);
  assert.equal(next.dashboard.savingsBalance, null);
});

test("Banking cursor appends and deduplicates with incoming values winning in original key order", () => {
  const first = read("banking", { ledgerEntries: [{ entryKey: "a", amount: 2, entryType: "credit" }, { entryKey: "b", amount: 1 }] });
  const next = read("banking", { pagination: { cursor: " next ", nextCursor: " end ", hasMore: true, limit: "2" }, ledgerEntries: [
    { entryKey: "b", amount: "4", entryType: "debit", sourceAction: "store_sale-payout", sourceDomain: "Store", currencyCode: "ECO", createdAt: "invalid" },
    { entryKey: "c", amount: -3, entryType: "credit" }
  ] }, first);
  assert.deepEqual(next.banking.transactions.map(({ id, amount }) => [id, amount]), [["a", 2], ["b", -4], ["c", 3]]);
  assert.equal(next.banking.transactions[1].description, "Store Sale Payout");
  assert.equal(next.banking.transactions[1].date, "Recorded");
  assert.strictEqual(next.banking.transactions[0], first.banking.transactions[0]);
  assert.deepEqual(next.banking.pagination, { cursor: "next", nextCursor: "end", hasMore: true, limit: 2 });
  assert.deepEqual(read("banking", { ledgerEntries: [] }, next).banking.transactions, []);
});

test("Banking freshness preserves explicit stale and the exact expiration boundary", () => {
  const original = Date.now;
  try {
    Date.now = () => Date.parse("2026-01-01T00:00:00Z");
    for (const [body, expected] of [
      [{ staleAt: "2025-12-31T23:59:59Z" }, true], [{ staleAt: "2026-01-01T00:00:00Z" }, true],
      [{ staleAt: "2026-01-01T00:00:01Z" }, false], [{ staleAt: "invalid" }, false], [{ stale: true }, true]
    ]) assert.equal(read("banking", body).banking.stale, expected);
  } finally { Date.now = original; }
});

const seededItem = { itemKey: "market-lens", id: "store", name: "Seeded", category: "Equipment", price: 25, currencyCode: "eco", image: "seed.svg" };
function offer(overrides = {}) {
  return { offerKey: "offer", sellerPartyKey: "seller", sellerKind: "business", unitPrice: 4, currencyCode: "eco", availableQuantity: 3.9, purchasable: true, ...overrides };
}
test("Store products join seeded metadata and inventory without duplicating catalog entries", () => {
  const me = { store: {
    listings: [seededItem, { itemKey: "orphan", name: "Orphan", category: "Materials", price: 8 }],
    products: [{ storeItemKey: "market-lens", catalogItemKey: "catalog", name: " Product ", offers: [offer(), offer({ offerKey: "second", unitPrice: 2, availableQuantity: 2 })] }],
    inventory: [{ catalogItemKey: "catalog", quantity: "5" }]
  } };
  const before = structuredClone(me), result = boot(me).store;
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.categories, ["All", "Equipment", "Materials"]);
  const product = result.items[0];
  assert.deepEqual([product.name, product.image, product.owned, product.stock, product.price, product.bestOfferKey, product.sellerCount], ["Product", "seed.svg", 5, 5, 2, "second", 1]);
  assert.deepEqual([product.offers[0].sellerName, product.offers[0].version, product.offers[0].currencyCode], ["Player Business", 1, "ECO"]);
  assert.deepEqual([result.items[1].stock, result.items[1].bestUnitPrice, result.items[1].offerCount], [0, null, 0]);
  assert.deepEqual(me, before);
});

test("Store excludes unavailable offers and does not compare prices across currencies", () => {
  const result = read("store", { items: [seededItem], products: [{ storeItemKey: "market-lens", offers: [
    offer(), offer({ offerKey: "foreign", currencyCode: "USD", unitPrice: 1 }),
    offer({ offerKey: "inactive", status: "inactive", unitPrice: 0 }), offer({ offerKey: "blocked", purchasable: false }),
    offer({ offerKey: "empty", availableQuantity: 0 })
  ] }] }).store.items[0];
  assert.deepEqual([result.stock, result.bestOfferKey, result.bestUnitPrice, result.price, result.offerCount], [6, null, null, 25, 5]);
});

test("Store endpoint keeps current inventory ownership and unrelated models", () => {
  const data = seed();
  data.inventory.items = [{ id: "holding", storeItemId: "market-lens", name: "Lens", quantity: 4, state: "Reserved" }];
  const next = read("store", { items: [seededItem] }, data);
  assert.equal(next.store.items[0].owned, 4);
  assert.equal(next.store.items[0].image, "seed.svg");
  siblings(data, next, ["store"]);
});

test("Inventory bootstrap preserves catalog joins, value and category artwork", () => {
  const result = boot({ store: {
    listings: [{ id: "item", itemKey: "market-lens", price: 4, name: "Catalog", category: "Equipment" }],
    inventory: [{ inventoryId: "holding", itemId: "item", quantityOwned: 3, quantityReserved: 1 }]
  } });
  assert.deepEqual(result.inventory.items[0], {
    id: "holding", storeItemId: "item", name: "Catalog", category: "Equipment", quantity: 3, value: 12,
    state: "Reserved", image: "./assets/store-items/market-lens.svg", description: "Inventory item", availableActions: []
  });
  assert.equal(result.dashboard.inventoryValue, 12);
});

test("Inventory reads retain capacity and action identities, authoritative totals and supplied categories", () => {
  const capacity = { used: "2", max: "10", extra: true }, actions = ["inventory.redeem"], categories = ["Custom"], summary = { value: 9 };
  const data = seed();
  const next = read("inventory", { capacity, categories, summary, items: [{ id: "i", storeItemId: "s", category: "Materials", quantityOwned: "3", quantityReserved: 1, quantityAvailable: 2, totalOwnedValue: "9", unitValue: "3", availableActions: actions }] }, data);
  assert.strictEqual(next.inventory.capacity, capacity);
  assert.strictEqual(next.inventory.categories, categories);
  assert.strictEqual(next.inventory.summary, summary);
  assert.strictEqual(next.inventory.items[0].availableActions, actions);
  assert.deepEqual([next.inventory.capacityUsed, next.inventory.capacityMax, next.inventory.items[0].value], [2, 10, 9]);
  assert.equal(next.inventory.items[0].image, "./assets/store-items/store-item-material.svg");
  assert.deepEqual(read("inventory", { items: [{}] }).inventory.categories, ["All", "Other"]);
  siblings(data, next, ["inventory"]);
});

test("Contracts lifecycle aliases preserve progress and timeline semantics", () => {
  for (const [status, expected, percent] of [
    ["completed", "Completed", 100], ["approved", "Completed", 100], ["rewarded", "Completed", 100],
    ["submitted", "Submitted", 100], ["active", "Active", 25], ["accepted", "Active", 25], ["in_progress", "Active", 25],
    ["unknown", "Available", 0], ["", "Available", 0]
  ]) {
    const item = read("contracts", { contracts: [{ contractId: "c" }], progress: [{ contractId: "c", status }] }).contracts.items[0];
    assert.deepEqual([item.status, item.progress], [expected, percent]);
    assert.deepEqual(item.timeline.map((step) => step.complete), [true, expected !== "Available", ["Submitted", "Completed"].includes(expected), expected === "Completed"]);
  }
});

test("Contracts preserve reward precedence, requirement shapes and submission metadata", () => {
  const timestamp = "2026-01-02T03:04:00Z", data = seed();
  for (const requirementsPayload of [[" one ", "", 2], { items: ["one"] }, { requirements: ["one"] }, { submissionRequirements: ["one"] }]) {
    const next = read("contracts", { contracts: [{ contractId: "c", title: " Test ", deadlineAt: timestamp, publishedAt: timestamp,
      rewardPayload: { cashAmount: 0, amount: 99, cash: { amount: 100 }, xp: 3 }, targetingPayload: { countryCodes: ["AB", "CD"] }, requirementsPayload }],
      progress: [{ contractId: "c", status: "submitted", submittedAt: timestamp, evidencePayload: { submissionUrl: " https://example.test/work ", note: " note " } }] }, data);
    const item = next.contracts.items[0];
    assert.deepEqual([item.title, item.rewardCash, item.rewardXp, item.location, item.due, item.urgency], ["Test", 0, 3, "AB, CD", date(timestamp), "medium"]);
    assert.deepEqual(item.requirements, ["one"]);
    assert.deepEqual(item.submission, { time: date(timestamp), url: "https://example.test/work", note: "note" });
    siblings(data, next, ["contracts"]);
  }
});

test("Portfolio keeps zero/null coercion, allocation and repeated-country exposure", () => {
  const data = seed();
  const next = read("portfolio", { summary: { totalEquity: 100, holdingsMarketValue: 60, cashBalance: 40, unrealizedPnl: 7, realizedPnl: -2, totalCostBasis: 25 }, holdings: [
    { countryCode: "AB", marketValue: 20 }, { countryCode: "ab", marketValue: 25 }, { marketValue: 15 }
  ] }, data);
  assert.deepEqual([next.portfolio.netWorth, next.portfolio.totalGain, next.portfolio.totalGainPercent], [100, 5, 20]);
  assert.deepEqual(next.portfolio.countryExposure, [{ countryId: "ab", value: 45, percent: 75 }, { countryId: "unknown", value: 15, percent: 25 }]);
  assert.deepEqual(next.portfolio.allocation.map(({ id, value, percent }) => [id, value, percent]), [["cash", 40, 40], ["equities", 60, 60]]);
  assert.deepEqual(next.portfolio.history, [100, 100]);
  siblings(data, next, ["portfolio"]);
  const empty = read("portfolio", { summary: { totalEquity: null, holdingsMarketValue: 0, totalCostBasis: 0 }, cash: { balance: 30 } }).portfolio;
  assert.deepEqual([empty.netWorth, empty.totalGainPercent, empty.history], [0, 0, []]);
});

test("All extracted endpoint reads keep the caller and input payload untouched", () => {
  for (const key of ["market", "marketAsset", "marketWatchlist", "store", "inventory", "banking", "contracts", "portfolio"]) {
    const data = seed(), body = {}, before = structuredClone(data);
    const next = read(key, body, data);
    assert.deepEqual(data, before, key);
    assert.deepEqual(body, {}, key);
    assert.notStrictEqual(next, data, key);
  }
  const data = seed();
  siblings(data, read("unknown", { ignored: true }, data), []);
});

test("Invalid outer responses keep existing empty semantics across feature reads", () => {
  for (const key of ["market", "marketAsset", "marketWatchlist", "store", "inventory", "banking", "contracts", "portfolio"]) {
    for (const body of [null, undefined, [], false, 7, "text"]) assert.deepEqual(read(key, body), read(key, {}), key);
  }
});

test("Malformed inner entries retain failures instead of silently dropping source data", () => {
  for (const [key, body] of [["market", { assets: [null] }], ["store", { items: [null] }],
    ["inventory", { items: [null] }], ["contracts", { contracts: [null] }],
    ["portfolio", { holdings: [null] }], ["banking", { ledgerEntries: [null] }]]) {
    assert.throws(() => read(key, body), TypeError, key);
  }
});
