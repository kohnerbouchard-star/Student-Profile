import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const managerSource = await readFile("admin/auth-session-manager.js", "utf8");
const safeExitSource = await readFile("admin/session-timeout-safe-exit.js", "utf8");
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const ABSOLUTE = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
const CSRF = "C".repeat(43);

function safeSession(overrides = {}) {
  return {
    authenticated: true,
    expiresAt: FUTURE,
    absoluteExpiresAt: ABSOLUTE,
    assuranceLevel: "aal1",
    mfaRequired: true,
    user: { id: "staff-1", email: "staff@example.test", displayName: "Staff" },
    csrfToken: CSRF,
    activeGameSessions: [{ id: "game-1", name: "Game", status: "active" }],
    ...overrides
  };
}

function createRuntime(fetch) {
  const sessionValues = new Map();
  const localValues = new Map();
  const sessionStorage = {
    getItem: (key) => sessionValues.get(key) ?? null,
    setItem: (key, value) => sessionValues.set(key, String(value)),
    removeItem: (key) => sessionValues.delete(key)
  };
  const localStorage = {
    getItem: (key) => localValues.get(key) ?? null,
    setItem: (key, value) => localValues.set(key, String(value)),
    removeItem: (key) => localValues.delete(key)
  };
  const window = {
    fetch,
    sessionStorage,
    localStorage,
    crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    EconovariaRuntimeConfig: Object.freeze({
      environment: "staging",
      supabaseUrl: "https://runtimefixture123456.supabase.co",
      supabasePublishableKey: "sb_publishable_runtime_fixture",
      webSessionApiUrl: "https://runtimefixture123456.supabase.co/functions/v1/web-session-api"
    }),
    dispatchEvent() {}
  };
  window.window = window;
  vm.runInNewContext(managerSource, {
    window,
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
  return { manager: window.EconovariaAdminAuthSession, sessionStorage, localStorage };
}

{
  let calls = 0;
  const { manager, sessionStorage } = createRuntime(async () => {
    calls += 1;
    throw new Error("unexpected fetch");
  });
  const current = safeSession();
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(current));
  assert.equal((await manager.getUsableSession()).csrfToken, CSRF);
  assert.equal(calls, 0, "valid safe state must not query status");
  assert.equal(JSON.stringify(manager.read()).includes("accessToken"), false);
  assert.equal(JSON.stringify(manager.read()).includes("refreshToken"), false);
}

{
  let calls = 0;
  let releaseFetch;
  const pending = new Promise((resolve) => { releaseFetch = resolve; });
  const { manager, sessionStorage } = createRuntime(async (url, init) => {
    calls += 1;
    assert.match(url, /web-session-api\/status$/);
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "include");
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.headers.apikey, "sb_publishable_runtime_fixture");
    assert.equal(init.headers["x-econovaria-device-id"], "11111111-1111-4111-8111-111111111111");
    await pending;
    return new Response(JSON.stringify({
      ok: true,
      session: {
        authenticated: true,
        expiresAt: FUTURE,
        absoluteExpiresAt: ABSOLUTE,
        assuranceLevel: "aal1",
        mfaRequired: true
      },
      user: { id: "staff-1", email: "staff@example.test", displayName: "Staff" },
      csrfToken: CSRF,
      activeGameSessions: [{ id: "game-1", name: "Game", status: "active" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(safeSession({
    expiresAt: new Date(Date.now() - 5000).toISOString()
  })));
  const first = manager.getUsableSession();
  const second = manager.getUsableSession();
  releaseFetch();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(calls, 1, "concurrent callers must share one status request");
  assert.equal(one.csrfToken, CSRF);
  assert.equal(two.csrfToken, CSRF);
  const stored = JSON.parse(sessionStorage.getItem("econovaria.admin.auth.v1"));
  assert.equal(stored.authenticated, true);
  assert.equal(Object.hasOwn(stored, "accessToken"), false);
  assert.equal(Object.hasOwn(stored, "refreshToken"), false);
}

{
  const { manager, sessionStorage } = createRuntime(async () =>
    new Response(JSON.stringify({ ok: false }), { status: 401 })
  );
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(safeSession({
    expiresAt: new Date(Date.now() - 5000).toISOString()
  })));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", "game-1");
  assert.equal(await manager.getUsableSession(), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.auth.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.selected-game.v1"), null);
}

{
  let request = null;
  const { manager, sessionStorage } = createRuntime(async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(safeSession()));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", "game-1");
  await manager.signOut();
  assert.match(request.url, /web-session-api\/logout$/);
  assert.equal(request.init.credentials, "include");
  assert.equal(request.init.headers.Authorization, undefined);
  assert.equal(sessionStorage.getItem("econovaria.admin.auth.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.selected-game.v1"), null);
}

{
  const values = new Map([
    ["econovaria.admin.auth.v1", JSON.stringify(safeSession())],
    ["econovaria.admin.selected-game.v1", "game-1"],
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
    async getUsableSession() { return this.read(); },
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
    ECONOVARIA_CSRF_TOKEN: CSRF,
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
  assert.equal(window.EconovariaAdminSessionExit.exit("session-expired"), false);
  assert.equal(clearCount, 1);
  assert.equal(sessionStorage.getItem("econovaria.admin.auth.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.selected-game.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.idle-seed-fingerprint.v1"), null);
  assert.equal(window.ECONOVARIA_CSRF_TOKEN, "");
  assert.equal(window.currentSession, null);
  assert.equal(window.state.staffSession, null);
  assert.equal(preview.inert, true);
  assert.equal(preview.hidden, true);
  assert.equal(attributes.get("preview:aria-hidden"), "true");
  assert.equal(gate.hidden, false);
  assert.equal(attributes.get("gate:role"), "alert");
  assert.equal(gate.hidden, false);
  assert.equal(status.textContent, "Administrator session expired. Returning to sign in.");
  assert.equal(document.title, "Session expired · Econovaria Administrator");

  for (const handler of timeouts.values()) handler();
  assert.deepEqual(redirects, ["https://example.test/?mode=admin&reason=session-expired"]);
}

console.log("Admin HttpOnly BFF session state, deduplication, rejection, logout, and safe timeout exit passed.");
