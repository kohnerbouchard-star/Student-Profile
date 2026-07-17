/// <reference lib="dom" />

import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import {
  readRequestedGameSessionId,
  rejectClientSuppliedPlayerIdentity,
  requireMatchingPlayerGameSession,
} from "../../players/api/playerRequestScope.ts";
import type {
  PlayerInventoryItemDto,
  PlayerInventoryRecord,
  PlayerInventoryRedemptionDto,
  PlayerInventoryResponseBody,
  PlayerInventoryValueSummaryDto,
} from "../contracts/playerInventoryContracts.ts";
import type { PlayerInventoryRepository } from "../infrastructure/playerInventoryRepository.ts";
import {
  PlayerInventoryPersistenceError,
  SupabasePlayerInventoryRepository,
} from "../infrastructure/supabasePlayerInventoryRepository.ts";
import {
  handlePlayerInventoryRedemptionRequest,
} from "./inventoryRedemptionHttpHandlers.ts";
import {
  readInventoryRedemptionRoutePath,
} from "./inventoryRedemptionRoutePaths.ts";

export type PlayerInventoryRedemptionReader = (
  client: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
) => Promise<readonly PlayerInventoryRedemptionDto[]>;

export interface PlayerInventoryHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: typeof resolveActivePlayerSession;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerInventoryRepository;
  readonly readRedemptionRequests?: PlayerInventoryRedemptionReader;
  readonly now?: () => string;
}

interface RedemptionRow {
  readonly id: string;
  readonly inventory_holding_id: string;
  readonly store_item_id: string;
  readonly quantity: number | string;
  readonly status: string;
  readonly request_note: string | null;
  readonly resolution_note: string | null;
  readonly requested_at: string;
  readonly reviewed_at: string | null;
  readonly fulfilled_at: string | null;
  readonly updated_at: string;
}

