import { ApiRequestError } from "./errors.js";

export class HttpTransport {
  constructor(config) {
    this.config = config;
  }

  async request({ method, path, payload }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    const headers = { Accept: "application/json" };

    if (payload !== undefined) headers["Content-Type"] = "application/json";
    if (this.config.accessToken) headers.Authorization = `Bearer ${this.config.accessToken}`;
    if (this.config.gameSessionId) headers["x-econovaria-game-session-id"] = this.config.gameSessionId;

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
        throw new ApiRequestError(
          body?.message || body?.error || `Request failed with status ${response.status}`,
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
