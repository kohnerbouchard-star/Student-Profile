import { jsonError } from "../platform/supabase/edgeResponse.ts";

const TEXT_ENCODER = new TextEncoder();
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 300;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^v1=([A-Za-z0-9_-]{43})$/;
const TIMESTAMP_PATTERN = /^[0-9]{10}$/;

export const INTERNAL_RUNNER_TIMESTAMP_HEADER =
  "x-econovaria-runner-timestamp";
export const INTERNAL_RUNNER_NONCE_HEADER = "x-econovaria-runner-nonce";
export const INTERNAL_RUNNER_SIGNATURE_HEADER =
  "x-econovaria-runner-signature";

export interface InternalRunnerNonceClaim {
  readonly runnerName: string;
  readonly nonceHash: string;
  readonly timestampSeconds: number;
  readonly expiresAt: string;
}

export interface InternalRunnerAuthDependencies {
  readonly readSecret: () => string | undefined;
  readonly claimNonce: (claim: InternalRunnerNonceClaim) => Promise<boolean>;
  readonly now?: () => Date;
  readonly maxClockSkewSeconds?: number;
  readonly maxBodyBytes?: number;
}

export interface InternalRunnerAuthOptions {
  readonly runnerName: string;
  readonly internalSecretHeader: string;
  readonly dependencies: InternalRunnerAuthDependencies;
}

export type InternalRunnerAuthResult =
  | {
    readonly ok: true;
    readonly request: Request;
    readonly nonceHash: string;
    readonly timestampSeconds: number;
  }
  | {
    readonly ok: false;
    readonly response: Response;
  };

