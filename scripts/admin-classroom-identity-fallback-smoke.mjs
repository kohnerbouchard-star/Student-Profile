import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ACCESS_TOKEN = "browser-smoke-access-token";
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

  const isClassroom = request.url.includes("/functions/v1/classroom-api/");
  return new Response(JSON.stringify({ ok: isClassroom, data: { accepted: isClassroom } }), {
    status: isClassroom ? 201 : primaryStatus,
    headers: { "content-type": "application/json" },
  });
}

const fakeFormData = class {
  constructor() {}
  get(name) {
    return {
      displayName: "Fallback Player",
      rosterLabel: "FALLBACK-001",
      playerIdentifier: "RFID:FALLBACK-001",
      accessCode: "FALLBACK-5937",
      status: "active",
      startingLocation: "NORTHREACH",
      notes: "",
    }[name] ?? "";
  }
};

const form = {
  querySelectorAll() {
    return [];
  },
};

const windowObject = {
  fetch: nativeFetch,
  location: { href: "http://127.0.0.1:4173/admin/" },
  sessionStorage: storage({
    "econovaria.admin.auth.v1": JSON.stringify({ accessToken: ACCESS_TOKEN }),
    "econovaria.admin.selected-game.v1": GAME_ID,
  }),
  EconovariaRuntimeConfig: Object.freeze({
    environment: "staging",
    supabaseUrl: "https://runtime-fixture.supabase.co",
    supabasePublishableKey: "runtime-fixture-publishable-key",
    classroomApiUrl: "https://runtime-fixture.supabase.co/functions/v1/classroom-api",
    adminApiUrl: "https://runtime-fixture.supabase.co/functions/v1/admin-api",
  }),
  Econovaria: { features: { adminOverviewTerminal: { currentModel: {} } } },
};
windowObject.window = windowObject;

const context = {
  window: windowObject,
  document: {
    querySelector(selector) {
      return selector === "[data-admin-terminal-player-form]" ? form : null;
    },
  },
  FormData: fakeFormData,
  Request,
  Response,
  Headers,
  URL,
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
  crypto,
  decodeURIComponent,
  encodeURIComponent,
};

runInNewContext(fallbackSource, context);
runInNewContext(createSource, context);

const fallbackIndex = adminHtml.indexOf("./classroom-write-fallback.js");
const createIndex = adminHtml.indexOf("./create-action-adapter.js");
assert(fallbackIndex >= 0 && createIndex > fallbackIndex, "Fallback must load before the create normalizer wrapper.");

const response = await windowObject.fetch(
  new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/players`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": "admin-only-token",
      "x-econovaria-csrf": "admin-csrf",
    },
    body: JSON.stringify({ action: "create-player", payload: {} }),
  }),
);

assert(response.status === 201, `Expected classroom fallback status 201, received ${response.status}.`);
assert(calls.length === 2, `Expected one admin attempt and one classroom retry, received ${calls.length}.`);
assert(calls[0].url.includes("/api/admin/"), "Admin write was not attempted first.");
assert(calls[1].url.endsWith(`/functions/v1/classroom-api/games/${GAME_ID}/players`), "Classroom player route was not used.");
assert(calls[1].body?.displayName === "Fallback Player", "Display name was not normalized before fallback.");
assert(calls[1].body?.rosterLabel === "FALLBACK-001", "Roster label was not normalized before fallback.");
assert(calls[1].body?.playerIdentifier === "RFID:FALLBACK-001", "RFID Player ID was omitted from fallback.");
assert(calls[1].body?.accessCode === "FALLBACK-5937", "Access Code was omitted from fallback.");
assert(calls[1].headers.authorization === `Bearer ${ACCESS_TOKEN}`, "Fallback omitted authorization.");
assert(Boolean(calls[1].headers.apikey), "Fallback omitted the publishable key.");
assert(!("x-csrf-token" in calls[1].headers), "Fallback forwarded x-csrf-token.");
assert(!("x-econovaria-csrf" in calls[1].headers), "Fallback forwarded x-econovaria-csrf.");

primaryStatus = 200;
calls.length = 0;
const noRetry = await windowObject.fetch(
  new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/players`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create-player", payload: {} }),
  }),
);
assert(noRetry.status === 200, "Successful primary write did not pass through.");
assert(calls.length === 1, "Successful primary write was duplicated.");

console.log("Admin normalized RFID identity fallback smoke passed under validated runtime configuration.");
