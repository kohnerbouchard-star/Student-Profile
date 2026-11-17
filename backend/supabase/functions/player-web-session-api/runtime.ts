import {
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
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
  routePath,
  preflightResponse,
  json,
  requireAllowedOrigin,
  withCors,
  serviceUnavailable,
  methodNotAllowed,
  errorBody,
} from "./playerSessionHttp.ts";
import {
  handleLogin,
  handleStatus,
  handleLogout,
  handleProxy,
} from "./playerSessionActions.ts";


Deno.serve(async (request: Request) => {
  const route = routePath(new URL(request.url).pathname);

  if (request.method === "OPTIONS") return preflightResponse(request);
  if (route === "/health" && request.method === "GET") {
    return json(request, 200, {
      ok: true,
      service: "player-web-session-api",
      status: "ready",
    });
  }

  const originFailure = requireAllowedOrigin(request);
  if (originFailure) return originFailure;
  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return withCors(request, publishableFailure);

  const env = readEdgeSupabaseEnv();
  if (!env.ok) return serviceUnavailable(request);

  let key: Uint8Array;
  try {
    key = readWebPlayerSessionKey();
  } catch {
    return serviceUnavailable(request);
  }

  try {
    if (route === "/login") {
      return request.method === "POST"
        ? handleLogin(
          request,
          key,
          env.value.supabaseUrl,
          env.value.supabaseAnonKey,
        )
        : methodNotAllowed(request, "POST");
    }
    if (route === "/status") {
      return request.method === "GET"
        ? handleStatus(
          request,
          key,
          env.value.supabaseUrl,
          env.value.supabaseAnonKey,
        )
        : methodNotAllowed(request, "GET");
    }
    if (route === "/logout") {
      return request.method === "POST"
        ? handleLogout(
          request,
          key,
          env.value.supabaseUrl,
          env.value.supabaseAnonKey,
        )
        : methodNotAllowed(request, "POST");
    }
    if (route.startsWith("/proxy/")) {
      return handleProxy(
        request,
        route.slice("/proxy".length),
        key,
        env.value.supabaseUrl,
        env.value.supabaseAnonKey,
      );
    }
    return json(request, 404, errorBody(
      "route_not_found",
      "Player web-session route was not found.",
    ));
  } catch {
    return json(request, 500, errorBody(
      "player_web_session_failed",
      "Player web-session processing failed.",
    ));
  }
});
