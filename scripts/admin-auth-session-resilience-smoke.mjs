import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const managerSource = await readFile("admin/auth-session-manager.js", "utf8");
const gateSource = await readFile("admin/session-gate.js", "utf8");
const SESSION_KEY = "econovaria.admin.auth.v1";
const GAME_KEY = "econovaria.admin.selected-game.v1";
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const CSRF = "C".repeat(43);
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const ABSOLUTE = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
const PERMISSIONS = [
  "account.read",
  "audit.read",
  "attendance.manage",
  "business.manage",
  "contracts.manage",
  "economy.adjust",
  "game.create",
  "game.read",
  "game.switch",
  "game.update",
  "inventory.redeem",
  "market.manage",
  "marketplace.moderate",
  "messaging.moderate",
  "players.manage",
  "progression.review",
  "settings.manage",
  "store.manage",
  "world.manage",
];

function sameJson(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

function sessionRecord(overrides = {}) {
  return {
    authenticated: true,
    expiresAt: new Date(Date.now() - 5000).toISOString(),
    absoluteExpiresAt: ABSOLUTE,
    assuranceLevel: "aal2",
    mfaRequired: true,
    user: {
      id: "staff-1",
      email: "staff@example.test",
      displayName: "Staff",
      role: "game_admin",
    },
    csrfToken: CSRF,
    activeGameSessions: [{ id: "game-1", name: "Game", status: "active" }],
    permissions: [...PERMISSIONS],
    roles: ["game_admin"],
    adminRole: "game_admin",
    ...overrides,
  };
}

function statusPayload() {
  return {
    ok: true,
    session: {
      authenticated: true,
      expiresAt: FUTURE,
      absoluteExpiresAt: ABSOLUTE,
      assuranceLevel: "aal2",
      mfaRequired: true,
    },
    user: sessionRecord().user,
    csrfToken: CSRF,
    activeGameSessions: sessionRecord().activeGameSessions,
  };
}

function createManagerRuntime(fetchImpl) {
  const sessionValues = new Map();
  const localValues = new Map();
  const sessionStorage = {
    getItem: (key) => sessionValues.get(key) ?? null,
    setItem: (key, value) => sessionValues.set(key, String(value)),
    removeItem: (key) => sessionValues.delete(key),
  };
  const localStorage = {
    getItem: (key) => localValues.get(key) ?? null,
    setItem: (key, value) => localValues.set(key, String(value)),
    removeItem: (key) => localValues.delete(key),
  };
  const window = {
    fetch: fetchImpl,
    sessionStorage,
    localStorage,
    crypto: { randomUUID: () => DEVICE_ID },
    EconovariaRuntimeConfig: Object.freeze({
      environment: "staging",
      supabasePublishableKey: "sb_publishable_runtime_fixture",
      webSessionApiUrl:
        "https://runtimefixture123456.supabase.co/functions/v1/web-session-api",
      adminBffApiUrl:
        "https://runtimefixture123456.supabase.co/functions/v1/web-session-api/proxy",
    }),
    dispatchEvent() {},
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
    Set,
    String,
  });
  return { manager: window.EconovariaAdminAuthSession, sessionStorage };
}

{
  const requests = [];
  const { manager, sessionStorage } = createManagerRuntime(async (url) => {
    requests.push(url);
    if (/web-session-api\/status$/.test(url)) {
      return new Response(JSON.stringify(statusPayload()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (/web-session-api\/proxy\/session\/bootstrap$/.test(url)) {
      return new Response(JSON.stringify({
        code: "admin_rate_limit_unavailable",
        message: "Administrator request protection is unavailable.",
      }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionRecord()));
  sessionStorage.setItem(GAME_KEY, "game-1");

  let failure;
  try {
    await manager.getUsableSession();
  } catch (error) {
    failure = manager.describeFailure(error);
  }

  sameJson(requests.map((url) => new URL(url).pathname), [
    "/functions/v1/web-session-api/status",
    "/functions/v1/web-session-api/proxy/session/bootstrap",
  ], "Admin status/bootstrap request order changed");
  assert.equal(failure?.code, "admin_rate_limit_unavailable");
  assert.equal(failure?.status, 503);
  assert.equal(failure?.retryable, true);
  assert.equal(failure?.terminal, false);
  assert.notEqual(sessionStorage.getItem(SESSION_KEY), null);
  assert.equal(sessionStorage.getItem(GAME_KEY), "game-1");
}

{
  const { manager, sessionStorage } = createManagerRuntime(async () =>
    new Response(JSON.stringify({
      error: {
        code: "staff_session_missing",
        message: "Administrator sign-in is required.",
      },
    }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })
  );
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionRecord()));
  sessionStorage.setItem(GAME_KEY, "game-1");

  assert.equal(await manager.getUsableSession(), null);
  assert.equal(sessionStorage.getItem(SESSION_KEY), null);
  assert.equal(sessionStorage.getItem(GAME_KEY), null);
}

{
  const redirects = [];
  let clearCount = 0;
  const created = [];
  const gate = {
    children: [],
    classList: {
      values: [],
      add(value) {
        this.values.push(value);
      },
    },
    replaceChildren() {
      this.children = [];
    },
    appendChild(value) {
      this.children.push(value);
    },
    remove() {},
  };
  const preview = { hidden: true, childElementCount: 0 };
  const document = {
    readyState: "complete",
    getElementById(id) {
      if (id === "adminSessionGate") return gate;
      if (id === "adminPreview") return preview;
      return null;
    },
    createElement(tagName) {
      const element = {
        tagName,
        children: [],
        listeners: {},
        className: "",
        textContent: "",
        type: "",
        append(...values) {
          this.children.push(...values);
        },
        addEventListener(type, listener) {
          this.listeners[type] = listener;
        },
      };
      created.push(element);
      return element;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const sessionManager = {
    async getUsableSession() {
      const error = new Error("Administrator request protection is unavailable.");
      error.code = "admin_rate_limit_unavailable";
      error.status = 503;
      error.retryable = true;
      error.terminal = false;
      throw error;
    },
    describeFailure(error) {
      return {
        code: error.code,
        status: error.status,
        retryable: error.retryable,
        terminal: error.terminal,
      };
    },
    clear() {
      clearCount += 1;
    },
  };
  const window = {
    document,
    EconovariaAdminAuthSession: sessionManager,
    sessionStorage: {
      getItem(key) {
        return key === GAME_KEY ? "game-1" : null;
      },
    },
    location: {
      href: "https://example.test/admin/index.html",
      replace(value) {
        redirects.push(value);
      },
      reload() {},
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
  };
  window.window = window;

  vm.runInNewContext(gateSource, {
    window,
    document,
    performance: { now: () => 0 },
    CustomEvent: class CustomEvent {},
    URL,
    Math,
    Object,
    String,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(clearCount, 0, "retryable failures must not clear the session");
  sameJson(redirects, [], "retryable failures must not redirect to login");
  sameJson(gate.classList.values, ["is-error"], "retry UI state changed");
  const paragraphs = created.filter((element) => element.tagName === "p");
  assert.equal(paragraphs.length, 1);
  assert.match(paragraphs[0].textContent, /session has been preserved/i);
  const buttons = created.filter((element) => element.tagName === "button");
  sameJson(buttons.map((button) => button.textContent), [
    "Reload",
    "Return to sign in",
  ], "retry UI actions changed");
}

console.log(
  "Admin status/bootstrap failure classification, session preservation, 401 clearing, and retry UI passed.",
);