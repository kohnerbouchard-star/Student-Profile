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
  createPlayerRequestApplicationContext,
  type PlayerRequestApplicationContext,
  rejectClientSuppliedBodyIdentity,
  resolvePlayerRequestScope,
} from "../../players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  PlayerBankingFxError,
  type PlayerBankingFxRepository,
  type PlayerBankingFxRoute,
} from "../contracts/playerBankingFxContracts.ts";
import { SupabasePlayerBankingFxRepository } from "../infrastructure/supabasePlayerBankingFxRepository.ts";
import {
  encodePlayerBankingFxCursor,
  type ParsedPlayerBankingFxHistoryQuery,
  type ParsedPlayerBankingFxOrdersQuery,
  parsePlayerBankingFxCancelBody,
  parsePlayerBankingFxConsumeBody,
  parsePlayerBankingFxQuery,
  parsePlayerBankingFxQuoteBody,
  playerBankingFxPagination,
  readPlayerBankingFxBody,
  validatePlayerBankingFxHeaders,
  validatePlayerBankingFxRouteAndMethod,
} from "./playerBankingFxRequestParser.ts";

export interface PlayerBankingFxHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
    body: Record<string, unknown> | null,
  ) => Promise<PlayerRequestApplicationContext>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerBankingFxRepository;
  readonly now?: () => Date;
  readonly createRequestId?: () => string;
}

