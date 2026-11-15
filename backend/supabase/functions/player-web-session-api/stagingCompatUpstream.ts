import {
  FORWARDED_HEADERS,
  MAX_BODY_BYTES,
  decoder,
  type SessionPayload,
  type JsonRecord,
  encoder,
} from "./stagingCompatContracts.ts";
import {
  configuredSupabaseUrl,
  configuredPublishableKey,
  configuredServiceRoleKey,
  trustedClientIp,
  responseHeaders,
  safePlayer,
  safeGame,
} from "./stagingCompatHttp.ts";
import {
  ownedBuffer,
} from "./stagingCompatSession.ts";


export async function readBody(request: Request, maximum: number): Promise<Uint8Array | null> {
  if (["GET", "HEAD"].includes(request.method.toUpperCase())) return null;
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maximum) throw new Error("request_body_too_large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maximum) throw new Error("request_body_too_large");
  return bytes;
}


export function upstreamHeaders(
  request: Request,
  publishableKey: string,
  serviceRoleKey: string,
  clientIp: string,
  sessionToken = "",
): Headers {
  const headers = new Headers({
    apikey: publishableKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "x-real-ip": clientIp,
  });
  if (sessionToken) headers.set("x-player-session-token", sessionToken);
  for (const [source, target] of FORWARDED_HEADERS) {
    const value = String(request.headers.get(source) || "");
    if (value && value.length <= 8_192 && !/[\r\n\0]/u.test(value)) headers.set(target, value);
  }
  return headers;
}


export async function upstreamRequest(
  request: Request,
  route: string,
  body: Uint8Array | null,
  sessionToken = "",
): Promise<{ response: Response; bytes: Uint8Array } | null> {
  const supabaseUrl = configuredSupabaseUrl();
  const publishableKey = configuredPublishableKey();
  const serviceRoleKey = configuredServiceRoleKey();
  const clientIp = trustedClientIp(request);
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !clientIp) return null;
  const headers = upstreamHeaders(request, publishableKey, serviceRoleKey, clientIp, sessionToken);
  if (body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${supabaseUrl}/functions/v1/classroom-api${route}`, {
    method: request.method,
    headers,
    body: body ? ownedBuffer(body) : undefined,
    cache: "no-store",
    redirect: "manual",
  }).catch(() => null);
  if (!response) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return null;
  return { response, bytes };
}


export function parseJson<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(decoder.decode(bytes)) as T;
  } catch {
    return null;
  }
}


export function forward(request: Request, upstream: Response, bytes: Uint8Array): Response {
  const headers = responseHeaders(request, upstream.headers.get("content-type"));
  const retryAfter = String(upstream.headers.get("retry-after") || "").trim();
  if (/^\d{1,5}$/u.test(retryAfter) && Number(retryAfter) <= 86_400) headers.set("Retry-After", retryAfter);
  return new Response(ownedBuffer(bytes), { status: upstream.status, headers });
}


export function publicSession(payload: SessionPayload, bootstrap: JsonRecord) {
  return {
    ok: true,
    session: {
      authenticated: true,
      status: "active",
      expiresAt: new Date(payload.sessionExpiresAt * 1000).toISOString(),
      absoluteExpiresAt: new Date(payload.absoluteExpiresAt * 1000).toISOString(),
    },
    player: bootstrap.player,
    gameSession: bootstrap.gameSession,
    balances: Array.isArray(bootstrap.balances) ? bootstrap.balances : [],
    attendance: bootstrap.attendance || { status: "not_configured" },
    availableActions: Array.isArray(bootstrap.availableActions) ? bootstrap.availableActions : [],
    csrfToken: payload.csrfToken,
  };
}


export async function loadBootstrap(request: Request, token: string): Promise<JsonRecord | null> {
  const bootstrapRequest = new Request(request.url, {
    method: "GET",
    headers: request.headers,
  });
  const upstream = await upstreamRequest(bootstrapRequest, "/players/me", null, token);
  if (!upstream?.response.ok) return null;
  const body = parseJson<JsonRecord>(upstream.bytes);
  if (
    body?.ok !== true ||
    !safePlayer(body.player) ||
    !safeGame(body.gameSession) ||
    !body.session ||
    typeof body.session !== "object" ||
    typeof (body.session as JsonRecord).expiresAt !== "string" ||
    !Array.isArray(body.balances) ||
    !Array.isArray(body.availableActions)
  ) return null;
  return body;
}


export async function revoke(request: Request, token: string): Promise<boolean> {
  const logoutRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
  });
  const upstream = await upstreamRequest(
    logoutRequest,
    "/players/me/session/logout",
    encoder.encode("{}"),
    token,
  );
  return upstream?.response.ok === true || upstream?.response.status === 401;
}
