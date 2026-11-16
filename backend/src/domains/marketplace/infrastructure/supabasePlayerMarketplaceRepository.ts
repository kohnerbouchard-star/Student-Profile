import {
  type ActivateMarketplaceListingInput,
  type CancelMarketplaceListingInput,
  type CreateMarketplaceListingInput,
  MARKETPLACE_DISPUTE_KEY_PATTERN,
  MARKETPLACE_LISTING_KEY_PATTERN,
  MARKETPLACE_ORDER_KEY_PATTERN,
  MARKETPLACE_RESERVATION_KEY_PATTERN,
  type MarketplaceCommittedResult,
  type OpenMarketplaceDisputeInput,
  PlayerMarketplaceError,
  type PlayerMarketplaceListingDto,
  type PlayerMarketplaceOrderDto,
  type PlayerMarketplaceRepository,
  type PlayerMarketplaceReservationDto,
  type PlayerMarketplaceScope,
  type PlayerMarketplaceSnapshotDto,
  type PurchaseMarketplaceListingInput,
} from "../contracts/playerMarketplaceContracts.ts";
import {
  type Client,
  DISPUTE_SELECT,
  LISTING_SELECT,
  ORDER_SELECT,
  type QueryResult,
  RESERVATION_SELECT,
  type Row,
} from "./marketplaceRepositoryRows.ts";
import {
  assertResult,
  committed,
  conflict,
  disputeDto,
  invalidRead,
  listingDto,
  lower,
  mapRpcError,
  orderDto,
  persistence,
  policyDto,
  publicId,
  reservationDto,
  text,
  token,
  unique,
  uniqueRows,
  uuid,
} from "./marketplaceRepositoryRowMapping.ts";

export class SupabasePlayerMarketplaceRepository implements PlayerMarketplaceRepository {
  constructor(private readonly client: Client) {}

