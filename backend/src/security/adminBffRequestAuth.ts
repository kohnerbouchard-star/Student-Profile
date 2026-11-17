import type { HostedEnvironment } from "./adminBffOidcVerification.ts";
import { verifyVercelOidcToken, MAX_OIDC_TOKEN_BYTES } from "./adminBffOidcVerification.ts";
import type { DeploymentEnvironment } from "./adminBffTargetPolicy.ts";
import {
  expectedDeploymentEnvironment,
  isLocalRequest,
  canonicalAdminBffTargetUrl,
} from "./adminBffTargetPolicy.ts";
import {
  sha256Hex,
  TEXT_ENCODER,
  ownedArrayBuffer,
  decodeBase64Url,
  deriveSigningKey,
} from "./adminBffCrypto.ts";

const MAX_BODY_BYTES = 1_048_576;

const MAX_CLOCK_SKEW_SECONDS = 120;

const NONCE_TTL_SECONDS = 300;

const SIGNATURE_VERSION = "econovaria-admin-bff-request-v1";

const LOCAL_SIGNING_MATERIAL =
  "econovaria-local-admin-bff-public-development-material-v1";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const SIGNATURE_PATTERN = /^v1=([A-Za-z0-9_-]{43})$/u;

const TIMESTAMP_PATTERN = /^\d{10}$/u;

const BFF_TIMESTAMP_HEADER = "x-econovaria-bff-timestamp";

const BFF_NONCE_HEADER = "x-econovaria-bff-nonce";

const BFF_CLIENT_IP_HEADER = "x-econovaria-bff-client-ip";

const BFF_SIGNATURE_HEADER = "x-econovaria-bff-signature";

const BFF_MODE_HEADER = "x-econovaria-bff-mode";

const INTERNAL_CLIENT_IP_HEADER = "x-real-ip";

const FORWARDED_IP_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
  "client-ip",
  "forwarded",
  "true-client-ip",
  "x-client-ip",
] as const;

const SIGNED_CONTEXT_HEADERS = [
  "content-type",
  "cookie",
  "x-econovaria-csrf-token",
  "x-econovaria-device-id",
  "x-econovaria-game-id",
  "idempotency-key",
  "x-request-id",
] as const;

export interface AdminBffNonceClaim {
  readonly runnerName: string;
  readonly nonceHash: string;
  readonly timestampSeconds: number;
  readonly expiresAt: string;
}

export interface AdminBffRequestAuthDependencies {
  readonly claimNonce: (claim: AdminBffNonceClaim) => Promise<boolean>;
  readonly now?: () => Date;
  readonly verifyOidc?: (
    token: string,
    expectedEnvironment: HostedEnvironment,
    nowSeconds: number,
  ) => Promise<boolean>;
}

export interface AdminBffRequestAuthOptions {
  readonly supabaseUrl: string;
  readonly dependencies: AdminBffRequestAuthDependencies;
}

export type AdminBffRequestAuthResult =
  | {
    readonly ok: true;
    readonly request: Request;
    readonly clientIp: string;
    readonly deploymentEnvironment: DeploymentEnvironment;
  }
  | {
    readonly ok: false;
    readonly response: Response;
  };

