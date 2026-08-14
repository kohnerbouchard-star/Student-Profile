"use strict";

const MAX_BODY_BYTES = 2_048;
const MAX_AUTH_RESPONSE_BYTES = 64 * 1_024;
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u;
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,12288}\.[A-Za-z0-9_-]{8,4096}$/u;
const VERIFICATION_TYPES = new Set(["signup", "magiclink", "recovery"]);
const STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const PRODUCTION_PROJECT_REF = "cgiukdjwicykrmtkhudh";
const STAGING_PUBLISHABLE_KEY = "sb_publishable_hxDGtX8hXCdh4wCMjj_IKg_REc8k3WB";

module.exports = async function authTokenVerify(request, response) {
  try {
    if (String(request.method || "GET").toUpperCase() === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    if (String(request.method || "GET").toUpperCase() !== "POST") {
      return sendJson(response, 405, errorBody("method_not_allowed", "Use POST to continue the authentication review."));
    }

    const origin = requestOrigin(request);
    const suppliedOrigin = safeHeader(request.headers?.origin).trim();
    if (!suppliedOrigin || suppliedOrigin !== origin) {
      return sendJson(response, 403, errorBody(
        "auth_review_origin_denied",
        "Authentication review must be completed from the Econovaria web application."
      ));
    }

    const bodyResult = readJsonBody(request);
    if (!bodyResult.ok) {
      return sendJson(response, bodyResult.status, errorBody(bodyResult.code, bodyResult.message));
    }

    const tokenHash = String(bodyResult.value.tokenHash || "").trim();
    const type = String(bodyResult.value.type || "").trim().toLowerCase();
    const requestedProjectRef = String(bodyResult.value.projectRef || "").trim().toLowerCase();
    if (!TOKEN_HASH_PATTERN.test(tokenHash) || !VERIFICATION_TYPES.has(type)) {
      return sendJson(response, 400, errorBody(
        "invalid_auth_review_request",
        "The authentication review request is invalid or incomplete."
      ));
    }
    if (requestedProjectRef && ![STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF].includes(requestedProjectRef)) {
      return sendJson(response, 400, errorBody(
        "invalid_auth_review_project",
        "The authentication review project is invalid."
      ));
    }

    const refs = requestedProjectRef
      ? [requestedProjectRef]
      : [PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF];
    let verified = null;
    for (const projectRef of refs) {
      let config;
      try {
        config = projectConfig(projectRef);
      } catch (_) {
        if (requestedProjectRef) throw _;
        continue;
      }
      const result = await verifyToken(config, tokenHash, type);
      if (result) {
        verified = { ...result, projectRef, config };
        break;
      }
    }

    if (!verified) {
      return sendJson(response, 400, errorBody(
        "auth_review_unavailable",
        "This authentication link is invalid, expired, or already used."
      ));
    }

    if (type === "recovery") {
      return sendJson(response, 200, {
        ok: true,
        verified: true,
        projectRef: verified.projectRef,
        type,
        accessToken: verified.accessToken
      });
    }

    const logout = await fetch(`${verified.config.supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: verified.config.publishableKey,
        Authorization: `Bearer ${verified.accessToken}`
      },
      cache: "no-store",
      redirect: "error"
    }).catch(() => null);
    const logoutStatus = logout?.status ?? 0;
    const logoutSucceeded = Boolean(logout && (logout.ok || logoutStatus === 401));
    await logout?.body?.cancel().catch(() => undefined);
    if (!logoutSucceeded) {
      return sendJson(response, 503, {
        ok: false,
        error: {
          code: "auth_review_cleanup_pending",
          message: "The mailbox was verified, but temporary-session cleanup could not be confirmed. Sign in again shortly.",
          retryable: true
        }
      });
    }

    return sendJson(response, 200, {
      ok: true,
      verified: true,
      projectRef: verified.projectRef,
      type
    });
  } catch (_) {
    return sendJson(response, 503, {
      ok: false,
      error: {
        code: "auth_review_unavailable",
        message: "Authentication review is temporarily unavailable.",
        retryable: true
      }
    });
  }
};

async function verifyToken(config, tokenHash, type) {
  const verification = await fetch(`${config.supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token_hash: tokenHash, type }),
    cache: "no-store",
    redirect: "error"
  }).catch(() => null);
  if (!verification) return null;
  const bytes = new Uint8Array(await verification.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUTH_RESPONSE_BYTES) return null;
  let payload = null;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (_) {
    payload = null;
  }
  const accessToken = String(payload?.access_token || "").trim();
  return verification.ok && JWT_PATTERN.test(accessToken) ? { accessToken } : null;
}

function projectConfig(projectRef) {
  if (projectRef === STAGING_PROJECT_REF) {
    return {
      supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
      publishableKey: STAGING_PUBLISHABLE_KEY
    };
  }
  if (projectRef !== PRODUCTION_PROJECT_REF) throw new Error("unsupported auth project");

  const supabaseUrl = String(process.env.ECONOVARIA_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const publishableKey = String(process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const parsed = new URL(supabaseUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== `${PRODUCTION_PROJECT_REF}.supabase.co` ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !publishableKey.startsWith("sb_publishable_")
  ) {
    throw new Error("invalid production auth-review configuration");
  }
  return { supabaseUrl, publishableKey };
}

function requestOrigin(request) {
  const host = safeHeader(request.headers?.["x-forwarded-host"] || request.headers?.host).trim();
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/u.test(host)) throw new Error("invalid request host");
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http:" : "https:";
  return `${protocol}//${host}`;
}

function readJsonBody(request) {
  const declared = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return failure(413, "request_body_too_large", "Authentication review request is too large.");
  }
  let bytes;
  if (request.body === undefined || request.body === null) bytes = Buffer.alloc(0);
  else if (Buffer.isBuffer(request.body)) bytes = request.body;
  else if (typeof request.body === "string") bytes = Buffer.from(request.body, "utf8");
  else bytes = Buffer.from(JSON.stringify(request.body), "utf8");
  if (bytes.byteLength === 0) return failure(400, "request_body_required", "A JSON authentication review request is required.");
  if (bytes.byteLength > MAX_BODY_BYTES) return failure(413, "request_body_too_large", "Authentication review request is too large.");
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    if (Object.keys(value).some((key) => !["tokenHash", "type", "projectRef"].includes(key))) throw new Error();
    return { ok: true, value };
  } catch (_) {
    return failure(400, "invalid_request_body", "Authentication review request must be valid JSON.");
  }
}

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function safeHeader(value) {
  const normalized = Array.isArray(value) ? value.join(",") : String(value || "");
  return normalized.length <= 8_192 && !/[\r\n\u0000]/u.test(normalized) ? normalized : "";
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(body));
}

function errorBody(code, message) {
  return { ok: false, error: { code, message, retryable: false } };
}