  async read(scope: PlayerMarketplaceScope): Promise<PlayerMarketplaceSnapshotDto> {
    await this.expire(scope.gameId);

    const policyResult = await this.client.from("marketplace_policies").select(
      "marketplace_enabled,cross_country_trading_enabled,moderation_required,fee_rate,tax_rate,listing_duration_hours,purchase_reservation_minutes,dispute_window_days,disputes_enabled",
    ).eq("game_session_id", scope.gameId).maybeSingle();
    const listingResult = await this.client.from("marketplace_listings").select(LISTING_SELECT)
      .eq("game_session_id", scope.gameId).order("created_at", { ascending: false }).limit(250);
    const buyerReservationResult = await this.client.from("marketplace_purchase_reservations").select(RESERVATION_SELECT)
      .eq("game_session_id", scope.gameId).eq("buyer_player_id", scope.playerUuid)
      .order("created_at", { ascending: false }).limit(100);
    const buyerOrders = await this.client.from("marketplace_orders").select(ORDER_SELECT)
      .eq("game_session_id", scope.gameId).eq("buyer_player_id", scope.playerUuid)
      .order("created_at", { ascending: false }).limit(100);
    const sellerOrders = await this.client.from("marketplace_orders").select(ORDER_SELECT)
      .eq("game_session_id", scope.gameId).eq("seller_player_id", scope.playerUuid)
      .order("created_at", { ascending: false }).limit(100);

    assertResult(policyResult);
    assertResult(listingResult);
    assertResult(buyerReservationResult);
    assertResult(buyerOrders);
    assertResult(sellerOrders);

    const listingRows = listingResult.data ?? [];
    const orderRows = uniqueRows([...(buyerOrders.data ?? []), ...(sellerOrders.data ?? [])]);
    const buyerReservationRows = buyerReservationResult.data ?? [];
    const knownReservationIds = new Set(buyerReservationRows.map((row) => uuid(row.id)));
    const missingReservationIds = unique(
      orderRows.map((row) => uuid(row.reservation_id)).filter((id) => !knownReservationIds.has(id)),
    );
    const referencedReservationResult: QueryResult<Row[]> = missingReservationIds.length
      ? await this.client.from("marketplace_purchase_reservations").select(RESERVATION_SELECT)
        .eq("game_session_id", scope.gameId).in("id", missingReservationIds)
      : { data: [], error: null };
    assertResult(referencedReservationResult);
    const allReservationRows = uniqueRows([
      ...buyerReservationRows,
      ...(referencedReservationResult.data ?? []),
    ]);

    const orderIds = orderRows.map((row) => uuid(row.id));
    const disputeResult: QueryResult<Row[]> = orderIds.length
      ? await this.client.from("marketplace_disputes").select(DISPUTE_SELECT)
        .eq("game_session_id", scope.gameId).in("order_id", orderIds)
        .order("opened_at", { ascending: false }).limit(100)
      : { data: [], error: null };
    assertResult(disputeResult);

    const playerIds = unique([
      ...listingRows.map((row) => uuid(row.seller_player_id)),
      ...orderRows.flatMap((row) => [uuid(row.buyer_player_id), uuid(row.seller_player_id)]),
    ]);
    const itemKeys = unique([
      ...listingRows.map((row) => token(row.item_key, 64)),
      ...orderRows.map((row) => token(row.item_key, 64)),
    ]);
    const playersResult: QueryResult<Row[]> = playerIds.length
      ? await this.client.from("players").select("id,display_name,player_identifier,roster_label")
        .eq("game_session_id", scope.gameId).in("id", playerIds)
      : { data: [], error: null };
    const itemsResult: QueryResult<Row[]> = itemKeys.length
      ? await this.client.from("store_items").select("item_key,name,description,category")
        .eq("game_session_id", scope.gameId).in("item_key", itemKeys)
      : { data: [], error: null };
    assertResult(playersResult);
    assertResult(itemsResult);

    const players = new Map((playersResult.data ?? []).map((row) => [uuid(row.id), row]));
    const items = new Map((itemsResult.data ?? []).map((row) => [token(row.item_key, 64), row]));
    const listingByInternal = new Map<string, PlayerMarketplaceListingDto>();
    const listings = listingRows.map((row) => {
      const dto = listingDto(
        row,
        players.get(uuid(row.seller_player_id)),
        items.get(token(row.item_key, 64)),
        scope.playerUuid,
      );
      listingByInternal.set(uuid(row.id), dto);
      return dto;
    });

    const reservationByInternal = new Map<string, PlayerMarketplaceReservationDto>();
    for (const row of allReservationRows) {
      const listing = listingByInternal.get(uuid(row.listing_id));
      if (!listing) throw invalidRead();
      reservationByInternal.set(uuid(row.id), reservationDto(row, listing.id));
    }
    const reservations = buyerReservationRows.map((row) => {
      const dto = reservationByInternal.get(uuid(row.id));
      if (!dto) throw invalidRead();
      return dto;
    });

    const orderByInternal = new Map<string, PlayerMarketplaceOrderDto>();
    const orders = orderRows.map((row) => {
      const listing = listingByInternal.get(uuid(row.listing_id));
      const reservation = reservationByInternal.get(uuid(row.reservation_id));
      const itemKey = token(row.item_key, 64);
      if (!listing || !reservation) throw invalidRead();
      const dto = orderDto(
        row,
        reservation.id,
        listing.id,
        text(items.get(itemKey)?.name, 180, "Marketplace item"),
        scope.playerUuid,
      );
      orderByInternal.set(uuid(row.id), dto);
      return dto;
    });
    const disputes = (disputeResult.data ?? []).map((row) => {
      const order = orderByInternal.get(uuid(row.order_id));
      if (!order) throw invalidRead();
      return disputeDto(row, order.id);
    });

    const active = listings.filter((item) => item.status === "active" && item.quantity > 0 && !item.mine);
    return {
      policy: policyDto(policyResult.data),
      listings: active,
      myListings: listings.filter((item) => item.mine),
      reservations,
      orders,
      disputes,
      summary: {
        listingCount: active.length,
        activeSellers: new Set(active.map((item) => item.sellerReference ?? item.seller)).size,
        volume: orders.filter((item) => ["completed", "disputed", "refunded"].includes(item.status))
          .reduce((sum, item) => sum + item.total, 0),
      },
    };
  }

