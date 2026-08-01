const RETRYABLE_READ_STATUSES = new Set([502, 503, 504, 546]);
const TRANSIENT_500_HEADER_VALUES = new Set([
  "worker-retired",
  "worker-resource-limit",
  "transient-upstream"
]);
const TRANSIENT_500_PATTERNS = Object.freeze([
  /WorkerAlreadyRetired/iu,
  /worker has already retired/iu,
  /WORKER_RESOURCE_LIMIT/iu,
  /\bCPUTime\b/iu,
  /CPU time soft limit reached/iu
]);
const NON_RETRYABLE_503_PATTERNS = Object.freeze([
  /\bBOOT_ERROR\b/iu,
  /Function failed to start/iu
]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 200;
const DEFAULT_MAX_JITTER_MS = 300;
const DEFAULT_MAX_RETRY_ELAPSED_MS = 3_000;
const MAX_INSPECTED_RESPONSE_BYTES = 8_192;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createStudentProfileReadResilientFetch(
  fetchImpl,
  {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxJitterMs = DEFAULT_MAX_JITTER_MS,
    maxRetryElapsedMs = DEFAULT_MAX_RETRY_ELAPSED_MS,
    sleep = abortableSleep,
    randomUint32 = secureRandomUint32,
    monotonicNow = defaultMonotonicNow,
    wallClockNow = Date.now,
    onRetry = () => {},
    onEvent = () => {}
  } = {}
) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const attemptLimit = boundedInteger(maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 3);
  const initialDelay = boundedInteger(baseDelayMs, DEFAULT_BASE_DELAY_MS, 0, 2_000);
  const jitterLimit = boundedInteger(maxJitterMs, DEFAULT_MAX_JITTER_MS, 0, 2_000);
  const retryBudget = boundedInteger(
    maxRetryElapsedMs,
    DEFAULT_MAX_RETRY_ELAPSED_MS,
    250,
    10_000
  );

  return async function resilientStudentProfileRead(input, init = {}) {
    const method = String(init.method || requestMethod(input) || "GET").toUpperCase();
    const signal = init.signal || requestSignal(input);
    if (!["GET", "HEAD"].includes(method) || !isPlayerBffRequest(input)) {
      return fetchImpl(input, init);
    }

    const startedAt = monotonicNow();
    let attemptedRetry = false;

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      if (signal?.aborted) throw abortReason(signal);
      try {
        const response = await fetchImpl(cloneInput(input), init);
        const classification = await retryClassification(response);
        if (!classification) {
          if (attemptedRetry) {
            emitEvent(onEvent, {
              type: "retry_recovered",
              attempt,
              path: sanitizedRequestPath(input),
              status: response.status,
              classification: "recovered",
              elapsedMs: elapsedMilliseconds(monotonicNow, startedAt)
            });
          }
          return response;
        }

        if (attempt >= attemptLimit) {
          emitEvent(onEvent, {
            type: "retry_exhausted",
            attempt,
            path: sanitizedRequestPath(input),
            status: response.status,
            classification,
            elapsedMs: elapsedMilliseconds(monotonicNow, startedAt)
          });
          return response;
        }

        const retryAfter = parsedRetryAfterMs(response, wallClockNow());
        const plan = retryPlan({
          attempt,
          retryAfterMs: retryAfter,
          startedAt,
          retryBudget,
          initialDelay,
          jitterLimit,
          randomUint32,
          monotonicNow
        });
        if (!plan.allowed) {
          emitEvent(onEvent, {
            type: "retry_budget_exhausted",
            attempt,
            path: sanitizedRequestPath(input),
            status: response.status,
            classification,
            retryAfterMs: retryAfter,
            remainingBudgetMs: plan.remainingBudgetMs,
            elapsedMs: plan.elapsedMs
          });
          return response;
        }

        await response.body?.cancel().catch(() => {});
        const retryEvent = Object.freeze({
          type: "retry_scheduled",
          attempt,
          nextAttempt: attempt + 1,
          delayMs: plan.delayMs,
          path: sanitizedRequestPath(input),
          status: response.status,
          reason: "response",
          classification,
          retryAfterMs: retryAfter,
          remainingBudgetMs: plan.remainingBudgetMs,
          elapsedMs: plan.elapsedMs
        });
        attemptedRetry = true;
        onRetry(retryEvent);
        emitEvent(onEvent, retryEvent);
        await sleep(plan.delayMs, signal);
      } catch (error) {
        if (attempt >= attemptLimit || signal?.aborted) {
          emitEvent(onEvent, {
            type: "retry_exhausted",
            attempt,
            path: sanitizedRequestPath(input),
            status: null,
            classification: "network",
            elapsedMs: elapsedMilliseconds(monotonicNow, startedAt)
          });
          throw error;
        }

        const plan = retryPlan({
          attempt,
          retryAfterMs: 0,
          startedAt,
          retryBudget,
          initialDelay,
          jitterLimit,
          randomUint32,
          monotonicNow
        });
        if (!plan.allowed) {
          emitEvent(onEvent, {
            type: "retry_budget_exhausted",
            attempt,
            path: sanitizedRequestPath(input),
            status: null,
            classification: "network",
            retryAfterMs: 0,
            remainingBudgetMs: plan.remainingBudgetMs,
            elapsedMs: plan.elapsedMs
          });
          throw error;
        }

        const retryEvent = Object.freeze({
          type: "retry_scheduled",
          attempt,
          nextAttempt: attempt + 1,
          delayMs: plan.delayMs,
          path: sanitizedRequestPath(input),
          status: null,
          reason: "network",
          classification: "network",
          retryAfterMs: 0,
          remainingBudgetMs: plan.remainingBudgetMs,
          elapsedMs: plan.elapsedMs
        });
        attemptedRetry = true;
        onRetry(retryEvent);
        emitEvent(onEvent, retryEvent);
        await sleep(plan.delayMs, signal);
      }
    }

    throw new Error("Player read retry state was exhausted.");
  };
}

