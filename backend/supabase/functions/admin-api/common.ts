import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs";
import { normalizeContractReview } from "./mutationAdapters.ts";
import { issueContractRewardsAtomically } from "./contractRewards.ts";
import { handleAttendancePlayerOperation } from "./attendancePlayerOperations.ts";
import { corsHeaders } from "./cors.ts";
import {
  bindGatewayTrustedClientIp,
} from "../../../src/security/edgeGatewayClientIp.ts";
import {
  readTrustedClientIp,
  TRUSTED_IP_HEADERS,
  type TrustedIpHeader,
} from "../../../src/security/rateLimitKeying.ts";
import { discoverAdminOwnedGameIdentities } from "./adminBootstrapComposition.ts";

export { corsHeaders };

function environmentValue(name: string): string {
  try {
    return Deno.env.get(name) || "";
  } catch {
    return "";
  }
}

export const SUPABASE_URL = environmentValue("SUPABASE_URL");
export const SUPABASE_ANON_KEY = environmentValue("SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = environmentValue(
  "SUPABASE_SERVICE_ROLE_KEY",
);
export const CLASSROOM_API_URL = `${SUPABASE_URL}/functions/v1/classroom-api`;

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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

type AuthUserLookupClient = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id?: string } | null };
      error: unknown;
    }>;
  };
};

type PostgrestQueryResult<T> = {
  data: T;
  error: unknown;
};

type StaffIdentityRow = {
  id: string;
};

export async function resolveContext(request) {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "Administrator sign-in is required.",
    };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userResult = await (authClient as unknown as AuthUserLookupClient).auth
    .getUser(token);
  const user = userResult.data?.user;
  if (userResult.error || !user?.id) {
    return {
      ok: false,
      status: 401,
      message: "Administrator session is invalid or expired.",
    };
  }

  const staffQuery = service
    .from("staff_users")
    .select("id")
    .eq("supabase_auth_user_id", user.id)
    .maybeSingle();
  const staffResult = await (
    staffQuery as unknown as Promise<
      PostgrestQueryResult<StaffIdentityRow | null>
    >
  );
  if (staffResult.error || !staffResult.data) {
    return {
      ok: false,
      status: 403,
      message: "This account is not registered as staff.",
    };
  }

  let games;
  try {
    games = await discoverAdminOwnedGameIdentities(
      service,
      staffResult.data.id,
    );
  } catch {
    return {
      ok: false,
      status: 500,
      message: "Administrator games could not be loaded.",
    };
  }

  return {
    ok: true,
    token,
    user,
    staff: staffResult.data,
    games,
    service,
  };
}

export function gameDto(game) {
  const gameCode = text(game.game_join_code);
  return {
    id: game.id,
    gameId: game.id,
    name: game.name,
    status: game.status,
    joinCodeStatus: game.game_join_code_status || "unknown",
    joinCode: gameCode,
    gameCode,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
}

export function selectGame(context, request, fallbackId = "") {
  const requested = fallbackId || request.headers.get("x-econovaria-game-id") ||
    "";
  return context.games.find((game) => String(game.id) === String(requested)) ||
    context.games.find((game) => game.status === "active") ||
    context.games[0] || null;
}

export function ensureOwnedGame(context, gameId) {
  return context.games.find((game) => String(game.id) === String(gameId)) ||
    null;
}

function gameSessionIdFromPath(path) {
  const gameMatch = String(path).match(/^\/games\/([^/]+)/);
  if (gameMatch) return decodeURIComponent(gameMatch[1]);
  const staffMatch = String(path).match(/^\/staff\/game-sessions\/([^/]+)/);
  return staffMatch ? decodeURIComponent(staffMatch[1]) : "";
}

export function isAdminLocalMutationProxyPath(path, method) {
  const normalizedMethod = String(method).toUpperCase();
  const normalizedPath = String(path).replace(/\/+$/, "");
  const scopedPath = normalizedPath.match(
    /^\/(?:games\/[^/]+|staff\/game-sessions\/[^/]+)(\/.*)$/,
  )?.[1] || "";
  if (!scopedPath) return false;
  if (["GET", "HEAD"].includes(normalizedMethod)) {
    return normalizedMethod === "GET" && scopedPath === "/join-code/reset";
  }

  if (normalizedMethod === "POST") {
    if (
      [
        "/players",
        "/attendance/scan",
        "/attendance/scans",
        "/attendance/corrections",
        "/store/items",
        "/contracts",
        "/join-code/reset",
      ].includes(scopedPath)
    ) return true;
    if (/^\/players\/[^/]+\/archive$/.test(scopedPath)) return true;
    if (
      /^\/store\/items\/[^/]+\/(?:status|restock|rebalance-price)$/.test(
        scopedPath,
      )
    ) return true;
    if (
      /^\/contracts\/[^/]+\/(?:publish|archive|duplicate)$/.test(scopedPath)
    ) return true;
    if (/^\/settings\/[^/]+\/reset$/.test(scopedPath)) return true;
  }

  if (
    normalizedMethod === "DELETE" && /^\/players\/[^/]+$/.test(scopedPath)
  ) return true;
  if (
    ["PATCH", "PUT", "DELETE"].includes(normalizedMethod) &&
    /^\/store\/items\/[^/]+$/.test(scopedPath)
  ) return true;
  if (
    normalizedMethod === "PATCH" && /^\/contracts\/[^/]+$/.test(scopedPath)
  ) return true;
  if (
    ["PATCH", "PUT"].includes(normalizedMethod) &&
    /^\/store\/items\/[^/]+\/status$/.test(scopedPath)
  ) return true;
  return ["POST", "PATCH", "PUT"].includes(normalizedMethod) &&
    (/^\/settings$/.test(scopedPath) || /^\/settings\/[^/]+$/.test(scopedPath));
}

function isContractReviewPath(path, method) {
  return method === "POST" &&
    /^\/staff\/game-sessions\/[^/]+\/contracts\/[^/]+\/progress\/[^/]+\/review$/
      .test(String(path));
}

function isLegacyContractDecisionRequest(request) {
  try {
    return /\/games\/[^/]+\/contract-submissions\/[^/]+\/decision$/.test(
      new URL(request.url).pathname,
    );
  } catch {
    return false;
  }
}

function contractRewardPathFromReview(path) {
  const match = String(path).match(
    /^\/staff\/game-sessions\/([^/]+)\/contracts\/([^/]+)\/progress\/([^/]+)\/review$/,
  );
  if (!match) return "";
  return `/staff/game-sessions/${match[1]}/contracts/${match[2]}/progress/${
    match[3]
  }/rewards/issue`;
}

function atomicContractRewardPath(path, method) {
  if (method !== "POST") return null;
  const match = String(path).match(
    /^\/staff\/game-sessions\/([^/]+)\/contracts\/([^/]+)\/progress\/([^/]+)\/rewards\/issue$/,
  );
  if (!match) return null;
  return {
    gameSessionId: decodeURIComponent(match[1]),
    contractId: decodeURIComponent(match[2]),
    progressId: decodeURIComponent(match[3]),
  };
}

function classroomTrustedClientIp(request) {
  const configuredHeader = environmentValue(
    "ECONOVARIA_TRUSTED_CLIENT_IP_HEADER",
  )
    .trim().toLowerCase();
  if (
    configuredHeader === "x-forwarded-for" ||
    !TRUSTED_IP_HEADERS.includes(configuredHeader as TrustedIpHeader)
  ) return null;
  const trustedHeader = configuredHeader as TrustedIpHeader;
  const metadataRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
  });
  const boundRequest = bindGatewayTrustedClientIp(
    metadataRequest,
    trustedHeader,
  );
  try {
    return {
      header: trustedHeader,
      value: readTrustedClientIp(boundRequest, trustedHeader),
    };
  } catch {
    return null;
  }
}

