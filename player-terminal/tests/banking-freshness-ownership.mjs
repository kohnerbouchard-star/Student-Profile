import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PlayerApi } from "../src/api/player-api.js";
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";
import { createStore } from "../src/core/store.js";
import { previewData } from "../src/data/preview-data.js";
import { installBankingReadFlow } from "../src/features/banking/banking-read-flow.js";
import { renderBankingPage } from "../src/pages/banking-page.js";

// The browser suite exercises native DOM. This minimal event/element boundary
// lets the registered Node gate exercise the real API, coordinator and store.
class Element {
  constructor() { this.childNodes = []; this.attributes = new Map(); this.dataset = {}; this.classList = { add() {}, remove() {} }; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key); }
  removeAttribute(key) { this.attributes.delete(key); }
  replaceChildren(...children) { this.childNodes = children; }
  append(...children) { this.childNodes.push(...children); }
  focus() { this.focused = true; }
}
class Button extends Element { disabled = false; }
const globals = Object.fromEntries(["HTMLElement", "HTMLButtonElement", "document", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, globalThis[key]]));
let frames = new Map(), frameId = 0;
globalThis.HTMLElement = Element;
globalThis.HTMLButtonElement = Button;
globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.document = { createElement: (tag) => {
  const element = new Element();
  if (tag === "template") Object.defineProperty(element, "innerHTML", { set(html) { this.content = { firstElementChild: { html } }; } });
  return element;
} };
after(() => Object.assign(globalThis, globals));
const tick = () => new Promise(setImmediate);
const pagination = { cursor: null, nextCursor: null, hasMore: false, limit: 100 };
function quoteResult() {
  return { quote: {
    quoteKey: "fxq_11111111111111111111111111111111", product: "instant",
    sourceAccountKey: "bac_11111111111111111111111111111111", targetAccountKey: "bac_22222222222222222222222222222222",
    sourceCurrencyCode: "ECO", targetCurrencyCode: "ELD", sourceMinorUnit: 2, targetMinorUnit: 2,
    sourceAmountMode: "source_debit", sourceAmount: "100", referenceRate: "1.5", customerRate: "1.49", spreadRate: "0.005",
    feeAmount: "2.00", targetAmount: "149.00", fixingKey: "fxf_11111111111111111111111111111111", policyVersion: "fx-policy-v1",
    expiresAt: "2099-08-26T08:02:00.000Z", settlesAt: "2099-08-26T08:01:01.000Z", requiresFx: true,
  } };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  frames = new Map();
  const data = structuredClone(previewData), freshness = createResourceFreshnessCoordinator();
  data.capabilities = { routes: { banking: true }, actions: { bankingFxQuote: true, bankingFxStandard: true, bankingFxInstant: true, bankingFxCancel: true } };
  data.banking.pagination = { cursor: null, nextCursor: "offset_2", hasMore: true, limit: 2 };
  data.banking.transactions = data.banking.transactions.slice(0, 2);
  const store = createStore({ status: "ready", route: "banking", data, ui: {} });
  const holds = new Map(), calls = [], toasts = [], invalidSessions = [];
  const config = { usePreviewData: false, authenticated: true, gameSessionId: "fixture-game", csrfToken: "S".repeat(43), requestTimeoutMs: 5000, writeCooldownMs: 0,
    onSessionInvalid: (detail) => invalidSessions.push(detail),
    apiCall: async (context) => {
      calls.push(context);
      const hold = holds.get(context.endpointKey)?.shift();
      if (hold) { hold.started.resolve(); return hold.promise; }
      return structuredClone(store.getState().data[context.endpointKey]);
    },
  };
  const api = new PlayerApi(config, { freshness, deferFreshnessSettlement: true });
  const mount = new Element(), button = new Button(), panel = new Element(), error = new Element();
  let updates = 0, markup = renderBankingPage(data);
  const page = { replaceWith: (next) => { markup = next.html; } };
  const listeners = new Map();
  mount.addEventListener = (name, callback) => listeners.set(name, callback);
  mount.removeEventListener = (name) => listeners.delete(name);
  mount.querySelector = (selector) => selector === '[data-page="banking"]' ? page
    : selector.includes("page-error") || selector.includes("fx-error") ? error
    : selector === ".player-terminal-fx-panel" ? panel
    : selector === '[data-player-banking-fx-form="quote"]' ? form : button;
  store.subscribe((state) => { updates++; markup = renderBankingPage(state.data); });
  const terminal = { freshness, getState: store.getState, subscribe: store.subscribe, showToast: (...args) => toasts.push(args),
    refreshResources: async (keys) => {
      const result = await api.refreshResources(keys);
      store.setState((state) => ({ ...state, data: { ...state.data, ...result.data } }));
      const ticket = freshness.ticketFor(result);
      for (const key of keys) if (!result.errors[key]) freshness.settle(ticket, key);
      return result;
    },
  };
  const fields = { sourceAccountKey: { value: data.bankingFx.balances[0].accountKey }, targetCurrencyCode: { value: "ELD" }, sourceAmount: { value: "100" }, product: { value: "instant" } };
  const form = { dataset: { playerBankingFxForm: "quote" }, elements: { namedItem: (key) => fields[key] }, querySelector: () => button };
  const flow = installBankingReadFlow({ mount, terminal, config });
  function event(name, selector, target) {
    listeners.get(name)?.({ target: { closest: (query) => query === selector ? target : null }, preventDefault() {}, stopImmediatePropagation() {} });
  }
  return { store, api, flow, config, freshness, terminal, fields, button, panel, error, calls, toasts, invalidSessions,
    markup: () => markup, updates: () => updates,
    hold(key) { const hold = { ...deferred(), started: deferred() }; const queue = holds.get(key) || []; queue.push(hold); holds.set(key, queue); return hold; },
    paginate: () => event("click", "[data-player-banking-load-more]", button),
    history: () => { button.dataset.playerBankingFxRange = "30d"; event("click", "[data-player-banking-fx-range]", button); },
    orders: () => event("click", "[data-player-banking-fx-refresh-orders]", button),
    quote: () => event("submit", "[data-player-banking-fx-form]", form),
    change: () => event("change", '[data-player-banking-fx-form="quote"]', form),
    order: () => event("submit", "[data-player-banking-fx-form]", { ...form, dataset: { playerBankingFxForm: "order", endpoint: "bankingFxInstant" } }),
    cancel: () => event("submit", "[data-player-banking-fx-form]", { ...form, dataset: { playerBankingFxForm: "cancel", orderKey: data.bankingFx.pendingOrders[0].orderKey } }),
  };
}

