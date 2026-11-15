import { PlayerApi } from "../api/player-api.js";
import { PLAYER_ENDPOINTS } from "../api/endpoints.js";
import { IDEMPOTENT_WRITE_ENDPOINTS } from "../api/resource-plan.js";



const PLAYER_OPERATION_EVENT = "econovaria:player-operation-state";

const OPERATION_LABELS = Object.freeze({
  contractAccept: "Contract acceptance",
  contractSubmit: "Contract submission",
  inventoryRedemptionRequest: "the Inventory redemption request",
  inventoryUse: "the Inventory action",
  marketOrder: "the market order",
  marketWatchlist: "the watchlist update",
  marketplaceCancel: "the Marketplace cancellation",
  marketplaceListing: "the Marketplace listing",
  marketplacePurchase: "the Marketplace purchase",
  notificationsRead: "the notification update",
  progressionClaim: "the reward claim",
  progressionUnlock: "the skill unlock",
  storePurchase: "the Store purchase",
  storeQuote: "the Store quote"
});

const WRITE_CONTROL_SELECTOR = [
  '[data-player-form][data-endpoint] button[type="submit"]',
  "[data-player-contract-accept]",
  "[data-player-inventory-use]",
  "[data-player-market-order-confirm]",
  "[data-player-market-watchlist]",
  "[data-player-marketplace-cancel]",
  "[data-player-purchase]",
  "[data-player-reward-claim]",
  "[data-player-skill-unlock]",
  "[data-player-store-confirm]",
  "[data-player-store-review]",
  '[data-player-action="notifications-read"]'
].join(",");

const RETRY_TARGET_ATTRIBUTES = Object.freeze([
  "data-player-action",
  "data-player-contract-accept",
  "data-player-inventory-use",
  "data-player-market-order-confirm",
  "data-player-market-watchlist",
  "data-player-marketplace-cancel",
  "data-player-purchase",
  "data-player-reward-claim",
  "data-player-skill-unlock",
  "data-player-store-confirm",
  "data-player-store-review"
]);

let originalExecute = null;
let instrumentationCount = 0;
const instrumentationRuntimes = new Set();

function selectorValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function retrySelectorFromActiveElement(runtime = globalThis) {
  const active = runtime.document?.activeElement;
  if (!active || typeof active.closest !== "function") return "";
  const control = active.closest("button, input[type=submit], [role=button]") || active;
  for (const attribute of RETRY_TARGET_ATTRIBUTES) {
    if (!control.hasAttribute?.(attribute)) continue;
    const value = control.getAttribute(attribute);
    return value ? `[${attribute}="${selectorValue(value)}"]` : `[${attribute}]`;
  }
  const form = control.closest?.("[data-player-form][data-endpoint]");
  if (form) {
    const formName = form.getAttribute("data-player-form");
    const endpoint = form.getAttribute("data-endpoint");
    if (formName) return `[data-player-form="${selectorValue(formName)}"] button[type="submit"]`;
    if (endpoint) return `[data-endpoint="${selectorValue(endpoint)}"] button[type="submit"]`;
  }
  return "";
}

function dispatchOperation(runtime, detail) {
  if (!runtime || typeof runtime.dispatchEvent !== "function") return;
  let event;
  if (typeof runtime.CustomEvent === "function") {
    event = new runtime.CustomEvent(PLAYER_OPERATION_EVENT, { detail: Object.freeze(detail) });
  } else if (typeof runtime.Event === "function") {
    event = new runtime.Event(PLAYER_OPERATION_EVENT);
    Object.defineProperty(event, "detail", { value: Object.freeze(detail) });
  } else {
    return;
  }
  runtime.dispatchEvent(event);
}

function boundedError(error = {}) {
  return Object.freeze({
    status: Number(error?.status || 0),
    code: String(error?.code || "REQUEST_FAILED").trim().toUpperCase().slice(0, 64),
    retryAfterMs: Math.max(0, Number(error?.retryAfterMs || 0))
  });
}

function instrumentPlayerApi() {
  if (originalExecute) return;
  originalExecute = PlayerApi.prototype.execute;
  PlayerApi.prototype.execute = function instrumentedExecute(endpointKey, payload, params, options) {
    const endpoint = PLAYER_ENDPOINTS[endpointKey];
    const method = String(endpoint?.method || "POST").toUpperCase();
    const idempotentWrite = IDEMPOTENT_WRITE_ENDPOINTS.has(endpointKey);
    const retryTargetSelector = retrySelectorFromActiveElement(globalThis);
    const operationLabel = OPERATION_LABELS[endpointKey] || "the requested action";
    const startedAt = Date.now();

    for (const runtime of instrumentationRuntimes) {
      dispatchOperation(runtime, {
        phase: "started",
        endpointKey,
        method,
        idempotentWrite,
        operationLabel,
        retryTargetSelector
      });
    }

    return originalExecute.call(this, endpointKey, payload, params, options).then(
      (value) => {
        for (const runtime of instrumentationRuntimes) {
          dispatchOperation(runtime, {
            phase: "succeeded",
            endpointKey,
            method,
            idempotentWrite,
            operationLabel,
            retryTargetSelector,
            elapsedMs: Math.max(0, Date.now() - startedAt)
          });
        }
        return value;
      },
      (error) => {
        const safeError = boundedError(error);
        for (const runtime of instrumentationRuntimes) {
          dispatchOperation(runtime, {
            phase: "failed",
            endpointKey,
            method,
            idempotentWrite,
            operationLabel,
            retryTargetSelector,
            error: safeError,
            elapsedMs: Math.max(0, Date.now() - startedAt)
          });
        }
        throw error;
      }
    );
  };
}

function uninstrumentPlayerApi() {
  if (!originalExecute || instrumentationCount > 0) return;
  PlayerApi.prototype.execute = originalExecute;
  originalExecute = null;
}

function installPlayerRecoveryInstrumentation({ runtime = globalThis } = {}) {
  instrumentationRuntimes.add(runtime);
  instrumentationCount += 1;
  instrumentPlayerApi();
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      instrumentationRuntimes.delete(runtime);
      instrumentationCount = Math.max(0, instrumentationCount - 1);
      uninstrumentPlayerApi();
    }
  };
}

export {
  PLAYER_OPERATION_EVENT,
  OPERATION_LABELS,
  WRITE_CONTROL_SELECTOR,
  RETRY_TARGET_ATTRIBUTES,
  originalExecute,
  instrumentationCount,
  instrumentationRuntimes,
  selectorValue,
  retrySelectorFromActiveElement,
  dispatchOperation,
  boundedError,
  instrumentPlayerApi,
  uninstrumentPlayerApi,
  installPlayerRecoveryInstrumentation,
};
