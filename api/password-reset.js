"use strict";

const MAX_BODY_BYTES = 4_096;
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,2048}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}$/u;

module.exports = async function passwordResetProxy(request, response) {
  try {
    if (String(request.method || "GET").toUpperCase() === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    if (String(request.method || "GET").toUpperCase() !== "POST") {
      return sendJson(response, 405, errorBody(
        "method_not_allowed",
        "Use POST to reset an administrator password."
      ));
    }

    const config = readConfig();
    const origin = requestOrigin(request);
    const authorization = String(request.headers?.authorization || "").trim();
    const match = authorization.match(/^Bearer\s+(.+)$/u);
    if (!match || !JWT_PATTERN.test(match[1])) {
      return sendJson(response, 401, errorBody(
        "invalid_recovery_session",
        "A valid password-recovery session is required."
      ));
    }

    const body = readBody(request);
    if (!body.ok) {
      return sendJson(response, 413, errorBody(
        "request_body_too_large",
        "Password reset request is too large."
      ));
    }

    const upstream = await fetch(
      `${config.supabaseUrl}/functions/v1/password-reset-api`,
      {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${match[1]}`,
          Origin: origin,
          "Content-Type": "application/json"
        },
        body: body.value,
        cache: "no-store",
        redirect: "manual"
      }
    );
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) {
      return sendJson(response, 502, errorBody(
        "upstream_response_too_large",
        "Password reset response is invalid."
      ));
    }

    response.statusCode = upstream.status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.end(Buffer.from(bytes));
  } catch (_) {
    sendJson(response, 502, errorBody(
      "password_reset_unavailable",
      "Administrator password reset is unavailable."
    ));
  }
};

function readConfig() {
  const supabaseUrl = String(process.env.ECONOVARIA_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const publishableKey = String(
    process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY || ""
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
    throw new Error("invalid password-reset proxy configuration");
  }
  return { supabaseUrl, publishableKey };
}

function requestOrigin(request) {
  const host = safeHeader(
    request.headers?.["x-forwarded-host"] || request.headers?.host
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

function readBody(request) {
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

function safeHeader(value) {
  const normalized = Array.isArray(value) ? value.join(",") : String(value || "");
  return normalized.length <= 8_192 && !/[\r\n\u0000]/u.test(normalized)
    ? normalized
    : "";
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