export async function authorizeAdminBffRequest(
  request: Request,
  options: AdminBffRequestAuthOptions,
): Promise<AdminBffRequestAuthResult> {
  const deploymentEnvironment = expectedDeploymentEnvironment(options.supabaseUrl);
  if (!deploymentEnvironment) {
    return failure(
      503,
      "admin_bff_configuration_invalid",
      "Administrator request protection is unavailable.",
      true,
    );
  }

  const now = normalizedNow(options.dependencies.now);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const timestampText = String(
    request.headers.get(BFF_TIMESTAMP_HEADER) || "",
  ).trim();
  const nonce = String(request.headers.get(BFF_NONCE_HEADER) || "")
    .trim()
    .toLowerCase();
  const clientIpText = String(
    request.headers.get(BFF_CLIENT_IP_HEADER) || "",
  ).trim();
  const signatureText = String(
    request.headers.get(BFF_SIGNATURE_HEADER) || "",
  ).trim();
  const signatureMatch = signatureText.match(SIGNATURE_PATTERN);

  if (
    !TIMESTAMP_PATTERN.test(timestampText) ||
    !UUID_V4_PATTERN.test(nonce) ||
    !signatureMatch
  ) {
    return malformedEnvelopeFailure();
  }

  const timestampSeconds = Number(timestampText);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return failure(
      401,
      "admin_bff_signature_stale",
      "Administrator request authentication failed.",
    );
  }

  let clientIp: string;
  try {
    clientIp = normalizeIpAddress(clientIpText);
  } catch {
    return authenticationFailure();
  }

  let signingMaterial: string;
  if (deploymentEnvironment === "local") {
    if (!isLocalRequest(request) || request.headers.get(BFF_MODE_HEADER) !== "local") {
      return authenticationFailure();
    }
    if (request.headers.has("authorization")) return authenticationFailure();
    signingMaterial = LOCAL_SIGNING_MATERIAL;
  } else {
    if (request.headers.has(BFF_MODE_HEADER)) return authenticationFailure();
    const oidcToken = bearerToken(request.headers.get("authorization"));
    if (!oidcToken) return authenticationFailure();
    const verified = await (
      options.dependencies.verifyOidc ?? verifyVercelOidcToken
    )(oidcToken, deploymentEnvironment, nowSeconds).catch(() => false);
    if (!verified) return authenticationFailure();
    signingMaterial = oidcToken;
  }

  let bodyBytes: Uint8Array;
  try {
    bodyBytes = new Uint8Array(await request.clone().arrayBuffer());
  } catch {
    return failure(
      400,
      "admin_bff_body_invalid",
      "Administrator request body could not be read.",
    );
  }
  if (bodyBytes.byteLength > MAX_BODY_BYTES) {
    return failure(
      413,
      "admin_bff_body_too_large",
      "Administrator request body is too large.",
    );
  }

let signatureTargetUrl: string;
try {
  signatureTargetUrl = canonicalAdminBffTargetUrl(
    request.url,
    options.supabaseUrl,
  );
} catch {
  return malformedEnvelopeFailure();
}
  const canonicalPayload = await buildAdminBffSignaturePayload({
    timestampSeconds,
    nonce,
    method: request.method,
    targetUrl: signatureTargetUrl,
    browserOrigin: String(request.headers.get("origin") || ""),
    clientIp,
    headers: request.headers,
    bodyBytes,
  });
  const signatureValid = await verifyAdminBffSignature(
    signingMaterial,
    canonicalPayload,
    signatureMatch[1],
  );
  if (!signatureValid) return authenticationFailure();

  const nonceHash = await sha256Hex(TEXT_ENCODER.encode(
    `admin-bff:${deploymentEnvironment}:${nonce}`,
  ));
  let claimed = false;
  try {
    claimed = await options.dependencies.claimNonce({
      runnerName: deploymentEnvironment === "local"
        ? "admin-bff-local"
        : "admin-bff-vercel",
      nonceHash,
      timestampSeconds,
      expiresAt: new Date(
        (timestampSeconds + NONCE_TTL_SECONDS) * 1000,
      ).toISOString(),
    });
  } catch {
    return failure(
      503,
      "admin_bff_replay_protection_unavailable",
      "Administrator request protection is temporarily unavailable.",
      true,
    );
  }
  if (!claimed) {
    return failure(
      409,
      "admin_bff_replay_denied",
      "Administrator request was already used.",
    );
  }

  const headers = overwriteTrustedClientIpHeaders(
    request.headers,
    INTERNAL_CLIENT_IP_HEADER,
    clientIp,
  );
  headers.delete("authorization");
  headers.delete(BFF_TIMESTAMP_HEADER);
  headers.delete(BFF_NONCE_HEADER);
  headers.delete(BFF_CLIENT_IP_HEADER);
  headers.delete(BFF_SIGNATURE_HEADER);
  headers.delete(BFF_MODE_HEADER);
  headers.delete("x-idempotency-key");
  for (const header of FORWARDED_IP_HEADERS) {
    if (header !== INTERNAL_CLIENT_IP_HEADER) headers.delete(header);
  }

  const method = request.method.toUpperCase();
  return {
    ok: true,
    clientIp,
    deploymentEnvironment,
    request: new Request(request.url, {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method)
        ? undefined
        : ownedArrayBuffer(bodyBytes),
      redirect: "manual",
    }),
  };
}

