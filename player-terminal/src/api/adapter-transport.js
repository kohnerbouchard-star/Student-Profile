import { ApiRequestError, normalizeApiError } from "./errors.js";

const SAFE_READ_METHODS = new Set(["GET", "HEAD"]);
const RETRYABLE_READ_STATUSES = new Set([500, 502, 503, 504]);
const SAFE_READ_RETRY_DELAY_MS = 75;

export class AdapterTransport {
  constructor(adapter, config) {
    const request = typeof adapter === "function"
      ? adapter
      : adapter && typeof adapter.request === "function"
        ? adapter.request.bind(adapter)
        : null;
    if (!request) {
      throw new TypeError("A player API adapter must be an async function or expose request(context).");
    }
    this.requestAdapter = request;
    this.config = config;
  }

  async request(context) {
    const controller = new AbortController();
    const timeoutMs = Number(this.config.requestTimeoutMs) || 15000;
    let timeout = 0;
    let removeExternalAbort = () => {};

    const abortPromise = new Promise((resolve, reject) => {
      const rejectAborted = () => reject(new ApiRequestError("The request was cancelled.", {
        code: "REQUEST_ABORTED",
        endpointKey: context.endpointKey,
        path: context.path,
        requestId: context.requestId
      }));
      if (context.signal?.aborted) {
        controller.abort();
        rejectAborted();
        return;
      }
      if (context.signal) {
        const onAbort = () => {
          controller.abort();
          rejectAborted();
        };
        context.signal.addEventListener("abort", onAbort, { once: true });
        removeExternalAbort = () => context.signal.removeEventListener("abort", onAbort);
      }
      void resolve;
    });

    const timeoutPromise = new Promise((resolve, reject) => {
      timeout = globalThis.setTimeout(() => {
        controller.abort();
        reject(new ApiRequestError("The game service took too long to respond. Try again.", {
          code: "REQUEST_TIMEOUT",
          endpointKey: context.endpointKey,
          path: context.path,
          requestId: context.requestId
        }));
      }, timeoutMs);
      void resolve;
    });

    const providedSession = typeof this.config.sessionProvider === "function"
      ? await this.config.sessionProvider()
      : null;
    const currentSession = providedSession && typeof providedSession === "object"
      ? providedSession
      : this.config.authenticated === true
        ? this.config
        : null;
    const adapterContext = {
      ...context,
      signal: controller.signal,
      session: {
        authenticated: currentSession?.authenticated === true,
        csrfToken: String(currentSession?.csrfToken || this.config.csrfToken || ""),
        gameSessionId: String(currentSession?.gameSessionId || this.config.gameSessionId || "")
      },
      config: this.config
    };
    const invokeAdapter = () => Promise.resolve()
      .then(() => this.requestAdapter(adapterContext))
      .then((result) => {
        if (result?.ok === false && Number(result?.status) >= 400) throw result;
        return result;
      });
    const adapterPromise = invokeAdapter().catch(async (error) => {
      const method = String(context.method || "GET").toUpperCase();
      const status = Number(error?.status || 0);
      if (
        !SAFE_READ_METHODS.has(method) ||
        !RETRYABLE_READ_STATUSES.has(status) ||
        controller.signal.aborted
      ) {
        throw error;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, SAFE_READ_RETRY_DELAY_MS));
      if (controller.signal.aborted) throw error;
      return invokeAdapter();
    });

    try {
      return await Promise.race([adapterPromise, timeoutPromise, abortPromise]);
    } catch (error) {
      throw normalizeApiError(error, context);
    } finally {
      globalThis.clearTimeout(timeout);
      removeExternalAbort();
    }
  }
}
