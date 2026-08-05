"use strict";

const {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual
} = require("node:crypto");
const { isIP } = require("node:net");

const MAX_BODY_BYTES = 1_048_576;
const MAX_PATH_BYTES = 2_048;
const MAX_OIDC_TOKEN_BYTES = 16_384;
const SAFE_VALUE_PATTERN = /^[^\r\n\u0000]{0,8192}$/u;
const COOKIE_ENVELOPE_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24,3900}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OIDC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,12288}\.[A-Za-z0-9_-]{8,4096}$/u;
const SIGNATURE_VERSION = "econovaria-admin-bff-request-v1";
const SIGNING_KEY_CONTEXT = "econovaria-admin-bff-signing-key-v1";
const BFF_TIMESTAMP_HEADER = "x-econovaria-bff-timestamp";
const BFF_NONCE_HEADER = "x-econovaria-bff-nonce";
const BFF_CLIENT_IP_HEADER = "x-econovaria-bff-client-ip";
const BFF_SIGNATURE_HEADER = "x-econovaria-bff-signature";
const BFF_MODE_HEADER = "x-econovaria-bff-mode";
const FORWARDED_HEADERS = Object.freeze({
  "content-type": "content-type",
  "x-econovaria-csrf-token": "x-econovaria-csrf-token",
  "x-econovaria-device-id": "x-econovaria-device-id",
  "x-econovaria-game-id": "x-econovaria-game-id",
  "x-request-id": "x-request-id"
});
const SIGNED_CONTEXT_HEADERS = Object.freeze([
  "content-type",
  "cookie",
  "x-econovaria-csrf-token",
  "x-econovaria-device-id",
  "x-econovaria-game-id",
  "idempotency-key",
  "x-request-id"
]);

async function proxyAdminBff(request, response, options = {}) {
  try {
    const config = readConfig();
    const path = normalizedPath(request.query?.path);
    if (!path) return sendJson(response, 400, errorBody(
      "invalid_proxy_path",
      "Administrator proxy path is invalid."
    ));

    const body = readBody(request);
    if (!body.ok) return sendJson(response, 413, errorBody(
      "request_body_too_large",
      "Administrator request body is too large."
    ));

    const clientIp = trustedVercelClientIp(request);
    if (!clientIp) return sendJson(response, 503, retryableErrorBody(
      "admin_bff_network_metadata_unavailable",
      "Administrator request protection is temporarily unavailable."
    ));
    const idempotency = canonicalIdempotencyHeader(request);
    if (!idempotency.ok) return sendJson(response, 400, errorBody(
      "idempotency_key_header_mismatch",
      "Idempotency-Key headers must identify the same request."
    ));

    const oidcToken = vercelOidcToken(request);
    if (!oidcToken) return sendJson(response, 503, retryableErrorBody(
      "admin_bff_identity_unavailable",
      "Administrator request protection is temporarily unavailable."
    ));

    const origin = requestOrigin(request);
    const targetPath = options.proxyAdmin
      ? `/functions/v1/web-session-api/proxy${path}`
      : `/functions/v1/web-session-api${path}`;
    const search = filteredSearch(request.url);
    const targetUrl = `${config.supabaseUrl}${targetPath}${search}`;
    const timestampSeconds = Math.floor(normalizedNow(options.now).getTime() / 1000);
    const nonce = normalizedNonce(options.nonceFactory?.() || randomUUID());

    const headers = new Headers({
      apikey: config.publishableKey,
      Origin: origin,
      Authorization: `Bearer ${oidcToken}`,
      [BFF_TIMESTAMP_HEADER]: String(timestampSeconds),
      [BFF_NONCE_HEADER]: nonce,
      [BFF_CLIENT_IP_HEADER]: clientIp,
      "x-real-ip": clientIp
    });
    const cookie = safeHeaderValue(request.headers?.cookie);
    if (cookie) headers.set("Cookie", cookie);
    if (idempotency.value) headers.set("Idempotency-Key", idempotency.value);
    for (const [source, target] of Object.entries(FORWARDED_HEADERS)) {
      const value = safeHeaderValue(request.headers?.[source]);
      if (value) headers.set(target, value);
    }

    const canonicalPayload = buildAdminBffSignaturePayload({
      timestampSeconds,
      nonce,
      method: String(request.method || "GET"),
      targetUrl,
      browserOrigin: origin,
      clientIp,
      headers,
      bodyBytes: body.bytes
    });
    headers.set(
      BFF_SIGNATURE_HEADER,
      `v1=${signAdminBffPayload(oidcToken, canonicalPayload)}`
    );

    const upstream = await (options.fetchImpl || globalThis.fetch)(targetUrl, {
      method: String(request.method || "GET").toUpperCase(),
      headers,
      body: body.value,
      cache: "no-store",
      redirect: "manual"
    });
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) {
      return sendJson(response, 502, errorBody(
        "upstream_response_too_large",
        "Administrator response was too large."
      ));
    }

    response.statusCode = upstream.status;
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Type",
      normalizedContentType(upstream.headers.get("content-type"))
    );
    const retryAfter = normalizedRetryAfter(upstream.headers.get("retry-after"));
    if (retryAfter) response.setHeader("Retry-After", retryAfter);
    const cookies = readUpstreamCookies(upstream.headers)
      .map(normalizedSessionCookie)
      .filter(Boolean);
    if (cookies.length) response.setHeader("Set-Cookie", cookies);
    response.end(Buffer.from(bytes));
  } catch (_) {
    sendJson(response, 502, retryableErrorBody(
      "admin_bff_unavailable",
      "Administrator session service is unavailable."
    ));
  }
}