export async function handlePlayerBankingFxRequest(
  request: Request,
  route: PlayerBankingFxRoute,
  dependencies: PlayerBankingFxHttpHandlerDependencies,
  applicationContext?: PlayerRequestApplicationContext,
): Promise<Response> {
  try {
    validatePlayerBankingFxRouteAndMethod(route, request.method);
    validatePlayerBankingFxHeaders(request);
    const query = parsePlayerBankingFxQuery(request, route);
    const body = await readPlayerBankingFxBody(request);
    if (body) rejectClientSuppliedBodyIdentity(body);

    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!envResult.ok) {
      throw new PlayerBankingFxError(
        "missing_edge_runtime_config",
        "Player FX runtime configuration is incomplete.",
        500,
      );
    }
    const client = dependencies.createServiceClient(envResult.value);
    const context = applicationContext ?? await (
      dependencies.resolveScope ??
        ((scopedRequest, scopedClient, scopedBody) =>
          defaultResolveScope(
            scopedRequest,
            scopedClient,
            scopedBody,
            dependencies.createRequestId,
            dependencies.now,
          ))
    )(request, client, body);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerBankingFxRepository(client);
    const scope = {
      gameSessionId: context.gameSessionId,
      playerId: context.actor.playerUuid,
    };
    const generatedAt = (dependencies.now?.() ?? new Date()).toISOString();

    switch (route.kind) {
      case "overview": {
        const overview = await repository.readOverview(scope);
        return privateJson(200, {
          ok: true,
          generatedAt,
          accounts: overview.accounts,
          balances: overview.accounts,
          currencies: overview.currencies,
          fixing: overview.fixing,
          pendingOrders: overview.pendingOrders,
          completedOrders: overview.completedOrders,
        });
      }
      case "history": {
        const historyQuery = query as ParsedPlayerBankingFxHistoryQuery;
        const page = await repository.listHistory({
          ...scope,
          ...historyQuery,
        });
        const lastPoint = page.items.at(-1);
        const nextCursor = page.hasMore && lastPoint
          ? encodePlayerBankingFxCursor(
            lastPoint.effectiveAt,
            lastPoint.fixingKey,
          )
          : null;
        return privateJson(200, {
          ok: true,
          generatedAt,
          sourceCurrencyCode: historyQuery.sourceCurrencyCode,
          targetCurrencyCode: historyQuery.targetCurrencyCode,
          range: historyQuery.range,
          points: page.items,
          pagination: playerBankingFxPagination(
            historyQuery.cursor,
            historyQuery.limit,
            nextCursor,
            page.hasMore,
          ),
        });
      }
      case "orders": {
        const ordersQuery = query as ParsedPlayerBankingFxOrdersQuery;
        const page = await repository.listOrders({ ...scope, ...ordersQuery });
        const lastOrder = page.items.at(-1);
        const nextCursor = page.hasMore && lastOrder
          ? encodePlayerBankingFxCursor(
            lastOrder.submittedAt,
            lastOrder.orderKey,
          )
          : null;
        return privateJson(200, {
          ok: true,
          generatedAt,
          status: ordersQuery.status,
          orders: page.items,
          pagination: playerBankingFxPagination(
            ordersQuery.cursor,
            ordersQuery.limit,
            nextCursor,
            page.hasMore,
          ),
        });
      }
      case "quote": {
        const command = parsePlayerBankingFxQuoteBody(body);
        const result = await repository.createQuote({ ...scope, ...command });
        return privateJson(result.outcome === "replayed" ? 200 : 201, {
          ok: true,
          outcome: result.outcome,
          quote: result.value,
        });
      }
      case "standard": {
        const command = parsePlayerBankingFxConsumeBody(body);
        const result = await repository.submitStandard({
          ...scope,
          ...command,
        });
        return privateJson(result.outcome === "replayed" ? 200 : 202, {
          ok: true,
          outcome: result.outcome,
          order: result.value,
        });
      }
      case "instant": {
        const command = parsePlayerBankingFxConsumeBody(body);
        const result = await repository.executeInstant({
          ...scope,
          ...command,
        });
        return privateJson(result.outcome === "replayed" ? 200 : 201, {
          ok: true,
          outcome: result.outcome,
          order: result.value,
        });
      }
      case "cancel": {
        const command = parsePlayerBankingFxCancelBody(body);
        const result = await repository.cancelStandard({
          ...scope,
          orderKey: route.orderKey,
          ...command,
        });
        return privateJson(200, {
          ok: true,
          outcome: result.outcome,
          order: result.value,
        });
      }
      case "malformed":
        throw invalid("Player FX route is malformed.");
    }
  } catch (error) {
    if (
      error instanceof EdgeActivationError &&
      error.code === "invalid_player_request"
    ) {
      return privateError(
        400,
        "invalid_player_banking_fx_request",
        error.message,
      );
    }
    if (
      error instanceof PlayerBankingFxError ||
      error instanceof EdgeActivationError
    ) {
      return privateError(
        error.status,
        error.code,
        error.message,
        error.retryable,
      );
    }
    return privateError(
      500,
      "player_banking_fx_request_failed",
      "The Player FX request could not be completed.",
    );
  }
}

async function defaultResolveScope(
  request: Request,
  client: EdgeSupabaseClient,
  body: Record<string, unknown> | null,
  createRequestId: (() => string) | undefined,
  now: (() => Date) | undefined,
): Promise<PlayerRequestApplicationContext> {
  return createPlayerRequestApplicationContext({
    scope: await resolvePlayerRequestScope(request, {
      hashSessionToken: sha256Hex,
      resolvePlayerSession: (sessionTokenHash) =>
        resolveActivePlayerSession(client, sessionTokenHash),
      now,
    }, { body }),
    requestId: createRequestId?.() ?? crypto.randomUUID(),
  });
}

function invalid(message: string): PlayerBankingFxError {
  return new PlayerBankingFxError(
    "invalid_player_banking_fx_request",
    message,
    400,
  );
}

function privateJson<T>(status: number, body: T): Response {
  const response = jsonResponse(status, body);
  privateHeaders(response);
  return response;
}

function privateError(
  status: number,
  code: string,
  message: string,
  retryable = false,
): Response {
  const response = jsonError(status, { code, message, retryable });
  privateHeaders(response);
  return response;
}

function privateHeaders(response: Response): void {
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("pragma", "no-cache");
  response.headers.set(
    "vary",
    "Origin, Authorization, X-Player-Session-Token, X-Econovaria-Device-Id",
  );
}
