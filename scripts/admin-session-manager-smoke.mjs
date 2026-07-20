import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const managerSource = await readFile("admin/auth-session-manager.js", "utf8");
const safeExitSource = await readFile("admin/session-timeout-safe-exit.js", "utf8");

function token(exp) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp, sub: "staff-1" })}.signature`;
}

function createRuntime(fetch) {
  const values = new Map();
  const sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const window = {
    fetch,
    sessionStorage,
    EconovariaRuntimeConfig: Object.freeze({
      environment: "staging",
      supabaseUrl: "https://runtime-fixture.supabase.co",
      supabasePublishableKey: "runtime-fixture-publishable-key"
    }),
    dispatchEvent() {}
  };
  window.window = window;
  vm.runInNewContext(managerSource, {
    window,
    atob: (value) => Buffer.from(value, "base64").toString("utf8"),
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    String
  });
  return { manager: window.EconovariaAdminAuthSession, sessionStorage };
}

{
  let calls = 0;
  const { manager, sessionStorage } = createRuntime(async () => {
    calls += 1;
    throw new Error("unexpected fetch");
  });
  const current = { accessToken: token(Math.floor(Date.now() / 1000) + 3600), refreshToken: "r1" };
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(current));
  assert.equal((await manager.getUsableSession()).accessToken, current.accessToken);
  assert.equal(calls, 0, "valid sessions must not refresh");
}

{
  let calls = 0;
  let releaseFetch;
  const pending = new Promise((resolve) => { releaseFetch = resolve; });
  const { manager, sessionStorage } = createRuntime(async (url, init) => {
    calls += 1;
    assert.match(url, /grant_type=refresh_token/);
    assert.equal(JSON.parse(init.body).refresh_token, "old-refresh");
    await pending;
    return new Response(JSON.stringify({
      access_token: token(Math.floor(Date.now() / 1000) + 3600),
      refresh_token: "rotated-refresh",
      user: { id: "staff-1" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken: token(Math.floor(Date.now() / 1000) - 5),
    refreshToken: "old-refresh"
  }));
  const first = manager.getUsableSession();
  const second = manager.getUsableSession();
  releaseFetch();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(calls, 1, "concurrent callers must share one refresh");
  assert.equal(one.refreshToken, "rotated-refresh");
  assert.equal(two.accessToken, one.accessToken);
  assert.equal(JSON.parse(sessionStorage.getItem("econovaria.admin.auth.v1")).refreshToken, "rotated-refresh");
}

{
  const { manager, sessionStorage } = createRuntime(async () => new Response("rejected", { status: 401 }));
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken: token(Math.floor(Date.now() / 1000) - 5),
    refreshToken: "revoked"
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", "game-1");
  await assert.rejects(() => manager.getUsableSession(), /rejected/);
  assert.equal(sessionStorage.getItem("econovaria.admin.auth.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.selected-game.v1"), null);
}

{
  const values = new Map([
    ["econovaria.admin.auth.v1", JSON.stringify({
      accessToken: token(Math.floor(Date.now() / 1000) + 3600),
      refreshToken: "refresh"
    })],
    ["econovaria.admin.selected-game.v1", "game-1"],
    ["econovaria.admin.csrf.v1", "csrf"],
    ["econovaria.admin.idle-seed-fingerprint.v1", "fingerprint"]
  ]);
  const attributes = new Map();
  const preview = {
    inert: false,
    hidden: false,
    setAttribute(name, value) { attributes.set(`preview:${name}`, value); }
  };
  const status = { textContent: "Verifying administrator access" };
  const gate = {
    hidden: true,
    setAttribute(name, value) { attributes.set(`gate:${name}`, value); },
    querySelector(selector) { return selector === ".admin-qol-sr-only" ? status : null; }
  };
  const documentListeners = new Map();
  const documentElement = {
    setAttribute(name, value) { attributes.set(`html:${name}`, value); }
  };
  const document = {
    title: "Administrator Console",
    visibilityState: "visible",
    documentElement,
    getElementById(id) {
      if (id === "adminPreview") return preview;
      if (id === "adminSessionGate") return gate;
      return null;
    },
    addEventListener(name, handler) { documentListeners.set(name, handler); }
  };
  const windowListeners = new Map();
  const redirects = [];
  const timeouts = new Map();
  let timeoutId = 0;
  let clearCount = 0;
  const sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const manager = {
    read() {
      const raw = sessionStorage.getItem("econovaria.admin.auth.v1");
      return raw ? JSON.parse(raw) : null;
    },
    parseJwt(accessToken) {
      const payload = accessToken.split(".")[1];
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    },
    async getUsableSession() {
      return this.read();
    },
    clear() {
      clearCount += 1;
      sessionStorage.removeItem("econovaria.admin.auth.v1");
      sessionStorage.removeItem("econovaria.admin.selected-game.v1");
    }
  };
  const window = {
    document,
    sessionStorage,
    EconovariaAdminAuthSession: manager,
    ECONOVARIA_CSRF_TOKEN: "csrf",
    currentSession: { role: "ADMIN" },
    state: { staffSession: { staffId: "staff-1" } },
    location: {
      href: "https://example.test/admin/index.html",
      replace(value) { redirects.push(value); }
    },
    addEventListener(name, handler) { windowListeners.set(name, handler); },
    dispatchEvent() {},
    setTimeout(handler) {
      timeoutId += 1;
      timeouts.set(timeoutId, handler);
      return timeoutId;
    },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval() { return 500; },
    clearInterval() {}
  };
  window.window = window;

  vm.runInNewContext(safeExitSource, {
    window,
    document,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    URL,
    Date,
    Math,
    Number,
    Object,
    String
  });

  assert.equal(typeof window.EconovariaAdminSessionExit?.exit, "function");
  assert.equal(window.EconovariaAdminSessionExit.exit("session-expired"), true);
  assert.equal(window.EconovariaAdminSessionExit.exit("session-expired"), false, "safe exit must be idempotent");
  assert.equal(clearCount, 1);
  assert.equal(sessionStorage.getItem("econovaria.admin.auth.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.selected-game.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.csrf.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.idle-seed-fingerprint.v1"), null);
  assert.equal(window.ECONOVARIA_CSRF_TOKEN, "");
  assert.equal(window.currentSession, null);
  assert.equal(window.state.staffSession, null);
  assert.equal(preview.inert, true);
  assert.equal(preview.hidden, true);
  assert.equal(attributes.get("preview:aria-hidden"), "true");
  assert.equal(gate.hidden, false);
  assert.equal(attributes.get("gate:role"), "alert");
  assert.equal(attributes.get("gate:aria-live"), "assertive");
  assert.equal(status.textContent, "Administrator session expired. Returning to sign in.");
  assert.equal(document.title, "Session expired · Econovaria Administrator");

  for (const handler of timeouts.values()) handler();
  assert.deepEqual(redirects, ["https://example.test/?mode=admin&reason=session-expired"]);
}

console.log("Admin session refresh, rotation, deduplication, rejection, and safe timeout exit passed.");
