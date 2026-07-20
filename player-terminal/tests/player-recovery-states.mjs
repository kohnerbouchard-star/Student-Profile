import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PlayerApi } from "../src/api/player-api.js";
import { ApiRequestError } from "../src/api/errors.js";
import {
  buildPlayerRecoveryPresentation,
  classifyPlayerRecovery,
  isAmbiguousWriteOutcome,
  isSessionInvalidRecovery
} from "../src/recovery/player-recovery-contract.js";
import {
  installPlayerRecoveryInstrumentation,
  PLAYER_OPERATION_EVENT
} from "../src/recovery/player-recovery-controller.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(classifyPlayerRecovery({ code: "OFFLINE" }, { online: false }), "offline");
assert.equal(classifyPlayerRecovery({ code: "REQUEST_TIMEOUT" }), "timeout");
assert.equal(classifyPlayerRecovery({ status: 429, retryAfterMs: 2500 }), "rate_limited");
assert.equal(classifyPlayerRecovery({ status: 409, code: "STALE_STATE" }), "conflict");
assert.equal(classifyPlayerRecovery({ status: 401, code: "SESSION_INVALID" }), "session_invalid");
assert.equal(classifyPlayerRecovery({}, { committed: true }), "confirmed_stale");
assert.equal(isSessionInvalidRecovery({ status: 401 }), true);

assert.equal(
  isAmbiguousWriteOutcome({ code: "NETWORK_ERROR" }, { idempotentWrite: true }),
  true,
  "A retry-safe write with no transport result must be represented as an unconfirmed outcome."
);
assert.equal(
  isAmbiguousWriteOutcome({ code: "NETWORK_ERROR" }, { idempotentWrite: false }),
  false,
  "A non-idempotent write must not be advertised as safely retryable."
);
assert.equal(
  isAmbiguousWriteOutcome({ status: 429, code: "RATE_LIMITED" }, { idempotentWrite: true }),
  false,
  "A bounded rate-limit response is not an ambiguous execution result."
);

const ambiguous = buildPlayerRecoveryPresentation(
  { code: "NETWORK_ERROR" },
  { idempotentWrite: true, operationLabel: "the Store purchase", scope: "write" }
);
assert.equal(ambiguous.kind, "ambiguous_write");
assert.equal(ambiguous.action, "retry_same");
assert.match(ambiguous.detail, /same action/i);
assert.match(ambiguous.detail, /idempotency key/i);

const limited = buildPlayerRecoveryPresentation(
  { status: 429, code: "RATE_LIMITED", retryAfterMs: 2500 },
  { idempotentWrite: true, scope: "write" }
);
assert.equal(limited.kind, "rate_limited");
assert.equal(limited.retryAfterMs, 2500);
assert.equal(limited.actionLabel, "Retry in 3s");

const committed = buildPlayerRecoveryPresentation({}, {
  committed: true,
  operationLabel: "The market order",
  scope: "write"
});
assert.equal(committed.kind, "confirmed_stale");
assert.equal(committed.action, "refresh");
assert.match(committed.detail, /completed successfully/i);
assert.match(committed.detail, /stale/i);

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function createRuntime() {
  const listeners = new Map();
  return {
    CustomEvent: FakeCustomEvent,
    addEventListener(type, listener) {
      const values = listeners.get(type) || new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    }
  };
}

{
  const runtime = createRuntime();
  const events = [];
  const calls = [];
  runtime.addEventListener(PLAYER_OPERATION_EVENT, (event) => events.push(event.detail));
  const original = PlayerApi.prototype.execute;
  const instrumentation = installPlayerRecoveryInstrumentation({ runtime });
  let attempt = 0;
  const api = new PlayerApi({
    usePreviewData: false,
    playerSessionToken: "token-1",
    requestTimeoutMs: 1000,
    writeCooldownMs: 0,
    apiCall: async (context) => {
      calls.push({ endpointKey: context.endpointKey, idempotencyKey: context.idempotencyKey });
      attempt += 1;
      if (attempt === 1) {
        throw new ApiRequestError("Network unavailable", {
          code: "NETWORK_ERROR",
          endpointKey: context.endpointKey
        });
      }
      return {
        ok: true,
        receipt: {
          receiptKey: "receipt_22222222222222222222222222222222",
          quoteKey: "quote_11111111111111111111111111111111",
          itemKey: "field_permit",
          itemName: "Field Permit",
          quantity: 1,
          finalUnitPrice: 50,
          finalTotalPrice: 50,
          currencyCode: "NRC",
          inventoryQuantityOwned: 1,
          completedAt: "2026-07-20T03:00:00.000Z",
          alreadyCompleted: false
        }
      };
    }
  });
  const payload = {
    quoteKey: "quote_11111111111111111111111111111111",
    clientSubmittedAt: "2026-07-20T03:00:00.000Z"
  };

  await assert.rejects(api.execute("storePurchase", payload), (error) => error.code === "NETWORK_ERROR");
  await api.execute("storePurchase", payload);

  assert.deepEqual(events.map((event) => event.phase), ["started", "failed", "started", "succeeded"]);
  assert.equal(events[1].endpointKey, "storePurchase");
  assert.equal(events[1].idempotentWrite, true);
  assert.deepEqual(events[1].error, { status: 0, code: "NETWORK_ERROR", retryAfterMs: 0 });
  assert.equal("payload" in events[1], false, "Recovery events must not expose request payloads.");
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey, "The retry must retain the original idempotency key.");

  instrumentation.destroy();
  assert.equal(PlayerApi.prototype.execute, original, "Recovery instrumentation must restore the original API method when destroyed.");
}

const [mainSource, bootstrapSource, indexSource, controllerSource, cssSource] = await Promise.all([
  readFile(path.join(root, "src/main.js"), "utf8"),
  readFile(path.join(root, "src/recovery/player-recovery-bootstrap.js"), "utf8"),
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "src/recovery/player-recovery-controller.js"), "utf8"),
  readFile(path.join(root, "css/player-terminal-recovery.css"), "utf8")
]);

assert.doesNotMatch(mainSource, /PlayerRecovery/, "Recovery must remain isolated from the shared Player main integration file.");
assert.match(bootstrapSource, /installPlayerRecoveryInstrumentation/);
assert.match(bootstrapSource, /installPlayerRecoveryController/);
assert.match(indexSource, /player-terminal-recovery\.css/);
assert.match(indexSource, /player-recovery-bootstrap\.js/);
assert.match(controllerSource, /MutationObserver/);
assert.match(controllerSource, /addEventListener\?\.\("offline"/);
assert.match(controllerSource, /data-player-recovery-region/);
assert.match(controllerSource, /aria-live/);
assert.match(controllerSource, /economic actions are paused/i);
assert.match(cssSource, /player-terminal-recovery-notice/);
assert.match(cssSource, /@media \(max-width: 640px\)/);
assert.doesNotMatch(controllerSource, /playerSessionToken|accessCode|ownershipUuid/i, "Recovery UI code must not expose credentials or ownership UUIDs.");

console.log("Player recovery states passed: bounded classification, ambiguous idempotent retry semantics, rate-limit timing, committed-success preservation, isolated runtime instrumentation, offline gating, accessibility, and privacy contracts are valid.");