function readConfig() {
  const supabaseUrl = String(process.env.ECONOVARIA_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const publishableKey = String(
    process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY || ""
  ).trim();
  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("invalid Supabase URL");
  }
  if (
    parsed.protocol !== "https:" ||
    !/^[a-z0-9]{20}\.supabase\.co$/u.test(parsed.hostname) ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !publishableKey.startsWith("sb_publishable_")
  ) {
    throw new Error("invalid Admin BFF configuration");
  }
  return { supabaseUrl, publishableKey };
}

function normalizedPath(value) {
  const source = Array.isArray(value) ? value.join("/") : String(value || "");
  let decoded;
  try {
    decoded = decodeURIComponent(source);
  } catch {
    return "";
  }
  const path = `/${decoded}`.replace(/\/{2,}/g, "/");
  if (
    path.includes("\\") ||
    path.split("/").includes("..") ||
    Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES
  ) return "";
  return path;
}

function filteredSearch(rawUrl) {
  const parsed = new URL(String(rawUrl || "/"), "https://proxy.invalid");
  parsed.searchParams.delete("path");
  const search = parsed.search;
  return Buffer.byteLength(search, "utf8") <= MAX_PATH_BYTES ? search : "";
}

function requestOrigin(request) {
  const supplied = safeHeaderValue(request.headers?.origin);
  const host = safeHeaderValue(request.headers?.host);
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/u.test(host)) {
    throw new Error("invalid request host");
  }
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1")
    ? "http:"
    : "https:";
  const expected = `${protocol}//${host}`;
  if (supplied && supplied !== expected) throw new Error("origin mismatch");
  return expected;
}

function trustedVercelClientIp(request) {
  const value = safeHeaderValue(
    request.headers?.["x-vercel-forwarded-for"]
  ).trim();
  if (!value || value.includes(",")) return "";
  const normalized = value.startsWith("::ffff:") ? value.slice(7) : value;
  const bracketless = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
  return isIP(bracketless) ? bracketless.toLowerCase() : "";
}

function canonicalIdempotencyHeader(request) {
  const canonical = safeHeaderValue(
    request.headers?.["idempotency-key"]
  ).trim();
  const compatibility = safeHeaderValue(
    request.headers?.["x-idempotency-key"]
  ).trim();
  return canonical && compatibility && canonical !== compatibility
    ? { ok: false, value: "" }
    : { ok: true, value: canonical || compatibility };
}

function vercelOidcToken(request) {
  const value = safeHeaderValue(request.headers?.["x-vercel-oidc-token"]).trim();
  if (!value || Buffer.byteLength(value, "utf8") > MAX_OIDC_TOKEN_BYTES) return "";
  return OIDC_TOKEN_PATTERN.test(value) ? value : "";
}

function normalizedNonce(value) {
  const nonce = String(value || "").trim().toLowerCase();
  if (!UUID_V4_PATTERN.test(nonce)) throw new Error("invalid BFF nonce");
  return nonce;
}

function normalizedNow(now) {
  const value = typeof now === "function" ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid BFF clock");
  return date;
}

