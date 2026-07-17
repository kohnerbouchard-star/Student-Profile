import { ApiConnectionPendingError, ApiRequestError } from "./errors.js";
import { resolvePlayerBackendRequest } from "./backend-routes.js";

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/$/, "")}/${String(path || "").replace(/^\//, "")}`;
}

export class HttpTransport {
  constructor(config) {
    this.config = config;
  }

  async request(context) {
    const session = {
      playerSessionToken: this.config.playerSessionToken || "",
      gameSessionId: this.config.gameSessionId || "",
      playerSessionId: this.config.playerSessionId || "",
      accessToken: this.config.accessToken || ""
    };
    const backendRequest = resolvePlayerBackendRequest({ ...context, session });
    if (!backendRequest && this.config.allowProvisionalHttpRoutes !== true) {
      throw new ApiConnectionPendingError(context);
    }
    const { method, path, payload } = backendRequest || context;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    const headers = { Accept: "application/json" };

    if (payload !== undefined) headers["Content-Type"] = "application/json";
    if (this.config.accessToken) headers.Authorization = `Bearer ${this.config.accessToken}`;
    if (this.config.playerSessionToken) headers["x-player-session-token"] = this.config.playerSessionToken;

    try {
      const response = await fetch(joinUrl(this.config.apiBaseUrl, path), {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal,
        credentials: this.config.requestCredentials || "omit"
      });

      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text().catch(() => "");

      if (!response.ok) {
        const edgeError = body && typeof body === "object" && !Array.isArray(body)
          ? body.error
          : null;
        const message = typeof body?.message === "string"
          ? body.message
          : edgeError && typeof edgeError === "object" && typeof edgeError.message === "string"
            ? edgeError.message
            : typeof edgeError === "string"
              ? edgeError
              : `Request failed with status ${response.status}`;
        throw new ApiRequestError(
          message,
          { status: response.status, body, path }
        );
      }

      return body;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new ApiRequestError("The player API request timed out.", { path });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
