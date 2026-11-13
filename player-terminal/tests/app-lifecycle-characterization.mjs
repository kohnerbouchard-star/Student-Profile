import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlayerTerminal } from "../src/app.js";
import { abortPlayerApiSessionRequests } from "../src/api/player-api.js";
import { previewData } from "../src/data/preview-data.js";

// Exercise the public terminal with real API, session handoff, store, coordinator
// and renderers. Only the DOM/event boundary and read transport are synthetic.
class Element extends EventTarget {
  innerHTML = "";
  childNodes = [];
  disabled = false;
  dataset = {};
  attributes = new Map();
  classList = { add() {}, remove() {} };
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  append(...nodes) { this.childNodes.push(...nodes); }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  matches() { return false; }
  remove() {}
}
const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  assert.fail("Terminal lifecycle did not settle within 100 event-loop turns");
}
function fixture(t, { connected = true, freshness, legacy = false, config: overrides = {} } = {}) {
  const keys = ["HTMLElement", "HTMLButtonElement", "document", "location", "addEventListener", "removeEventListener", "dispatchEvent", "CustomEvent", "requestAnimationFrame", "cancelAnimationFrame", "setInterval", "clearInterval", "ECONOVARIA_PLAYER_SESSION", "Econovaria"];
  const saved = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = new EventTarget(), frames = new Map(), holds = new Map(), allHolds = new Set(), calls = [], invalid = [], required = [], host = [];
  let frameId = 0, version = 0, destroyed = false;
  Object.assign(globalThis, {
    HTMLElement: Element, HTMLButtonElement: Element, document: { title: "", activeElement: null, createElement: () => new Element() },
    location: { hash: "#inventory", search: "", hostname: "localhost" },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    CustomEvent: class extends Event { constructor(name, options) { super(name); this.detail = options.detail; } },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); },
    setInterval() { return 0; }, clearInterval() {}, ECONOVARIA_PLAYER_SESSION: undefined, Econovaria: undefined,
  });
  const config = {
    usePreviewData: false, authenticated: connected, csrfToken: connected ? "C".repeat(43) : "", gameSessionId: connected ? "fixture-game" : "",
    requestTimeoutMs: 5000, writeCooldownMs: 0, allowedImageHosts: [], capabilities: { routes: { inventory: true }, actions: { marketWatchlist: true } },
    resourceFreshnessMs: { inventory: 60000 }, sessionReadyEvent: "fixture:ready", sessionRequiredEvent: "fixture:required", sessionInvalidEvent: "fixture:invalid",
    onSessionInvalid: (detail) => invalid.push(detail), onSessionRequired: (detail) => required.push(detail),
    apiCall: async (context) => {
      calls.push({ key: context.endpointKey, method: context.method, game: context.session.gameSessionId });
      const value = structuredClone(previewData[context.endpointKey]);
      if (value && !Array.isArray(value)) value.marker = version;
      const hold = holds.get(context.endpointKey)?.shift();
      if (hold) { hold.started.resolve(); await hold.promise; if (hold.error) throw hold.error; }
      return context.method === "POST" ? { ok: true } : value;
    }, ...overrides,
  };
  for (const name of [config.sessionRequiredEvent, config.sessionInvalidEvent]) events.addEventListener(name, (event) => host.push({ name, detail: event.detail }));
  const mount = new Element();
  const terminal = createPlayerTerminal({ mount, config, ...(legacy ? { freshness: null } : freshness ? { freshness } : {}) });
  const destroy = () => { if (!destroyed) { terminal.destroy(); destroyed = true; } };
  t.after(() => {
    destroy(); abortPlayerApiSessionRequests(config);
    for (const hold of allHolds) hold.resolve();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  return { terminal, config, mount, calls, invalid, required, host, frames, events, destroy,
    version(next) { version = next; },
    hold(key, error) { const hold = { ...deferred(), started: deferred(), error }; allHolds.add(hold); const queue = holds.get(key) || []; queue.push(hold); holds.set(key, queue); return hold; },
    ready: () => until(() => terminal.getState().status === "ready" && terminal.getState().routeLoading.inventory === false),
  };
}
const handoff = (gameSessionId = "next-game") => ({ authenticated: true, csrfToken: "D".repeat(43), gameSessionId });
const unauthorized = () => Object.assign(new Error("fixture session expired"), { status: 401, code: "SESSION_INVALID", requestId: "fixture-request" });

test("missing session waits, announces the host requirement and performs no reads", async (t) => {
  const f = fixture(t, { connected: false });
  await until(() => f.terminal.getState().status === "waiting");
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.required, [{ reason: "missing_player_session", terminal: "player" }]);
  assert.deepEqual(f.host, [{ name: "fixture:required", detail: f.required[0] }]);
  assert.match(f.mount.innerHTML, /AWAITING EXISTING PLAYER SESSION/);
});

