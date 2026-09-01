/// <reference lib="dom" />

import {
  BusinessOperationsWorkerError,
  type BusinessOperationsWorkerRepository,
  runBusinessOperationsWorker,
} from "../services/businessOperationsWorker.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

export const BUSINESS_OPERATIONS_WORKER_INTERNAL_HEADER =
  "x-business-operations-worker-secret";

const FORBIDDEN_BROWSER_HEADERS = Object.freeze([
  "authorization",
  "cookie",
  "origin",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "x-csrf-token",
  "x-econovaria-csrf-token",
  "x-player-session-token",
  "x-econovaria-player-session-token",
  "x-econovaria-device-id",
  "x-econovaria-game-id",
  "x-econovaria-game-session-id",
  "x-econovaria-player-id",
]);

export interface BusinessOperationsWorkerHttpDependencies {
  readonly createRepository: () => BusinessOperationsWorkerRepository;
  readonly readRunnerSecret?: () => string | undefined;
}

export async function handleBusinessOperationsWorkerRequest(
  request: Request,
  dependencies: BusinessOperationsWorkerHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return serviceJson(
      405,
      errorBody(
        "method_not_allowed",
        "Use POST to run due Business operations.",
        false,
      ),
      { allow: "POST" },
    );
  }

  const browserFailure = businessOperationsWorkerBrowserRequestFailure(request);
  if (browserFailure) return browserFailure;

  const configuredSecret = dependencies.readRunnerSecret
    ? dependencies.readRunnerSecret()
    : Deno.env.get("STOCK_MARKET_RUNNER_SECRET");
  const expectedSecret = typeof configuredSecret === "string"
    ? configuredSecret.trim()
    : "";
  if (!expectedSecret) {
    return serviceJson(
      500,
      errorBody(
        "business_operations_worker_secret_not_configured",
        "Business operations worker authentication is not configured.",
        false,
      ),
    );
  }
  const suppliedSecret = String(
    request.headers.get(BUSINESS_OPERATIONS_WORKER_INTERNAL_HEADER) ?? "",
  );
  if (!constantTimeTextEqual(suppliedSecret, expectedSecret)) {
    return serviceJson(
      401,
      errorBody(
        "unauthorized_business_operations_worker",
        "Business operations worker authentication failed.",
        false,
      ),
    );
  }

  try {
    await assertEmptyBody(request);
    const result = await runBusinessOperationsWorker({
      repository: dependencies.createRepository(),
      batchLimit: 25,
    });
    const summary = Object.freeze({
      recoveryScannedCount: result.recoveryScannedCount,
      recoveredCount: result.recoveredCount,
      recoveryReplayedCount: result.recoveryReplayedCount,
      recoveryDeferredCount: result.recoveryDeferredCount,
      taxRecoveryScannedCount: result.taxRecoveryScannedCount,
      taxRecoveredCount: result.taxRecoveredCount,
      taxRecoveryDeferredCount: result.taxRecoveryDeferredCount,
      claimedCount: result.claimedCount,
      closedCount: result.closedCount,
      replayedCount: result.replayedCount,
      failedCount: result.failedCount,
      releasedCount: result.releasedCount,
      releaseFailedCount: result.releaseFailedCount,
    });

    if (result.failedCount > 0) {
      return serviceJson(503, {
        ...errorBody(
          "business_operating_period_batch_incomplete",
          "One or more due Business operating periods did not close.",
          true,
        ),
        summary,
      });
    }
    return serviceJson(200, { ok: true, ...summary });
  } catch (error) {
    if (error instanceof BusinessOperationsWorkerError) {
      return serviceJson(
        error.status,
        errorBody(
          error.code,
          error.message,
          error.retryable,
        ),
      );
    }
    return serviceJson(
      500,
      errorBody(
        "business_operations_worker_failed",
        "Business operations worker failed.",
        true,
      ),
    );
  }
}

/** Rejects browser-derived identity before any nonce claim or service access. */
export function businessOperationsWorkerBrowserRequestFailure(
  request: Request,
): Response | null {
  if (FORBIDDEN_BROWSER_HEADERS.some((name) => request.headers.has(name))) {
    return serviceJson(
      403,
      errorBody(
        "browser_business_operations_request_forbidden",
        "Business operations worker requests must originate from a controlled server.",
        false,
      ),
    );
  }
  return null;
}

async function assertEmptyBody(request: Request): Promise<void> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && declaredLength.trim() !== "0") {
    throw invalidRequest();
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    throw invalidRequest();
  }
  if (bytes.byteLength !== 0) throw invalidRequest();
}

function invalidRequest(): BusinessOperationsWorkerError {
  return new BusinessOperationsWorkerError(
    "invalid_business_operations_worker_request",
    "Business operations work has fixed global scope and requires an empty body.",
    400,
    false,
  );
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function errorBody(code: string, message: string, retryable: boolean) {
  return { ok: false, error: { code, message, retryable } };
}

function serviceJson(
  status: number,
  body: unknown,
  additionalHeaders: HeadersInit = {},
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  new Headers(additionalHeaders).forEach((value, key) =>
    headers.set(key, value)
  );
  return new Response(JSON.stringify(body), { status, headers });
}
