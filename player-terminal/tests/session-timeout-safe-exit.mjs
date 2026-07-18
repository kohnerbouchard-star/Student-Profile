import assert from "node:assert/strict";
import {
  installPlayerSessionSafeExit,
  resolvePlayerLoginUrl
} from "../src/session-timeout-safe-exit.js";

const replaced = [];
const listeners = new Map();
const documentListeners = new Map();
const mount = {
  inert: false,
  attributes: new Map(),
  innerHTML: "PLAYER DATA",
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
};

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

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
  setTimeout(handler) {
    handler();
    return 1;
  },
  clearTimeout() {},
  setInterval() {
    return 2;
  },
  clearInterval() {}
};

const config = {
  playerSessionToken: "player-token",
  playerSessionId: "session-id",
  gameSessionId: "game-id",
  accessToken: "access-token",
  sessionInvalidEvent: "econovaria:player-session-invalid",
  sessionReadyEvent: "econovaria:player-session-ready",
  sessionExitDelayMs: 0,
  sessionExpiryWatchIntervalMs: 1000
};

const terminal = {
  getState() {
    return {
      data: {
        session: {
          sessionExpiresAt: new Date(Date.now() + 60_000).toISOString()
        }
      }
    };
  }
};

assert.equal(
  resolvePlayerLoginUrl(config, runtime.location),
  "https://example.test/?mode=player&reason=session-expired"
);

const controller = installPlayerSessionSafeExit({ terminal, config, mount, runtime });
assert.equal(listeners.has("econovaria:player-session-invalid"), true);
assert.equal(documentListeners.has("visibilitychange"), true);

runtime.dispatchEvent(new FakeCustomEvent("econovaria:player-session-invalid", {
  detail: { status: 401, code: "PLAYER_SESSION_EXPIRED" }
}));

assert.equal(mount.inert, true);
assert.equal(mount.attributes.get("data-player-session-exiting"), "true");
assert.match(mount.innerHTML, /SESSION EXPIRED · RETURNING TO SIGN IN/);
assert.equal(config.playerSessionToken, "");
assert.equal(config.playerSessionId, "");
assert.equal(config.gameSessionId, "");
assert.equal(config.accessToken, "");
assert.equal(runtime.ECONOVARIA_PLAYER_SESSION, null);
assert.equal(runtime.Econovaria.playerSession, null);
assert.deepEqual(replaced, ["https://example.test/?mode=player&reason=session-expired"]);

assert.equal(controller.exit({}), false, "safe exit must be idempotent");
controller.destroy();
assert.equal(listeners.has("econovaria:player-session-invalid"), false);

console.log("Player session timeout safe-exit checks passed.");