test("late Banking pagination cannot replace a newer terminal refresh in state or DOM", async () => {
  const f = fixture(), hold = f.hold("banking"), old = structuredClone(f.store.getState().data.banking);
  f.paginate(); await hold.started.promise;
  const fresh = f.hold("banking"), refreshing = f.terminal.refreshResources(["banking"]);
  const newer = structuredClone(old); newer.checking.balance = 98765; newer.transactions[0].description = "new authoritative activity";
  fresh.resolve(newer); await refreshing;
  const accepted = f.store.getState(), markup = f.markup(), updates = f.updates();
  hold.resolve({ ...old, transactions: [{ ...old.transactions[0], id: "late-row", description: "obsolete page" }] }); await tick();
  assert.strictEqual(f.store.getState(), accepted);
  assert.equal(f.store.getState().data.banking.checking.balance, 98765, "Late pagination must preserve the refreshed Checking balance.");
  assert.equal(f.markup(), markup, "Late pagination must preserve the refreshed DOM.");
  assert.equal(f.updates(), updates); assert.deepEqual(f.toasts, []); assert.equal(f.error.textContent, undefined);
  f.flow.destroy();
});

test("normal pagination publishes immutably through the store with deduplication and focus", async () => {
  const f = fixture(), before = f.store.getState(), hold = f.hold("banking");
  const next = structuredClone(before.data.banking);
  next.transactions = [next.transactions[1], { ...next.transactions[0], id: "next-row" }];
  next.pagination.nextCursor = "offset_3";
  f.paginate(); await hold.started.promise; hold.resolve(next); await tick();
  assert.notStrictEqual(f.store.getState(), before);
  assert.equal(before.data.banking.transactions.length, 2, "Previously published snapshots remain immutable.");
  assert.deepEqual(f.store.getState().data.banking.transactions.map(({ id }) => id), ["txn-1", "txn-2", "next-row"]);
  assert.equal(f.updates(), 1); assert.equal(f.calls.length, 1);
  for (const callback of frames.values()) callback(); frames.clear();
  assert.equal(f.button.focused, true); f.flow.destroy();
});

