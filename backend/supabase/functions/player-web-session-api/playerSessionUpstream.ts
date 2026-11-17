import {
  constantTimePlayerTextEqual,
  createWebPlayerSessionPayload,
  openWebPlayerSession,
  parsePlayerCookieHeader,
  randomWebPlayerCsrfToken,
  readWebPlayerSessionKey,
  sealWebPlayerSession,
  WEB_PLAYER_SESSION_COOKIE,
  WEB_PLAYER_SESSION_LOCAL_COOKIE,
  type WebPlayerSessionPayload,
} from "../../../src/security/webPlayerSession.ts";
import {
  normalizeRetryAfter,
  parseJsonBytes,
  isSafePlayer,
  isSafeGame,
  isSafeHeaderValue,
} from "./playerSessionHttp.ts";
import {
  MAX_BODY_BYTES,
  type PlayerBootstrapBody,
  DEVICE_HEADER,
  FORWARDED_REQUEST_HEADERS,
} from "./playerSessionContracts.ts";


export async function loadPlayerBootstrap(
  supabaseUrl: string,
  publishableKey: string,
  sessionToken: string,
  source: Request,
  clientIp: string,
): Promise<
  | { readonly ok: true; readonly body: RequiredPlayerBootstrapBody }
  | { readonly ok: false; readonly status: number; readonly retryAfter?: string | null }
> {
  const request = new Request(
    `${supabaseUrl}/functions/v1/player-api/players/me`,
    {
      method: "GET",
      headers: upstreamHeaders(
        source,
        publishableKey,
        clientIp,
        false,
        sessionToken,
      ),
      cache: "no-store",
      redirect: "manual",
    },
  );
  const response = await fetch(request).catch(() => null);
  if (!response) return { ok: false, status: 502 };
  if (!response.ok) {
    // A failed read is not proof of a revoked session. Never forward diagnostics.
    return {
      ok: false,
      status: response.status >= 400 ? response.status : 502,
      retryAfter: normalizeRetryAfter(response.headers.get("retry-after")),
    };
  }
  const bytes = await response.arrayBuffer().then((value) => new Uint8Array(value)).catch(() => null);
  if (!bytes || bytes.byteLength > MAX_BODY_BYTES) return { ok: false, status: 502 };
  const body = parseJsonBytes<PlayerBootstrapBody>(bytes);
  if (
    body?.ok !== true ||
    !isSafePlayer(body.player) ||
    !isSafeGame(body.gameSession) ||
    typeof body.session?.expiresAt !== "string" ||
    !Array.isArray(body.balances) ||
    !Array.isArray(body.availableActions)
  ) {
    return { ok: false, status: 502 };
  }
  return { ok: true, body: body as RequiredPlayerBootstrapBody };
}


export type RequiredPlayerBootstrapBody = PlayerBootstrapBody & {
  readonly ok: true;
  readonly player: WebPlayerSessionPayload["player"];
  readonly gameSession: WebPlayerSessionPayload["gameSession"];
  readonly session: { readonly status: string; readonly expiresAt: string };
  readonly balances: readonly unknown[];
  readonly availableActions: readonly unknown[];
};


export async function revokeUpstreamSession(
  supabaseUrl: string,
  publishableKey: string,
  sessionToken: string,
  source: Request,
  clientIp: string,
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/player-api/players/me/session/logout`,
    {
      method: "POST",
      headers: upstreamHeaders(
        source,
        publishableKey,
        clientIp,
        true,
        sessionToken,
      ),
      body: "{}",
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);
  return response?.ok === true || response?.status === 401;
}


export function publicPlayerSessionBody(
  payload: WebPlayerSessionPayload,
  bootstrap: RequiredPlayerBootstrapBody,
) {
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
    balances: bootstrap.balances,
    attendance: bootstrap.attendance ?? { status: "not_configured" },
    availableActions: bootstrap.availableActions,
    csrfToken: payload.csrfToken,
  };
}


export function upstreamHeaders(
  source: Request,
  publishableKey: string,
  clientIp: string,
  hasBody: boolean,
  sessionToken = "",
): Headers {
  const headers = new Headers({
    apikey: publishableKey,
    "x-real-ip": clientIp,
  });
  const deviceId = String(source.headers.get(DEVICE_HEADER) || "");
  if (isSafeHeaderValue(deviceId)) headers.set(DEVICE_HEADER, deviceId);
  if (sessionToken) headers.set("x-player-session-token", sessionToken);
  for (const [sourceName, targetName] of FORWARDED_REQUEST_HEADERS) {
    const value = String(source.headers.get(sourceName) || "");
    if (value && isSafeHeaderValue(value)) headers.set(targetName, value);
  }
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}


export async function resolveSession(
  request: Request,
  key: Uint8Array,
): Promise<
  | { readonly ok: true; readonly payload: WebPlayerSessionPayload }
  | { readonly ok: false; readonly code: string }
> {
  const cookies = parsePlayerCookieHeader(request.headers.get("cookie"));
  const envelope = cookies.get(WEB_PLAYER_SESSION_COOKIE) ||
    cookies.get(WEB_PLAYER_SESSION_LOCAL_COOKIE) || "";
  if (!envelope) return { ok: false, code: "player_session_missing" };
  try {
    return { ok: true, payload: await openWebPlayerSession(envelope, key) };
  } catch {
    return { ok: false, code: "player_session_invalid" };
  }
}