export async function authorizeInternalRunnerRequest(
  request: Request,
  options: InternalRunnerAuthOptions,
): Promise<InternalRunnerAuthResult> {
  if (request.method !== "POST") {
    return failure(405, "method_not_allowed", "Use POST for internal runner requests.");
  }

  if (request.headers.has(options.internalSecretHeader)) {
    return failure(
      401,
      "legacy_runner_secret_forbidden",
      "Legacy runner authentication is not accepted.",
    );
  }

  const secret = String(options.dependencies.readSecret() || "").trim();
  if (!secret) {
    return failure(
      500,
      "internal_runner_secret_not_configured",
      "Internal runner authentication is not configured.",
    );
  }

  const runnerName = normalizedRunnerName(options.runnerName);
  if (!runnerName) {
    return failure(
      500,
      "internal_runner_name_invalid",
      "Internal runner authentication is misconfigured.",
    );
  }

  const timestampText = String(
    request.headers.get(INTERNAL_RUNNER_TIMESTAMP_HEADER) || "",
  ).trim();
  const nonce = String(
    request.headers.get(INTERNAL_RUNNER_NONCE_HEADER) || "",
  ).trim().toLowerCase();
  const signatureText = String(
    request.headers.get(INTERNAL_RUNNER_SIGNATURE_HEADER) || "",
  ).trim();
  const signatureMatch = signatureText.match(SIGNATURE_PATTERN);

  if (
    !TIMESTAMP_PATTERN.test(timestampText) ||
    !NONCE_PATTERN.test(nonce) ||
    !signatureMatch
  ) {
    return failure(
      401,
      "invalid_internal_runner_signature",
      "Internal runner signature is missing or invalid.",
    );
  }

  const timestampSeconds = Number(timestampText);
  const maxClockSkewSeconds = boundedInteger(
    options.dependencies.maxClockSkewSeconds,
    DEFAULT_MAX_CLOCK_SKEW_SECONDS,
    30,
    900,
  );
  const now = options.dependencies.now?.() ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > maxClockSkewSeconds
  ) {
    return failure(
      401,
      "stale_internal_runner_signature",
      "Internal runner signature is outside the accepted time window.",
    );
  }

  const maxBodyBytes = boundedInteger(
    options.dependencies.maxBodyBytes,
    DEFAULT_MAX_BODY_BYTES,
    1024,
    1024 * 1024,
  );
  let bodyBytes: Uint8Array;
  try {
    bodyBytes = new Uint8Array(await request.clone().arrayBuffer());
  } catch (_error) {
    return failure(
      400,
      "invalid_internal_runner_body",
      "Internal runner request body could not be read.",
    );
  }
  if (bodyBytes.byteLength > maxBodyBytes) {
    return failure(
      413,
      "internal_runner_body_too_large",
      "Internal runner request body is too large.",
    );
  }

  const bodyHash = await sha256Hex(bodyBytes);
  const canonicalPayload = buildInternalRunnerSignaturePayload({
    runnerName,
    timestampSeconds,
    nonce,
    method: request.method,
    url: request.url,
    bodyHash,
  });
  const verified = await verifyHmacSha256(
    secret,
    canonicalPayload,
    signatureMatch[1],
  );
  if (!verified) {
    return failure(
      401,
      "invalid_internal_runner_signature",
      "Internal runner signature is missing or invalid.",
    );
  }

  const nonceHash = await sha256Hex(
    TEXT_ENCODER.encode(`${runnerName}:${nonce}`),
  );
  const expiresAt = new Date(
    (timestampSeconds + maxClockSkewSeconds * 2) * 1000,
  ).toISOString();
  let claimed = false;
  try {
    claimed = await options.dependencies.claimNonce({
      runnerName,
      nonceHash,
      timestampSeconds,
      expiresAt,
    });
  } catch (_error) {
    return failure(
      503,
      "internal_runner_nonce_store_unavailable",
      "Internal runner replay protection is unavailable.",
      true,
    );
  }
  if (!claimed) {
    return failure(
      409,
      "internal_runner_replay_denied",
      "Internal runner request was already used.",
    );
  }

  const headers = new Headers(request.headers);
  headers.delete(INTERNAL_RUNNER_TIMESTAMP_HEADER);
  headers.delete(INTERNAL_RUNNER_NONCE_HEADER);
  headers.delete(INTERNAL_RUNNER_SIGNATURE_HEADER);
  headers.set(options.internalSecretHeader, secret);

  return {
    ok: true,
    request: new Request(request.url, {
      method: "POST",
      headers,
      body: ownedArrayBuffer(bodyBytes),
      redirect: "manual",
    }),
    nonceHash,
    timestampSeconds,
  };
}

export function buildInternalRunnerSignaturePayload(input: {
  readonly runnerName: string;
  readonly timestampSeconds: number;
  readonly nonce: string;
  readonly method: string;
  readonly url: string;
  readonly bodyHash: string;
}): string {
  const url = new URL(input.url);
  return [
    "econovaria-internal-runner-v1",
    `runner:${normalizedRunnerName(input.runnerName)}`,
    `timestamp:${input.timestampSeconds}`,
    `nonce:${input.nonce.toLowerCase()}`,
    `method:${input.method.toUpperCase()}`,
    `origin:${url.origin}`,
    `path:${url.pathname}${url.search}`,
    `body-sha256:${input.bodyHash.toLowerCase()}`,
  ].join("\n");
}

async function verifyHmacSha256(
  secret: string,
  payload: string,
  signatureBase64Url: string,
): Promise<boolean> {
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(signatureBase64Url);
  } catch (_error) {
    return false;
  }
  if (signature.byteLength !== 32) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(TEXT_ENCODER.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    ownedArrayBuffer(signature),
    ownedArrayBuffer(TEXT_ENCODER.encode(payload)),
  );
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", ownedArrayBuffer(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function normalizedRunnerName(value: string): string {
  const name = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,63}$/.test(name) ? name : "";
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : fallback;
}

function failure(
  status: number,
  code: string,
  message: string,
  retryable = false,
): InternalRunnerAuthResult {
  return {
    ok: false,
    response: jsonError(status, { code, message, retryable }),
  };
}
