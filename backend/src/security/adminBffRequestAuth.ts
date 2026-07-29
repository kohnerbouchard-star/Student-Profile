const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const MAX_BODY_BYTES = 1_048_576;
const MAX_OIDC_TOKEN_BYTES = 16_384;
const MAX_CLOCK_SKEW_SECONDS = 120;
const NONCE_TTL_SECONDS = 300;
const SIGNATURE_VERSION = "econovaria-admin-bff-request-v1";
const SIGNING_KEY_CONTEXT = "econovaria-admin-bff-signing-key-v1";
const LOCAL_SIGNING_MATERIAL =
  "econovaria-local-admin-bff-public-development-material-v1";
const VERCEL_ISSUER = "https://oidc.vercel.com/econovaria";
const VERCEL_AUDIENCE = "https://vercel.com/econovaria";
const VERCEL_OWNER_ID = "team_PRsNkw4DHrGsUHl6ikKw2XyJ";
const VERCEL_PROJECT_ID = "prj_xdyYj6NclqUD8XwTrXX6ueXJseV9";
const VERCEL_OWNER_SLUG = "econovaria";
const VERCEL_PROJECT_NAME = "econovaria";
const PRODUCTION_PROJECT_REF = "cgiukdjwicykrmtkhudh";
const STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SIGNATURE_PATTERN = /^v1=([A-Za-z0-9_-]{43})$/u;
const TIMESTAMP_PATTERN = /^\d{10}$/u;
const JWT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/u;
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
  "x-idempotency-key",
  "x-request-id",
] as const;

type HostedEnvironment = "production" | "preview";
type DeploymentEnvironment = HostedEnvironment | "local";

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

interface JwtHeader {
  readonly alg?: unknown;
  readonly kid?: unknown;
  readonly typ?: unknown;
}

interface JwtPayload {
  readonly iss?: unknown;
  readonly aud?: unknown;
  readonly sub?: unknown;
  readonly exp?: unknown;
  readonly nbf?: unknown;
  readonly iat?: unknown;
  readonly owner_id?: unknown;
  readonly project_id?: unknown;
  readonly environment?: unknown;
}

interface JsonWebKeySet {
  readonly keys?: readonly JsonWebKey[];
}

interface CachedJwks {
  readonly expiresAtMs: number;
  readonly value: JsonWebKeySet;
}

let cachedJwks: CachedJwks | null = null;

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

async function deriveSigningKey(signingMaterial: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(TEXT_ENCODER.encode(signingMaterial)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    ownedArrayBuffer(TEXT_ENCODER.encode(SIGNING_KEY_CONTEXT)),
  ));
}

async function verifyVercelOidcToken(
  token: string,
  expectedEnvironment: HostedEnvironment,
  nowSeconds: number,
): Promise<boolean> {
  if (new TextEncoder().encode(token).byteLength > MAX_OIDC_TOKEN_BYTES) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !JWT_SEGMENT_PATTERN.test(part))) {
    return false;
  }

  const header = decodeJwtJson<JwtHeader>(parts[0]);
  const payload = decodeJwtJson<JwtPayload>(parts[1]);
  if (!header || !payload || header.alg !== "RS256") return false;
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!/^[A-Za-z0-9._:-]{1,256}$/u.test(kid)) return false;

  const jwks = await readVercelJwks();
  const jwk = jwks.keys?.find((candidate) =>
    candidate.kid === kid &&
    candidate.kty === "RSA" &&
    (candidate.alg === undefined || candidate.alg === "RS256") &&
    (candidate.use === undefined || candidate.use === "sig")
  );
  if (!jwk) return false;
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = decodeBase64Url(parts[2]);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    ownedArrayBuffer(signature),
    ownedArrayBuffer(TEXT_ENCODER.encode(`${parts[0]}.${parts[1]}`)),
  );
  if (!verified) return false;

  const expectedSubject =
    `owner:${VERCEL_OWNER_SLUG}:project:${VERCEL_PROJECT_NAME}:environment:${expectedEnvironment}`;
  const audience = Array.isArray(payload.aud)
    ? payload.aud
    : [payload.aud];
  const exp = Number(payload.exp);
  const nbf = payload.nbf === undefined ? null : Number(payload.nbf);
  const iat = payload.iat === undefined ? null : Number(payload.iat);
  return payload.iss === VERCEL_ISSUER &&
    audience.includes(VERCEL_AUDIENCE) &&
    payload.sub === expectedSubject &&
    payload.owner_id === VERCEL_OWNER_ID &&
    payload.project_id === VERCEL_PROJECT_ID &&
    payload.environment === expectedEnvironment &&
    Number.isSafeInteger(exp) && exp > nowSeconds - 30 &&
    (nbf === null || (Number.isSafeInteger(nbf) && nbf <= nowSeconds + 30)) &&
    (iat === null || (Number.isSafeInteger(iat) && iat <= nowSeconds + 60));
}

