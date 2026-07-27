"use strict";

const { isIP } = require("node:net");

const MAX_BODY_BYTES = 4_096;
const COOKIE_ENVELOPE_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24,3900}$/u;

module.exports = async function adminLogoutProxy(request, response) {
  try {
    if (String(request.method || "GET").toUpperCase() === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    if (String(request.method || "GET").toUpperCase() !== "POST") {
      return sendJson(response, 405, errorBody(
        "method_not_allowed",
        "Use POST to sign out an administrator.",
      ));
    }

    const config = readConfig();
    const origin = requestOrigin(request);
    const clientIp = trustedClientIp(request);
    if (!clientIp) {
      return sendJson(response, 400, errorBody(
        "trusted_client_ip_unavailable",
        "Trusted client network metadata is unavailable.",
      ));
    }

    const body = readBody(request);
    if (!body.ok) {
      return sendJson(response, 413, errorBody(
        "request_body_too_large",
        "Administrator sign-out request is too large.",
      ));
    }

    const headers = new Headers({
      apikey: config.publishableKey,
      Origin: origin,
      "Content-Type": "application/json",
      "x-real-ip": clientIp,
    });
    const cookie = safeHeader(request.headers?.cookie);
    if (cookie) headers.set("Cookie", cookie);
    const csrf = safeHeader(request.headers?.["x-econovaria-csrf-token"]);
    if (csrf) headers.set("x-econovaria-csrf-token", csrf);

    const upstream = await fetch(
      `${config.supabaseUrl}/functions/v1/admin-logout-api`,
      {
        method: "POST",
        headers,
        body: body.value,
        cache: "no-store",
        redirect: "manual",
      },
    );
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) {
      return sendJson(response, 502, errorBody(
        "upstream_response_too_large",
        "Administrator sign-out response is invalid.",
      ));
    }

    response.statusCode = upstream.status;
    securityHeaders(response);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    const cookies = readUpstreamCookies(upstream.headers)
      .map(normalizedSessionCookie)
      .filter(Boolean);
    if (cookies.length) response.setHeader("Set-Cookie", cookies);
    response.end(Buffer.from(bytes));
  } catch (_) {
    sendJson(response, 502, errorBody(
      "staff_logout_unavailable",
      "Administrator sign-out is unavailable.",
      true,
    ));
  }
};

function readConfig() {
  const supabaseUrl = String(process.env.ECONOVARIA_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const publishableKey = String(
    process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY || "",
  ).trim();
  const parsed = new URL(supabaseUrl);
  if (
    parsed.protocol !== "https:" ||
    !/^[a-z0-9]{20}\.supabase\.co$/u.test(parsed.hostname) ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !publishableKey.startsWith("sb_publishable_")
  ) {
    throw new Error("invalid Admin logout proxy configuration");
  }
  return { supabaseUrl, publishableKey };
}

function requestOrigin(request) {
  const host = safeHeader(
    request.headers?.["x-forwarded-host"] || request.headers?.host,
  );
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/u.test(host)) {
    throw new Error("invalid request host");
  }
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1")
    ? "http:"
    : "https:";
  const expected = `${protocol}//${host}`;
  const supplied = safeHeader(request.headers?.origin);
  if (supplied && supplied !== expected) throw new Error("origin mismatch");
  return expected;
}

function trustedClientIp(request) {
  const candidates = [
    request.headers?.["x-vercel-forwarded-for"],
    request.headers?.["x-real-ip"],
    request.socket?.remoteAddress,
  ];
  for (const candidate of candidates) {
    const value = safeHeader(candidate).trim();
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
  const declared = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false };
  let value;
  if (request.body === undefined || request.body === null) {
    value = Buffer.from("{}", "utf8");
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

function safeHeader(value) {
  const normalized = Array.isArray(value) ? value.join(",") : String(value || "");
  return normalized.length <= 8_192 && !/[\r\n\u0000]/u.test(normalized)
    ? normalized
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
    "__Host-econovaria_admin_session",
    "econovaria_admin_session",
  ].includes(name)) return "";
  if (!envelope) {
    return "__Host-econovaria_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
  }
  if (!COOKIE_ENVELOPE_PATTERN.test(envelope)) return "";
  return `__Host-econovaria_admin_session=${envelope}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`;
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

function errorBody(code, message, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}
