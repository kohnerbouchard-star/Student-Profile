import assert from "node:assert/strict";
import test from "node:test";
import { installMarketplaceFundingFlow } from "../src/features/marketplace/marketplace-funding-flow.js";
import { normalizeMarketplaceFundingQuote } from "../src/features/marketplace/marketplace-funding-read-model.js";

import { LISTING, RESERVATION, ORDER, ACCOUNT, quoteFixture, orderFixture } from "./fixtures/marketplace-funding.js";

class Mount {
  listeners = new Map();
  error = { hidden: true, textContent: "", focus() {} };
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
  querySelector(selector) { return selector.includes("funding-error") ? this.error : null; }
  contains(form) { return form.connected !== false; }
}
globalThis.HTMLElement = Mount;
globalThis.HTMLButtonElement = class {};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(fn); };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(adapter) {
  const mount = new Mount();
  const quote = structuredClone(quoteFixture);
  quote.reservation.expiresAt = quote.reservation.fundingQuote.expiresAt = new Date(Date.now() + 60000).toISOString();
  const state = { status: "ready", route: "marketplace", ui: { marketplaceListingId: LISTING }, data: {
    session: { authenticated: true, gameSessionId: "game-a" },
    capabilities: { routes: { marketplace: true }, actions: { marketplacePurchase: true } },
    marketplace: { listings: [{ id: LISTING, quantity: 4, unitPrice: 15, currencyCode: "LUM", version: 3 }], platformFeeRate: 2.5, taxRate: 1 },
  } };
  const calls = [], toasts = [], subscribers = new Set();
  const config = { authenticated: true, csrfToken: "csrf-a", gameSessionId: "game-a", requestTimeoutMs: 200, writeCooldownMs: 0,
    apiCall: async (context) => { calls.push(context); return adapter ? adapter(context, quote) : quote; } };
  const terminal = { getState: () => state, requestRender() {}, showToast: (...args) => toasts.push(args), refreshResources: async () => {},
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } };
  const quantity = { value: "1" }, amount = { value: "15.53" };
  const row = { querySelector: (selector) => selector.includes("sourceAccountKey") ? { value: ACCOUNT } : amount };
  const form = { dataset: { playerMarketplaceFundingForm: "quote", listingId: LISTING },
    elements: { namedItem: () => quantity }, querySelector: () => null, querySelectorAll: () => [row] };
  const settlement = { dataset: { playerMarketplaceFundingForm: "settlement", reservationId: RESERVATION }, querySelector: () => null };
  const flow = installMarketplaceFundingFlow({ mount, terminal, config });
  function emit(name, target = form) { mount.listeners.get(name)?.({ target: { closest: () => target }, preventDefault() {}, stopImmediatePropagation() {} }); }
  function notify() { for (const fn of subscribers) fn(state); }
  return { mount, state, config, terminal, quote, calls, toasts, form, settlement, quantity, amount, flow, emit, notify };
}

test("changed quantity cannot publish an in-flight quantity-one quote", async () => {
  const response = deferred();
  const h = setup(() => response.promise);
  h.emit("submit"); await tick();
  h.quantity.value = "2"; h.amount.value = "31.05"; h.emit("input");
  response.resolve(h.quote); await tick();
  assert.equal(h.state.data.marketplace.currentFundingQuote ?? null, null);
  assert.equal(h.toasts.length, 0);
  h.flow.destroy();
});

test("lost committed settlement retries the immutable command after expiry and fresh reads", async () => {
  let committed = null, effects = 0;
  const h = setup((context) => {
    if (!committed) {
      committed = { payload: structuredClone(context.payload), key: context.idempotencyKey };
      effects++;
      throw { code: "REQUEST_TIMEOUT", message: "Response lost" };
    }
    assert.deepEqual(context.payload, committed.payload);
    assert.equal(context.idempotencyKey, committed.key);
    return { ...orderFixture, order: { ...orderFixture.order, replayed: true } };
  });
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); await tick();
  await new Promise((resolve) => setTimeout(resolve, 5));
  // Fresh reads may now describe depleted balances and an expired reservation.
  h.state.data.marketplace = { ...h.state.data.marketplace, listings: [], currentFundingQuote: {
    ...h.state.data.marketplace.currentFundingQuote, expiresAt: "2000-01-01T00:00:00.000Z",
  } };
  h.state.data.bankingFx = { balances: [] }; h.notify();
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.calls.length, 2);
  assert.equal(effects, 1);
  assert.equal(h.state.data.marketplace.lastFundingOrder?.replayed, true);
  h.flow.destroy();
});

