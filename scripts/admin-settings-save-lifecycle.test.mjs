import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const PAGE = ".admin-terminal-settings-page";
const SAVE = '[data-admin-terminal-action="save-settings"]';
const CARD = "[data-admin-attendance-reward-settings]";
const controllerSource = readFileSync("admin/attendance-reward-save-controller-v3.js", "utf8");
const presenterSource = readFileSync("admin/settings-simplified.js", "utf8");
const bridgeSource = readFileSync("admin/settings-save-error-bridge.js", "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) { if (predicate()) return; await tick(); }
  assert.fail("Settings fixture did not settle");
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const json = (body = {}, status = 200) => new Response(JSON.stringify(body), { status });

function fixture() {
  const listeners = new Map(), storage = new Map(), timers = new Map();
  const calls = [], events = [], errors = [];
  let sequence = 0, mounted = null, focused = null;
  const state = { game: "game-one", selected: "game-one", dirty: true, reply: () => json(), read: null };
  class Element {
    constructor(kind = "node") {
      this.kind = kind; this.tagName = kind === "status" ? "SPAN" : "DIV"; this.attrs = new Map(); this.connected = true;
      const names = new Set();
      this.classList = { add: (...values) => values.forEach((v) => names.add(v)), remove: (...values) => values.forEach((v) => names.delete(v)),
        contains: (v) => names.has(v), toggle: (v, on) => { if (on) names.add(v); else names.delete(v); } };
      this.dataset = new Proxy({}, { get: (_, k) => this.getAttribute("data-" + String(k).replace(/[A-Z]/g, (v) => "-" + v.toLowerCase())),
        set: (_, k, v) => { this.setAttribute("data-" + String(k).replace(/[A-Z]/g, (v) => "-" + v.toLowerCase()), v); return true; } });
    }
    get isConnected() { return this.connected && (!this.page || this.page.connected); }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    removeAttribute(k) { this.attrs.delete(k); }
    hasAttribute(k) { return this.attrs.has(k); }
    closest(selector) {
      if (selector === PAGE) return this.kind === "page" ? this : this.page || null;
      if (selector === SAVE) return this.kind === "button" ? this : null;
      if (selector === "[data-admin-section]") return this.kind === "nav" ? this : null;
      if (selector === "[data-game-setting-key]") return this.hasAttribute("data-game-setting-key") ? this : null;
      return null;
    }
    focus() { focused = this; }
    querySelector(selector) {
      const page = this.kind === "page" ? this : this.page;
      if (!page) return null;
      if (selector === SAVE) return page.button;
      if (selector === "[data-settings-save-status]") return page.status;
      if (selector === ".admin-terminal-settings-save-panel-v543") return page.panel;
      if (selector.startsWith(CARD)) return page.card;
      const name = selector.match(/^\[data-attendance-reward-field="([^"]+)"\]$/)?.[1];
      return name ? page.fields[name] || null : null;
    }
    querySelectorAll(selector) {
      if (selector === "[data-game-setting-key]") return [];
      if (selector.includes("[data-game-setting-key],")) return Object.values(this.fields || {});
      return [];
    }
    append() {}
  }
  class Input extends Element { constructor(name, value) { super("input"); this.tagName = "INPUT"; this.type = "number"; this.value = value; this.setAttribute("data-attendance-reward-field", name); } }
  class Button extends Element { constructor() { super("button"); this.disabled = false; } }
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  const document = {
    querySelector: (s) => s === PAGE ? mounted : mounted?.querySelector(s) || null,
    querySelectorAll: (s) => mounted?.querySelectorAll(s) || [],
    addEventListener(type, fn, capture = false) { const set = listeners.get(type) || new Map(); set.set(fn, capture); listeners.set(type, set); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event) { events.push(event); for (const fn of [...(listeners.get(event.type)?.keys() || [])]) { fn(event); if (event.stopped) break; } return true; },
    getElementById: () => null, createElement: () => new Element(), head: { append() {} },
  };
  function mount() {
    if (mounted) mounted.connected = false;
    const page = new Element("page");
    page.fields = { presentRewardAmount: new Input("presentRewardAmount", "7.25"), lateRewardAmount: new Input("lateRewardAmount", "0") };
    page.button = new Button(); page.card = new Element("card"); page.status = new Element("status"); page.panel = new Element("panel");
    for (const node of [...Object.values(page.fields), page.button, page.card, page.status, page.panel]) node.page = page;
    page.panel.parentElement = page;
    mounted = page;
    return page;
  }
  mount();
  const persisted = { timezone: "Etc/UTC", presentRewardAmount: 1, lateRewardAmount: 0, currencyMode: "player_country", currencyCode: "ECO", retained: true };
  async function request(input, init) {
    const call = { input, init, body: init?.body ? JSON.parse(init.body) : null }; calls.push(call);
    if (init.method === "GET") return state.read ? state.read(call) : json({ data: { settings: { attendanceWindow: persisted } } });
    return state.reply(call);
  }
  const window = {
    fetch: request, sessionStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` },
    Econovaria: { features: { adminOverviewTerminal: { get currentModel() { return { gameId: state.game }; } } } },
    EconovariaAdminGameSelection: { read: () => state.selected },
    EconovariaAttendanceRewardRequestAdapter: { request },
    EconovariaAttendanceRewardSettings: { isDirty: () => state.dirty, isLoaded: () => true, getGameId: () => state.game,
      getDraftWindow: () => persisted, getPersistedWindow: () => persisted },
    EconovariaSimplifiedSettings: { refresh() {} },
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame() {}, queueMicrotask, addEventListener() {},
  };
  const context = vm.createContext({ window, document, Element, HTMLElement: Element, HTMLButtonElement: Button,
    HTMLInputElement: Input, HTMLSelectElement: class extends Element {}, HTMLTextAreaElement: class extends Element {},
    CustomEvent, Response, Request, Headers, URL, console: { error: (value) => errors.push(value) } });
  function install() { vm.runInContext(controllerSource, context); }
  function click(target = mounted.button) { document.dispatchEvent({ type: "click", target, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }); }
  function navigate(name) { const nav = new Element("nav"); nav.setAttribute("data-admin-section", name); click(nav); }
  function presenter() { vm.runInContext(presenterSource, context); window.EconovariaSimplifiedSettings.refresh(); }
  install();
  return { state, calls, events, errors, window, document, storage, timers, context, mount, install, click, navigate, presenter,
    get page() { return mounted; }, get focused() { return focused; }, writes: () => calls.filter((c) => c.init.method === "PATCH"),
    saved: () => events.filter((e) => e.type === "econovaria:attendance-reward-saved"), listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0) };
}

test("REF-014 stylesheet bridge installs no listeners, observer or transport", () => {
  const h = fixture(), before = h.listenerCount(), fetch = h.window.fetch;
  vm.runInContext(bridgeSource, h.context);
  assert.equal(h.listenerCount(), before); assert.equal(h.window.fetch, fetch);
  assert.doesNotMatch(bridgeSource, /MutationObserver|requestAnimationFrame|addEventListener|window\.fetch\s*=/);
});

test("REF-014 direct save preserves payload, identity headers and one-request double-click behavior", async () => {
  const h = fixture(), pending = deferred(); h.state.reply = () => pending.promise;
  h.click(); h.click(); await until(() => h.writes().length === 1);
  const write = h.writes()[0], key = write.init.headers["X-Idempotency-Key"];
  assert.equal(write.input, "/api/admin/games/game-one/settings"); assert.equal(write.init.headers["X-Request-Id"], key);
  assert.equal(write.body.idempotencyKey, key); assert.equal(write.body.attendanceWindow.timezone, "Etc/UTC");
  assert.equal(write.body.attendanceWindow.presentRewardAmount, 7.25); assert.equal(write.body.attendanceWindow.retained, true);
  assert.equal(h.page.button.getAttribute("aria-busy"), "true"); pending.resolve(json());
  await until(() => h.saved().length === 1); assert.equal(h.writes().length, 1); assert.equal(h.storage.size, 0);
});

for (const [status, message] of [[400, "Invalid timezone"], [403, "Wrong game or permission denied"], [503, "Service unavailable"]]) {
  test(`REF-014 ${status} rejection retains draft/error and same-payload retry key`, async () => {
    const h = fixture(); h.state.reply = () => json({ message }, status); h.click();
    await until(() => h.errors.length === 1);
    assert.equal(h.saved().length, 0); assert.equal(h.page.fields.presentRewardAmount.value, "7.25");
    assert.equal(h.page.button.dataset.attendanceRewardError, message); assert.equal(h.page.button.dataset.adminTerminalApiState, "error");
    const key = h.writes()[0].body.idempotencyKey;
    h.state.reply = () => json(); h.click(); await until(() => h.saved().length === 1);
    assert.equal(h.writes()[1].body.idempotencyKey, key); assert.equal(h.page.button.hasAttribute("data-attendance-reward-error"), false);
  });
}

test("REF-014 offline rejection never acknowledges success", async () => {
  const h = fixture(); h.state.reply = () => { throw new Error("synthetic offline"); }; h.click();
  await until(() => h.errors.length === 1); assert.equal(h.saved().length, 0); assert.equal(h.writes().length, 1);
});

test("REF-014 no-op and invalid settings do not write and invalid input keeps focus", async () => {
  const h = fixture(); h.state.dirty = false; h.click(); await tick(); assert.equal(h.calls.length, 0);
  h.state.dirty = true; h.page.fields.presentRewardAmount.value = "1001"; h.click(); await tick();
  assert.equal(h.calls.length, 0); assert.equal(h.focused, h.page.fields.presentRewardAmount);
  assert.equal(h.focused.getAttribute("aria-invalid"), "true");
});

for (const replacement of ["page", "route", "game", "dispose"]) for (const status of [200, 403]) {
  test(`REF-014 stale ${status} after ${replacement} cannot update or acknowledge replacement context`, async () => {
    const h = fixture(), pending = deferred(); h.state.reply = () => pending.promise; h.click();
    await until(() => h.writes().length === 1);
    if (replacement === "page") h.mount();
    if (replacement === "route") { h.navigate("Players"); h.navigate("Settings"); }
    if (replacement === "game") { h.state.selected = "game-two"; h.state.game = "game-two"; }
    if (replacement === "dispose") h.window.EconovariaAttendanceRewardSaveController.dispose();
    const before = JSON.stringify([...h.page.button.attrs]); pending.resolve(json({ message: "old failure" }, status));
    for (let i = 0; i < 20; i++) await tick();
    assert.equal(h.saved().length, 0); assert.equal(h.errors.length, 0); assert.equal(JSON.stringify([...h.page.button.attrs]), before);
  });
}

test("REF-014 stale pre-save GET prevents the mutation", async () => {
  const h = fixture(), pending = deferred(); h.state.read = () => pending.promise;
  h.click(); await until(() => h.calls.length === 1); h.mount();
  pending.resolve(json({ data: { settings: { attendanceWindow: { timezone: "Etc/UTC" } } } }));
  for (let i = 0; i < 20; i++) await tick(); assert.equal(h.writes().length, 0); assert.equal(h.saved().length, 0);
});

test("REF-014 listener disposal is idempotent and reinstallation does not multiply saves", async () => {
  const h = fixture(), before = h.listenerCount();
  const identity = h.window.EconovariaAttendanceRewardSaveController.getContextIdentity();
  h.install(); assert.equal(h.listenerCount(), before);
  assert.notEqual(h.window.EconovariaAttendanceRewardSaveController.getContextIdentity(), identity);
  h.window.EconovariaAttendanceRewardSaveController.dispose(); h.window.EconovariaAttendanceRewardSaveController.dispose();
  assert.equal(h.listenerCount(), 0); h.click(); await tick(); assert.equal(h.calls.length, 0);
  h.install(); h.click(); await until(() => h.saved().length === 1); assert.equal(h.writes().length, 1);
});

test("REF-014 presenter retains generic errors and never styles failed saves as success", () => {
  const h = fixture(); h.presenter();
  h.window.EconovariaSimplifiedSettings.acknowledgeSaved({ gameId: "game-one" });
  h.state.dirty = false; h.page.button.dataset.adminTerminalApiState = "error";
  h.window.EconovariaSimplifiedSettings.refresh();
  assert.equal(h.page.panel.classList.contains("is-error"), true); assert.equal(h.page.panel.classList.contains("is-saved"), false);
  assert.match(h.page.status.textContent, /not saved/); assert.equal(h.page.button.dataset.adminTerminalApiState, "error");
  h.page.button.removeAttribute("data-admin-terminal-api-state"); h.page.button.dataset.attendanceRewardError = "denied";
  h.window.EconovariaSimplifiedSettings.refresh(); assert.match(h.page.status.textContent, /not saved/);
});

test("REF-014 an old same-game completion cannot discard a newer payload retry identity", async () => {
  const h = fixture(), old = deferred(), newer = deferred();
  h.state.reply = () => old.promise; h.click(); await until(() => h.writes().length === 1);
  h.mount(); h.page.fields.presentRewardAmount.value = "8.25"; h.state.reply = () => newer.promise;
  h.click(); await until(() => h.writes().length === 2);
  const newKey = h.writes()[1].body.idempotencyKey;
  old.resolve(json()); for (let i = 0; i < 20; i++) await tick();
  assert.equal(JSON.parse([...h.storage.values()][0]).key, newKey);
  newer.resolve(json({ message: "retry required" }, 503)); await until(() => h.errors.length === 1);
  h.state.reply = () => json(); h.click(); await until(() => h.saved().length === 1);
  assert.equal(h.writes()[2].body.idempotencyKey, newKey);
});

test("REF-014 selector mismatch prevents a direct write", async () => {
  const h = fixture(); h.state.selected = "other-game"; h.click(); await tick();
  assert.equal(h.calls.length, 0); assert.equal(h.saved().length, 0);
});
