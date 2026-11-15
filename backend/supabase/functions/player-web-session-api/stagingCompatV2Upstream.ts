import {
  runtime,
  trustedClientIp,
  responseHeaders,
  safePlayer,
  safeGame,
} from "./stagingCompatV2Http.ts";
import {
  ownedBuffer,
} from "./stagingCompatV2Session.ts";
import {
  MAX_BODY_BYTES,
  type JsonObject,
  decoder,
  type SessionPayload,
  encoder,
} from "./stagingCompatV2Contracts.ts";


export async function readBody(request: Request, maximum: number): Promise<Uint8Array | null> {
  if (["GET", "HEAD"].includes(request.method.toUpperCase())) return null;
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maximum) throw new Error("request_body_too_large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maximum) throw new Error("request_body_too_large");
  return bytes;
}


export function upstreamHeaders(request: Request, token = ""): Headers | null {
  const config = runtime();
  const clientIp = trustedClientIp(request);
  if (!config.ok || !clientIp) {
    console.warn(JSON.stringify({
      event: "player_bff_upstream_unavailable",
      runtimeConfigured: config.ok,
      trustedClientIpAvailable: Boolean(clientIp),
    }));
    return null;
  }
  const headers = new Headers({
    apikey: config.publishableKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "x-real-ip": clientIp,
  });
  if (token) headers.set("x-player-session-token", token);
  for (const name of [
    "content-type",
    "x-econovaria-device-id",
    "x-econovaria-game-id",
    "x-idempotency-key",
    "idempotency-key",
    "x-request-id",
  ]) {
    const value = String(request.headers.get(name) || "");
    if (value && value.length <= 8_192 && !/[\r\n\0]/u.test(value)) headers.set(name, value);
  }
  return headers;
}


export async function callClassroom(
  request: Request,
  route: string,
  body: Uint8Array | null,
  token = "",
): Promise<{ readonly response: Response; readonly bytes: Uint8Array } | null> {
  const config = runtime();
  const headers = upstreamHeaders(request, token);
  if (!headers) return null;
  if (body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${config.supabaseUrl}/functions/v1/classroom-api${route}`, {
    method: request.method,
    headers,
    body: body ? ownedBuffer(body) : undefined,
    cache: "no-store",
    redirect: "manual",
  }).catch(() => null);
  if (!response) {
    console.warn(JSON.stringify({ event: "player_bff_upstream_fetch_failed", route }));
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  console.info(JSON.stringify({
    event: "player_bff_upstream_response",
    route,
    status: response.status,
    bytes: bytes.byteLength,
  }));
  return bytes.byteLength <= MAX_BODY_BYTES ? { response, bytes } : null;
}


export function parseJson(bytes: Uint8Array): JsonObject | null {
  try {
    return JSON.parse(decoder.decode(bytes)) as JsonObject;
  } catch {
    return null;
  }
}


export function forward(request: Request, upstream: Response, bytes: Uint8Array): Response {
  const headers = responseHeaders(request, upstream.headers.get("content-type") || "application/json");
  const retryAfter = String(upstream.headers.get("retry-after") || "").trim();
  if (/^\d{1,5}$/u.test(retryAfter) && Number(retryAfter) <= 86_400) headers.set("Retry-After", retryAfter);
  return new Response(ownedBuffer(bytes), { status: upstream.status, headers });
}


export function publicSession(payload: SessionPayload, bootstrap: JsonObject) {
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


export async function loadBootstrap(request: Request, token: string): Promise<JsonObject | null> {
  const source = new Request(request.url, { method: "GET", headers: request.headers });
  const upstream = await callClassroom(source, "/players/me", null, token);
  if (!upstream?.response.ok) return null;
  const body = parseJson(upstream.bytes);
  const session = body?.session;
  if (
    body?.ok !== true || !safePlayer(body.player) || !safeGame(body.gameSession) ||
    !session || typeof session !== "object" ||
    typeof (session as JsonObject).expiresAt !== "string" ||
    !Array.isArray(body.balances) || !Array.isArray(body.availableActions)
  ) return null;
  return body;
}


export async function revoke(request: Request, token: string): Promise<boolean> {
  const source = new Request(request.url, { method: "POST", headers: request.headers });
  const upstream = await callClassroom(source, "/players/me/session/logout", encoder.encode("{}"), token);
  return upstream?.response.ok === true || upstream?.response.status === 401;
}
