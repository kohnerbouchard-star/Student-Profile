import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000002";
const ACCESS_TOKEN = "player-access-code-smoke-token";
const PLAYER_IDENTIFIER = "RFID:ABCD2345";
const ACCESS_CODE = "ACCESS-4826";

const fallbackSource = readFileSync("admin/classroom-write-fallback.js", "utf8");
const bridgeSource = readFileSync("admin/player-access-code-bridge.js", "utf8");

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
const issuedCredentials = [];

async function nativeFetch(input, init) {
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(String(input), init);
  let body = null;
  if (!["GET", "HEAD"].includes(request.method)) {
    try {
      body = await request.clone().json();
    } catch (_) {
      body = await request.clone().text();
    }
  }

  const call = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
  };
  calls.push(call);

  if (request.url.includes(`/api/admin/games/${GAME_ID}/players`)) {
    return new Response(JSON.stringify({
      error: { code: "player_create_contract_mismatch", message: "Retry canonical classroom route." },
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (request.url.endsWith(`/functions/v1/classroom-api/games/${GAME_ID}/players`)) {
    return new Response(JSON.stringify({
      ok: true,
      player: {
        id: PLAYER_UUID,
        displayName: "RFID Identity Smoke Player",
        rosterLabel: "CODE-001",
        playerIdentifier: body.playerIdentifier,
        status: "active",
      },
      accessCode: {
        studentCode: body.accessCode,
        status: "active",
        createdAt: "2026-07-14T00:00:00.000Z",
      },
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }

  throw new Error(`Unexpected request: ${request.method} ${request.url}`);
}

const sessionStorage = storage({
  "econovaria.admin.auth.v1": JSON.stringify({
    accessToken: ACCESS_TOKEN,
    user: { id: "00000000-0000-4000-8000-000000000003" },
  }),
  "econovaria.admin.selected-game.v1": GAME_ID,
});

const windowObject = {
  fetch: nativeFetch,
  location: { href: "http://127.0.0.1:4173/admin/" },
  sessionStorage,
  EconovariaRuntimeConfig: Object.freeze({
    environment: "staging",
    supabaseUrl: "https://runtime-fixture.supabase.co",
    supabasePublishableKey: "runtime-fixture-publishable-key",
    classroomApiUrl: "https://runtime-fixture.supabase.co/functions/v1/classroom-api",
    adminApiUrl: "https://runtime-fixture.supabase.co/functions/v1/admin-api",
  }),
  dispatchEvent(event) {
    issuedCredentials.push(event?.detail || null);
  },
};
windowObject.window = windowObject;

const context = {
  window: windowObject,
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
  decodeURIComponent,
  encodeURIComponent,
};

runInNewContext(fallbackSource, context);
runInNewContext(bridgeSource, context);

const response = await windowObject.fetch(
  new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/players`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": "admin-only-token",
      "x-econovaria-csrf": "admin-csrf",
    },
    body: JSON.stringify({
      action: "create-player",
      payload: {
        displayName: "RFID Identity Smoke Player",
        rosterLabel: "CODE-001",
        playerIdentifier: PLAYER_IDENTIFIER,
        accessCode: ACCESS_CODE,
      },
    }),
  }),
);

assert(response.status === 201, `Expected player create status 201, received ${response.status}.`);
const result = await response.json();
const resultCode = result.accessCode?.studentCode || result.data?.accessCode?.studentCode;
const resultIdentifier = result.player?.playerIdentifier || result.data?.player?.playerIdentifier;
assert(resultCode === ACCESS_CODE, `Player response omitted the configured Access Code: ${JSON.stringify(result)}.`);
assert(resultIdentifier === PLAYER_IDENTIFIER, `Player response omitted the configured Player ID: ${JSON.stringify(result)}.`);
assert(calls.length === 2, `Expected exactly two requests, received ${calls.length}.`);
assert(calls[0].url.includes(`/api/admin/games/${GAME_ID}/players`), "Primary admin player request was not attempted first.");
assert(calls[1].url.endsWith(`/functions/v1/classroom-api/games/${GAME_ID}/players`), "Canonical classroom player create was not attempted second.");
assert(calls[1].body?.playerIdentifier === PLAYER_IDENTIFIER, "Canonical create omitted the RFID Player ID.");
assert(calls[1].body?.accessCode === ACCESS_CODE, "Canonical create omitted the Access Code.");
assert(calls[1].headers.authorization === `Bearer ${ACCESS_TOKEN}`, "Canonical create omitted the bearer token.");
assert(Boolean(calls[1].headers.apikey), "Canonical create omitted the publishable key.");
assert(!("x-csrf-token" in calls[1].headers), "Canonical create forwarded x-csrf-token.");
assert(!("x-econovaria-csrf" in calls[1].headers), "Canonical create forwarded x-econovaria-csrf.");

console.log("Admin configured Player ID and Access Code issuance smoke passed under validated runtime configuration.");
