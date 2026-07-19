/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type PlayerRequestScope,
  resolvePlayerRequestScope,
} from "../../players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  PLAYER_BANKING_CURSOR_PATTERN,
  PlayerBankingPublicError,
  type PlayerBankingPublicRepository,
} from "../contracts/playerBankingPublicContracts.ts";
import { SupabasePlayerBankingPublicRepository } from "../infrastructure/supabasePlayerBankingPublicRepository.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FRESHNESS_MS = 120_000;
const FORBIDDEN_SCOPE_HEADERS = [
  "x-econovaria-game-id",
  "x-econovaria-game-session-id",
  "x-game-session-id",
  "x-player-id",
  "x-player-session-id",
  "x-player-uuid",
] as const;

export interface PlayerBankingPublicHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
  ) => Promise<Pick<PlayerRequestScope, "gameId" | "playerUuid">>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerBankingPublicRepository;
  readonly now?: () => string;
}

export async function handlePlayerBankingPublicRequest(
  request: Request,
  dependencies: PlayerBankingPublicHttpHandlerDependencies,
): Promise<Response> {
  try {
    if (request.method !== "GET") {
      throw new PlayerBankingPublicError(
        "method_not_allowed",
        "Use GET to load Player Banking activity.",
        405,
        false,
      );
    }

    const url = new URL(request.url);
    validateRequestEnvelope(request, url);
    await requireEmptyBody(request);
    const limit = readLimit(url.searchParams.get("limit"));
    const offset = readOffset(url.searchParams.get("cursor"));

    const environment = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!environment.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const client = dependencies.createServiceClient(environment.value);
    const scope = await (dependencies.resolveScope ?? defaultResolveScope)(
      request,
      client,
    );
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerBankingPublicRepository(client as never);
    const page = await repository.readPage({
      gameSessionId: scope.gameId,
      playerId: scope.playerUuid,
      limit,
      offset,
    });
    const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
    const generatedTimestamp = Date.parse(generatedAt);
    if (!Number.isFinite(generatedTimestamp)) {
      throw new Error("Player Banking generatedAt is invalid.");
    }

    const ledgerEntries = page.entries.map((entry, index) => ({
      entryKey: `ledger_${offset + index + 1}`,
      ...entry,
    }));
    const nextOffset = offset + ledgerEntries.length;

    return privateJsonResponse(200, {
      ok: true,
      generatedAt,
      staleAt: new Date(generatedTimestamp + FRESHNESS_MS).toISOString(),
      currentBalances: page.balances,
      ledgerEntries,
      pagination: {
        limit,
        hasMore: page.hasMore,
        nextCursor: page.hasMore ? `offset_${nextOffset}` : null,
      },
    });
  } catch (error) {
    if (error instanceof PlayerBankingPublicError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return jsonError(500, {
      code: "player_banking_read_failed",
      message: "Player Banking activity could not be loaded.",
      retryable: false,
    });
  }
}

function defaultResolveScope(
  request: Request,
  client: EdgeSupabaseClient,
): Promise<PlayerRequestScope> {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (sessionTokenHash) =>
      resolveActivePlayerSession(client, sessionTokenHash),
  });
}

function validateRequestEnvelope(request: Request, url: URL): void {
  const allowed = new Set(["limit", "cursor"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw invalidRequest(`Player Banking does not accept query parameter: ${key}.`);
    }
    if (url.searchParams.getAll(key).length !== 1) {
      throw invalidRequest(`Player Banking query parameter ${key} may appear once.`);
    }
  }
  if (FORBIDDEN_SCOPE_HEADERS.some((name) => request.headers.has(name))) {
    throw invalidRequest(
      "Player Banking ownership is derived from x-player-session-token.",
    );
  }
}

async function requireEmptyBody(request: Request): Promise<void> {
  if ((await request.text()).trim()) {
    throw invalidRequest("Player Banking reads do not accept a request body.");
  }
}

function readLimit(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_LIMIT;
  if (!/^\d+$/u.test(value.trim())) {
    throw invalidRequest("limit must be an integer from 1 through 100.");
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw invalidRequest("limit must be an integer from 1 through 100.");
  }
  return limit;
}

function readOffset(value: string | null): number {
  if (value === null || value.trim() === "") return 0;
  const cursor = value.trim().toLowerCase();
  if (!PLAYER_BANKING_CURSOR_PATTERN.test(cursor)) {
    throw invalidRequest("cursor is invalid.");
  }
  return Number(cursor.slice("offset_".length));
}

function invalidRequest(message: string): PlayerBankingPublicError {
  return new PlayerBankingPublicError(
    "invalid_player_banking_request",
    message,
    400,
    false,
  );
}

function privateJsonResponse<T>(status: number, body: T): Response {
  const response = jsonResponse(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
