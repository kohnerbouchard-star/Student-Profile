import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const CSRF_TOKEN = "C".repeat(43);
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const PUBLISHABLE_KEY = "sb_publishable_inventory_redemption_fixture";
const secureConfig = {
  usePreviewData: false,
  authenticated: true,
  csrfToken: CSRF_TOKEN,
  publishableKey: PUBLISHABLE_KEY,
  deviceId: DEVICE_ID,
  requestTimeoutMs: 1000,
  writeCooldownMs: 250
};

const requests = [];
const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    requests.push(request);
    if (
      request.method === "POST" &&
      request.path === "/players/me/inventory/meal-pass/redemptions"
    ) {
      return {
        ok: true,
        outcome: "created",
        redemption: {
          id: `red_${"a".repeat(32)}`,
          itemId: "meal-pass",
          quantity: 1,
          status: "pending",
          requestNote: "Lunch",
          resolutionNote: null,
          requestedAt: "2026-07-19T06:00:00.000Z",
          reviewedAt: null,
          fulfilledAt: null,
          updatedAt: "2026-07-19T06:00:00.000Z"
        }
      };
    }
    if (request.method === "GET" && request.path === "/players/me/inventory") {
      throw Object.assign(new Error("authoritative Inventory refresh failed"), {
        status: 503,
        code: "INVENTORY_REFRESH_UNAVAILABLE"
      });
    }
    throw new Error(`Unexpected connected request ${request.method} ${request.path}`);
  }
});

const api = new PlayerApi({ ...secureConfig, apiCall });
api.readCache.set("GET:inventory:cached", { items: [{ id: "meal-pass" }] });
api.readCacheUpdatedAt.set("GET:inventory:cached", Date.now());

const committed = await api.execute(
  "inventoryUse",
  { quantity: 1, note: "Lunch", gameSessionId: "must-not-cross-boundary" },
  { inventoryItemId: "meal-pass" }
);
assert.equal(committed.result.outcome, "created");
assert.equal(committed.result.redemption.id.startsWith("red_"), true);
assert.equal(committed.invalidatedResources.includes("inventory"), true);
assert.equal(api.readCache.has("GET:inventory:cached"), false);

const write = requests[0];
assert.equal(write.method, "POST");
assert.equal(write.path, "/players/me/inventory/meal-pass/redemptions");
assert.deepEqual(Object.keys(write.payload).sort(), ["idempotencyKey", "note", "quantity"]);
assert.equal(typeof write.payload.idempotencyKey, "string");
assert.equal(write.payload.idempotencyKey.length > 0, true);
assert.equal(write.headers.apikey, PUBLISHABLE_KEY);
assert.equal(write.headers["x-econovaria-device-id"], DEVICE_ID);
assert.equal(write.headers["x-econovaria-csrf-token"], CSRF_TOKEN);
assert.equal(write.headers["x-player-session-token"], undefined);
assert.equal(write.headers.Authorization, undefined);
assert.equal("gameSessionId" in write.payload, false);
assert.equal("playerId" in write.payload, false);
assert.equal("playerUuid" in write.payload, false);

const refresh = await api.refreshResources(["inventory"]);
assert.equal(Boolean(refresh.errors.inventory), true);
assert.equal(committed.result.outcome, "created", "A failed authoritative refresh must not reverse a committed redemption request.");
assert.equal(committed.result.redemption.status, "pending");

const failedRequests = [];
const failedApi = new PlayerApi({
  ...secureConfig,
  apiCall: async (context) => {
    failedRequests.push(context);
    throw Object.assign(new Error("redemption write failed"), {
      status: 503,
      code: "REDEMPTION_WRITE_FAILED"
    });
  }
});
failedApi.readCache.set("GET:inventory:cached", { items: [{ id: "meal-pass" }] });
failedApi.readCacheUpdatedAt.set("GET:inventory:cached", Date.now());
await assert.rejects(
  failedApi.execute(
    "inventoryUse",
    { quantity: 1, note: "Lunch" },
    { inventoryItemId: "meal-pass" }
  )
);
assert.equal(failedRequests.length, 1);
assert.equal(failedApi.readCache.has("GET:inventory:cached"), true, "A failed write must not invalidate authoritative Inventory state.");

console.log("Connected Inventory redemption cookie-session committed-success boundary passed.");

// Real terminal/API/coordinator with synthetic DOM and transport, not live economics.
import { setTimeout as delay } from "node:timers/promises";
import { createPlayerTerminal } from "../src/app.js";
import { installInventoryActionFlow } from "../src/features/inventory/inventory-action-flow.js";
import { previewData } from "../src/data/preview-data.js";
import { abortPlayerApiSessionRequests } from "../src/api/player-api.js";
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";

