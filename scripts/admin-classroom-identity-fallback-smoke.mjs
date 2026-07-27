import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const fallbackSource = readFileSync("admin/classroom-write-fallback.js", "utf8");
const createSource = readFileSync("admin/create-action-adapter.js", "utf8");
const adminHtml = readFileSync("admin/index.html", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function storage(values = {}) {
  const state = new Map(Object.entries(values));
  return {
    getItem(key) {
      return state.has(key) ? state.get(key) : null;
    },
    setItem(key, value) {
      state.set(key, String(value));
    },
    removeItem(key) {
      state.delete(key);
    },
  };
}

const calls = [];
let primaryStatus = 400;
async function nativeFetch(input, init) {
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(String(input), init);
  let body = null;
  try {
    body = await request.clone().json();
  } catch (_) {}
  calls.push({
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
  });
  return new Response(JSON.stringify({ ok: primaryStatus < 400 }), {
    status: primaryStatus,
    headers: { "content-type": "application/json" },
  });
}

const fakeFormData = class {
  get(name) {
    return {
      displayName: "BFF Player",
      rosterLabel: "BFF-001",
      playerIdentifier: "RFID:BFF-001",
      accessCode: "BFF-5937",
      status: "active",
      startingLocation: "NORTHREACH",
      notes: "",
    }[name] ?? "";
  }
};
const form = { querySelectorAll() { return []; } };
const windowObject = {
  fetch: nativeFetch,
  location: {
    href: "http://127.0.0.1:4173/admin/",
    origin: "http://127.0.0.1:4173",
  },
  sessionStorage: storage({
    "econovaria.admin.selected-game.v1": GAME_ID,
  }),
  EconovariaRuntimeConfig: Object.freeze({
    environment: "development",
    adminBffApiUrl: "http://127.0.0.1:4173/functions/v1/web-session-api/proxy",
  }),
  Econovaria: { features: { adminOverviewTerminal: { currentModel: {} } } },
  document: { dispatchEvent() {} },
  CustomEvent: class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  },
};
windowObject.window = windowObject;

const context = {
  window: windowObject,
  document: {
    dispatchEvent() {},
    querySelector(selector) {
      return selector === "[data-admin-terminal-player-form]" ? form : null;
    },
  },
  FormData: fakeFormData,
  Request,
  Response,
  Headers,
  URL,
  URLSearchParams,
  console,
  Set,
  Map,
  JSON,
  String,
  Object,
  Array,
  Number,
  Boolean,
  Math,
  Date,
  crypto,
  CustomEvent: windowObject.CustomEvent,
  decodeURIComponent,
  encodeURIComponent,
  globalThis: {
    crypto,
    CustomEvent: windowObject.CustomEvent,
  },
};

runInNewContext(fallbackSource, context);
runInNewContext(createSource, context);

const fallbackIndex = adminHtml.indexOf("./classroom-write-fallback.js");
const createIndex = adminHtml.indexOf("./create-action-adapter.js");
assert(
  fallbackIndex >= 0 && createIndex > fallbackIndex,
  "Admin write lifecycle adapter must load before the create normalizer.",
);
assert(
  windowObject.EconovariaClassroomWriteFallback.legacyClassroomFallbackRetired === true,
  "Legacy classroom fallback retirement marker is missing.",
);
assert(!fallbackSource.includes("CLASSROOM_API_BASE"), "Browser adapter still owns classroom-api authority.");
assert(!fallbackSource.includes("accessToken"), "Browser adapter still reads a Staff token.");
assert(!fallbackSource.includes("Authorization"), "Browser adapter still constructs bearer authorization.");
assert(!fallbackSource.includes("supabasePublishableKey"), "Browser adapter still injects a publishable key.");
assert(!fallbackSource.includes("retryStatuses"), "Browser adapter still retries into a legacy route.");

const failed = await windowObject.fetch(
  new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/players`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create-player", payload: {} }),
  }),
);
assert(failed.status === 400, `Expected primary BFF failure 400, received ${failed.status}.`);
assert(calls.length === 1, `Failed BFF write was retried ${calls.length - 1} time(s).`);
assert(calls[0].url.includes("/api/admin/"), "Write left the same-origin Admin boundary.");
assert(!calls[0].url.includes("classroom-api"), "Write reached classroom-api.");
assert(!("authorization" in calls[0].headers), "Adapter injected bearer authorization.");
assert(!("apikey" in calls[0].headers), "Adapter injected application identity outside the BFF owner.");
assert(calls[0].body?.displayName === "BFF Player", "Display name normalization was lost.");
assert(calls[0].body?.playerIdentifier === "RFID:BFF-001", "Player ID normalization was lost.");
assert(calls[0].body?.accessCode === "BFF-5937", "Access Code normalization was lost.");

primaryStatus = 200;
calls.length = 0;
const success = await windowObject.fetch(
  new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/players`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create-player", payload: {} }),
  }),
);
assert(success.status === 200, "Successful BFF write did not pass through.");
assert(calls.length === 1, "Successful BFF write was duplicated.");

console.log("Admin classroom browser fallback is retired; lifecycle and normalization remain BFF-bound.");