for (const outcome of ["success", "error"]) {
  for (const interruption of ["navigation", "selection", "destroy", "session", "waiting", "freshness", "input", "change", "detached"]) {
    test(`quote ${outcome} cannot publish after ${interruption}`, async () => {
      const response = deferred();
      const h = setup(() => response.promise);
      let epoch = 0;
      h.terminal.freshness = { capture: () => ({ epoch }), isCurrent: (ticket) => ticket.epoch === epoch };
      h.emit("submit"); await tick();
      if (interruption === "navigation") { h.state.route = "banking"; h.notify(); h.state.route = "marketplace"; h.notify(); }
      if (interruption === "selection") { h.state.ui.marketplaceListingId = "other"; h.notify(); h.state.ui.marketplaceListingId = LISTING; h.notify(); }
      if (interruption === "destroy") h.flow.destroy();
      if (interruption === "session") { h.config.csrfToken = "csrf-b"; h.notify(); }
      if (interruption === "waiting") { h.state.status = "waiting"; h.notify(); h.state.status = "ready"; h.notify(); }
      if (interruption === "freshness") epoch++;
      if (["input", "change"].includes(interruption)) { h.amount.value = "15.52"; h.emit(interruption); }
      if (interruption === "detached") h.form.connected = false;
      if (outcome === "success") response.resolve(h.quote);
      else response.reject({ code: "SERVER_ERROR", message: "Stale failure", status: 503 });
      await tick();
      assert.equal(h.state.data.marketplace.currentFundingQuote ?? null, null);
      assert.equal(h.mount.error.textContent, "");
      assert.equal(h.toasts.length, 0);
      h.flow.destroy();
    });
  }
}

for (const outcome of ["success", "error"]) {
  for (const interruption of ["navigation", "selection", "destroy", "session", "waiting", "input"]) {
    test(`settlement ${outcome} cannot publish after ${interruption}`, async () => {
      const response = deferred();
      const h = setup(() => response.promise);
      let refreshed = 0;
      h.terminal.refreshResources = async () => { refreshed++; };
      h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
      h.emit("submit", h.settlement); await tick();
      if (interruption === "navigation") { h.state.route = "banking"; h.notify(); h.state.route = "marketplace"; h.notify(); }
      if (interruption === "selection") { h.state.ui.marketplaceListingId = "other"; h.notify(); h.state.ui.marketplaceListingId = LISTING; h.notify(); }
      if (interruption === "destroy") h.flow.destroy();
      if (interruption === "session") { h.config.csrfToken = "csrf-b"; h.notify(); }
      if (interruption === "waiting") { h.state.status = "waiting"; h.notify(); h.state.status = "ready"; h.notify(); }
      if (interruption === "input") h.emit("input");
      if (outcome === "success") response.resolve(orderFixture);
      else response.reject({ code: "SERVER_ERROR", message: "Stale failure", status: 503 });
      await tick();
      assert.equal(h.state.data.marketplace.lastFundingOrder ?? null, null);
      assert.equal(h.mount.error.textContent, "");
      assert.equal(h.toasts.length, 0);
      assert.equal(refreshed,
        outcome === "success" && ["navigation", "selection", "input"].includes(interruption) ? 1 : 0);
      h.flow.destroy();
    });
  }
}

test("older quote completion cannot release or replace a newer request", async () => {
  const responses = [deferred(), deferred()];
  const h = setup(() => responses[h.calls.length - 1].promise);
  h.emit("submit"); h.emit("submit"); await tick();
  assert.equal(h.calls.length, 1);
  h.quantity.value = "2"; h.amount.value = "31.05"; h.emit("input");
  h.emit("submit"); await tick();
  assert.equal(h.calls.length, 2);
  responses[0].resolve(h.quote); await tick();
  assert.equal(h.toasts.length, 0);
  h.emit("submit"); await tick();
  assert.equal(h.calls.length, 2);
  const quote = structuredClone(h.quote);
  Object.assign(quote.reservation, { quantity: 2, subtotal: 30, sellerProceeds: 30, feeAmount: 0.75, taxAmount: 0.3, buyerTotal: 31.05 });
  quote.reservation.fundingQuote.targetAmount = quote.reservation.fundingQuote.lines[0].targetContribution = 31.05;
  responses[1].resolve(quote); await tick();
  assert.equal(h.state.data.marketplace.currentFundingQuote.quantity, 2);
  assert.equal(h.toasts.length, 1);
  h.flow.destroy();
});

