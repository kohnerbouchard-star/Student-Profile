"use strict";

const { isIP } = require("node:net");

const MAX_BODY_BYTES = 4_096;
const MAX_AUTH_RESPONSE_BYTES = 64 * 1_024;
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,2048}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}$/u;
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u;
const VERIFICATION_TYPES = new Set(["signup", "magiclink", "recovery"]);
const STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const PRODUCTION_PROJECT_REF = "cgiukdjwicykrmtkhudh";
const STAGING_PUBLISHABLE_KEY = "sb_publishable_hxDGtX8hXCdh4wCMjj_IKg_REc8k3WB";

module.exports = async function passwordResetProxy(request, response) {
  const operation = requestOperation(request);
  if (operation === "verify-auth") {
    return handleAuthTokenVerify(request, response);
  }
  return handlePasswordReset(request, response);
};

async function handleAuthTokenVerify(request, response) {
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

    const body = readAuthReviewBody(request);
    if (!body.ok) return sendJson(response, body.status, errorBody(body.code, body.message));
    const refs = body.projectRef
      ? [body.projectRef]
      : [PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF];

    let verified = null;
    for (const projectRef of refs) {
      let config;
      try {
        config = readConfig(projectRef);
      } catch (_) {
        if (body.projectRef) throw _;
        continue;
      }
      const result = await verifyToken(config, body.tokenHash, body.type);
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

    if (body.type === "recovery") {
      return sendJson(response, 200, {
        ok: true,
        verified: true,
        projectRef: verified.projectRef,
        type: body.type,
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
      type: body.type
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
}

async function handlePasswordReset(request, response) {
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

    const operation = requestOperation(request);
    if (operation.startsWith("recovery-")) {
      if (safeHeader(request.headers?.origin) !== origin) return sendJson(response,403,errorBody("origin_not_allowed","Recovery must continue from this application."));
      return await handleSystemRecoveryProxy(request,response,operation,origin,clientIp,match[1]);
    }
    if (operation === "mfa-status" || operation === "mfa-verify") {
      if (safeHeader(request.headers?.origin) !== origin) {
        return sendJson(response, 403, errorBody("origin_not_allowed", "Recovery must continue from this application."));
      }
      return await handleRecoveryMfa(request, response, operation, origin, clientIp, match[1]);
    }
    const body = readPasswordResetBody(request);
    if (!body.ok) return sendJson(response, body.status, errorBody(body.code, body.message));
    const config = readConfig(body.projectRef);

    const upstream = await fetch(`${config.supabaseUrl}/functions/v1/password-reset-api`, {
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
    });
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
}

async function handleRecoveryMfa(request, response, operation, origin, clientIp, accessToken) {
  const body = readJsonObject(request);
  if (!body.ok) return sendJson(response, body.status, errorBody(body.code, body.message));
  const { projectRef, factorHandle, code } = body.value;
  const verify = operation === "mfa-verify";
  const allowed = verify ? ["projectRef", "factorHandle", "code"] : ["projectRef"];
  if (Object.keys(body.value).some((key) => !allowed.includes(key)) ||
      ![STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF].includes(projectRef) ||
      (verify && (typeof factorHandle !== "string" || !/^mfa1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32,2048}$/u.test(factorHandle) ||
        typeof code !== "string" || !/^\d{6}$/u.test(code)))) {
    return sendJson(response, 400, errorBody("invalid_mfa_request", "Recovery verification input is invalid."));
  }
  const config = readConfig(projectRef);
  const upstream = await fetch(`${config.supabaseUrl}/functions/v1/staff-mfa-api/staff/mfa${verify ? "/verify" : ""}`, {
    method: verify ? "POST" : "GET",
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${accessToken}`, Origin: origin,
      "Content-Type": "application/json", "x-real-ip": clientIp },
    ...(verify ? { body: JSON.stringify({ factorHandle, code }) } : {}),
    cache: "no-store", redirect: "error"
  });
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > MAX_AUTH_RESPONSE_BYTES) throw new Error("invalid MFA response");
  const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!upstream.ok || data?.ok !== true) {
    const invalidCode = data?.error?.code === "mfa_verification_failed";
    return sendJson(response, upstream.ok ? 502 : upstream.status, errorBody(
      invalidCode ? "mfa_verification_failed" : "recovery_mfa_unavailable",
      invalidCode ? "The authenticator code is invalid or expired." : "Recovery verification is unavailable. Request a fresh recovery email or contact your administrator."
    ));
  }
  if (verify) {
    if (data.session?.assuranceLevel !== "aal2" || !JWT_PATTERN.test(String(data.session?.accessToken || ""))) {
      throw new Error("invalid elevated session");
    }
    // Keep the existing memory-only recovery bearer contract; never return refresh tokens.
    return sendJson(response, 200, { ok: true, accessToken: data.session.accessToken });
  }
  const factors = (Array.isArray(data.factors) ? data.factors : []).filter((factor) =>
    factor.factorType === "totp" && factor.status === "verified" && typeof factor.handle === "string").map((factor) => ({
      handle: factor.handle, friendlyName: String(factor.friendlyName || "Authenticator").slice(0, 80)
    }));
  return sendJson(response, 200, { ok: true, factors });
}

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

function readConfig(projectRef) {
  if (projectRef === STAGING_PROJECT_REF) {
    return {
      supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
      publishableKey: STAGING_PUBLISHABLE_KEY
    };
  }
  if (projectRef !== PRODUCTION_PROJECT_REF) throw new Error("invalid password-reset project");

  const supabaseUrl = String(process.env.ECONOVARIA_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const publishableKey = String(process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const parsed = new URL(supabaseUrl);
  if (
    parsed.protocol !== "https:" ||
    !/^[a-z0-9]{20}\.supabase\.co$/u.test(parsed.hostname) ||
    parsed.hostname === `${STAGING_PROJECT_REF}.supabase.co` ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !publishableKey.startsWith("sb_publishable_")
  ) {
    throw new Error("invalid password-reset proxy configuration");
  }
  return { supabaseUrl, publishableKey };
}

function requestOperation(request) {
  try {
    return new URL(String(request.url || "/api/password-reset"), "https://econovaria.invalid")
      .searchParams.get("operation") || "";
  } catch (_) {
    return "";
  }
}

function requestOrigin(request) {
  const host = safeHeader(request.headers?.["x-forwarded-host"] || request.headers?.host);
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/u.test(host)) throw new Error("invalid request host");
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http:" : "https:";
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

function readAuthReviewBody(request) {
  const result = readJsonObject(request);
  if (!result.ok) return result;
  const value = result.value;
  if (Object.keys(value).some((key) => !["tokenHash", "type", "projectRef"].includes(key))) {
    return failure(400, "invalid_request_body", "Authentication review request must be valid JSON.");
  }
  const tokenHash = String(value.tokenHash || "").trim();
  const type = String(value.type || "").trim().toLowerCase();
  const projectRef = String(value.projectRef || "").trim().toLowerCase();
  if (
    !TOKEN_HASH_PATTERN.test(tokenHash) ||
    !VERIFICATION_TYPES.has(type) ||
    (projectRef && ![STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF].includes(projectRef))
  ) {
    return failure(400, "invalid_auth_review_request", "The authentication review request is invalid or incomplete.");
  }
  return { ok: true, tokenHash, type, projectRef };
}

function readPasswordResetBody(request) {
  const result = readJsonObject(request);
  if (!result.ok) return result;
  const value = result.value;
  if (Object.keys(value).some((key) => !["password", "projectRef"].includes(key))) {
    return failure(400, "invalid_request_body", "Password reset request is invalid.");
  }
  if (typeof value.password !== "string") {
    return failure(400, "invalid_request_body", "Password reset request is invalid.");
  }
  const projectRef = String(value.projectRef || PRODUCTION_PROJECT_REF).trim().toLowerCase();
  if (![STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF].includes(projectRef)) {
    return failure(400, "invalid_request_body", "Password reset request is invalid.");
  }
  return { ok: true, password: value.password, projectRef };
}

function readJsonObject(request) {
  const declared = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return failure(413, "request_body_too_large", "Request body is too large.");
  }
  let raw;
  if (request.body === undefined || request.body === null) raw = Buffer.alloc(0);
  else if (Buffer.isBuffer(request.body)) raw = request.body;
  else if (typeof request.body === "string") raw = Buffer.from(request.body, "utf8");
  else raw = Buffer.from(JSON.stringify(request.body), "utf8");
  if (raw.byteLength === 0) return failure(400, "request_body_required", "A JSON request body is required.");
  if (raw.byteLength > MAX_BODY_BYTES) return failure(413, "request_body_too_large", "Request body is too large.");
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return { ok: true, value };
  } catch (_) {
    return failure(400, "invalid_request_body", "Request body must be valid JSON.");
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
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(body));
}

function errorBody(code, message) {
  return { ok: false, error: { code, message, retryable: false } };
}

async function handleSystemRecoveryProxy(request,response,operation,origin,clientIp,accessToken) {
  const action=operation.slice("recovery-".length);
  const parsed=readJsonObject(request);
  if(!parsed.ok) return sendJson(response,parsed.status,errorBody(parsed.code,parsed.message));
  const body=parsed.value;
  const fields=action==="enroll" ? ["projectRef","grant","slot"] : action==="verify"
    ? ["projectRef","grant","slot","factorHandle","code"] : action==="complete"
    ? ["projectRef","grant","password"] : ["projectRef","grant"];
  if(!["claim","status","enroll","verify","complete"].includes(action) || body.projectRef!==STAGING_PROJECT_REF ||
    Object.keys(body).some(key=>!fields.includes(key)) || typeof body.grant!=="string" || !/^[A-Za-z0-9_-]{43}$/u.test(body.grant)) {
    return sendJson(response,400,errorBody("invalid_recovery_request","Recovery request is invalid."));
  }
  const config=readConfig(STAGING_PROJECT_REF);
  const {projectRef,...payload}=body;
  const upstream=await fetch(`${config.supabaseUrl}/functions/v1/${action==="complete" ? "password-reset-api" : `staff-mfa-api/staff/mfa/recovery/${action}`}`,{
    method:"POST",headers:{apikey:config.publishableKey,Authorization:`Bearer ${accessToken}`,Origin:origin,"Content-Type":"application/json","x-real-ip":clientIp},
    body:JSON.stringify(payload),cache:"no-store",redirect:"error",
  });
  const bytes=new Uint8Array(await upstream.arrayBuffer());
  if(bytes.byteLength>256*1024) throw Error("invalid recovery response");
  const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  if(!upstream.ok || data.ok!==true) return sendJson(response,upstream.status>=400?upstream.status:502,
    errorBody(data?.error?.code === "mfa_verification_failed" ? "mfa_verification_failed" : "recovery_unavailable","Recovery could not continue. Contact the system operator if setup was interrupted."));
  if(action==="enroll") {
    if(typeof data.factor?.handle!=="string" || typeof data.factor?.qrCode!=="string" || !data.factor.qrCode.startsWith("data:image/") ||
      !/^[A-Z2-7]{16,128}$/u.test(data.factor?.secret||"")) throw Error("invalid recovery enrollment");
    return sendJson(response,201,{ok:true,factor:{handle:data.factor.handle,qrCode:data.factor.qrCode,secret:data.factor.secret}});
  }
  if(action==="verify") {
    if(!JWT_PATTERN.test(data.accessToken||"")) throw Error("invalid elevated recovery bearer");
    return sendJson(response,200,{ok:true,accessToken:data.accessToken});
  }
  return sendJson(response,200,{ok:true,...(action==="complete" ? {passwordReset:true,sessionsRevoked:true} : {
    primaryVerified:data.primaryVerified===true,backupVerified:data.backupVerified===true,setupInterrupted:data.setupInterrupted===true,
  })});
}
