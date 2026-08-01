const RETRYABLE_READ_STATUSES = new Set([500, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 40;
const DEFAULT_MAX_JITTER_MS = 60;
const MAX_RETRY_AFTER_MS = 1_000;

export function createStudentProfileReadResilientFetch(
  fetchImpl,
  {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxJitterMs = DEFAULT_MAX_JITTER_MS,
    sleep = abortableSleep,
    randomUint32 = secureRandomUint32,
    onRetry = () => {}
  } = {}
) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const attemptLimit = boundedInteger(maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 3);
  const initialDelay = boundedInteger(baseDelayMs, DEFAULT_BASE_DELAY_MS, 0, 1_000);
  const jitterLimit = boundedInteger(maxJitterMs, DEFAULT_MAX_JITTER_MS, 0, 1_000);

  return async function resilientStudentProfileRead(input, init = {}) {
    const method = String(init.method || requestMethod(input) || "GET").toUpperCase();
    const signal = init.signal || requestSignal(input);
    if (!["GET", "HEAD"].includes(method) || !isPlayerBffRequest(input)) {
      return fetchImpl(input, init);
    }

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      if (signal?.aborted) throw abortReason(signal);
      try {
        const response = await fetchImpl(cloneInput(input), init);
        if (!RETRYABLE_READ_STATUSES.has(response.status) || attempt >= attemptLimit) {
          return response;
        }
        await response.body?.cancel().catch(() => {});
        await waitBeforeRetry({
          attempt,
          response,
          input,
          signal,
          initialDelay,
          jitterLimit,
          randomUint32,
          sleep,
          onRetry,
          reason: "response"
        });
      } catch (error) {
        if (attempt >= attemptLimit || signal?.aborted) throw error;
        await waitBeforeRetry({
          attempt,
          response: null,
          input,
          signal,
          initialDelay,
          jitterLimit,
          randomUint32,
          sleep,
          onRetry,
          reason: "network"
        });
      }
    }

    throw new Error("Player read retry state was exhausted.");
  };
}

async function waitBeforeRetry({
  attempt,
  response,
  input,
  signal,
  initialDelay,
  jitterLimit,
  randomUint32,
  sleep,
  onRetry,
  reason
}) {
  const exponentialDelay = initialDelay * (2 ** Math.max(0, attempt - 1));
  const jitter = jitterLimit === 0 ? 0 : randomUint32() % (jitterLimit + 1);
  const retryAfter = response ? retryAfterMs(response) : 0;
  const delayMs = Math.max(exponentialDelay + jitter, retryAfter);
  onRetry(Object.freeze({
    attempt,
    nextAttempt: attempt + 1,
    delayMs,
    path: requestPath(input),
    status: response?.status ?? null,
    reason
  }));
  await sleep(delayMs, signal);
}

function isPlayerBffRequest(input) {
  const path = requestPath(input);
  return path === "/api/player" ||
    path.startsWith("/api/player/") ||
    path === "/functions/v1/player-web-session-api" ||
    path.startsWith("/functions/v1/player-web-session-api/");
}

function requestPath(input) {
  try {
    const value = input instanceof Request ? input.url : String(input || "");
    return new URL(value, "http://localhost").pathname;
  } catch {
    return "";
  }
}

function requestMethod(input) {
  return input instanceof Request ? input.method : "";
}

function requestSignal(input) {
  return input instanceof Request ? input.signal : undefined;
}

function cloneInput(input) {
  return input instanceof Request ? input.clone() : input;
}

function retryAfterMs(response) {
  const value = String(response.headers?.get?.("retry-after") || "").trim();
  if (!/^\d{1,5}$/u.test(value)) return 0;
  return Math.min(MAX_RETRY_AFTER_MS, Number(value) * 1_000);
}

function secureRandomUint32() {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0];
}

function abortableSleep(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal) {
  return signal?.reason || new DOMException("The request was aborted.", "AbortError");
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}
