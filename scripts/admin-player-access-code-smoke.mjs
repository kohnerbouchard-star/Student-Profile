import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const ACCESS_TOKEN = "player-access-code-smoke-token";
const STUDENT_CODE = "ABCD2345";

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

async function nativeFetch(input, init) {
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(String(input), init);
  let body = null;
  if (!['GET', 'HEAD'].includes(request.method)) {
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
        id: PLAYER_ID,
        displayName: "Access Code Smoke Player",
        rosterLabel: "CODE-001",
        status: "active",
      },
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }

  if (request.url.endsWith(`/functions/v1/classroom-api/games/${GAME_ID}/players/${PLAYER_ID}/access-code/reset`)) {
    return new Response(JSON.stringify({
      ok: true,
      player: {
        id: PLAYER_ID,
        displayName: "Access Code Smoke Player",
        rosterLabel: "CODE-001",
        status: "active",
      },
      accessCode: {
        studentCode: STUDENT_CODE,
        status: "active",
        createdAt: "2026-07-14T00:00:00.000Z",
      },
    }), {
      status: 200,
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
  dispatchEvent() {},
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
        displayName: "Access Code Smoke Player",
        rosterLabel: "CODE-001",
      },
    }),
  }),
);

assert(response.status === 201, `Expected player create status 201, received ${response.status}.`);
const result = await response.json();
const resultCode = result.accessCode?.studentCode || result.data?.accessCode?.studentCode;
assert(resultCode === STUDENT_CODE, `Merged player response omitted the issued code: ${JSON.stringify(result)}.`);
assert(calls.length === 3, `Expected three requests, received ${calls.length}.`);
assert(calls[0].url.includes(`/api/admin/games/${GAME_ID}/players`), "Primary admin player request was not attempted first.");
assert(calls[1].url.endsWith(`/functions/v1/classroom-api/games/${GAME_ID}/players`), "Canonical classroom player create was not attempted second.");
assert(calls[2].url.endsWith(`/functions/v1/classroom-api/games/${GAME_ID}/players/${PLAYER_ID}/access-code/reset`), "Access-code reset was not attempted after player creation.");
assert(calls[2].headers.authorization === `Bearer ${ACCESS_TOKEN}`, "Access-code reset omitted the bearer token.");
assert(Boolean(calls[2].headers.apikey), "Access-code reset omitted the publishable key.");
assert(!("x-csrf-token" in calls[2].headers), "Access-code reset forwarded x-csrf-token.");
assert(!("x-econovaria-csrf" in calls[2].headers), "Access-code reset forwarded x-econovaria-csrf.");
assert(calls[2].body?.reason === "player_created_without_access_code", "Access-code reset omitted its bounded reason.");

console.log("Admin player access-code issuance smoke passed.");
