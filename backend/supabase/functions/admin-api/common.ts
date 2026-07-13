import { createClient } from "npm:@supabase/supabase-js@2";
import {
  applyDifficultyPolicy,
  normalizeSettingsMutation,
  normalizeStoreMutation,
} from "./mutationAdapters.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
export const CLASSROOM_API_URL = `${SUPABASE_URL}/functions/v1/classroom-api`;

const ALLOWED_ORIGINS = new Set([
  "https://kohnerbouchard-star.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://[::]:4173",
]);

export function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://kohnerbouchard-star.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-econovaria-game-id, x-client-info, x-csrf-token, x-idempotency-key, x-econovaria-admin-action, x-requested-with, if-match, x-request-id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function readJson(request) {
  try {
    return object(await request.json());
  } catch {
    return {};
  }
}

export function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function bearerToken(request) {
  return String(request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

export async function resolveContext(request) {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, message: "Administrator sign-in is required." };

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userResult = await authClient.auth.getUser(token);
  const user = userResult.data?.user;
  if (userResult.error || !user?.id) {
    return { ok: false, status: 401, message: "Administrator session is invalid or expired." };
  }

  const staffResult = await service
    .from("staff_users")
    .select("id,supabase_auth_user_id,email,display_name,created_at,updated_at")
    .eq("supabase_auth_user_id", user.id)
    .maybeSingle();
  if (staffResult.error || !staffResult.data) {
    return { ok: false, status: 403, message: "This account is not registered as staff." };
  }

  const gamesResult = await service
    .from("game_sessions")
    .select("id,name,status,game_join_code_status,created_at,updated_at")
    .eq("owner_staff_user_id", staffResult.data.id)
    .order("created_at", { ascending: false });
  if (gamesResult.error) {
    return { ok: false, status: 500, message: "Administrator games could not be loaded." };
  }

  return { ok: true, token, user, staff: staffResult.data, games: gamesResult.data || [], service };
}

export function gameDto(game) {
  return {
    id: game.id,
    gameId: game.id,
    name: game.name,
    status: game.status,
    joinCodeStatus: game.game_join_code_status || "unknown",
    joinCode: "",
    gameCode: "",
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
}

export function selectGame(context, request, fallbackId = "") {
  const requested = fallbackId || request.headers.get("x-econovaria-game-id") || "";
  return context.games.find((game) => String(game.id) === String(requested)) ||
    context.games.find((game) => game.status === "active") || context.games[0] || null;
}

export function ensureOwnedGame(context, gameId) {
  return context.games.find((game) => String(game.id) === String(gameId)) || null;
}

function gameIdFromClassroomPath(path) {
  const match = String(path).match(/^\/games\/([^/]+)\//);
  return match ? decodeURIComponent(match[1]) : "";
}

function isStoreMutationPath(path, method) {
  return !["GET", "HEAD"].includes(method) &&
    /^\/games\/[^/]+\/store\/items(?:\/[^/]+)?$/.test(String(path));
}

function isSettingsMutationPath(path, method) {
  return !["GET", "HEAD"].includes(method) &&
    /^\/games\/[^/]+\/settings$/.test(String(path));
}

async function fetchClassroom(request, context, path, method, body) {
  const headers = new Headers();
  headers.set("apikey", SUPABASE_ANON_KEY);
  headers.set("Authorization", `Bearer ${context.token}`);
  headers.set(
    "X-Request-Id",
    request.headers.get("x-request-id") ||
      request.headers.get("x-idempotency-key") ||
      crypto.randomUUID(),
  );
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${CLASSROOM_API_URL}${path}`, {
    method,
    headers,
    body: ["GET", "HEAD"].includes(method)
      ? undefined
      : JSON.stringify(body ?? {}),
  });
  const responseText = await response.text();
  return new Response(responseText, {
    status: response.status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function proxyClassroom(
  request,
  context,
  path,
  method = request.method,
  overrideBody = undefined,
) {
  if (isStoreMutationPath(path, method) && overrideBody === undefined) {
    const normalized = await normalizeStoreMutation(request, method);
    return fetchClassroom(request, context, path, normalized.method, normalized.body);
  }

  if (isSettingsMutationPath(path, method) && overrideBody === undefined) {
    const gameId = gameIdFromClassroomPath(path);
    const normalized = await normalizeSettingsMutation(request);

    let settingsResponse = null;
    if (Object.keys(normalized.gameSettings).length > 0) {
      settingsResponse = await fetchClassroom(
        request,
        context,
        path,
        "PATCH",
        normalized.gameSettings,
      );
      if (!settingsResponse.ok) return settingsResponse;
    }

    const difficultyPolicy = await applyDifficultyPolicy(
      context.service,
      gameId,
      normalized.policySettings,
    );

    if (settingsResponse) return settingsResponse;
    return json(request, 200, {
      data: {
        saved: true,
        difficultyPolicy,
      },
    });
  }

  const body = ["GET", "HEAD"].includes(method)
    ? undefined
    : overrideBody !== undefined
      ? overrideBody
      : await request.clone().json().catch(() => ({}));

  return fetchClassroom(request, context, path, method, body);
}