  async createListing(input: CreateMarketplaceListingInput): Promise<MarketplaceCommittedResult> {
    const row = await this.rpcRow("create_marketplace_listing_public_v2", {
      p_game_session_id: input.gameSessionId,
      p_seller_player_id: input.playerId,
      p_item_key: input.itemKey,
      p_quantity: input.quantity,
      p_unit_price: input.unitPrice,
      p_currency_code: input.currencyCode,
      p_condition_label: input.condition,
      p_duration_hours: input.durationHours,
      p_idempotency_key: input.idempotencyKey,
    });
    return committed(row, "listing_key", MARKETPLACE_LISTING_KEY_PATTERN);
  }

  async activateListing(input: ActivateMarketplaceListingInput): Promise<MarketplaceCommittedResult> {
    const row = await this.rpcRow("activate_marketplace_listing_public_v1", {
      p_game_session_id: input.gameSessionId,
      p_seller_player_id: input.playerId,
      p_listing_key: input.listingKey,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
    if (lower(row.outcome) === "expired") throw conflict("Listing expired before activation.");
    return committed(row, "listing_key", MARKETPLACE_LISTING_KEY_PATTERN);
  }

  async purchase(input: PurchaseMarketplaceListingInput): Promise<MarketplaceCommittedResult> {
    const reservation = await this.rpcRow("reserve_marketplace_purchase_public_v1", {
      p_game_session_id: input.gameSessionId,
      p_buyer_player_id: input.playerId,
      p_listing_key: input.listingKey,
      p_quantity: input.quantity,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
    if (lower(reservation.outcome) === "expired") {
      throw conflict("Listing expired before the purchase reservation committed.");
    }
    const reservationKey = publicId(
      reservation.reservation_key,
      MARKETPLACE_RESERVATION_KEY_PATTERN,
    );
    const settlement = await this.rpcRow("settle_marketplace_purchase_public_v1", {
      p_game_session_id: input.gameSessionId,
      p_buyer_player_id: input.playerId,
      p_reservation_key: reservationKey,
    });
    const outcome = lower(settlement.outcome);
    if (outcome === "insufficient_funds") {
      throw new PlayerMarketplaceError(
        "player_marketplace_insufficient_funds",
        "Available cash is insufficient for this purchase.",
        409,
      );
    }
    if (outcome === "released" || outcome === "reservation_lost") {
      throw conflict("The purchase reservation could not be settled.");
    }
    return committed(settlement, "order_key", MARKETPLACE_ORDER_KEY_PATTERN);
  }

  async cancel(input: CancelMarketplaceListingInput): Promise<MarketplaceCommittedResult> {
    const row = await this.rpcRow("cancel_marketplace_listing_public_v2", {
      p_game_session_id: input.gameSessionId,
      p_seller_player_id: input.playerId,
      p_listing_key: input.listingKey,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
    return committed(row, "listing_key", MARKETPLACE_LISTING_KEY_PATTERN);
  }

  async openDispute(input: OpenMarketplaceDisputeInput): Promise<MarketplaceCommittedResult> {
    const row = await this.rpcRow("open_marketplace_dispute_public_v2", {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_order_key: input.orderKey,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    });
    return committed(row, "dispute_key", MARKETPLACE_DISPUTE_KEY_PATTERN);
  }

  private async expire(gameId: string): Promise<void> {
    for (const name of [
      "expire_marketplace_purchase_reservations_v1",
      "expire_marketplace_listings_v1",
    ]) {
      const response = await this.client.rpc(name, {
        p_game_session_id: gameId,
        p_now: new Date().toISOString(),
      });
      if (response.error) throw persistence(response.error);
    }
  }

  private async rpcRow(name: string, args: Row): Promise<Row> {
    const response = await this.client.rpc(name, args);
    if (response.error) throw mapRpcError(response.error);
    const data = response.data;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object" || Array.isArray(row)) throw invalidRead();
    return row as Row;
  }
}