for (const retirement of ["session", "destroy", "route-return"]) for (const failure of [false, true]) {
  test(`${retirement} rejects late Banking ${failure ? "401 effects" : "publication"}`, async () => {
    const f = fixture(), hold = f.hold("banking"), before = f.store.getState().data.banking;
    f.paginate(); await hold.started.promise;
    if (retirement === "session") f.api.setSession({ gameSessionId: "next-game" });
    if (retirement === "destroy") f.flow.destroy();
    if (retirement === "route-return") { f.store.setState({ route: "news" }); f.store.setState({ route: "banking" }); }
    const markup = f.markup(), updates = f.updates();
    if (failure) hold.reject({ status: 401, code: "SESSION_INVALID" });
    else hold.resolve({ ...before, transactions: [] });
    await tick();
    assert.strictEqual(f.store.getState().data.banking, before); assert.equal(f.markup(), markup); assert.equal(f.updates(), updates);
    assert.deepEqual(f.invalidSessions, []); assert.equal(f.error.textContent, undefined); assert.deepEqual(f.toasts, []);
    assert.equal(frames.size, 0); f.flow.destroy();
  });
}

for (const endpoint of ["bankingFxHistory", "bankingFxOrders"]) {
  test(`${endpoint} honors the BankingFX generation and cannot settle its pending aggregate`, async () => {
    const f = fixture(), hold = f.hold(endpoint);
    (endpoint === "bankingFxHistory" ? f.history : f.orders)(); await hold.started.promise;
    f.api.invalidateResources(["bankingFx"]);
    const before = f.store.getState(), resource = before.data.bankingFx, markup = f.markup();
    hold.resolve(endpoint === "bankingFxHistory" ? { range: "30d", points: [], pagination } : { orders: [], pagination });
    await tick(); assert.strictEqual(f.store.getState(), before); assert.equal(f.updates(), 0);
    assert.strictEqual(f.store.getState().data.bankingFx, resource); assert.equal(f.markup(), markup);
    assert.equal(f.freshness.isPending("bankingFx"), true); assert.equal(f.error.textContent, undefined); f.flow.destroy();
  });
}

for (const field of ["sourceAccountKey", "targetCurrencyCode", "sourceAmount", "product"]) {
  test(`a held FX quote cannot publish after ${field} changes, even if changed back`, async () => {
    const f = fixture(), hold = f.hold("bankingFxQuote"), prior = f.fields[field].value;
    f.quote(); await hold.started.promise;
    f.fields[field].value = "changed"; f.change(); f.fields[field].value = prior; f.change();
    hold.resolve(quoteResult()); await tick();
    assert.equal(f.store.getState().data.bankingFx.currentQuote, null);
    assert.deepEqual(f.toasts, []); assert.equal(f.error.textContent, undefined); assert.equal(frames.size, 0); f.flow.destroy();
  });
}

test("current FX quote uses store subscribers and becomes unavailable when its intent changes", async () => {
  const f = fixture(), hold = f.hold("bankingFxQuote"), before = f.store.getState();
  f.quote(); await hold.started.promise; hold.resolve(quoteResult()); await tick();
  assert.equal(f.store.getState().data.bankingFx.currentQuote.quoteKey, quoteResult().quote.quoteKey);
  assert.equal(before.data.bankingFx.currentQuote, null); assert.equal(f.updates(), 1);
  assert.deepEqual(f.toasts, [["Exact FX quote ready for review.", "cyan"]]);
  assert.ok(f.calls[0].idempotencyKey); f.change();
  assert.equal(f.store.getState().data.bankingFx.currentQuote, null); assert.equal(f.updates(), 2);
  for (const callback of frames.values()) callback(); frames.clear();
  assert.equal(f.button.focused, undefined, "A quote's scheduled order focus cannot outlive its intent."); f.flow.destroy();
});

