import assert from "node:assert/strict";
import { PlayerApi } from "../src/api/player-api.js";
import {
  installPlayerLogoutController,
  PLAYER_LOGOUT_COMPLETED_EVENT,
  resolvePlayerLogoutUrl
} from "../src/integrations/player-logout-controller.js";

const CSRF_TOKEN = "C".repeat(43);
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const PUBLISHABLE_KEY = "sb_publishable_logout_fixture";
const SESSION_API = "https://example.test/functions/v1/player-web-session-api";

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function createHarness({ fetchImpl, logoutAdvertised = true } = {}) {
  const listeners = new Map();
  const dispatched = [];
  const replaced = [];
  let timerId = 0;
  const mount = {
    inert: false,
    attributes: new Map(),
    innerHTML: "PLAYER TERMINAL",
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
  };
  const config = {
    authenticated: true,
    csrfToken: CSRF_TOKEN,
    sessionExpiresAt: "2026-07-27T08:00:00.000Z",
    gameSessionId: "internal-game-id",
    playerSessionApiBaseUrl: SESSION_API,
    publishableKey: PUBLISHABLE_KEY,
    deviceId: DEVICE_ID,
    playerSessionToken: "legacy-token-must-be-deleted",
    playerSessionId: "legacy-session-id-must-be-deleted",
    accessToken: "legacy-access-token-must-be-deleted",
    logoutRequestedEvent: "econovaria:player-logout-requested",
    sessionExitDelayMs: 0
  };
  const terminal = {
    destroyCalls: 0,
    getState() {
      return {
        data: {
          capabilities: {
            actions: { logout: logoutAdvertised }
          }
        }
      };
    },
    destroy() {
      this.destroyCalls += 1;
    }
  };
  const runtime = {
    location: {
      href: "https://example.test/player-terminal/index.html#profile",
      replace(value) {
        replaced.push(value);
      }
    },
    document: { title: "Player Terminal" },
    CustomEvent: FakeCustomEvent,
    ECONOVARIA_PLAYER_SESSION: { authenticated: true, csrfToken: CSRF_TOKEN },
    Econovaria: { playerSession: { authenticated: true, csrfToken: CSRF_TOKEN } },
    fetch: fetchImpl,
    localStorage: {
      getItem() { return DEVICE_ID; },
      setItem() {}
    },
    crypto: { randomUUID: () => DEVICE_ID },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
    dispatchEvent(event) {
      dispatched.push(event);
      listeners.get(event.type)?.(event);
      return true;
    },
    setTimeout(handler) {
      timerId += 1;
      handler();
      return timerId;
    },
    clearTimeout() {}
  };
  return { config, dispatched, listeners, mount, replaced, runtime, terminal };
}

function assertLocalStateCleared(harness) {
  assert.equal(harness.config.authenticated, false);
  assert.equal(harness.config.csrfToken, "");
  assert.equal(harness.config.sessionExpiresAt, "");
  assert.equal(harness.config.gameSessionId, "");
  assert.equal(Object.hasOwn(harness.config, "playerSessionToken"), false);
  assert.equal(Object.hasOwn(harness.config, "playerSessionId"), false);
  assert.equal(Object.hasOwn(harness.config, "accessToken"), false);
  assert.equal(harness.runtime.ECONOVARIA_PLAYER_SESSION, null);
  assert.equal(harness.runtime.Econovaria.playerSession, null);
  assert.equal(harness.mount.inert, true);
  assert.equal(harness.mount.attributes.get("data-player-session-exiting"), "true");
  assert.match(harness.mount.innerHTML, /SIGNING OUT · REVOKING PLAYER SESSION/);
  assert.deepEqual(harness.replaced, ["https://example.test/?mode=player&reason=logged-out"]);
}

{
  assert.equal(
    resolvePlayerLogoutUrl({}, { href: "https://example.test/player-terminal/index.html" }),
    "https://example.test/?mode=player&reason=logged-out"
  );
  assert.equal(
    resolvePlayerLogoutUrl(
      { sessionExitUrl: "/custom-login?mode=player" },
      { href: "https://example.test/player-terminal/index.html" }
    ),
    "https://example.test/custom-login?mode=player"
  );
}

