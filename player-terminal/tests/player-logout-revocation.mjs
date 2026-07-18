import assert from "node:assert/strict";
import {
  installPlayerLogoutController,
  PLAYER_LOGOUT_COMPLETED_EVENT,
  resolvePlayerLogoutUrl
} from "../src/integrations/player-logout-controller.js";

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function createHarness({ apiCall, logoutAdvertised = true } = {}) {
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
    playerSessionToken: "player-secret-token",
    playerSessionId: "internal-session-id",
    gameSessionId: "internal-game-id",
    accessToken: "access-token",
    logoutRequestedEvent: "econovaria:player-logout-requested",
    sessionExitDelayMs: 0,
    apiCall
  };
  const terminal = {
    getState() {
      return {
        data: {
          capabilities: {
            actions: { logout: logoutAdvertised }
          }
        }
      };
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
    ECONOVARIA_PLAYER_SESSION: { playerSessionToken: "global-token" },
    Econovaria: { playerSession: { playerSessionToken: "host-token" } },
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
  assert.equal(harness.config.playerSessionToken, "");
  assert.equal(harness.config.playerSessionId, "");
  assert.equal(harness.config.gameSessionId, "");
  assert.equal(harness.config.accessToken, "");
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
    apiCall: async (context) => {
      calls.push(context);
      return {
        ok: true,
        alreadyLoggedOut: false,
        status: "revoked",
        revokedAt: "2026-07-19T00:00:00.000Z"
      };
    }
  });
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

  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpointKey, "logout");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/session/logout");
  assert.equal(calls[0].payload, undefined);
  assert.deepEqual(calls[0].params, {});
  assert.deepEqual(calls[0].session, { playerSessionToken: "player-secret-token" });
  assert.equal(Object.hasOwn(calls[0].session, "gameSessionId"), false);
  assert.equal(Object.hasOwn(calls[0].session, "playerSessionId"), false);

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
  assert.equal(JSON.stringify(completion).includes("player-secret-token"), false);
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
    apiCall: async () => {
      const error = new Error("The session is already inactive.");
      error.status = 401;
      error.code = "invalid_player_session";
      throw error;
    }
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
    apiCall: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("Retry the exact revocation.");
        error.status = 503;
        error.code = "player_logout_service_unavailable";
        error.retryAfterMs = 0;
        throw error;
      }
      return { ok: true, alreadyLoggedOut: true, status: "revoked" };
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
  assert.equal(completion.alreadyLoggedOut, true);
  assert.equal(completion.localOnly, false);
  assertLocalStateCleared(harness);
  controller.destroy();
}

{
  let attempts = 0;
  const harness = createHarness({
    apiCall: async () => {
      attempts += 1;
      const error = new Error("Logout service unavailable.");
      error.status = 503;
      error.code = "player_logout_service_unavailable";
      throw error;
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
    apiCall: async () => {
      calls += 1;
      return { ok: true };
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

console.log("Player logout revocation lifecycle checks passed.");