class Element extends EventTarget {
  constructor() {
    super();
    this.listeners = new Set();
    this.dataset = {};
    this.attrs = new Map();
    this.childNodes = [];
    this.disabled = false;
    this.classList = { add() {}, remove() {} };
    this.innerHTML = "";
  }
  addEventListener(type, listener, capture) { this.listeners.add(listener); super.addEventListener(type, listener, { capture: Boolean(capture) }); }
  removeEventListener(type, listener, capture) { this.listeners.delete(listener); super.removeEventListener(type, listener, { capture: Boolean(capture) }); }
  setAttribute(key, value) { this.attrs.set(key, value); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  removeAttribute(key) { this.attrs.delete(key); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains() { return true; }
  append(node) { this.childNodes.push(node); }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  remove() {}
  matches() { return false; }
  closest(selector) {
    if (selector === "[data-player-inventory-effect-use]" && this.dataset.playerInventoryEffectUse) return this;
    if (selector === "[data-player-inventory-redeem]" && this.dataset.playerInventoryRedeem) return this;
    return null;
  }
}
globalThis.HTMLElement = Element;
globalThis.HTMLButtonElement = Element;
globalThis.document = Object.assign(new EventTarget(), {
  createElement: () => new Element(), visibilityState: "visible", activeElement: null
});
globalThis.location = { hash: "#inventory" };
const events = new EventTarget();
for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) {
  globalThis[name] = events[name].bind(events);
}
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.CustomEvent = class extends Event {
  constructor(type, options = {}) { super(type); this.detail = options.detail; }
};
globalThis.prompt = () => "1";

async function waitFor(predicate) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return;
    await delay(2);
  }
  throw new Error("Inventory fixture condition did not settle");
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function fixture() {
  location.hash = "#inventory";
  const requests = [];
  let mutation, readHold, readError, holdNextInventory = false, version = 0, outcome = "created";
  const config = {
    usePreviewData: false, authenticated: true, csrfToken: "C".repeat(43), gameSessionId: "game-1",
    deviceId: "11111111-1111-4111-8111-111111111111", publishableKey: "sb_publishable_ref042_fixture",
    requestTimeoutMs: 5000, writeCooldownMs: 0, allowedImageHosts: [],
    resourceFreshnessMs: { inventory: 60000 },
    sessionReadyEvent: "test:ready", sessionInvalidEvent: "test:invalid", sessionRequiredEvent: "test:required",
    apiCall: async (context) => {
      requests.push({ key: context.endpointKey, method: context.method, session: context.session.gameSessionId });
      if (context.method === "POST") {
        await mutation.promise;
        if (outcome !== "replayed") version++;
        return { ok: true, outcome };
      }
      const data = structuredClone(previewData[context.endpointKey]);
      if (context.endpointKey === "inventory") {
        // Capture the authoritative value when the request starts, not resolves.
        data.marker = version;
        if (holdNextInventory) {
          holdNextInventory = false;
          readHold = deferred();
          await readHold.promise;
          if (readError) throw readError;
        }
      }
      return data;
    }
  };
  const mount = new Element();
  const freshness = createResourceFreshnessCoordinator();
  const terminal = createPlayerTerminal({ mount, config, freshness });
  const toasts = [];
  terminal.showToast = (...args) => toasts.push(args);
  await waitFor(() => terminal.getState().status === "ready" && !terminal.getState().routeLoading.inventory);
  const flow = installInventoryActionFlow({ mount, terminal, config });
  function dispatch(button) {
    const event = new Event("click", { cancelable: true });
    Object.defineProperty(event, "target", { value: button });
    mount.dispatchEvent(event);
  }
  function click(kind = "use") {
    const button = new Element();
    button.dataset[kind === "use" ? "playerInventoryEffectUse" : "playerInventoryRedeem"] = "fixture-item";
    button.replaceChildren({ textContent: "Original" });
    dispatch(button);
    return button;
  }
  return {
    requests, config, mount, terminal, freshness, toasts, flow, click, dispatch,
    begin(nextOutcome = "created") {
      outcome = nextOutcome;
      if (outcome === "replayed") version = 1; // Prior committed state, no second economic effect.
      mutation = deferred();
      return mutation;
    },
    hold(error) { holdNextInventory = true; readError = error; },
    getReadHold() { return readHold; },
    getVersion() { return version; },
    close() { flow.destroy(); terminal.destroy(); abortPlayerApiSessionRequests(config); }
  };
}

