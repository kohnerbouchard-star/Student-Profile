import { ApiRequestError, normalizeApiError } from "./errors.js";

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

    const adapterPromise = Promise.resolve()
      .then(() => this.requestAdapter({
        ...context,
        signal: controller.signal,
        session: {
          playerSessionToken: this.config.playerSessionToken || "",
          gameSessionId: this.config.gameSessionId || "",
          playerSessionId: this.config.playerSessionId || "",
          accessToken: this.config.accessToken || ""
        },
        config: this.config
      }))
      .then((result) => {
        if (result?.ok === false && Number(result?.status) >= 400) throw result;
        return result;
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
