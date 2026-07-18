import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  installPlayerSessionSafeExit,
  resolvePlayerLoginUrl
} from "../src/session-timeout-safe-exit.js";

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function createHarness(sessionExpiresAt) {
  const replaced = [];
  const listeners = new Map();
  const documentListeners = new Map();
  const timers = new Map();
  let timerId = 0;

  const mount = {
    inert: false,
    attributes: new Map(),
    innerHTML: "PLAYER DATA",
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
  };
  const config = {
    playerSessionToken: "player-token",
    playerSessionId: "session-id",
    gameSessionId: "game-id",
    accessToken: "access-token",
    sessionInvalidEvent: "econovaria:player-session-invalid",
    sessionReadyEvent: "econovaria:player-session-ready",
    sessionExitDelayMs: 0,
    sessionExpirySkewMs: 0,
    sessionExpiryWatchIntervalMs: 1000
  };
  const terminal = {
    getState() {
      return { data: { session: { sessionExpiresAt } } };
    }
  };
  const runtime = {
    location: {
      href: "https://example.test/player-terminal/index.html#inventory",
      replace(value) {
        replaced.push(value);
      }
    },
    document: {
      title: "Player Terminal",
      visibilityState: "visible",
      addEventListener(name, handler) {
        documentListeners.set(name, handler);
      },
      removeEventListener(name) {
        documentListeners.delete(name);
      }
    },
    CustomEvent: FakeCustomEvent,
    Econovaria: { playerSession: { token: "host-token" } },
    ECONOVARIA_PLAYER_SESSION: { token: "global-token" },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
      return true;
    },
    setTimeout(handler, timeout = 0) {
      timerId += 1;
      timers.set(timerId, { handler, timeout });
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval() {
      timerId += 1;
      return timerId;
    },
    clearInterval() {}
  };

  function runRedirectTimers() {
    for (const [id, timer] of [...timers]) {
      if (timer.timeout !== 0) continue;
      timers.delete(id);
      timer.handler();
    }
  }

  return {
    config,
    documentListeners,
    listeners,
    mount,
    replaced,
    runRedirectTimers,
    runtime,
    terminal
  };
}

{
  const harness = createHarness(new Date(Date.now() + 60_000).toISOString());
  assert.equal(
    resolvePlayerLoginUrl(harness.config, harness.runtime.location),
    "https://example.test/?mode=player&reason=session-expired"
  );

  const controller = installPlayerSessionSafeExit(harness);
  assert.equal(harness.listeners.has("econovaria:player-session-invalid"), true);
  assert.equal(harness.documentListeners.has("visibilitychange"), true);

  harness.runtime.dispatchEvent(new FakeCustomEvent("econovaria:player-session-invalid", {
    detail: { status: 401, code: "PLAYER_SESSION_EXPIRED" }
  }));
  harness.runRedirectTimers();

  assert.equal(harness.mount.inert, true);
  assert.equal(harness.mount.attributes.get("data-player-session-exiting"), "true");
  assert.match(harness.mount.innerHTML, /SESSION EXPIRED · RETURNING TO SIGN IN/);
  assert.equal(harness.config.playerSessionToken, "");
  assert.equal(harness.config.playerSessionId, "");
  assert.equal(harness.config.gameSessionId, "");
  assert.equal(harness.config.accessToken, "");
  assert.equal(harness.runtime.ECONOVARIA_PLAYER_SESSION, null);
  assert.equal(harness.runtime.Econovaria.playerSession, null);
  assert.deepEqual(harness.replaced, ["https://example.test/?mode=player&reason=session-expired"]);
  assert.equal(controller.exit({}), false, "safe exit must be idempotent");

  controller.destroy();
  assert.equal(harness.listeners.has("econovaria:player-session-invalid"), false);
}

{
  const fixedExpiry = new Date(Date.now() + 10).toISOString();
  const harness = createHarness(fixedExpiry);
  const controller = installPlayerSessionSafeExit(harness);

  await delay(25);
  controller.check();
  harness.runRedirectTimers();

  assert.equal(
    harness.mount.attributes.get("data-player-session-exiting"),
    "true",
    "a resumed terminal must exit even when the original timer ID is still pending"
  );
  assert.deepEqual(harness.replaced, ["https://example.test/?mode=player&reason=session-expired"]);
  controller.destroy();
}

console.log("Player session timeout safe-exit checks passed.");