async function readVercelJwks(): Promise<JsonWebKeySet> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAtMs > now) return cachedJwks.value;
  const response = await fetch(`${VERCEL_ISSUER}/.well-known/jwks`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Vercel OIDC key set unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 64 * 1024) {
    throw new Error("Vercel OIDC key set invalid");
  }
  const value = JSON.parse(TEXT_DECODER.decode(bytes)) as JsonWebKeySet;
  if (!Array.isArray(value.keys) || value.keys.length < 1 || value.keys.length > 20) {
    throw new Error("Vercel OIDC key set invalid");
  }
  cachedJwks = { value, expiresAtMs: now + 5 * 60 * 1000 };
  return value;
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

function canonicalAdminBffTargetUrl(
  requestUrlValue: string,
  supabaseUrlValue: string,
): string {
  const requestUrl = new URL(requestUrlValue);
  const supabaseUrl = new URL(supabaseUrlValue);
  const prefixes = [
    "/functions/v1/web-session-api",
    "/web-session-api",
  ] as const;
  const prefix = prefixes.find((candidate) =>
    requestUrl.pathname.startsWith(candidate)
  );
  if (!prefix) throw new Error("invalid Admin BFF path");
  const suffix = requestUrl.pathname.slice(prefix.length);
  if (
    !suffix.startsWith("/") ||
    suffix.includes("\\") ||
    suffix.split("/").includes("..")
  ) throw new Error("invalid Admin BFF path");
  return `${supabaseUrl.origin}/functions/v1/web-session-api${suffix}${requestUrl.search}`;
}

function expectedDeploymentEnvironment(value: string): DeploymentEnvironment | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    ["http:", "https:"].includes(url.protocol)
  ) return "local";
  if (url.protocol === "http:" && url.hostname === "kong") return "local";
  if (url.protocol !== "https:") return null;
  if (url.hostname === `${PRODUCTION_PROJECT_REF}.supabase.co`) return "production";
  if (url.hostname === `${STAGING_PROJECT_REF}.supabase.co`) return "preview";
  return null;
}

function isLocalRequest(request: Request): boolean {
  try {
    const target = new URL(request.url);
    const origin = new URL(String(request.headers.get("origin") || ""));
    return ["localhost", "127.0.0.1", "kong"].includes(target.hostname) &&
      ["localhost", "127.0.0.1"].includes(origin.hostname) &&
      origin.protocol === "http:";
  } catch {
    return false;
  }
}

function bearerToken(value: string | null): string {
  const match = String(value || "").match(/^Bearer\s+(.+)$/iu);
  const token = match?.[1]?.trim() || "";
  return token && TEXT_ENCODER.encode(token).byteLength <= MAX_OIDC_TOKEN_BYTES
    ? token
    : "";
}

function decodeJwtJson<T>(value: string): T | null {
  try {
    return JSON.parse(TEXT_DECODER.decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(value),
  ));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!JWT_SEGMENT_PATTERN.test(value)) throw new Error("invalid base64url");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function normalizedNow(now: (() => Date) | undefined): Date {
  const value = now?.() ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new Error("invalid clock");
  return value;
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
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