export async function handlePlayerInventoryRequest(
  request: Request,
  dependencies: PlayerInventoryHttpHandlerDependencies,
): Promise<Response> {
  const redemptionRoute = readInventoryRedemptionRoutePath(
    new URL(request.url).pathname,
  );
  if (redemptionRoute?.kind === "player_request") {
    return handlePlayerInventoryRedemptionRequest(
      request,
      redemptionRoute.inventoryHoldingId,
      dependencies,
    );
  }

  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player inventory.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player inventory requests must not send a runner secret.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    rejectClientSuppliedPlayerIdentity(request);
    const requestedGameSessionId = readRequestedGameSessionId(request);
    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    requireMatchingPlayerGameSession(
      requestedGameSessionId,
      sessionResult.session.game_session_id,
    );

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabasePlayerInventoryRepository(serviceClient as never);
    const [records, redemptionRequests] = await Promise.all([
      repository.readPlayerInventory({
        gameSessionId: sessionResult.session.game_session_id,
        playerId: sessionResult.session.player_id,
      }),
      (dependencies.readRedemptionRequests ?? readPlayerRedemptionRequests)(
        serviceClient,
        sessionResult.session.game_session_id,
        sessionResult.session.player_id,
      ),
    ]);

    if (
      records.some((record) =>
        record.gameSessionId !== sessionResult.session.game_session_id ||
        record.playerId !== sessionResult.session.player_id
      )
    ) {
      return jsonError(500, {
        code: "player_inventory_scope_violation",
        message: "Player inventory could not be loaded.",
        retryable: false,
      });
    }

    const items = records.map(toPlayerInventoryItemDto);

    return jsonResponse<PlayerInventoryResponseBody>(200, {
      ok: true,
      gameSession: {
        id: sessionResult.gameSession.id,
        name: sessionResult.gameSession.name,
        status: sessionResult.gameSession.status,
      },
      player: {
        id: sessionResult.player.id,
        displayName: sessionResult.player.display_name,
        rosterLabel: sessionResult.player.roster_label ?? null,
        status: sessionResult.player.status,
      },
      generatedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
      capacity: null,
      categories: [
        "All",
        ...new Set(
          items
            .map((item) => item.category)
            .filter((category) => category !== "All")
            .sort((a, b) => a.localeCompare(b)),
        ),
      ],
      summary: buildSummary(items),
      redemptionRequests,
      items,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    if (error instanceof PlayerInventoryPersistenceError) {
      return jsonError(500, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    return jsonError(500, {
      code: "player_inventory_read_failed",
      message: "Player inventory could not be loaded.",
      retryable: false,
    });
  }
}

function toPlayerInventoryItemDto(
  record: PlayerInventoryRecord,
): PlayerInventoryItemDto {
  const quantityAvailable = record.quantityOwned - record.quantityReserved;

  if (quantityAvailable < 0) {
    throw new PlayerInventoryPersistenceError(
      "player_inventory_invalid_quantity",
      "Player inventory could not be loaded.",
    );
  }

  const redeemable = quantityAvailable > 0 &&
    record.itemStatus === "active" &&
    record.itemVisibility === "visible";

  return {
    id: record.id,
    storeItemId: record.storeItemId,
    itemKey: record.itemKey,
    name: record.name,
    description: record.description,
    category: record.category,
    quantityOwned: record.quantityOwned,
    quantityReserved: record.quantityReserved,
    quantityAvailable,
    unitValue: record.unitValue,
    totalOwnedValue: roundMoney(record.unitValue * record.quantityOwned),
    currencyCode: record.currencyCode,
    itemStatus: record.itemStatus,
    itemVisibility: record.itemVisibility,
    availableActions: redeemable ? ["inventory.use"] : [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function readPlayerRedemptionRequests(
  client: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
): Promise<readonly PlayerInventoryRedemptionDto[]> {
  const response = await client.from("inventory_redemption_requests")
    .select([
      "id",
      "inventory_holding_id",
      "store_item_id",
      "quantity",
      "status",
      "request_note",
      "resolution_note",
      "requested_at",
      "reviewed_at",
      "fulfilled_at",
      "updated_at",
    ].join(","))
    .eq("game_session_id", gameSessionId)
    .eq("player_id", playerId)
    .order("requested_at", { ascending: false })
    .limit(50);

  if (response.error) {
    throw new PlayerInventoryPersistenceError(
      "player_inventory_redemptions_read_failed",
      "Inventory redemption history could not be loaded.",
    );
  }

  return ((response.data ?? []) as unknown as readonly RedemptionRow[]).map(
    (row) => ({
      id: row.id,
      inventoryHoldingId: row.inventory_holding_id,
      storeItemId: row.store_item_id,
      quantity: Number(row.quantity),
      status: row.status,
      requestNote: row.request_note ?? null,
      resolutionNote: row.resolution_note ?? null,
      requestedAt: row.requested_at,
      reviewedAt: row.reviewed_at ?? null,
      fulfilledAt: row.fulfilled_at ?? null,
      updatedAt: row.updated_at,
    }),
  );
}

function buildSummary(
  items: readonly PlayerInventoryItemDto[],
): PlayerInventoryResponseBody["summary"] {
  const values = new Map<string, number>();

  for (const item of items) {
    values.set(
      item.currencyCode,
      roundMoney(
        (values.get(item.currencyCode) ?? 0) + item.totalOwnedValue,
      ),
    );
  }

  const valueSummary: PlayerInventoryValueSummaryDto[] = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, totalOwnedValue]) => ({
      currencyCode,
      totalOwnedValue,
    }));

  return {
    itemTypes: items.length,
    quantityOwned: sum(items, (item) => item.quantityOwned),
    quantityReserved: sum(items, (item) => item.quantityReserved),
    quantityAvailable: sum(items, (item) => item.quantityAvailable),
    values: valueSummary,
  };
}

function sum<T>(
  values: readonly T[],
  readValue: (value: T) => number,
): number {
  return values.reduce((total, value) => total + readValue(value), 0);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
