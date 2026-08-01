const PLAYER_API_PATH_PREFIX = "/functions/v1/player-api/";
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 40;
const DEFAULT_MAX_JITTER_MS = 60;

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface PlayerApiReadResilienceOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxJitterMs?: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly randomUint32?: () => number;
}

export function createPlayerApiReadResilientFetch(
  upstreamFetch: FetchLike,
  options: PlayerApiReadResilienceOptions = {},
): FetchLike {
  const maxAttempts = boundedInteger(
    options.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
    1,
    3,
  );
  const baseDelayMs = boundedInteger(
    options.baseDelayMs,
    DEFAULT_BASE_DELAY_MS,
    0,
    1_000,
  );
  const maxJitterMs = boundedInteger(
    options.maxJitterMs,
    DEFAULT_MAX_JITTER_MS,
    0,
    1_000,
  );
  const sleep = options.sleep ?? abortableSleep;
  const randomUint32 = options.randomUint32 ?? secureRandomUint32;

  return async (input, init) => {
    const request = new Request(input, init);
    if (!isRetryablePlayerApiRead(request)) {
      return upstreamFetch(input, init);
    }

    let lastError: unknown = new Error("Player API read failed.");
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (request.signal.aborted) throw abortReason(request.signal);
      try {
        const response = await upstreamFetch(request.clone());
        let body: ArrayBuffer;
        try {
          body = await response.arrayBuffer();
        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) {
            await retryDelay(
              attempt,
              baseDelayMs,
              maxJitterMs,
              randomUint32,
              sleep,
              request.signal,
            );
            continue;
          }
          throw error;
        }

        const replayable = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        if (!TRANSIENT_STATUSES.has(response.status) || attempt >= maxAttempts) {
          return replayable;
        }
        lastError = new Error(`Transient Player API response: ${response.status}`);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || request.signal.aborted) throw error;
      }

      await retryDelay(
        attempt,
        baseDelayMs,
        maxJitterMs,
        randomUint32,
        sleep,
        request.signal,
      );
    }

    throw lastError;
  };
}

function isRetryablePlayerApiRead(request: Request): boolean {
  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) return false;
  try {
    return new URL(request.url).pathname.startsWith(PLAYER_API_PATH_PREFIX);
  } catch {
    return false;
  }
}

async function retryDelay(
  attempt: number,
  baseDelayMs: number,
  maxJitterMs: number,
  randomUint32: () => number,
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  const exponential = baseDelayMs * (2 ** Math.max(0, attempt - 1));
  const jitter = maxJitterMs === 0 ? 0 : randomUint32() % (maxJitterMs + 1);
  await sleep(exponential + jitter, signal);
}

function secureRandomUint32(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The request was aborted.", "AbortError");
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : fallback;
}
