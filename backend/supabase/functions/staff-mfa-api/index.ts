import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  resolveStaffSessionForRequest,
  type EdgeSupabaseClient,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  bindGatewayTrustedClientIp,
} from "../../../src/security/edgeGatewayClientIp.ts";
import {
  createAuthClient,
  createServiceClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";

interface MfaFactor {
  readonly id: string;
  readonly friendly_name?: string;
  readonly factor_type?: string;
  readonly status?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

const MAX_BODY_BYTES = 8_192;
const MAX_FRIENDLY_NAME_LENGTH = 80;
const FACTOR_HANDLE_TTL_SECONDS = 15 * 60;

Deno.serve(async (incomingRequest) => {
  if (incomingRequest.method === "OPTIONS") return jsonResponse(204, null);

  const request = bindGatewayTrustedClientIp(
    incomingRequest,
    Deno.env.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER"),
  );

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;

  const env = readEdgeSupabaseEnv();
  if (!env.ok) {
    return jsonError(500, {
      code: "missing_edge_runtime_config",
      message: "Staff MFA runtime configuration is incomplete.",
      retryable: false,
    });
  }

  const path = functionPath(request);
  const requiredAal = path.endsWith("/verify") || path.endsWith("/enroll")
    ? "aal1"
    : path.endsWith("/unenroll")
    ? "aal2"
    : "aal1";
  const staffResult = await resolveStaffSessionForRequest(
    request,
    env.value,
    { createAuthClient, createServiceClient },
    {
      missingMessage: "A verified staff user is required for MFA management.",
      requiredRole: "game_admin",
      requiredAssuranceLevel: requiredAal,
    },
  );
  if (!staffResult.ok) {
    return jsonError(staffResult.status, staffResult.error);
  }

  const authorization = String(request.headers.get("authorization") || "").trim();
  const userClient = createClient(env.value.supabaseUrl, env.value.supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any;

  try {
    if (path === "/staff/mfa" && request.method === "GET") {
      return handleStatus(userClient, staffResult.authUser.id);
    }
    if (path === "/staff/mfa/enroll" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleEnroll(userClient, staffResult.authUser.id, body);
    }
    if (path === "/staff/mfa/verify" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleVerify(userClient, staffResult.authUser.id, body);
    }
    if (path === "/staff/mfa/unenroll" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleUnenroll(userClient, staffResult.authUser.id, body);
    }
  } catch (error) {
    if (error instanceof MfaRequestError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return mfaFailure();
  }

  return jsonError(404, {
    code: "route_not_found",
    message: "Staff MFA route was not found.",
    retryable: false,
  });
});

async function handleStatus(userClient: any, userId: string): Promise<Response> {
  const [{ data: factorData, error: factorError }, { data: aalData, error: aalError }] =
    await Promise.all([
      userClient.auth.mfa.listFactors(),
      userClient.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
  if (factorError || aalError) return mfaFailure();

  const factors = enrolledFactors(factorData);
  return jsonResponse(200, {
    ok: true,
    assuranceLevel: normalizeAal(aalData?.currentLevel),
    nextAssuranceLevel: normalizeAal(aalData?.nextLevel),
    needsEnrollment: factors.length === 0,
    factors: await Promise.all(factors.map(async (factor) => ({
      handle: await createFactorHandle(userId, factor.id),
      friendlyName: safeFriendlyName(factor.friendly_name),
      factorType: factor.factor_type === "totp" ? "totp" : "unknown",
      status: factor.status === "verified" ? "verified" : "unverified",
      createdAt: safeIsoDate(factor.created_at),
      updatedAt: safeIsoDate(factor.updated_at),
    }))),
  }, privateHeaders());
}

async function handleEnroll(
  userClient: any,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  rejectUnknownFields(body, new Set(["friendlyName"]));
  const friendlyName = safeFriendlyName(body.friendlyName) || "Econovaria Admin";

  const { data, error } = await userClient.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  const factorId = String(data?.id || "");
  const qrCode = String(data?.totp?.qr_code || "");
  const secret = String(data?.totp?.secret || "");
  const uri = String(data?.totp?.uri || "");
  if (error || !factorId || !qrCode || !secret || !uri) return mfaFailure();

  return jsonResponse(201, {
    ok: true,
    factor: {
      handle: await createFactorHandle(userId, factorId),
      factorType: "totp",
      friendlyName,
      qrCode,
      secret,
      uri,
    },
    expiresInSeconds: FACTOR_HANDLE_TTL_SECONDS,
  }, privateHeaders());
}

async function handleVerify(
  userClient: any,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  rejectUnknownFields(body, new Set(["factorHandle", "code"]));
  const factorId = await readFactorHandle(body.factorHandle, userId);
  const code = String(body.code || "").replace(/\s+/gu, "");
  if (!/^\d{6}$/u.test(code)) {
    throw new MfaRequestError(
      "invalid_mfa_code",
      "Enter the six-digit authenticator code.",
      400,
    );
  }

  const { data, error } = await userClient.auth.mfa.challengeAndVerify({
    factorId,
    code,
  });
  const accessToken = String(data?.access_token || data?.session?.access_token || "");
  const refreshToken = String(data?.refresh_token || data?.session?.refresh_token || "");
  if (error || !accessToken) {
    throw new MfaRequestError(
      "mfa_verification_failed",
      "The authenticator code is invalid or expired.",
      401,
    );
  }

  return jsonResponse(200, {
    ok: true,
    session: {
      accessToken,
      refreshToken,
      assuranceLevel: "aal2",
      expiresAt: readJwtExpiry(accessToken),
    },
  }, privateHeaders());
}

async function handleUnenroll(
  userClient: any,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  rejectUnknownFields(body, new Set(["factorHandle"]));
  const factorId = await readFactorHandle(body.factorHandle, userId);
  const { error } = await userClient.auth.mfa.unenroll({ factorId });
  if (error) return mfaFailure();
  return jsonResponse(200, { ok: true, removed: true }, privateHeaders());
}

function enrolledFactors(value: unknown): MfaFactor[] {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const all = [
    ...(Array.isArray(record.totp) ? record.totp : []),
    ...(Array.isArray(record.phone) ? record.phone : []),
  ];
  return all.filter((factor): factor is MfaFactor =>
    Boolean(factor && typeof factor === "object" && String((factor as any).id || ""))
  );
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = String(request.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new MfaRequestError(
      "unsupported_media_type",
      "Use application/json for Staff MFA requests.",
      415,
    );
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BODY_BYTES) {
    throw new MfaRequestError(
      bytes.byteLength === 0 ? "request_body_required" : "request_body_too_large",
      bytes.byteLength === 0
        ? "A JSON request body is required."
        : "The Staff MFA request is too large.",
      bytes.byteLength === 0 ? 400 : 413,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new MfaRequestError(
      "invalid_request_body",
      "The Staff MFA request must contain valid JSON.",
      400,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MfaRequestError(
      "invalid_request_body",
      "The Staff MFA request must be a JSON object.",
      400,
    );
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  body: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new MfaRequestError(
      "unknown_request_field",
      "The Staff MFA request contains an unsupported field.",
      400,
    );
  }
}

function safeFriendlyName(value: unknown): string {
  const name = String(value || "").trim();
  if (!name) return "";
  if (
    name.length > MAX_FRIENDLY_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(name)
  ) {
    throw new MfaRequestError(
      "invalid_factor_name",
      "The authenticator name is invalid.",
      400,
    );
  }
  return name;
}

function safeIsoDate(value: unknown): string | null {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeAal(value: unknown): "aal1" | "aal2" | "unknown" {
  return value === "aal2" ? "aal2" : value === "aal1" ? "aal1" : "unknown";
}

async function createFactorHandle(userId: string, factorId: string): Promise<string> {
  const key = await factorHandleKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify({
    sub: userId,
    fid: factorId,
    exp: Math.floor(Date.now() / 1000) + FACTOR_HANDLE_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  }));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("econovaria-mfa-factor-v1") },
    key,
    payload,
  );
  return `mfa1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

async function readFactorHandle(value: unknown, userId: string): Promise<string> {
  const token = String(value || "").trim();
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "mfa1") {
    throw invalidHandle();
  }

  try {
    const key = await factorHandleKey();
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(parts[1]),
        additionalData: new TextEncoder().encode("econovaria-mfa-factor-v1"),
      },
      key,
      fromBase64Url(parts[2]),
    );
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (
      payload?.sub !== userId ||
      typeof payload?.fid !== "string" ||
      !payload.fid ||
      !Number.isSafeInteger(payload?.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw invalidHandle();
    }
    return payload.fid;
  } catch (error) {
    if (error instanceof MfaRequestError) throw error;
    throw invalidHandle();
  }
}

async function factorHandleKey(): Promise<CryptoKey> {
  const secret = String(Deno.env.get("ECONOVARIA_MFA_HANDLE_KEY") || "");
  if (secret.length < 32 || secret.length > 1024) {
    throw new MfaRequestError(
      "mfa_handle_key_unavailable",
      "Staff MFA handle protection is unavailable.",
      503,
      true,
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function functionPath(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const marker = "/staff-mfa-api";
  const markerIndex = pathname.indexOf(marker);
  return markerIndex >= 0
    ? pathname.slice(markerIndex + marker.length) || "/"
    : pathname;
}

function readJwtExpiry(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    const expiry = Number(claims?.exp);
    return Number.isFinite(expiry) ? new Date(expiry * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

function privateHeaders(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "Origin, Authorization, X-Econovaria-Device-Id",
  };
}

function mfaFailure(): Response {
  return jsonError(500, {
    code: "staff_mfa_failed",
    message: "Staff MFA operation failed.",
    retryable: false,
  });
}

function invalidHandle(): MfaRequestError {
  return new MfaRequestError(
    "invalid_factor_handle",
    "The authenticator reference is invalid or expired.",
    400,
  );
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw invalidHandle();
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

class MfaRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MfaRequestError";
  }
}