test("invalid handoff rejects without reads; valid handoff connects and refresh reloads", async (t) => {
  const f = fixture(t, { connected: false }); await until(() => f.required.length === 1);
  await assert.rejects(f.terminal.connectSession({ playerSessionToken: "unsupported" }), TypeError);
  assert.deepEqual(f.calls, []);
  await f.terminal.connectSession(handoff()); await f.ready();
  assert.equal(f.config.gameSessionId, "next-game");
  assert.ok(f.calls.every((call) => call.game === "next-game"));
  f.version(2); await f.terminal.refresh();
  assert.equal(f.terminal.getState().data.session.marker, 2);
  assert.equal(f.terminal.getState().error, null);
});

test("session-ready event adopts a valid session through the public host boundary", async (t) => {
  const f = fixture(t, { connected: false }); await until(() => f.required.length === 1);
  f.events.dispatchEvent(new CustomEvent("fixture:ready", { detail: handoff() })); await f.ready();
  assert.equal(f.terminal.getState().status, "ready"); assert.equal(f.config.csrfToken, "D".repeat(43));
});

for (const legacy of [false, true]) {
  test(`resource refresh normalizes keys and merges data/status (${legacy ? "null" : "default"} freshness)`, async (t) => {
    const f = fixture(t, { legacy }); await f.ready();
    const before = f.terminal.getState().data, count = f.calls.length;
    for (const keys of [undefined, "inventory", [null, "", 1]]) assert.deepEqual(await f.terminal.refreshResources(keys), { data: {}, errors: {}, resourceStatus: {} });
    assert.equal(f.calls.length, count);
    f.version(3);
    const result = await f.terminal.refreshResources(["inventory", "inventory", "", null]);
    assert.deepEqual(f.calls.slice(count).map((call) => call.key), ["inventory"]);
    const data = f.terminal.getState().data;
    assert.equal(data.inventory.marker, 3); assert.equal(result.data.inventory.marker, 3);
    assert.strictEqual(data.session, before.session); assert.notStrictEqual(data, before);
    assert.equal(data.resourceStatus.inventory.state, "ready");
    assert.deepEqual(data.resourceStatus.session, before.resourceStatus.session);
    if (!legacy) assert.equal(f.terminal.freshness.isPending("inventory"), false);
  });
}

test("non-auth resource error remains a returned batch and leaves invalidation pending", async (t) => {
  const f = fixture(t); await f.ready();
  const hold = f.hold("inventory", { status: 409, code: "FIXTURE_CONFLICT" });
  const pending = f.terminal.refreshResources(["inventory"]); await hold.started.promise; hold.resolve();
  const result = await pending;
  assert.equal(result.errors.inventory.status, 409); assert.equal(f.terminal.getState().status, "ready");
  assert.equal(f.terminal.freshness.isPending("inventory"), true); assert.deepEqual(f.invalid, []);
});

for (const operation of ["bootstrap", "resource", "route"]) {
  test(`current ${operation} 401 announces invalid session and clears active UI`, async (t) => {
    const f = fixture(t); await f.ready(); f.terminal.openModal({ type: "connection" });
    const hold = f.hold(operation === "bootstrap" ? "session" : "inventory", unauthorized());
    let pending;
    if (operation === "bootstrap") pending = f.terminal.refresh();
    else if (operation === "resource") pending = assert.rejects(f.terminal.refreshResources(["inventory"]), (error) => error.status === 401);
    else { f.terminal.freshness.invalidate(["inventory"]); f.events.dispatchEvent(new Event("hashchange")); }
    await hold.started.promise; hold.resolve(); if (pending) await pending;
    await until(() => f.terminal.getState().status === "waiting");
    assert.equal(f.invalid.length, 1);
    assert.match(f.invalid[0].requestId, /^ptr_/);
    assert.deepEqual(f.invalid, [{ reason: "invalid_player_session", status: 401, code: "SESSION_INVALID", requestId: f.invalid[0].requestId }]);
    assert.deepEqual(f.host, [{ name: "fixture:invalid", detail: f.invalid[0] }]);
    assert.equal(f.terminal.getState().modal, null); assert.deepEqual(f.terminal.getState().routeLoading, {});
  });
}