async function retryClassification(response) {
  if (response.status === 500) {
    const header = String(response.headers?.get?.("x-econovaria-retryable") || "")
      .trim()
      .toLowerCase();
    if (TRANSIENT_500_HEADER_VALUES.has(header)) return header.replaceAll("-", "_");
    const body = await boundedResponseText(response);
    return TRANSIENT_500_PATTERNS.some((pattern) => pattern.test(body))
      ? "worker_retired"
      : "";
  }
  if (response.status === 503) {
    const body = await boundedResponseText(response);
    return NON_RETRYABLE_503_PATTERNS.some((pattern) => pattern.test(body))
      ? ""
      : "service_unavailable";
  }
  if (response.status === 546) return "worker_resource_limit";
  return RETRYABLE_READ_STATUSES.has(response.status) ? "gateway" : "";
}

async function boundedResponseText(response) {
  let clone;
  try {
    clone = response.clone();
  } catch {
    return "";
  }
  const body = clone.body;
  if (!body?.getReader) {
    try {
      return (await clone.text()).slice(0, MAX_INSPECTED_RESPONSE_BYTES);
    } catch {
      return "";
    }
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  try {
    while (bytesRead <= MAX_INSPECTED_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_INSPECTED_RESPONSE_BYTES) break;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return "";
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

function retryPlan({
  attempt,
  retryAfterMs,
  startedAt,
  retryBudget,
  initialDelay,
  jitterLimit,
  randomUint32,
  monotonicNow
}) {
  const elapsedMs = elapsedMilliseconds(monotonicNow, startedAt);
  const remainingBudgetMs = Math.max(0, retryBudget - elapsedMs);
  const exponentialDelay = initialDelay * (2 ** Math.max(0, attempt - 1));
  const jitter = jitterLimit === 0 ? 0 : randomUint32() % (jitterLimit + 1);
  const delayMs = Math.max(exponentialDelay + jitter, retryAfterMs);
  return {
    allowed: remainingBudgetMs > 0 && delayMs <= remainingBudgetMs,
    delayMs,
    elapsedMs,
    remainingBudgetMs
  };
}

function parsedRetryAfterMs(response, nowMs) {
  const value = String(response.headers?.get?.("retry-after") || "").trim();
  if (!value) return 0;
  if (/^\d+$/u.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : 0;
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

function sanitizedRequestPath(input) {
  const path = requestPath(input);
  return path
    .split("/")
    .map((segment) => {
      if (UUID_PATTERN.test(segment) || segment.length > 48) return ":dynamic";
      return segment;
    })
    .join("/")
    .slice(0, 240);
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

function defaultMonotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function elapsedMilliseconds(monotonicNow, startedAt) {
  return Math.max(0, Math.round(monotonicNow() - startedAt));
}

function emitEvent(listener, event) {
  listener(Object.freeze({ ...event }));
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}
