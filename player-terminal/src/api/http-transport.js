import { ApiRequestError, normalizeApiError, playerSafeErrorMessage } from "./errors.js";
import { parseRetryAfter } from "./request-context.js";

const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function normalizedCredential(value) {
  return String(value || "").replace(/^Bearer\s+/i, "").trim();
}

function isPublishableKey(value) {
  return /^sb_publishable_/i.test(normalizedCredential(value));
}

function deviceId(config) {
  const configured = String(config.deviceId || "").trim().toLowerCase();
  if (DEVICE_ID_PATTERN.test(configured)) return configured;

  try {
    const existing = String(globalThis.localStorage?.getItem(DEVICE_STORAGE_KEY) || "")
      .trim()
      .toLowerCase();
    if (DEVICE_ID_PATTERN.test(existing)) return existing;

    const generated = String(globalThis.crypto?.randomUUID?.() || "").toLowerCase();
    if (!DEVICE_ID_PATTERN.test(generated)) {
      throw new Error("secure device identifier generation unavailable");
    }
    globalThis.localStorage?.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    throw new ApiRequestError("This device could not initialize a secure game session.", {
      code: "DEVICE_ID_UNAVAILABLE"
    });
  }
}

function currentPlayerSession(config) {
  const value = typeof config.sessionProvider === "function"
    ? config.sessionProvider()
    : null;
  return value && value.authenticated === true ? value : null;
}

export class HttpTransport {
  constructor(config) {
    this.config = config;
  }

  async request({ endpointKey, method, path, payload, requestId, idempotencyKey, signal }) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.requestTimeoutMs);
    const onExternalAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", onExternalAbort, { once: true });

    const normalizedMethod = String(method || "GET").toUpperCase();
    const headers = {
      Accept: "application/json",
      "x-request-id": requestId,
      "x-econovaria-device-id": deviceId(this.config)
    };

    if (payload !== undefined) headers["Content-Type"] = "application/json";

    const publishableKey = normalizedCredential(this.config.publishableKey);
    if (publishableKey && !isPublishableKey(publishableKey)) {
      throw new ApiRequestError("The Player application identity is invalid.", {
        code: "PUBLISHABLE_KEY_INVALID",
        path,
        endpointKey,
        requestId
      });
    }
    if (publishableKey) headers.apikey = publishableKey;

    if (!["GET", "HEAD"].includes(normalizedMethod)) {
      const session = currentPlayerSession(this.config);
      const csrfToken = String(session?.csrfToken || this.config.csrfToken || "");
      if (!CSRF_PATTERN.test(csrfToken)) {
        throw new ApiRequestError("Your Player session ended. Sign in again.", {
          status: 401,
          code: "SESSION_INVALID",
          path,
          endpointKey,
          requestId
        });
      }
      headers["x-econovaria-csrf-token"] = csrfToken;
    }
    if (this.config.gameSessionId) {
      headers["x-econovaria-game-id"] = this.config.gameSessionId;
      headers["x-econovaria-game-session-id"] = this.config.gameSessionId;
    }
    if (idempotencyKey) {
      headers["x-idempotency-key"] = idempotencyKey;
      headers["idempotency-key"] = idempotencyKey;
    }

    try {
      const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        method: normalizedMethod,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal,
        credentials: "include",
        cache: "no-store"
      });

      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text().catch(() => "");

      if (!response.ok) {
        const responseCode = String(body?.code || body?.error?.code || "").toUpperCase();
        const code = /^[A-Z0-9_]{2,64}$/.test(responseCode)
          ? responseCode
          : response.status === 401
            ? "SESSION_INVALID"
            : response.status === 429
              ? "RATE_LIMITED"
              : "REQUEST_FAILED";
        throw new ApiRequestError(playerSafeErrorMessage({ status: response.status, code }), {
          status: response.status,
          code,
          path,
          endpointKey,
          requestId,
          retryAfterMs: parseRetryAfter(response.headers.get("retry-after"))
        });
      }

      return body;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new ApiRequestError(
          timedOut ? "The game service took too long to respond. Try again." : "The request was cancelled.",
          { code: timedOut ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED", path, endpointKey, requestId }
        );
      }
      if (error instanceof ApiRequestError) throw error;
      const offline = globalThis.navigator?.onLine === false;
      throw normalizeApiError(error, {
        code: offline ? "OFFLINE" : "NETWORK_ERROR",
        endpointKey,
        path,
        requestId
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onExternalAbort);
    }
  }
}