for (const retirement of ["generation", "config-session", "destroy", "route-return"]) for (const failure of [false, true]) {
  test(`${retirement} suppresses obsolete FX quote ${failure ? "401 effects" : "state/toast/focus"}`, async () => {
    const f = fixture(), hold = f.hold("bankingFxQuote");
    f.quote(); await hold.started.promise;
    if (retirement === "generation") f.api.invalidateResources(["bankingFx"]);
    if (retirement === "config-session") f.config.gameSessionId = "rotated-game";
    if (retirement === "destroy") f.flow.destroy();
    if (retirement === "route-return") { f.store.setState({ route: "news" }); f.store.setState({ route: "banking" }); }
    if (failure) hold.reject({ status: 401, code: "SESSION_INVALID" }); else hold.resolve(quoteResult());
    await tick();
    assert.equal(f.store.getState().data.bankingFx.currentQuote, null); assert.deepEqual(f.toasts, []);
    assert.equal(f.error.textContent, undefined); assert.deepEqual(f.invalidSessions, []); assert.equal(frames.size, 0); f.flow.destroy();
  });
}

for (const endpoint of ["bankingFxHistory", "bankingFxOrders"]) {
  test(`normal ${endpoint} publishes immutably without settling a pending aggregate`, async () => {
    const f = fixture(); f.api.invalidateResources(["bankingFx"]);
    const before = f.store.getState(), hold = f.hold(endpoint);
    (endpoint === "bankingFxHistory" ? f.history : f.orders)(); await hold.started.promise;
    const order = before.data.bankingFx.pendingOrders[0];
    hold.resolve(endpoint === "bankingFxHistory" ? { range: "30d", points: [], pagination }
      : { orders: [{ ...order, status: "cancelled", cancellable: false }], pagination });
    await tick();
    assert.equal(f.error.textContent, undefined); assert.equal(f.updates(), 1); assert.notStrictEqual(f.store.getState(), before);
    if (endpoint === "bankingFxHistory") assert.equal(f.store.getState().data.bankingFx.history.range, "30d");
    else { assert.equal(f.store.getState().data.bankingFx.pendingOrders.length, 0); assert.equal(f.store.getState().data.bankingFx.completedOrders.length, 2); }
    assert.equal(f.freshness.isPending("bankingFx"), true); f.flow.destroy();
  });
}

test("discarded pagination cannot settle raw transport/cache admission", async () => {
  const f = fixture(); f.api.invalidateResources(["banking"]);
  const detached = { ...f.store.getState() }; f.terminal.getState = () => detached;
  const hold = f.hold("banking"); f.paginate(); await hold.started.promise;
  hold.resolve(detached.data.banking); await tick();
  assert.equal(f.updates(), 0); assert.equal(f.freshness.isPending("banking"), true); assert.equal(frames.size, 0); f.flow.destroy();
});

test("destroy aborts only its adapter and preserves sibling freshness", async () => {
  const f = fixture(), sibling = f.freshness.capture(["news"]), hold = f.hold("banking");
  f.paginate(); await hold.started.promise; f.flow.destroy();
  assert.equal(f.calls[0].signal.aborted, true); assert.equal(f.freshness.isCurrent(sibling), true);
  hold.resolve(f.store.getState().data.banking); await tick(); assert.equal(f.updates(), 0);
});

for (const command of ["order", "cancel"]) {
  test(`confirmed FX ${command} remains successful if follow-up refresh fails`, async () => {
    const f = fixture(); f.store.setState((state) => ({ ...state, data: { ...state.data, bankingFx: { ...state.data.bankingFx, currentQuote: quoteResult().quote } } }));
    const endpoint = command === "order" ? "bankingFxInstant" : "bankingFxCancel", hold = f.hold(endpoint);
    f.terminal.refreshResources = async () => { throw { code: "OFFLINE" }; };
    f[command](); await hold.started.promise;
    hold.resolve({ order: { ...previewData.bankingFx.completedOrders[0], status: command === "order" ? "settled" : "cancelled" } });
    await tick(); assert.equal(f.error.textContent, undefined);
    assert.deepEqual(f.toasts, [[command === "order" ? "Instant conversion settled." : "Pending FX order cancelled; reservations released.", "green"]]);
    assert.equal(f.freshness.isPending("banking"), true); assert.equal(f.freshness.isPending("bankingFx"), true);
    assert.ok(f.calls[0].idempotencyKey); f.flow.destroy();
  });
}