async function fetchClassroom(request, context, path, method, body) {
  const headers = new Headers();
  headers.set("apikey", SUPABASE_ANON_KEY);
  headers.set("Authorization", `Bearer ${context.token}`);
  const idempotencyKey = request.headers.get("idempotency-key") ||
    request.headers.get("x-idempotency-key") || "";
  headers.set(
    "X-Request-Id",
    request.headers.get("x-request-id") ||
      idempotencyKey ||
      crypto.randomUUID(),
  );
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const trustedClient = classroomTrustedClientIp(request);
  if (trustedClient) headers.set(trustedClient.header, trustedClient.value);
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
      "Content-Type": response.headers.get("content-type") ||
        "application/json",
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
  if (isAdminLocalMutationProxyPath(path, method)) {
    throw new Error("ADMIN_LOCAL_MUTATION_PROXY_FORBIDDEN");
  }

  if (!["GET", "HEAD"].includes(method) && overrideBody === undefined) {
    const operationBody = object(
      await request.clone().json().catch(() => ({})),
    );
    const operationInput = {
      gameSessionId: gameSessionIdFromPath(path),
      staffUserId: context.staff.id,
      path,
      method,
      body: operationBody,
    };
    const attendancePlayer = await handleAttendancePlayerOperation(
      context.service,
      operationInput,
    );
    if (attendancePlayer.handled) {
      return json(request, attendancePlayer.status, attendancePlayer.body);
    }
  }

  const rewardRoute = atomicContractRewardPath(path, method);
  if (rewardRoute) {
    const result = await issueContractRewardsAtomically(context.service, {
      ...rewardRoute,
      staffUserId: context.staff.id,
      requestId: request.headers.get("x-request-id") ||
        request.headers.get("idempotency-key") ||
        request.headers.get("x-idempotency-key") ||
        crypto.randomUUID(),
    });
    if (!result.ok) {
      return json(request, result.status, { error: result.error });
    }
    return json(request, result.status, result.body);
  }

  if (isContractReviewPath(path, method) && overrideBody === undefined) {
    const body = await normalizeContractReview(request);
    const reviewResponse = await fetchClassroom(
      request,
      context,
      path,
      "POST",
      body,
    );

    if (
      !reviewResponse.ok ||
      body.action !== "approve" ||
      !isLegacyContractDecisionRequest(request)
    ) {
      return reviewResponse;
    }

    const rewardPath = contractRewardPathFromReview(path);
    if (!rewardPath) return reviewResponse;

    const rewardResponse = await proxyClassroom(
      request,
      context,
      rewardPath,
      "POST",
      {},
    );
    if (!rewardResponse.ok) return rewardResponse;

    const reviewBody = object(
      await reviewResponse.clone().json().catch(() => ({})),
    );
    const rewardBody = object(
      await rewardResponse.clone().json().catch(() => ({})),
    );

    return json(request, 200, {
      data: {
        reviewed: true,
        rewardIssued: rewardBody.rewardIssued === true,
        alreadyIssued: rewardBody.alreadyIssued === true,
        progress: rewardBody.progress || reviewBody.progress || null,
        rewardResult: rewardBody.rewardResult || {},
      },
      review: reviewBody,
      reward: rewardBody,
    });
  }

  const body = ["GET", "HEAD"].includes(method)
    ? undefined
    : overrideBody !== undefined
    ? overrideBody
    : await request.clone().json().catch(() => ({}));

  return fetchClassroom(request, context, path, method, body);
}
