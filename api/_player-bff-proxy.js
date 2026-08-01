"use strict";

const { isIP } = require("node:net");

const MAX_BODY_BYTES = 1_048_576;
const MAX_PATH_BYTES = 2_048;
const MAX_RETRY_MARKER_BYTES = 8_192;
const SAFE_VALUE_PATTERN = /^[^\r\n\u0000]{0,8192}$/u;
const COOKIE_ENVELOPE_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24,3000}$/u;
const IMF_FIXDATE_PATTERN = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u;
const TRANSIENT_WORKER_PATTERNS = Object.freeze([
  /WorkerAlreadyRetired/iu,
  /worker has already retired/iu,
  /WORKER_RESOURCE_LIMIT/iu,
  /\bCPUTime\b/iu,
  /CPU time soft limit reached/iu
]);
const FORWARDED_HEADERS = Object.freeze({
  "content-type": "content-type",
  "x-econovaria-csrf-token": "x-econovaria-csrf-token",
  "x-econovaria-device-id": "x-econovaria-device-id",
  "x-econovaria-game-id": "x-econovaria-game-id",
  "x-idempotency-key": "x-idempotency-key",
  "idempotency-key": "idempotency-key",
  "x-request-id": "x-request-id"
});

async function proxyPlayerBff(request, response, options) {
  try {
    const config = readConfig();
    const path = normalizedPath(request.query?.path);
    if (!path) return sendJson(response, 400, errorBody(
      "invalid_proxy_path",
      "Player proxy path is invalid."
    ));

    const body = readBody(request);
    if (!body.ok) return sendJson(response, 413, errorBody(
      "request_body_too_large",
      "Player request body is too large."
    ));

    const clientIp = trustedClientIp(request);
    if (!clientIp) return sendJson(response, 400, errorBody(
      "trusted_client_ip_unavailable",
      "Trusted client network metadata is unavailable."
    ));

    const headers = new Headers({
      apikey: config.publishableKey,
      Origin: requestOrigin(request),
      "x-real-ip": clientIp
    });
    const cookie = safeHeaderValue(request.headers?.cookie);
    if (cookie) headers.set("Cookie", cookie);
    for (const [source, target] of Object.entries(FORWARDED_HEADERS)) {
      const value = safeHeaderValue(request.headers?.[source]);
      if (value) headers.set(target, value);
    }

    const targetPath = options.proxyPlayer
      ? `/functions/v1/player-web-session-api/proxy${path}`
      : `/functions/v1/player-web-session-api${path}`;
    const search = filteredSearch(request.url);
    const upstream = await fetch(`${config.supabaseUrl}${targetPath}${search}`, {
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
        "Player response was too large."
      ));
    }

    response.statusCode = upstream.status;
    securityHeaders(response);
    response.setHeader(
      "Content-Type",
      normalizedContentType(upstream.headers.get("content-type"))
    );
    const retryAfter = normalizedRetryAfter(upstream.headers.get("retry-after"));
    if (retryAfter) response.setHeader("Retry-After", retryAfter);
    const retryable = transientWorkerFailureReason(upstream.status, bytes);
    if (retryable) response.setHeader("X-Econovaria-Retryable", retryable);
    const cookies = readUpstreamCookies(upstream.headers)
      .map(normalizedSessionCookie)
      .filter(Boolean);
    if (cookies.length) response.setHeader("Set-Cookie", cookies);
    response.end(Buffer.from(bytes));
  } catch (_) {
    sendJson(response, 502, errorBody(
      "player_bff_unavailable",
      "Player session service is unavailable."
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
    throw new Error("invalid Player BFF configuration");
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
  const host = safeHeaderValue(
    request.headers?.["x-forwarded-host"] || request.headers?.host
  );
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

function trustedClientIp(request) {
  const candidates = [
    request.headers?.["x-vercel-forwarded-for"],
    request.headers?.["x-real-ip"],
    request.socket?.remoteAddress
  ];
  for (const candidate of candidates) {
    const value = safeHeaderValue(candidate).trim();
    if (!value || value.includes(",")) continue;
    const normalized = value.startsWith("::ffff:") ? value.slice(7) : value;
    const bracketless = normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;
    if (isIP(bracketless)) return bracketless.toLowerCase();
  }
  return "";
}

function readBody(request) {
  if (["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) {
    return { ok: true, value: undefined };
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
    ? { ok: true, value }
    : { ok: false };
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
  if (/^\d{1,10}$/u.test(candidate)) {
    const seconds = Number(candidate);
    return Number.isSafeInteger(seconds) && seconds >= 0 ? String(seconds) : "";
  }
  if (!IMF_FIXDATE_PATTERN.test(candidate)) return "";
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toUTCString() : "";
}

function transientWorkerFailureReason(status, bytes) {
  if (status === 546) return "worker-resource-limit";
  if (status !== 500) return "";
  const text = Buffer.from(bytes)
    .subarray(0, MAX_RETRY_MARKER_BYTES)
    .toString("utf8");
  return TRANSIENT_WORKER_PATTERNS.some((pattern) => pattern.test(text))
    ? "worker-retired"
    : "";
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
    "__Host-econovaria_player_session",
    "econovaria_player_session"
  ].includes(name)) {
    return "";
  }
  if (!envelope) {
    return "__Host-econovaria_player_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
  }
  if (!COOKIE_ENVELOPE_PATTERN.test(envelope)) return "";
  return `__Host-econovaria_player_session=${envelope}; Path=/; Max-Age=14400; HttpOnly; Secure; SameSite=Strict`;
}

function securityHeaders(response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  securityHeaders(response);
  response.end(JSON.stringify(body));
}

function errorBody(code, message) {
  return { ok: false, error: { code, message, retryable: false } };
}

module.exports = {
  proxyPlayerBff,
  __test: Object.freeze({
    normalizedRetryAfter,
    transientWorkerFailureReason
  })
};