test("lost settlement retry before expiry also reuses the original payload and key", async () => {
  const h = setup(() => { throw { code: "REQUEST_TIMEOUT", message: "Response lost" }; });
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); await tick();
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[0].payload, h.calls[1].payload);
  assert.equal(h.calls[0].idempotencyKey, h.calls[1].idempotencyKey);
  h.flow.destroy();
});

test("unconfirmed expiry and mismatched settlement forms cannot write", async () => {
  const h = setup();
  h.state.data.marketplace.currentFundingQuote = { ...normalizeMarketplaceFundingQuote(h.quote), expiresAt: "2000-01-01T00:00:00.000Z" };
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.calls.length, 0);
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.settlement.dataset.reservationId = "mpr_99999999999999999999999999999999";
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.calls.length, 0);
  h.flow.destroy();
});

test("committed receipt stays successful when refresh fails", async () => {
  const h = setup(() => orderFixture);
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.terminal.refreshResources = async () => { throw new Error("Refresh unavailable"); };
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.state.data.marketplace.lastFundingOrder.orderKey, ORDER);
  assert.equal(h.mount.error.textContent, "");
  assert.equal(h.toasts[0][1], "green");
  h.flow.destroy();
});

test("initial loading and session bootstrap do not retire the flow", async () => {
  const h = setup();
  h.state.status = "loading"; h.state.data.session = null; h.notify();
  h.config.csrfToken = "bootstrap-csrf";
  h.state.status = "ready"; h.state.data.session = { gameSessionId: "game-a" }; h.notify();
  h.emit("submit"); await tick();
  assert.equal(h.state.data.marketplace.currentFundingQuote.quantity, 1);
  h.flow.destroy();
});

test("repeated confirmation while pending sends one settlement", async () => {
  const response = deferred();
  const h = setup(() => response.promise);
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); h.emit("submit", h.settlement); await tick();
  assert.equal(h.calls.length, 1);
  response.resolve(orderFixture); await tick();
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.calls.length, 1);
  h.flow.destroy();
});

test("a retired API session cannot retry or publish its aborted request", async () => {
  const { abortPlayerApiSessionRequests } = await import("../src/api/player-api.js");
  const response = deferred();
  const h = setup(() => response.promise);
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); await tick();
  abortPlayerApiSessionRequests(h.config); await tick();
  response.resolve(orderFixture); await tick();
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.state.data.marketplace.currentFundingQuote, null);
  assert.equal(h.mount.error.textContent, "");
  assert.equal(h.toasts.length, 0);
  h.flow.destroy();
});

test("session retirement between uncertain attempts cannot mint a new retry identity", async () => {
  const { abortPlayerApiSessionRequests } = await import("../src/api/player-api.js");
  const h = setup(() => { throw { code: "REQUEST_TIMEOUT", message: "Response lost" }; });
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); await tick();
  abortPlayerApiSessionRequests(h.config);
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.calls.length, 1);
  h.notify();
  assert.equal(h.state.data.marketplace.currentFundingQuote, null);
  h.flow.destroy();
});

for (const code of ["MARKETPLACE_QUOTE_EXPIRED", "MARKETPLACE_FIXING_STALE", "MARKETPLACE_INSUFFICIENT_FUNDS", "MARKETPLACE_RESERVATION_INVALID"]) {
  test(`authoritative ${code} restores quote and allocation recovery`, async () => {
    const h = setup((context, quote) => {
      if (context.endpointKey === "marketplaceSettlement") throw { code, status: 409 };
      return quote;
    });
    h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
    h.emit("submit", h.settlement); await tick();
    assert.equal(h.state.data.marketplace.currentFundingQuote, null);
    // Reselecting the same listing is not required. Inputs and quote submission
    // belong to the still-active listing and must immediately work again.
    h.amount.value = "15.53"; h.emit("change");
    h.emit("submit"); await tick();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].endpointKey, "marketplacePurchase");
    assert.equal(h.state.data.marketplace.currentFundingQuote.reservationKey, RESERVATION);
    assert.equal(h.state.data.marketplace.currentFundingQuote.settlementRetry, undefined);
    assert.equal(h.mount.error.textContent, "");
    h.flow.destroy();
  });
}

