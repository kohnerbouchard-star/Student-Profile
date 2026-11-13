import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlayerTerminal } from "../src/app.js";
import { abortPlayerApiSessionRequests } from "../src/api/player-api.js";
import { PLAYER_ACTION_CAPABILITIES } from "../src/api/capabilities.js";
import { ROUTES } from "../src/core/router.js";
import { previewData } from "../src/data/preview-data.js";

// Real terminal, store, renderer, lifecycle and transport adapter. This small DOM
// boundary makes delegated events awaitable without extracting private handlers.
class Element {
  innerHTML = ""; childNodes = []; dataset = {}; attributes = new Map();
  listeners = new Map(); selectors = new Map(); matchesSet = new Set(); disabled = false;
  classes = new Set(); textContent = ""; hidden = false;
  classList = { add: (...values) => values.forEach((v) => this.classes.add(v)), remove: (...values) => values.forEach((v) => this.classes.delete(v)) };
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  querySelector(key) { return this.selectors.get(key) ?? null; }
  querySelectorAll(key) { return this.selectors.get(key) ?? []; }
  closest(key) { return this.matchesSet.has(key) ? this : this.selectors.get(`closest:${key}`) ?? null; }
  matches(key) { return this.matchesSet.has(key); }
  append(...nodes) { this.childNodes.push(...nodes); nodes.forEach((node) => { node.parent = this; }); }
  prepend(node) { this.childNodes.unshift(node); node.parent = this; }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  remove() { if (this.parent) this.parent.childNodes = this.parent.childNodes.filter((node) => node !== this); }
  focus() { document.activeElement = this; }
  addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((f) => f !== fn)); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); return true; }
  async emit(type, target, detail = {}) { const event = { type, target, prevented: false, preventDefault() { this.prevented = true; }, ...detail }; for (const fn of this.listeners.get(type) || []) await fn(event); return event; }
}
class Field extends Element {
  constructor(name, value) { super(); this.name = name; this.value = String(value); }
  validationMessage = "";
  setCustomValidity(message) { this.validationMessage = message; }
}
function formFor(endpoint, values = {}, dataset = {}) {
  const form = new Element(); form.dataset = { playerForm: endpoint, endpoint, ...dataset }; form.matchesSet.add("[data-player-form]");
  form.elements = Object.entries(values).map(([name, value]) => new Field(name, value));
  form.elements.namedItem = (name) => form.elements.find((field) => field.name === name) ?? null;
  form.elements.forEach((field) => { field.matchesSet.add("input, select, textarea"); field.selectors.set("closest:[data-player-form]", form); });
  const button = new Element(); button.childNodes = [{ textContent: "Submit" }]; form.selectors.set('button[type="submit"]', button);
  form.checkValidity = () => !form.elements.some((field) => field.validationMessage);
  form.querySelector = (selector) => selector === ":invalid" ? form.elements.find((field) => field.validationMessage) : selector === "[data-player-form-error]" ? form.childNodes.find((child) => child.dataset?.playerFormError) : form.selectors.get(selector) ?? null;
  return form;
}
function targetFor(dataset, selectors = []) {
  const target = new Element(); target.dataset = dataset;
  for (const [key, value] of Object.entries(dataset)) target.setAttribute(`data-${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`, value);
  target.matchesSet.add("button, a, summary, input, select, textarea");
  if (dataset.playerLocalAction === "toggle-notifications") target.matchesSet.add('[data-player-notification-drawer], [data-player-local-action="toggle-notifications"]');
  for (const key of Object.keys(dataset)) target.matchesSet.add(`[data-${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}]`);
  selectors.forEach((selector) => target.matchesSet.add(selector));
  return target;
}
const tick = () => new Promise(setImmediate);
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } assert.fail("Terminal did not settle"); }
async function fixture(t, { routes = {}, actions = {}, bankBalance } = {}) {
  const keys = ["HTMLElement", "HTMLButtonElement", "document", "location", "CSS", "navigator", "localStorage", "FormData", "CustomEvent", "HashChangeEvent", "addEventListener", "removeEventListener", "dispatchEvent", "requestAnimationFrame", "cancelAnimationFrame", "setInterval", "clearInterval", "ECONOVARIA_PLAYER_SESSION", "Econovaria"];
  const saved = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = new Element(), mount = new Element(), storage = new Map(), requests = [], calls = [], clipboard = [], frames = new Map(); let frameId = 0, clipboardFails = false;
  const globals = {
    HTMLElement: Element, HTMLButtonElement: Element, document: { title: "", activeElement: null, createElement: () => new Element() }, CSS: { escape: (value) => value },
    location: { hash: "#inventory", search: "", hostname: "localhost" }, navigator: { clipboard: { async writeText(value) { if (clipboardFails) throw Error("clipboard unavailable"); clipboard.push(value); } } },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    FormData: class { constructor(form) { this.form = form; } entries() { return this.form.elements.map((field) => [field.name, field.value])[Symbol.iterator](); } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }, HashChangeEvent: class { constructor(type) { this.type = type; } },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); },
    setInterval() { return 0; }, clearInterval() {}, ECONOVARIA_PLAYER_SESSION: undefined, Econovaria: undefined,
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const config = {
    usePreviewData: false, authenticated: true, csrfToken: "C".repeat(43), gameSessionId: "fixture-game", playerSessionId: "fixture-player", requestTimeoutMs: 5000, writeCooldownMs: 0, allowedImageHosts: [],
    capabilities: { routes: { ...Object.fromEntries(ROUTES.map((key) => [key, true])), ...routes }, actions: { ...Object.fromEntries(PLAYER_ACTION_CAPABILITIES.map((key) => [key, true])), ...actions } },
    sessionReadyEvent: "fixture:ready", sessionRequiredEvent: "fixture:required", sessionInvalidEvent: "fixture:invalid", logoutRequestedEvent: "fixture:logout",
    apiCall: async (context) => {
      calls.push(context);
      const value = structuredClone(previewData[context.endpointKey]);
      if (context.endpointKey === "banking" && bankBalance !== undefined) value.checking.available = bankBalance;
      return context.method === "GET" ? value : { ok: true };
    },
  };
  mount.addEventListener("econovaria:player-api-request", (event) => requests.push(event.detail));
  const terminal = createPlayerTerminal({ mount, config }); let destroyed = false;
  const destroy = () => { if (!destroyed) { terminal.destroy(); destroyed = true; } };
  t.after(() => { destroy(); abortPlayerApiSessionRequests(config); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  await until(() => terminal.getState().status === "ready" && terminal.getState().routeLoading.inventory === false);
  await terminal.refreshResources(["countries", "news", "market", "contracts", "marketplace", "banking", "inventory", "notifications"]);
  return { terminal, mount, config, storage, requests, calls, clipboard, frames, events, destroy, state: terminal.getState,
    click: (dataset, selectors) => mount.emit("click", targetFor(dataset, selectors)), submit: (form) => mount.emit("submit", form),
    clipboardFails(value) { clipboardFails = value; }, toast: () => mount.childNodes.at(-1)?.textContent };
}

test("repeated sidebar clicks persist and reverse the UI state", async (t) => {
  const f = await fixture(t); const before = f.state().ui.sidebarCollapsed;
  await f.click({ playerLocalAction: "toggle-sidebar" }); assert.equal(f.state().ui.sidebarCollapsed, !before); assert.equal(f.storage.get("econovaria.player.sidebarCollapsed"), String(!before));
  await f.click({ playerLocalAction: "toggle-sidebar" }); assert.equal(f.state().ui.sidebarCollapsed, before);
});
test("notifications/mobile toggles are exclusive, repeated clicks close, and modal close restores state", async (t) => {
  const f = await fixture(t);
  await f.click({ playerLocalAction: "toggle-notifications" }); assert.equal(f.state().ui.notificationsOpen, true);
  await f.click({ playerLocalAction: "toggle-mobile-menu" }); assert.equal(f.state().ui.notificationsOpen, false); assert.equal(f.state().ui.mobileMenuOpen, true);
  await f.click({ playerLocalAction: "toggle-mobile-menu" }); assert.equal(f.state().ui.mobileMenuOpen, false);
  await f.click({ playerLocalAction: "toggle-notifications" }); await f.click({ playerLocalAction: "toggle-notifications" }); assert.equal(f.state().ui.notificationsOpen, false);
  f.terminal.openModal({ type: "connection" }); await f.click({ playerLocalAction: "close-modal" }); assert.equal(f.state().modal, null);
});
test("route dispatch precedes local action and closes overlays; disabled route is rejected", async (t) => {
  const f = await fixture(t, { routes: { market: false } });
  await f.click({ playerLocalAction: "toggle-mobile-menu" });
  await f.click({ route: "market", playerLocalAction: "toggle-sidebar" }); assert.equal(location.hash, "#inventory"); assert.equal(f.state().ui.mobileMenuOpen, true); assert.equal(f.state().ui.sidebarCollapsed, false); assert.match(f.toast(), /not enabled/);
  await f.click({ route: "news", playerLocalAction: "toggle-sidebar" }); assert.equal(location.hash, "news"); assert.equal(f.state().ui.mobileMenuOpen, false); assert.equal(f.state().ui.sidebarCollapsed, false);
});
test("story backdrop dispatches its acknowledgement contract without dismissing; ordinary backdrop closes", async (t) => {
  const f = await fixture(t); const close = []; f.mount.addEventListener("econovaria:player-story-close-request", (e) => close.push(e.detail));
  f.terminal.openModal({ type: "storyCutscene", delivery: { deliveryId: "delivery-fixture", requiresAcknowledgement: true } });
  await f.click({}, ["[data-player-modal-backdrop]"]); assert.deepEqual(close, [{ deliveryId: "delivery-fixture", requiresAcknowledgement: true }]); assert.equal(f.state().modal.type, "storyCutscene");
  f.terminal.openModal({ type: "connection" }); await f.click({}, ["[data-player-modal-backdrop]"]); assert.equal(f.state().modal, null);
});
test("outside click closes notifications while a drawer click leaves it open", async (t) => {
  const f = await fixture(t); await f.click({ playerLocalAction: "toggle-notifications" });
  await f.click({}, ['[data-player-notification-drawer], [data-player-local-action="toggle-notifications"]']); assert.equal(f.state().ui.notificationsOpen, true);
  await f.click({}); assert.equal(f.state().ui.notificationsOpen, false);
});
for (const [key, value, patch, route] of [
  ["playerNewsCategory", "Economy", { newsCategory: "Economy", newsId: "" }], ["playerNewsSelect", "news-2", { newsId: "news-2" }],
  ["playerNewsLink", "news-3", { newsId: "news-3", newsCategory: "All" }, "news"], ["playerMarketLink", "nova", { marketAssetId: "nova" }, "market"],
  ["playerMarketSelect", "test-asset", { marketAssetId: "test-asset" }], ["playerMarketSector", "Energy", { marketSector: "Energy" }],
  ["playerStoreCategory", "Tools", { storeCategory: "Tools" }], ["playerContractTab", "Completed", { contractTab: "Completed", contractId: "" }],
  ["playerContractSelect", "contract-2", { contractId: "contract-2" }], ["playerInventoryCategory", "Tools", { inventoryCategory: "Tools" }],
  ["playerMarketplaceCategory", "Equipment", { marketplaceCategory: "Equipment", marketplaceListingId: "" }], ["playerMarketplaceSelect", "listing-2", { marketplaceListingId: "listing-2" }],
  ["playerMessageThread", "thread-2", { messageThreadId: "thread-2" }], ["playerLoanOffer", "offer-2", { loanOfferId: "offer-2" }],
  ["playerCraftingRecipe", "recipe-2", { craftingRecipeId: "recipe-2" }], ["playerProgressionTab", "Skills", { progressionTab: "Skills" }],
]) test(`public click updates ${key}${route ? " and navigates" : ""}`, async (t) => {
  const f = await fixture(t); await f.click({ [key]: value }); for (const [name, expected] of Object.entries(patch)) assert.equal(f.state().ui[name], expected); if (route) assert.equal(location.hash, route);
});
test("country click resolves related records and unknown country is a no-op", async (t) => {
  const f = await fixture(t); const data = f.state().data, country = data.countries[0];
  await f.click({ playerCountry: country.id }); assert.deepEqual(f.state().modal, { type: "country", country, relatedAssets: data.market.assets.filter((asset) => country.relatedAssetIds?.includes(asset.id)), relatedNews: data.news.items.filter((item) => country.eventIds?.includes(item.id)), relatedContracts: data.contracts.items.filter((item) => item.location === country.name || item.location === "All Nations").slice(0, 3) });
  const modal = f.state().modal; await f.click({ playerCountry: "missing" }); assert.strictEqual(f.state().modal, modal);
});
test("copy game code prefers the closest code and reports clipboard denial without throwing", async (t) => {
  const f = await fixture(t); const target = targetFor({ playerLocalAction: "copy-game-code" }); const code = new Element(); code.dataset.gameCode = "LOCAL-CODE"; target.selectors.set("closest:[data-game-code]", code);
  await f.mount.emit("click", target); assert.deepEqual(f.clipboard, ["LOCAL-CODE"]); assert.equal(f.toast(), "Game code LOCAL-CODE copied.");
  f.clipboardFails(true); await f.click({ playerLocalAction: "copy-game-code" }); assert.equal(f.toast(), `Game code: ${f.state().data.session.gameCode}. Clipboard access is unavailable.`);
});
for (const [action, message] of [["download-transactions", "Transaction export"], ["market-search", "Market search"], ["message-search", "Message search"], ["message-attachment", "Message attachments"], ["chart-range", "1Y chart history"]]) test(`local ${action} reports fallback without mutation`, async (t) => {
  const f = await fixture(t); await f.click({ playerLocalAction: action, range: "1Y" }); assert.equal(f.toast(), `${message} is not available in this game.`.replace("attachments is", "attachments are")); assert.deepEqual(f.requests, []);
});
for (const [key, endpoint, params, payload] of [
  ["playerMarketplaceCancel", "marketplaceCancel", { listingId: "fixture-id" }, "game"], ["playerSkillUnlock", "progressionUnlock", { skillId: "fixture-id" }, {}],
  ["playerRewardClaim", "progressionClaim", { rewardId: "fixture-id" }, {}], ["playerMarketWatchlist", "marketWatchlist", { assetId: "fixture-id" }, { enabled: true }],
  ["playerPurchase", "storePurchase", {}, { storeItemId: "fixture-id", quantity: 1 }], ["playerContractAccept", "contractAccept", { contractId: "fixture-id" }, {}],
  ["playerInventoryUse", "inventoryUse", { inventoryItemId: "fixture-id" }, { quantity: 1 }],
]) test(`public click dispatches ${endpoint} with retained params and normalized payload`, async (t) => {
  const f = await fixture(t); await f.click({ [key]: "fixture-id" }); assert.equal(f.requests.length, 1); const request = f.requests[0]; assert.equal(request.endpointKey, endpoint); assert.deepEqual(request.params, params);
  const expected = ["progressionUnlock", "progressionClaim", "contractAccept"].includes(endpoint) ? {} : { ...(typeof payload === "object" ? payload : {}), gameSessionId: previewData.session.gameSessionId }; assert.deepEqual(request.payload, expected);
});
test("disabled mutation produces a notice and no request; watchlisted toggle sends false", async (t) => {
  const f = await fixture(t, { actions: { storePurchase: false } }); await f.click({ playerPurchase: "item" }); assert.deepEqual(f.requests, []); assert.match(f.toast(), /not enabled/);
  await f.click({ playerMarketWatchlist: "nova", watchlisted: "true" }); assert.equal(f.requests[0].payload.enabled, false);
});

for (const [name, endpoint, values, field, message, data] of [
  ["same savings destination", "savingsTransfer", { fromAccount: "savings", toAccount: "savings", amount: "1" }, "toAccount", "Choose a different destination account."],
  ["savings balance", "savingsTransfer", { fromAccount: "savings", toAccount: "checking", amount: "999999" }, "amount", "The transfer exceeds the available balance in the source account."],
  ["checking source balance", "savingsTransfer", { fromAccount: "checking", toAccount: "savings", amount: "999999" }, "amount", "The transfer exceeds the available balance in the source account."],
  ["bank transfer balance", "bankTransfer", { amount: "999999" }, "amount", "The transfer exceeds your available checking balance."],
  ["limit price required", "marketOrder", { assetId: "nova", side: "buy", orderType: "limit", quantity: "1", limitPrice: "" }, "limitPrice", "Enter a limit price for a limit order."],
  ["buy affordability", "marketOrder", { assetId: "nova", side: "buy", orderType: "market", quantity: "999999" }, "quantity", "The estimated order total exceeds your available cash."],
  ["sell holdings", "marketOrder", { assetId: "nova", side: "sell", orderType: "market", quantity: "999999" }, "quantity", /You currently own .* shares/],
  ["listing stock", "marketplacePurchase", { quantity: "13" }, "quantity", "The requested quantity exceeds the available listing quantity.", { listingId: "listing-1" }],
  ["inventory stock", "marketplaceListing", { inventoryItemId: "inv-1", quantity: "999999" }, "quantity", /Only .* units are available/],
  ["loan payment balance", "loanRepay", { amount: "999999" }, "amount", "The payment exceeds your available checking balance."],
  ["blank message", "messageSend", { body: "  " }, "body", "Enter a message before sending."],
  ["blank repayment source", "loanApply", { repaymentSource: "  " }, "repaymentSource", "Describe the expected repayment source."],
]) test(`form rejects ${name}, focuses the field, then input clears the error`, async (t) => {
  const f = await fixture(t);
  const formValues = endpoint === "marketplaceListing" ? { ...values, inventoryItemId: f.state().data.inventory.items[0].id } : values;
  const formData = endpoint === "marketplacePurchase" ? { listingId: f.state().data.marketplace.listings[0].id } : data;
  const form = formFor(endpoint, formValues, formData), invalid = form.elements.namedItem(field);
  const event = await f.submit(form); assert.equal(event.prevented, true); assert.equal(form.classes.has("was-validated"), true); assert.equal(form.classes.has("has-validation-error"), true);
  if (message instanceof RegExp) assert.match(invalid.validationMessage, message); else assert.equal(invalid.validationMessage, message);
  assert.strictEqual(document.activeElement, invalid); assert.equal(form.querySelector("[data-player-form-error]").textContent, invalid.validationMessage); assert.deepEqual(f.requests, []);
  await f.mount.emit("input", invalid); assert.equal(invalid.validationMessage, ""); assert.equal(form.classes.has("has-validation-error"), false); assert.equal(form.querySelector("[data-player-form-error]"), undefined);
});

for (const [endpoint, values, data, params, expected] of [
  ["contractSubmit", { contractId: "fallback-contract", note: " note " }, { contractId: "dataset-contract" }, { contractId: "dataset-contract" }, { note: "note" }],
  ["contractSubmit", { contractId: "fallback-contract", note: "note" }, {}, { contractId: "fallback-contract" }, { note: "note" }],
  ["businessPrice", { price: "12", employeeKey: "explicit-employee" }, { productId: "product", employeeId: "fallback-employee" }, { productId: "product" }, { price: 12, employeeKey: "explicit-employee" }],
  ["businessManufacturingStart", { businessKey: "payload-business", quantity: "2" }, { businessId: "dataset-business" }, { businessId: "dataset-business" }, { businessKey: "payload-business", quantity: 2 }],
  ["businessManufacturingStart", { businessKey: "payload-business" }, {}, { businessId: "payload-business" }, { businessKey: "payload-business" }],
  ["businessManufacturingCancel", { businessId: "payload-business", jobKey: "payload-job" }, {}, { businessId: "payload-business", jobId: "payload-job" }, { businessId: "payload-business", jobKey: "payload-job" }],
  ["businessManufacturingCancel", { businessId: "payload-business", jobId: "payload-job" }, { businessId: "dataset-business", jobId: "dataset-job" }, { businessId: "dataset-business", jobId: "dataset-job" }, { businessId: "payload-business", jobId: "payload-job" }],
  ["marketplacePurchase", { quantity: "1" }, { listingId: "unmatched-listing" }, { listingId: "unmatched-listing" }, { quantity: 1 }],
  ["craftItem", { quantity: "1" }, { recipeId: "recipe" }, { recipeId: "recipe" }, { quantity: 1 }],
  ["loanApply", { repaymentSource: " employment " }, { offerId: "offer" }, { offerId: "offer" }, { repaymentSource: "employment" }],
  ["loanRepay", { amount: "1" }, { loanId: "loan" }, { loanId: "loan" }, { amount: 1 }],
  ["messageSend", { body: " hello " }, { threadId: "thread" }, { threadId: "thread" }, { body: "hello" }],
  ["bankTransfer", { amount: "2", gameSessionId: "untrusted-game" }, { employeeId: " employee " }, {}, { amount: 2, employeeKey: "employee" }],
]) test(`form ${endpoint} preserves dataset/payload parameter resolution ${JSON.stringify(params)}`, async (t) => {
  const f = await fixture(t); const form = formFor(endpoint, values, data); form.classes.add("has-validation-error"); form.elements[0]?.setCustomValidity("stale validity");
  await f.submit(form); assert.equal(f.requests.length, 1, f.toast()); const request = f.requests[0]; assert.equal(request.endpointKey, endpoint); assert.deepEqual(request.params, params);
  assert.deepEqual(request.payload, ["contractSubmit", "messageSend"].includes(endpoint) ? expected : { ...expected, gameSessionId: previewData.session.gameSessionId }); assert.equal(form.classes.has("has-validation-error"), false);
});

test("market input estimates market/limit prices and toggles limit constraints", async (t) => {
  const f = await fixture(t), asset = f.state().data.market.assets[0], code = f.state().data.session.currencyCode;
  const form = formFor("marketOrder", { assetId: asset.id, quantity: "2", orderType: "limit", limitPrice: "50" }); const total = new Element(), fees = new Element();
  form.selectors.set("[data-player-market-estimated-value]", total); form.selectors.set("[data-player-market-estimated-fees]", fees);
  await f.mount.emit("input", form.elements.namedItem("quantity")); assert.equal(total.textContent, `${code} 100`); assert.equal(fees.textContent, `${code} 0.25`); assert.equal(form.elements.namedItem("limitPrice").required, true);
  form.elements.namedItem("orderType").value = "market"; form.elements.namedItem("quantity").value = "-3"; await f.mount.emit("input", form.elements.namedItem("orderType")); assert.equal(total.textContent, `${code} 0`); assert.equal(form.elements.namedItem("limitPrice").required, false); assert.equal(form.elements.namedItem("limitPrice").placeholder, "Optional for market order");
});
test("marketplace input computes fee inclusive quantity estimate", async (t) => {
  const f = await fixture(t), listing = f.state().data.marketplace.listings[0], form = formFor("marketplacePurchase", { quantity: "2" }, { listingId: listing.id }), output = new Element();
  form.selectors.set("[data-player-marketplace-estimated-total]", output); await f.mount.emit("input", form.elements.namedItem("quantity"));
  const total = 2 * listing.unitPrice * (1 + Number(f.state().data.marketplace.feeRate) / 100); assert.equal(output.textContent, `${f.state().data.session.currencyCode} ${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
});
test("store search filters case-insensitively, reuses empty notice and reverses on clearing", async (t) => {
  const f = await fixture(t), first = new Element(), second = new Element(), grid = new Element(), search = targetFor({ playerStoreSearch: "true" });
  first.textContent = "Repair Kit"; second.textContent = "Compass"; f.mount.selectors.set(".player-terminal-store-card", [first, second]); f.mount.selectors.set(".player-terminal-catalog-grid", grid); grid.querySelector = () => grid.childNodes[0] || null;
  search.value = "  REPAIR "; await f.mount.emit("input", search); assert.equal(first.hidden, false); assert.equal(second.hidden, true);
  search.value = "missing"; await f.mount.emit("input", search); assert.equal(grid.childNodes.length, 1); assert.equal(grid.childNodes[0].textContent, "No store items match “missing”.");
  search.value = "another"; await f.mount.emit("input", search); assert.equal(grid.childNodes.length, 1); search.value = ""; await f.mount.emit("input", search); assert.equal(first.hidden, false); assert.equal(second.hidden, false); assert.equal(grid.childNodes[0].hidden, true);
});
test("non-form submit is ignored and destroy removes click/input/submit dispatch", async (t) => {
  const f = await fixture(t); const ignored = await f.mount.emit("submit", new Element()); assert.equal(ignored.prevented, false);
  f.destroy(); const state = f.state(); await f.click({ playerLocalAction: "toggle-sidebar" }); const form = formFor("bankTransfer", { amount: "1" }); const event = await f.submit(form); assert.equal(event.prevented, false); assert.strictEqual(f.state(), state); assert.deepEqual(f.requests, []);
  for (const type of ["click", "input", "submit"]) assert.equal(f.mount.listeners.get(type).length, 0);
});

test("retry and ready refresh force current route reads; notifications-read forwards current ids", async (t) => {
  const f = await fixture(t); const before = f.calls.length; await f.click({ playerAction: "retry-route" }); assert.ok(f.calls.slice(before).some((call) => call.endpointKey === "inventory"));
  const again = f.calls.length; await f.click({ playerAction: "refresh-data" }); assert.ok(f.calls.slice(again).some((call) => call.endpointKey === "inventory"));
  const ids = f.state().data.notifications.map((item) => item.id); await f.click({ playerAction: "notifications-read" }); assert.equal(f.requests.at(-1).endpointKey, "notificationsRead"); assert.deepEqual(f.requests.at(-1).payload, { notificationIds: ids });
});
test("logout callback precedes host event with exact session details", async (t) => {
  const f = await fixture(t), calls = []; f.config.playerSessionId = "fixture-player"; f.config.onLogoutRequested = (detail) => calls.push(["callback", detail]); f.events.addEventListener(f.config.logoutRequestedEvent, (event) => calls.push(["event", event.detail]));
  await f.click({ playerAction: "logout" }); const detail = { reason: "player_requested", terminal: "player", gameSessionId: "fixture-game", playerSessionId: "fixture-player" }; assert.deepEqual(calls, [["callback", detail], ["event", detail]]);
});
test("invalid submission can be corrected and submitted without stale form errors", async (t) => {
  const f = await fixture(t), form = formFor("bankTransfer", { amount: "999999", gameSessionId: "wrong" }); await f.submit(form); assert.equal(f.requests.length, 0);
  form.elements.namedItem("amount").value = "1"; await f.submit(form); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].payload.amount, 1); assert.equal(f.requests[0].payload.gameSessionId, previewData.session.gameSessionId); assert.equal(form.querySelector("[data-player-form-error]"), undefined);
});

test("click focus survives rerender and overlay dismissal restores the original opener", async (t) => {
  const f = await fixture(t), selected = new Element(), opener = new Element();
  f.mount.selectors.set('[data-player-news-select="news-2"]', selected);
  await f.click({ playerNewsSelect: "news-2" }); [...f.frames.values()].at(-1)(); assert.strictEqual(document.activeElement, selected);
  f.mount.selectors.set('[data-player-local-action="toggle-notifications"]', opener);
  await f.click({ playerLocalAction: "toggle-notifications" }); await f.click({ playerLocalAction: "toggle-notifications" }); [...f.frames.values()].at(-1)(); assert.strictEqual(document.activeElement, opener);
});
test("route click clears overlay restoration and focuses main content; later hash navigation does the same", async (t) => {
  const f = await fixture(t), main = new Element(), opener = new Element(); f.mount.selectors.set("#player-main-content", main); f.mount.selectors.set('[data-player-local-action="toggle-mobile-menu"]', opener);
  await f.click({ playerLocalAction: "toggle-mobile-menu" }); await f.click({ route: "news" }); [...f.frames.values()].at(-1)(); assert.strictEqual(document.activeElement, main);
  // A later modal dismissal must not restore the stale mobile-menu opener.
  document.activeElement = null; f.terminal.openModal({ type: "connection" }); f.terminal.closeModal(); [...f.frames.values()].at(-1)(); assert.equal(document.activeElement, null);
  location.hash = "#profile"; await f.events.emit("hashchange", new Element()); await tick();
  for (const frame of f.frames.values()) frame(); assert.strictEqual(document.activeElement, main); assert.equal(f.state().route, "profile");
});
test("Escape closes an overlay before route actions and restores focus", async (t) => {
  const f = await fixture(t), opener = new Element(); f.mount.selectors.set('[data-player-local-action="toggle-mobile-menu"]', opener);
  await f.click({ playerLocalAction: "toggle-mobile-menu" }); const event = await f.mount.emit("keydown", new Element(), { key: "Escape" }); assert.equal(event.prevented, true); assert.equal(f.state().ui.mobileMenuOpen, false); [...f.frames.values()].at(-1)(); assert.strictEqual(document.activeElement, opener);
});

test("marketplace form rejects unaffordable quantity even when listing has sufficient stock", async (t) => {
  const f = await fixture(t, { bankBalance: 1 }), listing = f.state().data.marketplace.listings[0]; assert.ok(listing.quantity >= 1);
  const form = formFor("marketplacePurchase", { quantity: "1" }, { listingId: listing.id }); await f.submit(form);
  assert.equal(form.elements.namedItem("quantity").validationMessage, "The estimated purchase total exceeds your available cash."); assert.deepEqual(f.requests, []);
});