export async function buildAdminBffSignaturePayload(input: {
  readonly timestampSeconds: number;
  readonly nonce: string;
  readonly method: string;
  readonly targetUrl: string;
  readonly browserOrigin: string;
  readonly clientIp: string;
  readonly headers: Headers;
  readonly bodyBytes: Uint8Array;
}): Promise<string> {
  const target = new URL(input.targetUrl);
  const contextHash = await hashSignedContext(input.headers);
  const bodyHash = await sha256Hex(input.bodyBytes);
  return [
    SIGNATURE_VERSION,
    `timestamp:${input.timestampSeconds}`,
    `nonce:${input.nonce.toLowerCase()}`,
    `method:${input.method.toUpperCase()}`,
    `target-origin:${target.origin}`,
    `path:${target.pathname}${target.search}`,
    `browser-origin:${input.browserOrigin}`,
    `client-ip:${input.clientIp}`,
    `context-sha256:${contextHash}`,
    `body-sha256:${bodyHash}`,
  ].join("\n");
}

async function hashSignedContext(headers: Headers): Promise<string> {
  const canonical = SIGNED_CONTEXT_HEADERS
    .map((name) => `${name}:${String(headers.get(name) || "")}`)
    .join("\n");
  return sha256Hex(TEXT_ENCODER.encode(canonical));
}

async function verifyAdminBffSignature(
  signingMaterial: string,
  payload: string,
  signatureBase64Url: string,
): Promise<boolean> {
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(signatureBase64Url);
  } catch {
    return false;
  }
  if (signature.byteLength !== 32) return false;
  const signingKey = await deriveSigningKey(signingMaterial);
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(signingKey),
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

function overwriteTrustedClientIpHeaders(
  source: HeadersInit,
  trustedHeader: typeof INTERNAL_CLIENT_IP_HEADER,
  clientIp: string,
): Headers {
  const headers = new Headers(source);
  for (const header of FORWARDED_IP_HEADERS) headers.delete(header);
  headers.set(trustedHeader, normalizeIpAddress(clientIp));
  return headers;
}

function normalizeIpAddress(value: string): string {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > 128 || candidate.includes("%")) {
    throw new Error("invalid client IP");
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(candidate)) {
    const octets = candidate.split(".").map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet > 255)) {
      throw new Error("invalid client IP");
    }
    return octets.join(".");
  }
  const bracketless = candidate.startsWith("[") && candidate.endsWith("]")
    ? candidate.slice(1, -1)
    : candidate;
  if (!/^[0-9a-f:.]+$/iu.test(bracketless) || !bracketless.includes(":")) {
    throw new Error("invalid client IP");
  }
  const hostname = new URL(`http://[${bracketless}]/`).hostname;
  if (!hostname.startsWith("[") || !hostname.endsWith("]")) {
    throw new Error("invalid client IP");
  }
  return hostname.slice(1, -1).toLowerCase();
}

function bearerToken(value: string | null): string {
  const match = String(value || "").match(/^Bearer\s+(.+)$/iu);
  const token = match?.[1]?.trim() || "";
  return token && TEXT_ENCODER.encode(token).byteLength <= MAX_OIDC_TOKEN_BYTES
    ? token
    : "";
}

function normalizedNow(now: (() => Date) | undefined): Date {
  const value = now?.() ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new Error("invalid clock");
  return value;
}

function malformedEnvelopeFailure(): AdminBffRequestAuthResult {
  return failure(
    400,
    "admin_bff_envelope_invalid",
    "Administrator request envelope is missing or invalid.",
  );
}

function authenticationFailure(): AdminBffRequestAuthResult {
  return failure(
    401,
    "admin_bff_authentication_failed",
    "Administrator request authentication failed.",
  );
}

function failure(
  status: number,
  code: string,
  message: string,
  retryable = false,
): AdminBffRequestAuthResult {
  return {
    ok: false,
    response: new Response(JSON.stringify({
      ok: false,
      error: { code, message, retryable },
    }), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store, max-age=0",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    }),
  };
}

export const ADMIN_BFF_AUTH_HEADERS = Object.freeze({
  timestamp: BFF_TIMESTAMP_HEADER,
  nonce: BFF_NONCE_HEADER,
  clientIp: BFF_CLIENT_IP_HEADER,
  signature: BFF_SIGNATURE_HEADER,
  mode: BFF_MODE_HEADER,
});

export const ADMIN_BFF_LOCAL_SIGNING_MATERIAL = LOCAL_SIGNING_MATERIAL;
