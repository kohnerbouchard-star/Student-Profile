import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlayerTerminal } from "../src/app.js";
import { PlayerApi } from "../src/api/player-api.js";
import { resolveCapabilities } from "../src/api/capabilities.js";
import { buildPlayerTerminalConfig } from "../src/config/player-terminal.config.js";
import { createStore, updateStoreFromSnapshot } from "../src/core/store.js";
import { subscribeTerminalRender } from "../src/core/terminal-render-subscription.js";
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";
import { installPlayerInvalidationController } from "../src/realtime/player-invalidation-controller.js";
import { previewData } from "../src/data/preview-data.js";
import { installLiveStatusPresenter } from "../src/realtime/live-status-presenter.js";

// Real terminal/store/renderers with an element boundary that counts shell
// replacement. Native focus, keyboard operation and node identity are also
// asserted by player-store-business-offer-acceptance.spec.mjs in both browsers.
class Element extends EventTarget {
  attributes = new Map();
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
}

async function fixture(t) {
  const keys = ["HTMLElement", "document", "location", "addEventListener", "removeEventListener", "requestAnimationFrame", "cancelAnimationFrame", "setInterval", "clearInterval"];
  const saved = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const bootstrap = PlayerApi.prototype.bootstrap, loadRoute = PlayerApi.prototype.loadRoute;
  const refreshResources = PlayerApi.prototype.refreshResources;
  const events = new EventTarget(), frames = new Map();
  let frameId = 0, writes = 0, markup = "", indicator = null, destroyed = false;
  const root = new Element(), statusHost = new Element(), mount = new Element();
  const indicatorNode = (html) => ({ html, replaceWith(next) { indicator = next; } });
  indicator = indicatorNode("");
  statusHost.querySelector = () => indicator;
  mount.querySelector = (selector) => selector === ".player-terminal-app-root" ? root
    : selector === ".player-terminal-topbar-status" ? statusHost : null;
  Object.defineProperty(mount, "innerHTML", { set(value) { writes++; markup = value; }, get() { return markup; } });
  Object.assign(globalThis, {
    HTMLElement: Element, document: { title: "" }, location: { hash: "#store", search: "", hostname: "localhost" },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); }, setInterval() { return 0; }, clearInterval() {},
  });
  const config = buildPlayerTerminalConfig({ usePreviewData: true });
  const data = structuredClone(previewData);
  data.capabilities = resolveCapabilities({ config, session: data.session, dashboard: data.dashboard });
  PlayerApi.prototype.bootstrap = async function () { return this.freshness.track(data, this.freshness.capture([])); };
  PlayerApi.prototype.loadRoute = async function () { return this.freshness.track({ data: {}, errors: {} }, this.freshness.capture([])); };
  PlayerApi.prototype.refreshResources = async function () {
    const store = structuredClone(data.store);
    store.items[0].name = "Authoritative replacement item";
    return this.freshness.track({ data: { store }, errors: {} }, this.freshness.capture([]));
  };
  const terminal = createPlayerTerminal({ mount, config });
  await new Promise(setImmediate);
  assert.equal(terminal.getState().status, "ready");
  assert.equal(terminal.getState().route, "store");
  const publish = (patch) => updateStoreFromSnapshot(terminal.getState(), patch);
  const runtime = {
    navigator: { onLine: true }, queueMicrotask,
    document: { createElement() {
      const template = {};
      Object.defineProperty(template, "innerHTML", { set(html) { this.content = { firstElementChild: indicatorNode(html) }; } });
      return template;
    } },
    setInterval() { return 0; }, clearInterval() {},
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  };
  t.after(() => {
    if (!destroyed) terminal.destroy();
    PlayerApi.prototype.bootstrap = bootstrap; PlayerApi.prototype.loadRoute = loadRoute;
    PlayerApi.prototype.refreshResources = refreshResources;
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return { terminal, mount, publish, runtime, writes: () => writes, markup: () => markup, indicator: () => indicator,
    destroy() { terminal.destroy(); destroyed = true; } };
}

test("late live-only reconnect does not replace the restored Store shell", async (t) => {
  const f = await fixture(t);
  f.publish({ live: { status: "updating", updatedAt: 1, error: "" } });
  const writes = f.writes(), data = f.terminal.getState().data;
  f.publish({ live: { status: "connected", updatedAt: 1, error: "" } });
  assert.equal(f.writes(), writes, "A late live-status publication must not replace the restored Store opener.");
  assert.strictEqual(f.terminal.getState().data, data);
  assert.equal(f.terminal.getState().live.status, "connected");
});

test("live status remains published to subscribers and the existing presenter", async (t) => {
  const f = await fixture(t), seen = [];
  const unsubscribe = f.terminal.subscribe((state) => seen.push(state.live.status));
  const presenter = installLiveStatusPresenter({ mount: f.mount, terminal: f.terminal, config: { usePreviewData: false }, runtime: f.runtime });
  try {
    const writes = f.writes();
    for (const [status, label] of [["updating", "UPDATING"], ["offline", "OFFLINE"], ["reconnecting", "RECONNECTING"], ["connected", "LIVE"]]) {
      f.publish({ live: { status, updatedAt: Date.now(), error: status === "offline" ? "network" : "" } });
      await Promise.resolve();
      assert.match(f.indicator().html, new RegExp(`data-player-live-status="${status}"`));
      assert.ok(f.indicator().html.includes(`<strong>${label}</strong>`));
      assert.match(f.indicator().html, /role="status" aria-live="polite"/);
      assert.equal(f.writes(), writes);
    }
    assert.deepEqual(seen, ["updating", "offline", "reconnecting", "connected"]);
    presenter.destroy(); unsubscribe();
    const before = f.indicator();
    f.publish({ live: { status: "offline" } }); await Promise.resolve();
    assert.strictEqual(f.indicator(), before, "Destroyed presentation must not resume.");
  } finally { presenter.destroy(); unsubscribe(); }
});

for (const [key, value] of [
  ["status", "waiting"], ["route", "inventory"], ["data", structuredClone(previewData)],
  ["error", { message: "new error" }], ["routeLoading", { store: true }],
  ["routeErrors", { store: { message: "failed read" } }], ["modal", { type: "connection" }],
  ["ui", { storeCategory: "Equipment" }], ["futureState", undefined], [Symbol("futureState"), 1],
]) {
  test(`a live update cannot hide a simultaneous ${String(key)} change`, async (t) => {
    const f = await fixture(t), writes = f.writes();
    f.publish((state) => ({ ...state, live: { status: "connected" }, [key]: value }));
    assert.ok(f.writes() > writes);
  });
}

test("removing a non-live field still renders, even when its value was undefined", async (t) => {
  const f = await fixture(t);
  f.publish({ futureState: undefined });
  const writes = f.writes();
  f.publish(({ futureState, ...state }) => ({ ...state, live: { status: "connected" } }));
  assert.ok(f.writes() > writes);
});

test("real resource publication and explicit render remain effective after live-only updates", async (t) => {
  const f = await fixture(t);
  f.publish({ live: { status: "updating" } });
  const writes = f.writes();
  await f.terminal.refreshResources(["store"]);
  assert.ok(f.writes() > writes);
  assert.match(f.markup(), /Authoritative replacement item/);
  const afterRefresh = f.writes();
  f.publish({ live: { status: "connected" } });
  assert.equal(f.writes(), afterRefresh);
  f.terminal.requestRender();
  assert.equal(f.writes(), afterRefresh + 1);
});

test("same-state notifications retain their render semantics and destroy unsubscribes", async (t) => {
  const f = await fixture(t), before = f.writes();
  f.publish({});
  assert.equal(f.writes(), before + 1);
  const retainedSnapshot = f.terminal.getState();
  f.destroy();
  const afterDestroy = f.writes();
  updateStoreFromSnapshot(retainedSnapshot, { live: { status: "connected" }, ui: {} });
  assert.equal(f.writes(), afterDestroy);
});


test("a superseded realtime read cannot repaint the shell on its later idle reconnect", { timeout: 5000 }, async (t) => {
  const freshness = createResourceFreshnessCoordinator();
  let first = true, release, started, poll, renders = 0;
  const startedRead = new Promise((resolve) => { started = resolve; });
  const config = {
    usePreviewData: false, authenticated: true, csrfToken: "C".repeat(43),
    deviceId: "11111111-1111-4111-8111-111111111111", gameSessionId: "synthetic-live-focus",
    publishableKey: "sb_publishable_live_focus_fixture", requestTimeoutMs: 5000, writeCooldownMs: 0,
    apiCall: async ({ endpointKey }) => {
      if (first) { first = false; started(); await new Promise((resolve) => { release = resolve; }); }
      return structuredClone(previewData[endpointKey]);
    },
  };
  const api = new PlayerApi(config, { freshness, deferFreshnessSettlement: true });
  const store = createStore({ status: "ready", route: "store", data: structuredClone(previewData), modal: null, ui: {} });
  const unsubscribe = subscribeTerminalRender(store, () => { renders++; });
  const terminal = { freshness, getState: store.getState, subscribe: store.subscribe, navigate() {} };
  const documentRef = new EventTarget(); documentRef.visibilityState = "visible";
  const nativeInterval = globalThis.setInterval;
  globalThis.setInterval = (callback) => { poll = callback; return 0; };
  let controller;
  try {
    controller = installPlayerInvalidationController({ terminal, config, eventTarget: new EventTarget(), documentRef,
      mount: { contains: () => false, querySelector: () => null } });
  } finally { globalThis.setInterval = nativeInterval; }
  t.after(() => { release?.(); controller.destroy(); unsubscribe(); api.abortSessionRequests(); });
  controller.refreshNow(["store"]);
  await startedRead;
  assert.equal(store.getState().live.status, "updating");
  const result = await api.refreshResources(["store"]);
  store.setState((state) => ({ ...state, data: { ...state.data, ...result.data } }));
  freshness.settle(freshness.ticketFor(result), "store");
  release(); await new Promise(setImmediate);
  assert.equal(store.getState().live.status, "updating");
  assert.equal(freshness.isPending("store"), false);
  assert.equal(renders, 1, "Only the authoritative resource publication needs a shell render.");
  const before = store.getState();
  const connected = new Promise((resolve) => {
    const stop = store.subscribe((state) => { if (state.live.status === "connected") { stop(); resolve(); } });
  });
  poll(); await connected;
  assert.strictEqual(store.getState().data, before.data);
  assert.equal(renders, 1, "The late idle reconnect must preserve the newly restored opener.");
});
