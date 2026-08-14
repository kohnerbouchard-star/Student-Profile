"use strict";

const { isIP } = require("node:net");

const MAX_BODY_BYTES = 4_096;
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,2048}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}$/u;
const STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const PRODUCTION_PROJECT_REF = "cgiukdjwicykrmtkhudh";
const STAGING_PUBLISHABLE_KEY = "sb_publishable_hxDGtX8hXCdh4wCMjj_IKg_REc8k3WB";

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

    const origin = requestOrigin(request);
    const clientIp = trustedClientIp(request);
    if (!clientIp) {
      return sendJson(response, 400, errorBody(
        "trusted_client_ip_unavailable",
        "Trusted client network metadata is unavailable."
      ));
    }

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
      return sendJson(response, body.status, errorBody(body.code, body.message));
    }
    const config = readConfig(body.projectRef);

    const upstream = await fetch(
      `${config.supabaseUrl}/functions/v1/password-reset-api`,
      {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${match[1]}`,
          Origin: origin,
          "Content-Type": "application/json",
          "x-real-ip": clientIp
        },
        body: JSON.stringify({ password: body.password }),
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

function readConfig(projectRef) {
  if (projectRef === STAGING_PROJECT_REF) {
    return {
      supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
      publishableKey: STAGING_PUBLISHABLE_KEY
    };
  }
  if (projectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error("invalid password-reset project");
  }

  const supabaseUrl = String(process.env.ECONOVARIA_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const publishableKey = String(
    process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY || ""
  ).trim();
  const parsed = new URL(supabaseUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== `${PRODUCTION_PROJECT_REF}.supabase.co` ||
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

function trustedClientIp(request) {
  const candidates = [
    request.headers?.["x-vercel-forwarded-for"],
    request.headers?.["x-real-ip"],
    request.socket?.remoteAddress
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
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return failure(413, "request_body_too_large", "Password reset request is too large.");
  }
  let raw;
  if (request.body === undefined || request.body === null) raw = Buffer.alloc(0);
  else if (Buffer.isBuffer(request.body)) raw = request.body;
  else if (typeof request.body === "string") raw = Buffer.from(request.body, "utf8");
  else raw = Buffer.from(JSON.stringify(request.body), "utf8");
  if (raw.byteLength === 0 || raw.byteLength > MAX_BODY_BYTES) {
    return failure(raw.byteLength === 0 ? 400 : 413,
      raw.byteLength === 0 ? "request_body_required" : "request_body_too_large",
      raw.byteLength === 0 ? "A password reset request is required." : "Password reset request is too large.");
  }
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    if (Object.keys(value).some((key) => !["password", "projectRef"].includes(key))) throw new Error();
    if (typeof value.password !== "string") throw new Error();
    const projectRef = String(value.projectRef || PRODUCTION_PROJECT_REF).trim().toLowerCase();
    if (![STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF].includes(projectRef)) throw new Error();
    return { ok: true, password: value.password, projectRef };
  } catch (_) {
    return failure(400, "invalid_request_body", "Password reset request is invalid.");
  }
}

function failure(status, code, message) {
  return { ok: false, status, code, message };
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
