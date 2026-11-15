import { recoverRetiredPlayerRead } from "./retiredWorkerReadRecovery.ts";
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
  json,
  errorBody,
  readBoundedBody,
  trustedClientIp,
  ownedArrayBuffer,
  readBoundedResponse,
  parseJsonBytes,
  forwardJsonResponse,
  isSafePlayer,
  isSafeGame,
  playerSessionJson,
  clearPlayerSessionResponse,
  validProxyPath,
  forwardResponse,
} from "./playerSessionHttp.ts";
import {
  MAX_LOGIN_BODY_BYTES,
  type PlayerLoginBody,
  CSRF_HEADER,
  MAX_BODY_BYTES,
} from "./playerSessionContracts.ts";
import {
  upstreamHeaders,
  revokeUpstreamSession,
  loadPlayerBootstrap,
  publicPlayerSessionBody,
  resolveSession,
} from "./playerSessionUpstream.ts";


export async function handleLogin(
  request: Request,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  if (!/^application\/json(?:\s*;|$)/iu.test(
    String(request.headers.get("content-type") || ""),
  )) {
    return json(request, 415, errorBody(
      "unsupported_media_type",
      "Player login requires an application/json request.",
    ));
  }
  const bodyResult = await readBoundedBody(request, MAX_LOGIN_BODY_BYTES);
  if (bodyResult.ok === false) return bodyResult.response;
  const clientIp = trustedClientIp(request);
  if (!clientIp) {
    return json(request, 400, errorBody(
      "trusted_client_ip_unavailable",
      "Trusted client network metadata is unavailable.",
    ));
  }

  const upstream = await fetch(
    `${supabaseUrl}/functions/v1/player-api/players/login`,
    {
      method: "POST",
      headers: upstreamHeaders(
        request,
        publishableKey,
        clientIp,
        true,
      ),
      body: ownedArrayBuffer(bodyResult.body ?? new Uint8Array()),
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);
  if (!upstream) {
    return json(request, 502, errorBody(
      "player_login_unavailable",
      "Player sign-in is unavailable.",
      true,
    ));
  }
  const loginBytes = await readBoundedResponse(request, upstream);
  if (loginBytes.ok === false) return loginBytes.response;
  const login = parseJsonBytes<PlayerLoginBody>(loginBytes.body);
  if (!upstream.ok) {
    return forwardJsonResponse(request, upstream, loginBytes.body);
  }

  const token = String(login?.session?.token || "");
  const expiresAt = String(login?.session?.expiresAt || "");
  if (
    login?.ok !== true ||
    !token ||
    !expiresAt ||
    !isSafePlayer(login.player) ||
    !isSafeGame(login.gameSession)
  ) {
    if (token) {
      await revokeUpstreamSession(
        supabaseUrl,
        publishableKey,
        token,
        request,
        clientIp,
      );
    }
    return json(request, 502, errorBody(
      "player_login_response_invalid",
      "Player sign-in returned an invalid session.",
    ));
  }

  const bootstrap = await loadPlayerBootstrap(
    supabaseUrl,
    publishableKey,
    token,
    request,
    clientIp,
  );
  if (!bootstrap.ok) {
    await revokeUpstreamSession(
      supabaseUrl,
      publishableKey,
      token,
      request,
      clientIp,
    );
    return json(request, 502, errorBody(
      "player_session_bootstrap_failed",
      "The Player session could not be loaded.",
      true,
    ));
  }

  const payload = createWebPlayerSessionPayload({
    sessionToken: token,
    sessionExpiresAt: String(bootstrap.body.session?.expiresAt || expiresAt),
    csrfToken: randomWebPlayerCsrfToken(),
    player: bootstrap.body.player,
    gameSession: bootstrap.body.gameSession,
  });

  return playerSessionJson(
    request,
    200,
    publicPlayerSessionBody(payload, bootstrap.body),
    payload,
    key,
  );
}


export async function handleStatus(
  request: Request,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  const resolved = await resolveSession(request, key);
  if (resolved.ok === false) {
    return clearPlayerSessionResponse(request, 401, resolved.code);
  }
  const clientIp = trustedClientIp(request);
  if (!clientIp) {
    return json(request, 400, errorBody(
      "trusted_client_ip_unavailable",
      "Trusted client network metadata is unavailable.",
    ));
  }
  const bootstrap = await loadPlayerBootstrap(
    supabaseUrl,
    publishableKey,
    resolved.payload.sessionToken,
    request,
    clientIp,
  );
  if (!bootstrap.ok) {
    if (bootstrap.status === 401) {
      return clearPlayerSessionResponse(request, 401, "player_session_invalid");
    }
    const response = json(request, bootstrap.status, errorBody(
      "player_session_bootstrap_failed",
      "The Player session could not be loaded.",
      bootstrap.status === 429 || bootstrap.status >= 500,
    ));
    if (bootstrap.retryAfter) response.headers.set("Retry-After", bootstrap.retryAfter);
    return response;
  }
  return playerSessionJson(
    request,
    200,
    publicPlayerSessionBody(resolved.payload, bootstrap.body),
    resolved.payload,
    key,
    false,
  );
}


export async function handleLogout(
  request: Request,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  const resolved = await resolveSession(request, key);
  if (resolved.ok === false) {
    return clearPlayerSessionResponse(request, 200, "signed_out", { ok: true });
  }
  const suppliedCsrf = String(request.headers.get(CSRF_HEADER) || "");
  if (!constantTimePlayerTextEqual(suppliedCsrf, resolved.payload.csrfToken)) {
    return json(request, 403, errorBody(
      "csrf_validation_failed",
      "Player request verification failed.",
    ));
  }
  const clientIp = trustedClientIp(request);
  const revoked = clientIp
    ? await revokeUpstreamSession(
      supabaseUrl,
      publishableKey,
      resolved.payload.sessionToken,
      request,
      clientIp,
    )
    : false;
  if (!revoked) {
    return clearPlayerSessionResponse(
      request,
      502,
      "player_session_revocation_failed",
      errorBody(
        "player_session_revocation_failed",
        "The local Player session was closed, but server revocation could not be confirmed.",
        true,
      ),
    );
  }
  return clearPlayerSessionResponse(request, 200, "signed_out", { ok: true });
}


export async function handleProxy(
  request: Request,
  suffix: string,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  if (!validProxyPath(suffix)) {
    return json(request, 400, errorBody(
      "invalid_proxy_path",
      "Player proxy path is invalid.",
    ));
  }
  const resolved = await resolveSession(request, key);
  if (resolved.ok === false) {
    return clearPlayerSessionResponse(request, 401, resolved.code);
  }
  const isMutation = !["GET", "HEAD"].includes(request.method.toUpperCase());
  if (isMutation) {
    const suppliedCsrf = String(request.headers.get(CSRF_HEADER) || "");
    if (!constantTimePlayerTextEqual(suppliedCsrf, resolved.payload.csrfToken)) {
      return json(request, 403, errorBody(
        "csrf_validation_failed",
        "Player request verification failed.",
      ));
    }
  }
  const clientIp = trustedClientIp(request);
  if (!clientIp) {
    return json(request, 400, errorBody(
      "trusted_client_ip_unavailable",
      "Trusted client network metadata is unavailable.",
    ));
  }
  const bodyResult = await readBoundedBody(request, MAX_BODY_BYTES);
  if (bodyResult.ok === false) return bodyResult.response;
  const headers = upstreamHeaders(
    request,
    publishableKey,
    clientIp,
    Boolean(bodyResult.body),
    resolved.payload.sessionToken,
  );
  const recovered = await recoverRetiredPlayerRead(request.method, async () => {
    const upstream = await fetch(
      `${supabaseUrl}/functions/v1/player-api${suffix}${new URL(request.url).search}`,
      {
        method: request.method,
        headers,
        body: bodyResult.body ? ownedArrayBuffer(bodyResult.body) : undefined,
        cache: "no-store",
        redirect: "manual",
      },
    ).catch(() => null);
    const responseBody = upstream ? await readBoundedResponse(request, upstream) : null;
    return {
      upstream,
      responseBody,
      status: upstream?.status ?? 0,
      body: responseBody?.ok ? responseBody.body : new Uint8Array(),
    };
  });
  const { upstream, responseBody } = recovered;
  if (!upstream) {
    return json(request, 502, errorBody(
      "player_service_unavailable",
      "The Player service is unavailable.",
      true,
    ));
  }
  if (!responseBody) throw new Error("Missing Player upstream response body.");
  if (responseBody.ok === false) return responseBody.response;
  if (upstream.status === 401) {
    return clearPlayerSessionResponse(
      request,
      401,
      "player_session_invalid",
      parseJsonBytes(responseBody.body) ?? errorBody(
        "player_session_invalid",
        "Player sign-in is required.",
      ),
    );
  }
  return forwardResponse(request, upstream, responseBody.body);
}