test("latest session-provider resolution wins without applying an older handoff", async (t) => {
  const first = deferred(), second = deferred(); let calls = 0;
  const f = fixture(t, { connected: false, config: { sessionProvider: () => (++calls === 1 ? first.promise : second.promise) } });
  const refresh = f.terminal.refresh(); second.resolve(handoff("new-game")); await refresh;
  const state = f.terminal.getState(), markup = f.mount.innerHTML;
  first.resolve(handoff("old-game")); await tick();
  assert.strictEqual(f.terminal.getState(), state); assert.equal(f.mount.innerHTML, markup);
  assert.equal(f.config.gameSessionId, "new-game"); assert.ok(f.calls.every((call) => call.game === "new-game"));
});

for (const failure of [false, true]) {
  test(`session replacement prevents late ${failure ? "401 callbacks" : "bootstrap publication"}`, async (t) => {
    const f = fixture(t); await f.ready();
    const hold = f.hold("session", failure ? unauthorized() : null);
    f.version(1); const old = f.terminal.refresh(); await hold.started.promise;
    f.version(2); await f.terminal.connectSession(handoff());
    const state = f.terminal.getState(), markup = f.mount.innerHTML;
    hold.resolve(); await old;
    assert.strictEqual(f.terminal.getState(), state); assert.equal(f.mount.innerHTML, markup);
    assert.equal(state.data.session.marker, 2); assert.deepEqual(f.invalid, []);
  });
}

for (const operation of ["bootstrap", "resource"]) for (const failure of [false, true]) {
  test(`destroy fences held ${operation} ${failure ? "401" : "success"} and later public loads`, async (t) => {
    const f = fixture(t); await f.ready();
    const hold = f.hold(operation === "bootstrap" ? "session" : "inventory", failure ? unauthorized() : null);
    const pending = operation === "bootstrap" ? f.terminal.refresh() : f.terminal.refreshResources(["inventory"]);
    // Attach the rejection observer before releasing retired work.
    const settled = pending.then(() => null, (error) => error);
    await hold.started.promise; f.destroy(); const state = f.terminal.getState(), count = f.calls.length;
    hold.resolve(); const error = await settled;
    if (operation === "resource") assert.equal(error.code, "REQUEST_ABORTED");
    assert.strictEqual(f.terminal.getState(), state); assert.equal(f.mount.innerHTML, ""); assert.deepEqual(f.invalid, []); assert.equal(f.frames.size, 0);
    await f.terminal.refresh(); await f.terminal.connectSession(handoff()); await f.terminal.refreshResources(["inventory"]);
    assert.equal(f.calls.length, count);
  });
}

for (const failure of [false, true]) {
  test(`new resource refresh wins over an older ${failure ? "401" : "value"}`, async (t) => {
    const f = fixture(t); await f.ready(); f.version(1);
    const hold = f.hold("inventory", failure ? unauthorized() : null);
    const old = f.terminal.refreshResources(["inventory"]).then(() => null, (error) => error);
    await hold.started.promise; f.version(2); await f.terminal.refreshResources(["inventory"]);
    const state = f.terminal.getState(), markup = f.mount.innerHTML;
    hold.resolve(); const error = await old;
    assert.equal(error.code, "REQUEST_SUPERSEDED");
    assert.strictEqual(f.terminal.getState(), state); assert.equal(f.mount.innerHTML, markup);
    assert.equal(state.data.inventory.marker, 2); assert.equal(f.terminal.freshness.isPending("inventory"), false);
    assert.deepEqual(f.invalid, []);
  });
}