for (const kind of ["use", "redeem", "replay", "failedRefresh"]) {
  const f = await fixture();
  f.requests.length = 0;
  const receipt = f.begin(kind === "replay" ? "replayed" : "created");
  if (kind === "failedRefresh") f.hold(Object.assign(new Error("unavailable"), { status: 400 }));
  const button = f.click(kind === "redeem" ? "redeem" : "use");
  await waitFor(() => f.requests.length === 1);
  f.dispatch(button);
  assert.equal(button.disabled, true);
  assert.equal(f.toasts.length, 0);
  receipt.resolve();
  if (kind === "failedRefresh") {
    await waitFor(() => f.getReadHold());
    assert.equal(f.toasts.length, 0);
    f.getReadHold().resolve();
  }
  await waitFor(() => !button.disabled);
  assert.deepEqual(f.requests.map(({ method, key }) => `${method}:${key}`).sort(),
    (kind === "redeem" ? ["POST:inventoryUse", "GET:dashboard", "GET:inventory"] :
      ["POST:itemEffectUse", "GET:dashboard", "GET:crafting", "GET:inventory"]).sort());
  assert.equal(button.childNodes[0].textContent, "Original");
  assert.equal(f.toasts.length, 1);
  assert.equal(f.toasts[0][1], "success", "Committed writes survive refresh errors");
  assert.equal(f.terminal.getState().data.inventory.marker, kind === "failedRefresh" ? 0 : 1);
  if (kind === "failedRefresh") assert.equal(f.freshness.isPending("inventory"), true);
  f.close();
}
for (const kind of ["rejection", "abort", "destroy", "sessionSwitch", "logout", "terminalDestroy", "stale401"]) {
  const f = await fixture();
  f.requests.length = 0;
  const receipt = f.begin();
  const before = f.freshness.capture(["inventory"]);
  const button = f.click();
  await waitFor(() => f.requests.length === 1);
  if (kind === "rejection") receipt.reject(Object.assign(new Error("rejected"), { status: 409, code: "CONFLICT" }));
  if (kind === "abort" || kind === "logout") abortPlayerApiSessionRequests(f.config);
  if (kind === "destroy") { f.flow.destroy(); receipt.resolve(); }
  if (kind === "terminalDestroy") { f.terminal.destroy(); receipt.resolve(); }
  if (kind === "sessionSwitch") {
    await f.terminal.connectSession({ authenticated: true, csrfToken: "D".repeat(43), gameSessionId: "game-2" });
    receipt.resolve();
  }
  if (kind === "stale401") {
    f.hold(Object.assign(new Error("old unauthorized"), { status: 401 }));
    receipt.resolve();
    await waitFor(() => f.getReadHold());
    await f.terminal.connectSession({ authenticated: true, csrfToken: "D".repeat(43), gameSessionId: "game-2" });
    f.getReadHold().resolve();
  }
  await waitFor(() => !button.disabled);
  assert.equal(f.toasts.length, kind === "rejection" ? 1 : 0, kind);
  assert.equal(f.terminal.getState().status, "ready", kind);
  if (kind === "rejection") assert.equal(f.freshness.isCurrent(before), true);
  if (["rejection", "abort", "logout", "destroy"].includes(kind)) assert.equal(f.requests.length, 1);
  receipt.resolve();
  f.close();
}
{
  const f = await fixture(), other = await fixture();
  const otherTicket = other.freshness.capture(["inventory"]);
  const listenerCount = f.mount.listeners.size;
  const old = f.begin(), button = f.click();
  await waitFor(() => f.requests.some(({ method }) => method === "POST"));
  f.flow.destroy();
  assert.equal(button.disabled, false);
  assert.equal(f.mount.listeners.size, listenerCount - 1);
  const replacement = installInventoryActionFlow({ mount: f.mount, terminal: f.terminal, config: f.config });
  assert.equal(f.mount.listeners.size, listenerCount);
  const next = f.begin();
  f.dispatch(button);
  await waitFor(() => f.requests.filter(({ method }) => method === "POST").length === 2);
  old.resolve();
  await delay(10);
  assert.equal(button.disabled, true, "Old finally cannot release remounted control");
  assert.equal(f.toasts.length, 0);
  assert.equal(other.freshness.isCurrent(otherTicket), true);
  assert.equal(other.terminal.getState().data.inventory.marker, 0);
  next.resolve();
  await waitFor(() => !button.disabled);
  assert.equal(f.toasts.length, 1);
  replacement.destroy();
  assert.equal(f.mount.listeners.size, listenerCount - 1);
  const count = f.requests.length;
  f.dispatch(button);
  await delay(5);
  assert.equal(f.requests.length, count, "Destroyed listeners cannot submit");
  f.close(); other.close();
}
{
  const f = await fixture(), receipt = f.begin();
  const refresh = f.terminal.refreshResources;
  f.terminal.refreshResources = async (keys) => {
    const result = await refresh(keys);
    f.freshness.invalidate(["inventory"]);
    return result;
  };
  const button = f.click();
  receipt.resolve();
  await waitFor(() => !button.disabled);
  assert.equal(f.toasts.length, 0, "New invalidation fences final action notification");
  assert.equal(f.freshness.isPending("inventory"), true);
  f.close();
}
console.log("Optional Inventory freshness request budgets and lifecycle boundaries passed.");
