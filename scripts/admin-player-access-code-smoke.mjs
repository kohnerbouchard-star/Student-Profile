import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000002";
const PLAYER_IDENTIFIER = "RFID:ABCD2345";
const ACCESS_CODE = "ACCESS-4826";
const CSRF_TOKEN = "C".repeat(43);

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

function createHarness({ createIncludesCode }) {
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

    const createPath = `/api/admin/games/${GAME_ID}/players`;
    if (request.url.endsWith(createPath)) {
      return new Response(JSON.stringify({
        ok: true,
        player: {
          id: PLAYER_UUID,
          displayName: "RFID Identity Smoke Player",
          rosterLabel: "CODE-001",
          playerIdentifier: PLAYER_IDENTIFIER,
          status: "active",
        },
        ...(createIncludesCode
          ? {
            accessCode: {
              studentCode: ACCESS_CODE,
              status: "active",
              createdAt: "2026-07-14T00:00:00.000Z",
            },
          }
          : {}),
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    const resetPath = `${createPath}/${PLAYER_UUID}/access-code/reset`;
    if (request.url.endsWith(resetPath)) {
      return new Response(JSON.stringify({
        ok: true,
        player: {
          id: PLAYER_UUID,
          displayName: "RFID Identity Smoke Player",
          playerIdentifier: body.playerIdentifier,
        },
        accessCode: {
          studentCode: body.accessCode,
          status: "active",
          createdAt: "2026-07-14T00:00:01.000Z",
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
      authenticated: true,
      csrfToken: CSRF_TOKEN,
      user: {
        id: "00000000-0000-4000-8000-000000000003",
        role: "game_admin",
      },
      permissions: ["players.manage"],
      roles: ["game_admin"],
      adminRole: "game_admin",
    }),
    "econovaria.admin.selected-game.v1": GAME_ID,
  });

  const windowObject = {
    fetch: nativeFetch,
    location: {
      href: "http://127.0.0.1:4173/admin/",
      origin: "http://127.0.0.1:4173",
    },
    sessionStorage,
    crypto,
    EconovariaRuntimeConfig: Object.freeze({
      environment: "development",
      adminBffApiUrl:
        "http://127.0.0.1:4173/functions/v1/web-session-api/proxy",
    }),
    document: { dispatchEvent() {} },
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    dispatchEvent(event) {
      if (event?.type === "econovaria:player-access-code-issued") {
        issuedCredentials.push(event.detail || null);
      }
    },
  };
  windowObject.window = windowObject;

  const context = {
    window: windowObject,
    document: windowObject.document,
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
  runInNewContext(bridgeSource, context);
  return { windowObject, calls, issuedCredentials };
}

async function createPlayer(windowObject) {
  return windowObject.fetch(
    new Request(`http://127.0.0.1:4173/api/admin/games/${GAME_ID}/players`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
}

function assertBffOnlyCalls(calls) {
  for (const call of calls) {
    assert(
      call.url.startsWith("http://127.0.0.1:4173/api/admin/"),
      `Player credential request left the same-origin Admin boundary: ${call.url}`,
    );
    assert(!call.url.includes("classroom-api"), "Player credential request reached classroom-api.");
    assert(!call.url.includes("functions/v1/admin-api"), "Player credential request reached admin-api directly.");
    assert(!("authorization" in call.headers), "Player credential bridge injected bearer authorization.");
    assert(!("apikey" in call.headers), "Player credential bridge injected application identity outside the BFF owner.");
  }
}

{
  const harness = createHarness({ createIncludesCode: true });
  const response = await createPlayer(harness.windowObject);
  assert(response.status === 201, `Expected player create status 201, received ${response.status}.`);
  const result = await response.json();
  assert(
    result.accessCode?.studentCode === ACCESS_CODE,
    `Player response omitted the one-time Access Code: ${JSON.stringify(result)}.`,
  );
  assert(
    result.player?.playerIdentifier === PLAYER_IDENTIFIER,
    `Player response omitted the configured Player ID: ${JSON.stringify(result)}.`,
  );
  assert(harness.calls.length === 1, `Expected one canonical BFF request, received ${harness.calls.length}.`);
  assertBffOnlyCalls(harness.calls);
  assert(harness.issuedCredentials.length === 1, "One-time credential event was not emitted.");
  assert(harness.issuedCredentials[0].studentCode === ACCESS_CODE, "Credential event omitted Access Code.");
  assert(harness.issuedCredentials[0].playerIdentifier === PLAYER_IDENTIFIER, "Credential event omitted Player ID.");
}

{
  const harness = createHarness({ createIncludesCode: false });
  const response = await createPlayer(harness.windowObject);
  assert(response.status === 201, `Expected merged create status 201, received ${response.status}.`);
  const result = await response.json();
  assert(
    result.accessCode?.studentCode === ACCESS_CODE ||
      result.data?.accessCode?.studentCode === ACCESS_CODE,
    `Credential reset follow-up omitted Access Code: ${JSON.stringify(result)}.`,
  );
  assert(harness.calls.length === 2, `Expected create plus BFF reset, received ${harness.calls.length}.`);
  assertBffOnlyCalls(harness.calls);
  assert(
    harness.calls[1].url.endsWith(
      `/api/admin/games/${GAME_ID}/players/${PLAYER_UUID}/access-code/reset`,
    ),
    "Credential follow-up did not use the canonical BFF reset route.",
  );
  assert(harness.calls[1].body?.playerIdentifier === PLAYER_IDENTIFIER, "BFF reset omitted Player ID.");
  assert(harness.calls[1].body?.accessCode === ACCESS_CODE, "BFF reset omitted Access Code.");
  assert(harness.issuedCredentials.length === 1, "Reset flow did not emit one-time credentials exactly once.");
}

console.log(
  "Admin configured Player ID and one-time Access Code issuance remain entirely inside the HttpOnly BFF boundary.",
);