test("route loading keeps the shell ready and a current route error stays section-local", async (t) => {
  const f = fixture(t); await f.ready();
  const before = f.terminal.getState().data;
  const hold = f.hold("inventory", { status: 409, code: "FIXTURE_CONFLICT" });
  f.terminal.freshness.invalidate(["inventory"]); f.events.dispatchEvent(new Event("hashchange"));
  await hold.started.promise;
  assert.equal(f.terminal.getState().status, "ready"); assert.equal(f.terminal.getState().routeLoading.inventory, true);
  hold.resolve(); await until(() => f.terminal.getState().routeLoading.inventory === false);
  assert.equal(f.terminal.getState().status, "ready"); assert.equal(f.terminal.getState().routeErrors.inventory.cause.status, 409);
  assert.strictEqual(f.terminal.getState().data, before); assert.match(f.mount.innerHTML, /SECTION UNAVAILABLE/); assert.deepEqual(f.invalid, []);
});

test("current bootstrap non-auth failure enters the connection error state", async (t) => {
  const f = fixture(t); await f.ready();
  const hold = f.hold("session", { status: 409, code: "FIXTURE_CONFLICT" });
  const pending = f.terminal.refresh(); await hold.started.promise; hold.resolve(); await pending;
  assert.equal(f.terminal.getState().status, "error"); assert.equal(f.terminal.getState().error.status, 409);
  assert.match(f.mount.innerHTML, /player-terminal-error-shell/); assert.deepEqual(f.invalid, []);
});

function clickWatchlist(f) {
  const button = new Element(), original = { textContent: "Watch asset" }, requests = [];
  button.childNodes = [original]; button.dataset = { playerMarketWatchlist: "nova", watchlisted: "false" };
  button.closest = (selector) => selector === "[data-player-market-watchlist]" || selector === "button, a, summary, input, select, textarea" ? button : null;
  f.mount.addEventListener("econovaria:player-api-request", (event) => requests.push(event.detail));
  const event = new Event("click", { cancelable: true });
  Object.defineProperty(event, "target", { value: button }); f.mount.dispatchEvent(event);
  return { button, original, requests };
}
function assertRestored({ button, original }) {
  assert.equal(button.disabled, false); assert.equal(button.attributes.has("aria-busy"), false);
  assert.deepEqual(button.childNodes, [original]); assert.strictEqual(button.childNodes[0], original);
}

test("public click emits normalized request, refreshes after mutation and restores completed control on retirement", async (t) => {
  const f = fixture(t); await f.ready(); const count = f.calls.length;
  const hold = f.hold("marketWatchlist"), click = clickWatchlist(f);
  await hold.started.promise;
  assert.equal(click.button.disabled, true); assert.equal(click.button.attributes.get("aria-busy"), "true");
  assert.equal(click.button.childNodes.at(-1).textContent, "Processing");
  assert.deepEqual(click.requests, [{ endpointKey: "marketWatchlist", method: "POST", path: "/market/watchlist/nova", payload: { enabled: true, gameSessionId: previewData.session.gameSessionId }, params: { assetId: "nova" } }]);
  hold.resolve(); await until(() => f.mount.childNodes.length > 0);
  assert.deepEqual(f.calls.slice(count).map(({ key, method }) => [key, method]), [["marketWatchlist", "POST"], ["market", "GET"]]);
  assert.equal(click.button.childNodes.at(-1).textContent, "Completed"); assert.equal(click.button.disabled, false);
  assert.equal(f.mount.childNodes.at(-1).textContent, "Action completed and current information refreshed.");
  f.destroy(); assertRestored(click);
});

for (const retirement of ["destroy", "session"]) for (const failure of [false, true]) {
  test(`${retirement} restores pending mutation control and suppresses late ${failure ? "401" : "success"} effects`, async (t) => {
    const f = fixture(t); await f.ready();
    const hold = f.hold("marketWatchlist", failure ? unauthorized() : null), click = clickWatchlist(f);
    await hold.started.promise; assert.equal(click.button.disabled, true);
    if (retirement === "destroy") f.destroy(); else await f.terminal.connectSession(handoff());
    assertRestored(click);
    const state = f.terminal.getState(), markup = f.mount.innerHTML, count = f.calls.length;
    hold.resolve(); await tick(); await tick();
    assertRestored(click); assert.strictEqual(f.terminal.getState(), state); assert.equal(f.mount.innerHTML, markup);
    assert.equal(f.calls.length, count, "Retired write must not begin follow-up resource reads.");
    assert.deepEqual(f.mount.childNodes, [], "Retired write must not append a success/error toast.");
    assert.deepEqual(f.invalid, []);
  });
}