function readBody(request) {
  if (["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) {
    const bytes = Buffer.alloc(0);
    return { ok: true, value: undefined, bytes };
  }
  const declared = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false };
  let value;
  if (request.body === undefined || request.body === null) {
    value = Buffer.alloc(0);
  } else if (Buffer.isBuffer(request.body)) {
    value = request.body;
  } else if (typeof request.body === "string") {
    value = Buffer.from(request.body, "utf8");
  } else {
    value = Buffer.from(JSON.stringify(request.body), "utf8");
  }
  return value.byteLength <= MAX_BODY_BYTES
    ? { ok: true, value, bytes: value }
    : { ok: false };
}

function buildAdminBffSignaturePayload(input) {
  const target = new URL(input.targetUrl);
  const contextHash = hashSignedContext(input.headers);
  const bodyHash = sha256Hex(input.bodyBytes || Buffer.alloc(0));
  return [
    SIGNATURE_VERSION,
    `timestamp:${input.timestampSeconds}`,
    `nonce:${String(input.nonce || "").toLowerCase()}`,
    `method:${String(input.method || "").toUpperCase()}`,
    `target-origin:${target.origin}`,
    `path:${target.pathname}${target.search}`,
    `browser-origin:${input.browserOrigin}`,
    `client-ip:${input.clientIp}`,
    `context-sha256:${contextHash}`,
    `body-sha256:${bodyHash}`
  ].join("\n");
}

function hashSignedContext(headers) {
  const source = headers instanceof Headers ? headers : new Headers(headers || {});
  const canonical = SIGNED_CONTEXT_HEADERS
    .map((name) => `${name}:${String(source.get(name) || "")}`)
    .join("\n");
  return sha256Hex(Buffer.from(canonical, "utf8"));
}

function signAdminBffPayload(oidcToken, canonicalPayload) {
  const key = deriveAdminBffSigningKey(oidcToken);
  return createHmac("sha256", key).update(canonicalPayload, "utf8").digest("base64url");
}

function deriveAdminBffSigningKey(oidcToken) {
  return createHmac("sha256", Buffer.from(oidcToken, "utf8"))
    .update(SIGNING_KEY_CONTEXT, "utf8")
    .digest();
}

function verifyAdminBffSignature(oidcToken, canonicalPayload, supplied) {
  const expected = Buffer.from(signAdminBffPayload(oidcToken, canonicalPayload), "base64url");
  let actual;
  try {
    actual = Buffer.from(String(supplied || "").replace(/^v1=/u, ""), "base64url");
  } catch {
    return false;
  }
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeHeaderValue(value) {
  const normalized = Array.isArray(value) ? value.join(",") : String(value || "");
  return SAFE_VALUE_PATTERN.test(normalized) ? normalized : "";
}

function normalizedContentType(value) {
  const mediaType = String(value || "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType === "text/csv") return "text/csv; charset=utf-8";
  if (mediaType === "application/octet-stream") return mediaType;
  return "application/json; charset=utf-8";
}

function normalizedRetryAfter(value) {
  const candidate = String(value || "").trim();
  if (!/^\d{1,5}$/u.test(candidate)) return "";
  const seconds = Number(candidate);
  return seconds <= 86400 ? String(seconds) : "";
}

function readUpstreamCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function normalizedSessionCookie(value) {
  const first = String(value || "").split(";", 1)[0];
  const separator = first.indexOf("=");
  if (separator <= 0) return "";
  const name = first.slice(0, separator).trim();
  const envelope = first.slice(separator + 1).trim();
  if (![
    "__Host-econovaria_admin_session",
    "econovaria_admin_session"
  ].includes(name)) {
    return "";
  }
  if (!envelope) {
    return "__Host-econovaria_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
  }
  if (!COOKIE_ENVELOPE_PATTERN.test(envelope)) return "";
  return `__Host-econovaria_admin_session=${envelope}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`;
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(body));
}

function errorBody(code, message) {
  return { ok: false, error: { code, message, retryable: false } };
}

function retryableErrorBody(code, message) {
  return { ok: false, error: { code, message, retryable: true } };
}

module.exports = {
  BFF_CLIENT_IP_HEADER,
  BFF_NONCE_HEADER,
  BFF_SIGNATURE_HEADER,
  BFF_TIMESTAMP_HEADER,
  buildAdminBffSignaturePayload,
  deriveAdminBffSigningKey,
  hashSignedContext,
  proxyAdminBff,
  signAdminBffPayload,
  verifyAdminBffSignature
};
