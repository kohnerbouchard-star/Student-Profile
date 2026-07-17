import { ApiRequestError, normalizeApiError, playerSafeErrorMessage } from "./errors.js";
import { parseRetryAfter } from "./request-context.js";

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

    const headers = {
      Accept: "application/json",
      "x-request-id": requestId
    };

    if (payload !== undefined) headers["Content-Type"] = "application/json";
    if (this.config.accessToken) headers.Authorization = `Bearer ${this.config.accessToken}`;
    if (this.config.playerSessionToken) headers["x-econovaria-player-session-token"] = this.config.playerSessionToken;
    if (this.config.gameSessionId) headers["x-econovaria-game-session-id"] = this.config.gameSessionId;
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    try {
      const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal,
        credentials: "include"
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
