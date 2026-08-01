const PLAYER_API_PATH_PREFIX = "/functions/v1/player-api/";
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 40;
const DEFAULT_MAX_JITTER_MS = 60;

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface PlayerApiReadRetryEvent {
  readonly attempt: number;
  readonly nextAttempt: number;
  readonly delayMs: number;
  readonly path: string;
  readonly status: number | null;
  readonly reason: "network" | "response" | "response_body";
}

export interface PlayerApiReadResilienceOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxJitterMs?: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly randomUint32?: () => number;
  readonly onRetry?: (event: PlayerApiReadRetryEvent) => void;
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
  const onRetry = options.onRetry ?? (() => {});

  return async (input, init) => {
    const request = new Request(input, init);
    if (!isRetryablePlayerApiRead(request)) {
      return upstreamFetch(input, init);
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (request.signal.aborted) throw abortReason(request.signal);

      let retry: Pick<PlayerApiReadRetryEvent, "status" | "reason"> | null = null;
      try {
        const response = await upstreamFetch(request.clone());
        let body: ArrayBuffer;
        try {
          body = await response.arrayBuffer();
        } catch (error) {
          if (attempt >= maxAttempts) throw error;
          retry = { status: response.status, reason: "response_body" };
          body = new ArrayBuffer(0);
        }

        if (!retry) {
          const replayable = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
          if (!TRANSIENT_STATUSES.has(response.status) || attempt >= maxAttempts) {
            return replayable;
          }
          retry = { status: response.status, reason: "response" };
        }
      } catch (error) {
        if (attempt >= maxAttempts || request.signal.aborted) throw error;
        retry = { status: null, reason: "network" };
      }

      await waitBeforeRetry({
        request,
        attempt,
        status: retry.status,
        reason: retry.reason,
        baseDelayMs,
        maxJitterMs,
        randomUint32,
        sleep,
        onRetry,
      });
    }

    throw new Error("Player API read retry state was exhausted.");
  };
}

interface RetryWaitInput {
  readonly request: Request;
  readonly attempt: number;
  readonly status: number | null;
  readonly reason: PlayerApiReadRetryEvent["reason"];
  readonly baseDelayMs: number;
  readonly maxJitterMs: number;
  readonly randomUint32: () => number;
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly onRetry: (event: PlayerApiReadRetryEvent) => void;
}

async function waitBeforeRetry(input: RetryWaitInput): Promise<void> {
  const exponential = input.baseDelayMs * (2 ** Math.max(0, input.attempt - 1));
  const jitter = input.maxJitterMs === 0
    ? 0
    : input.randomUint32() % (input.maxJitterMs + 1);
  const delayMs = exponential + jitter;
  input.onRetry(Object.freeze({
    attempt: input.attempt,
    nextAttempt: input.attempt + 1,
    delayMs,
    path: new URL(input.request.url).pathname,
    status: input.status,
    reason: input.reason,
  }));
  await input.sleep(delayMs, input.request.signal);
}

function isRetryablePlayerApiRead(request: Request): boolean {
  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) return false;
  try {
    return new URL(request.url).pathname.startsWith(PLAYER_API_PATH_PREFIX);
  } catch {
    return false;
  }
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