for (const failure of [
  { code: "NETWORK_ERROR" },
  { code: "OFFLINE" },
  { code: "REQUEST_TIMEOUT" },
  { code: "SERVICE_UNAVAILABLE", status: 503 },
]) {
  test(`uncertain ${failure.code} still preserves the confirmed command`, async () => {
    const h = setup(() => { throw failure; });
    h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
    h.emit("submit", h.settlement); await tick();
    assert.equal(h.state.data.marketplace.currentFundingQuote.settlementRetry, true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    h.emit("submit", h.settlement); await tick();
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.calls[0].payload, h.calls[1].payload);
    assert.equal(h.calls[0].idempotencyKey, h.calls[1].idempotencyKey);
    h.flow.destroy();
  });
}

test("authoritative rejection after an uncertain attempt restores fresh quote recovery", async () => {
  const h = setup((context, quote) => {
    if (context.endpointKey === "marketplacePurchase") return quote;
    if (h.calls.length === 1) throw { code: "REQUEST_TIMEOUT" };
    throw { code: "MARKETPLACE_QUOTE_EXPIRED", status: 409 };
  });
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.state.data.marketplace.currentFundingQuote.settlementRetry, true);
  h.emit("submit", h.settlement); await tick();
  assert.equal(h.state.data.marketplace.currentFundingQuote, null);
  h.quote.reservation.expiresAt = h.quote.reservation.fundingQuote.expiresAt = "2000-01-01T00:00:00Z";
  h.emit("submit"); await tick();
  assert.equal(h.calls[2].endpointKey, "marketplacePurchase");
  h.emit("submit", h.settlement); await tick();
  // A newly received expired quote must not inherit the retired command's
  // expiry bypass, even if the reservation key is returned again.
  assert.equal(h.calls.length, 3);
  h.flow.destroy();
});

test("held settlement converges current-session Banking and FX after navigation without stale UI", async () => {
  const response = deferred();
  const h = setup(() => response.promise);
  let committed = false;
  const refreshes = [];
  h.state.data.banking = { available: 100 };
  h.state.data.bankingFx = { available: 100 };
  h.terminal.refreshResources = async (resources) => {
    refreshes.push(resources);
    if (resources.includes("banking")) h.state.data.banking.available = committed ? 84.47 : 100;
    if (resources.includes("bankingFx")) h.state.data.bankingFx.available = committed ? 84.47 : 100;
  };
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); await tick();
  h.state.route = "banking"; h.notify();
  await h.terminal.refreshResources(["banking", "bankingFx"]);
  assert.equal(h.state.data.bankingFx.available, 100);
  committed = true;
  response.resolve(orderFixture); await tick();
  assert.deepEqual(refreshes[1], ["dashboard", "marketplace", "inventory", "banking", "bankingFx"]);
  assert.equal(h.state.data.banking.available, 84.47);
  assert.equal(h.state.data.bankingFx.available, 84.47);
  assert.equal(h.state.data.marketplace.currentFundingQuote, null);
  assert.equal(h.state.data.marketplace.lastFundingOrder ?? null, null);
  assert.equal(h.mount.error.textContent, "");
  assert.equal(h.toasts.length, 0);
  h.flow.destroy();
});

test("retired view cannot converge an invalid settlement receipt", async () => {
  const response = deferred();
  const h = setup(() => response.promise);
  let refreshes = 0;
  h.terminal.refreshResources = async () => { refreshes++; };
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); await tick();
  h.state.route = "banking"; h.notify();
  response.resolve({ ...orderFixture, order: { ...orderFixture.order, quantity: 2 } }); await tick();
  assert.equal(refreshes, 0);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.mount.error.textContent, "");
  h.flow.destroy();
});

test("freshness session retirement suppresses held settlement convergence", async () => {
  const response = deferred();
  const h = setup(() => response.promise);
  let epoch = 0, refreshes = 0;
  h.terminal.freshness = { capture: () => ({ epoch }), isCurrent: (ticket) => ticket.epoch === epoch };
  h.terminal.refreshResources = async () => { refreshes++; };
  h.state.data.marketplace.currentFundingQuote = normalizeMarketplaceFundingQuote(h.quote);
  h.emit("submit", h.settlement); await tick();
  h.state.route = "banking"; h.notify();
  epoch++;
  response.resolve(orderFixture); await tick();
  assert.equal(refreshes, 0);
  assert.equal(h.toasts.length, 0);
  h.flow.destroy();
});