{
  const calls = [];
  const harness = createHarness({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, {
        ok: true,
        alreadyLoggedOut: false,
        status: "revoked",
        revokedAt: "2026-07-27T00:00:00.000Z"
      });
    }
  });
  harness.config.apiCall = async () => ({ ok: true });
  const playerApi = new PlayerApi(harness.config);
  let sessionAbortCount = 0;
  const abortSessionRequests = playerApi.abortSessionRequests.bind(playerApi);
  playerApi.abortSessionRequests = () => {
    sessionAbortCount += 1;
    abortSessionRequests();
  };
  const controller = installPlayerLogoutController({
    terminal: harness.terminal,
    config: harness.config,
    mount: harness.mount,
    runtime: harness.runtime,
    retryDelayMs: 0
  });

  assert.equal(harness.listeners.has("econovaria:player-logout-requested"), true);
  const completion = await controller.logout({
    reason: "player_requested",
    gameSessionId: "must-not-be-forwarded",
    playerSessionId: "must-not-be-forwarded"
  });

  assert.equal(harness.terminal.destroyCalls, 1, "session exit must stop the active terminal before revocation");
  assert.equal(sessionAbortCount, 2, "session exit must abort Player API work before revocation and before local session clearing");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${SESSION_API}/logout`);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, "{}");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.headers.apikey, PUBLISHABLE_KEY);
  assert.equal(calls[0].options.headers["x-econovaria-device-id"], DEVICE_ID);
  assert.equal(calls[0].options.headers["x-econovaria-csrf-token"], CSRF_TOKEN);
  assert.equal(calls[0].options.headers["x-player-session-token"], undefined);
  assert.equal(calls[0].options.headers.Authorization, undefined);

  assert.deepEqual(
    {
      reason: completion.reason,
      terminal: completion.terminal,
      revoked: completion.revoked,
      alreadyLoggedOut: completion.alreadyLoggedOut,
      localOnly: completion.localOnly,
      status: completion.status,
      code: completion.code
    },
    {
      reason: "player_requested",
      terminal: "player",
      revoked: true,
      alreadyLoggedOut: false,
      localOnly: false,
      status: 200,
      code: "PLAYER_SESSION_REVOKED"
    }
  );
  assert.equal(JSON.stringify(completion).includes("legacy-token"), false);
  assert.equal(Object.hasOwn(completion, "gameSessionId"), false);
  assert.equal(Object.hasOwn(completion, "playerSessionId"), false);
  assertLocalStateCleared(harness);

  const completionEvents = harness.dispatched.filter((event) => event.type === PLAYER_LOGOUT_COMPLETED_EVENT);
  assert.equal(completionEvents.length, 1);
  assert.deepEqual(completionEvents[0].detail, completion);

  const duplicate = await controller.logout();
  assert.deepEqual(duplicate, completion);
  assert.equal(calls.length, 1, "repeated logout requests must share one revocation lifecycle");

  controller.destroy();
  assert.equal(harness.listeners.has("econovaria:player-logout-requested"), false);
}

{
  const harness = createHarness({
    fetchImpl: async () => jsonResponse(401, {
      ok: false,
      error: { code: "invalid_player_session", message: "The session is already inactive." }
    })
  });
  const controller = installPlayerLogoutController({
    terminal: harness.terminal,
    config: harness.config,
    mount: harness.mount,
    runtime: harness.runtime,
    retryDelayMs: 0
  });
  const completion = await controller.logout();
  assert.equal(completion.revoked, false);
  assert.equal(completion.alreadyLoggedOut, true);
  assert.equal(completion.localOnly, false);
  assert.equal(completion.status, 401);
  assert.equal(completion.code, "INVALID_PLAYER_SESSION");
  assertLocalStateCleared(harness);
  controller.destroy();
}

{
  let attempts = 0;
  const harness = createHarness({
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse(503, {
          ok: false,
          error: { code: "player_logout_service_unavailable", message: "Retry the exact revocation." }
        }, { "retry-after": "0" });
      }
      return jsonResponse(200, { ok: true, alreadyLoggedOut: true, status: "revoked" });
    }
  });
  const controller = installPlayerLogoutController({
    terminal: harness.terminal,
    config: harness.config,
    mount: harness.mount,
    runtime: harness.runtime,
    retryDelayMs: 0,
    maxAttempts: 2
  });
  const completion = await controller.logout();
  assert.equal(attempts, 2);
  assert.equal(completion.revoked, true);
  assert.equal(completion.localOnly, false);
  assertLocalStateCleared(harness);
  controller.destroy();
}

{
  let attempts = 0;
  const harness = createHarness({
    fetchImpl: async () => {
      attempts += 1;
      return jsonResponse(503, {
        ok: false,
        error: { code: "player_logout_service_unavailable", message: "Logout service unavailable." }
      });
    }
  });
  const controller = installPlayerLogoutController({
    terminal: harness.terminal,
    config: harness.config,
    mount: harness.mount,
    runtime: harness.runtime,
    retryDelayMs: 0,
    maxAttempts: 2
  });
  const completion = await controller.logout();
  assert.equal(attempts, 2);
  assert.equal(completion.revoked, false);
  assert.equal(completion.alreadyLoggedOut, false);
  assert.equal(completion.localOnly, true);
  assert.equal(completion.status, 503);
  assert.equal(completion.code, "PLAYER_LOGOUT_SERVICE_UNAVAILABLE");
  assertLocalStateCleared(harness);
  controller.destroy();
}

{
  let calls = 0;
  const harness = createHarness({
    logoutAdvertised: false,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, { ok: true });
    }
  });
  const controller = installPlayerLogoutController({
    terminal: harness.terminal,
    config: harness.config,
    mount: harness.mount,
    runtime: harness.runtime
  });
  const completion = await controller.logout();
  assert.equal(calls, 0, "unadvertised logout must not issue speculative Backend traffic");
  assert.equal(completion.localOnly, true);
  assert.equal(completion.code, "LOGOUT_REVOCATION_UNAVAILABLE");
  assertLocalStateCleared(harness);
  controller.destroy();
}

console.log("Player logout cookie-session revocation lifecycle checks passed.");
