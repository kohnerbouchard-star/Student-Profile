import type {
  PlayerMarketplaceFundedOrderDto,
  PlayerMarketplaceFundedReservationDto,
  PlayerMarketplaceFundingRepository,
  PlayerMarketplaceFundingScope,
} from "../contracts/playerMarketplaceFundingContracts.ts";
import { PlayerMarketplaceError } from "../contracts/playerMarketplaceContracts.ts";
import {
  mapMarketplaceFundingRpcError,
  parseMarketplaceFundingOrder,
  parseMarketplaceFundingQuote,
} from "./playerMarketplaceFundingResponse.ts";

const UUID_EXACT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface MarketplaceFundingRpcClient {
  rpc<T>(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: T | null;
    error: { code?: string; message?: string } | null;
  }>;
}

export class SupabasePlayerMarketplaceFundingRepository
  implements PlayerMarketplaceFundingRepository {
  constructor(private readonly client: MarketplaceFundingRpcClient) {}

  async createQuote(
    input: Parameters<PlayerMarketplaceFundingRepository["createQuote"]>[0],
  ): Promise<PlayerMarketplaceFundedReservationDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "create_marketplace_funding_quote_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_buyer_player_id: scope.playerId,
        p_listing_key: input.listingKey,
        p_quantity: input.quantity,
        p_expected_version: input.expectedVersion,
        p_allocations: input.allocations,
        p_idempotency_key: input.idempotencyKey,
        p_effective_at: input.effectiveAt,
      },
      "quote",
    );
    return parseMarketplaceFundingQuote(raw);
  }

  async settle(
    input: Parameters<PlayerMarketplaceFundingRepository["settle"]>[0],
  ): Promise<PlayerMarketplaceFundedOrderDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "settle_marketplace_funding_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_buyer_player_id: scope.playerId,
        p_reservation_key: input.reservationKey,
        p_idempotency_key: input.idempotencyKey,
        p_client_submitted_at: input.clientSubmittedAt,
      },
      "settlement",
    );
    return parseMarketplaceFundingOrder(raw);
  }

  private async callRpc(
    functionName: string,
    args: Record<string, unknown>,
    phase: "quote" | "settlement",
  ): Promise<unknown> {
    const response = await this.client.rpc<unknown>(functionName, args);
    if (response.error) {
      throw mapMarketplaceFundingRpcError(response.error, phase);
    }
    if (response.data === null || response.data === undefined) {
      throw new PlayerMarketplaceError(
        "player_marketplace_service_unavailable",
        "Marketplace funding returned no public result.",
        500,
        false,
      );
    }
    return response.data;
  }
}

function normalizeScope(
  input: PlayerMarketplaceFundingScope,
): PlayerMarketplaceFundingScope {
  const gameSessionId = String(input.gameSessionId ?? "").trim().toLowerCase();
  const playerId = String(input.playerId ?? "").trim().toLowerCase();
  if (!UUID_EXACT.test(gameSessionId) || !UUID_EXACT.test(playerId)) {
    throw new PlayerMarketplaceError(
      "player_marketplace_service_unavailable",
      "Marketplace funding scope is invalid.",
      500,
      false,
    );
  }
  return Object.freeze({ gameSessionId, playerId });
}
