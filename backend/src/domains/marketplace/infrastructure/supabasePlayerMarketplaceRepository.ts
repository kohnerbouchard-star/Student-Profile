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
  PlayerMarketplacePersistenceError,
  type PlayerMarketplaceDisputeDto,
  type PlayerMarketplaceListingDto,
  type PlayerMarketplaceOrderDto,
  type PlayerMarketplacePolicyDto,
  type PlayerMarketplaceRepository,
  type PlayerMarketplaceReservationDto,
  type PlayerMarketplaceScope,
  type PlayerMarketplaceSnapshotDto,
  type PurchaseMarketplaceListingInput,
} from "../contracts/playerMarketplaceContracts.ts";

type Row = Record<string, unknown>;
interface QueryError { readonly code?: string; readonly message: string }
interface QueryResult<T> { readonly data: T | null; readonly error: QueryError | null }
interface Filter extends PromiseLike<QueryResult<Row[]>> {
  eq(column: string, value: unknown): Filter;
  in(column: string, values: readonly unknown[]): Filter;
  order(column: string, options?: { readonly ascending?: boolean }): Filter;
  limit(value: number): Filter;
  maybeSingle(): PromiseLike<QueryResult<Row>>;
}
interface Client {
  from(table: string): { select(columns: string): Filter };
  rpc(name: string, args: Row): PromiseLike<QueryResult<Row[] | Row | number>>;
}

const LISTING_SELECT = [
  "id", "public_id", "seller_player_id", "seller_country_code", "store_item_id", "item_key",
  "quantity_initial", "quantity_available", "unit_price", "currency_code", "condition_label",
  "status", "version", "expires_at", "moderation_reason", "created_at", "updated_at",
].join(",");
const RESERVATION_SELECT = [
  "id", "public_id", "listing_id", "buyer_player_id", "quantity", "buyer_total",
  "currency_code", "status", "version", "expires_at", "release_reason", "created_at",
].join(",");
const ORDER_SELECT = [
  "id", "public_id", "reservation_id", "listing_id", "buyer_player_id", "seller_player_id",
  "item_key", "quantity", "unit_price", "subtotal", "fee_amount", "tax_amount", "buyer_total",
  "seller_proceeds", "currency_code", "status", "version", "completed_at", "refunded_at", "created_at",
].join(",");
const DISPUTE_SELECT = [
  "id", "public_id", "order_id", "opened_by_player_id", "reason", "status", "version",
  "resolution_note", "opened_at", "resolved_at",
].join(",");

export class SupabasePlayerMarketplaceRepository implements PlayerMarketplaceRepository {
  constructor(private readonly client: Client) {}

  async read(scope: PlayerMarketplaceScope): Promise<PlayerMarketplaceSnapshotDto> {
    await this.expire(scope.gameId);
    const [policyResult, listingResult, reservationResult, buyerOrders, sellerOrders, disputeResult] = await Promise.all([
      this.client.from("marketplace_policies").select(
        "marketplace_enabled,cross_country_trading_enabled,moderation_required,fee_rate,tax_rate,listing_duration_hours,purchase_reservation_minutes,dispute_window_days,disputes_enabled",
      ).eq("game_session_id", scope.gameId).maybeSingle(),
      this.client.from("marketplace_listings").select(LISTING_SELECT)
        .eq("game_session_id", scope.gameId).order("created_at", { ascending: false }).limit(250),
      this.client.from("marketplace_purchase_reservations").select(RESERVATION_SELECT)
        .eq("game_session_id", scope.gameId).eq("buyer_player_id", scope.playerUuid)
        .order("created_at", { ascending: false }).limit(100),
      this.client.from("marketplace_orders").select(ORDER_SELECT)
        .eq("game_session_id", scope.gameId).eq("buyer_player_id", scope.playerUuid)
        .order("created_at", { ascending: false }).limit(100),
      this.client.from("marketplace_orders").select(ORDER_SELECT)
        .eq("game_session_id", scope.gameId).eq("seller_player_id", scope.playerUuid)
        .order("created_at", { ascending: false }).limit(100),
      this.client.from("marketplace_disputes").select(DISPUTE_SELECT)
        .eq("game_session_id", scope.gameId).eq("opened_by_player_id", scope.playerUuid)
        .order("opened_at", { ascending: false }).limit(100),
    ]);
    assertResult(policyResult);
    assertResult(listingResult);
    assertResult(reservationResult);
    assertResult(buyerOrders);
    assertResult(sellerOrders);
    assertResult(disputeResult);

    const listingRows = listingResult.data ?? [];
    const orderRows = uniqueRows([...(buyerOrders.data ?? []), ...(sellerOrders.data ?? [])]);
    const playerIds = unique([
      ...listingRows.map((row) => uuid(row.seller_player_id)),
      ...orderRows.flatMap((row) => [uuid(row.buyer_player_id), uuid(row.seller_player_id)]),
    ]);
    const itemKeys = unique([
      ...listingRows.map((row) => token(row.item_key, 64)),
      ...orderRows.map((row) => token(row.item_key, 64)),
    ]);
    const [playersResult, itemsResult] = await Promise.all([
      playerIds.length
        ? this.client.from("players").select("id,display_name,player_identifier,roster_label")
          .eq("game_session_id", scope.gameId).in("id", playerIds)
        : Promise.resolve({ data: [], error: null }),
      itemKeys.length
        ? this.client.from("store_items").select("item_key,name,description,category,image_url")
          .eq("game_session_id", scope.gameId).in("item_key", itemKeys)
        : Promise.resolve({ data: [], error: null }),
    ]);
    assertResult(playersResult);
    assertResult(itemsResult);
    const players = new Map((playersResult.data ?? []).map((row) => [uuid(row.id), row]));
    const items = new Map((itemsResult.data ?? []).map((row) => [token(row.item_key, 64), row]));
    const listingByInternal = new Map<string, PlayerMarketplaceListingDto>();
    const listings = listingRows.map((row) => {
      const dto = listingDto(row, players.get(uuid(row.seller_player_id)), items.get(token(row.item_key, 64)), scope.playerUuid);
      listingByInternal.set(uuid(row.id), dto);
      return dto;
    });
    const reservationByInternal = new Map<string, PlayerMarketplaceReservationDto>();
    const reservations = (reservationResult.data ?? []).map((row) => {
      const listing = listingByInternal.get(uuid(row.listing_id));
      if (!listing) throw invalidRead();
      const dto = reservationDto(row, listing.id);
      reservationByInternal.set(uuid(row.id), dto);
      return dto;
    });
    const orderByInternal = new Map<string, PlayerMarketplaceOrderDto>();
    const orders = orderRows.map((row) => {
      const listing = listingByInternal.get(uuid(row.listing_id));
      const reservation = reservationByInternal.get(uuid(row.reservation_id));
      const itemKey = token(row.item_key, 64);
      if (!listing) throw invalidRead();
      const dto = orderDto(row, reservation?.id ?? publicReservationFallback(row.reservation_id), listing.id,
        text(items.get(itemKey)?.name, 180, "Marketplace item"), scope.playerUuid);
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
    if (lower(reservation.outcome) === "expired") throw conflict("Listing expired before the purchase reservation committed.");
    const reservationKey = publicId(reservation.reservation_key, MARKETPLACE_RESERVATION_KEY_PATTERN);
    const settlement = await this.rpcRow("settle_marketplace_purchase_public_v1", {
      p_game_session_id: input.gameSessionId,
      p_buyer_player_id: input.playerId,
      p_reservation_key: reservationKey,
    });
    const outcome = lower(settlement.outcome);
    if (outcome === "insufficient_funds") {
      throw new PlayerMarketplaceError("player_marketplace_insufficient_funds", "Available cash is insufficient for this purchase.", 409);
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
    for (const name of ["expire_marketplace_purchase_reservations_v1", "expire_marketplace_listings_v1"]) {
      const response = await this.client.rpc(name, { p_game_session_id: gameId, p_now: new Date().toISOString() });
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

function policyDto(row: Row | null): PlayerMarketplacePolicyDto {
  return {
    marketplaceEnabled: row?.marketplace_enabled !== false,
    crossCountryTradingEnabled: row?.cross_country_trading_enabled !== false,
    moderationRequired: row?.moderation_required === true,
    feeRate: boundedNumber(row?.fee_rate, 0, 0.25, 0.025),
    taxRate: boundedNumber(row?.tax_rate, 0, 0.25, 0),
    listingDurationHours: integer(row?.listing_duration_hours, 1, 720, 168),
    purchaseReservationMinutes: integer(row?.purchase_reservation_minutes, 1, 60, 5),
    disputeWindowDays: integer(row?.dispute_window_days, 1, 30, 7),
    disputesEnabled: row?.disputes_enabled !== false,
  };
}

function listingDto(row: Row, player: Row | undefined, item: Row | undefined, me: string): PlayerMarketplaceListingDto {
  const sellerId = uuid(row.seller_player_id);
  return {
    id: publicId(row.public_id, MARKETPLACE_LISTING_KEY_PATTERN),
    itemId: token(row.item_key, 64),
    name: text(item?.name, 180, "Marketplace item"),
    description: optionalText(item?.description, 1200) ?? "No description is available.",
    category: token(item?.category ?? "other", 64),
    image: optionalAsset(item?.image_url),
    country: token(row.seller_country_code, 32),
    condition: condition(row.condition_label),
    seller: text(player?.display_name, 180, "Player"),
    sellerReference: optionalText(player?.player_identifier, 80) ?? optionalText(player?.roster_label, 80),
    unitPrice: boundedNumber(row.unit_price, 0.0001, 1e12),
    currencyCode: currency(row.currency_code),
    quantity: integer(row.quantity_available, 0, 1_000_000),
    status: listingStatus(row.status),
    version: integer(row.version, 1, Number.MAX_SAFE_INTEGER),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    moderationReason: optionalText(row.moderation_reason, 1000),
    mine: sellerId === me,
  };
}

function reservationDto(row: Row, listingId: string): PlayerMarketplaceReservationDto {
  return {
    id: publicId(row.public_id, MARKETPLACE_RESERVATION_KEY_PATTERN),
    listingId,
    quantity: integer(row.quantity, 1, 1_000_000),
    total: boundedNumber(row.buyer_total, 0, 1e15),
    currencyCode: currency(row.currency_code),
    status: reservationStatus(row.status),
    version: integer(row.version, 1, Number.MAX_SAFE_INTEGER),
    expiresAt: iso(row.expires_at),
    releaseReason: optionalText(row.release_reason, 200),
  };
}

function orderDto(row: Row, reservationId: string, listingId: string, itemName: string, me: string): PlayerMarketplaceOrderDto {
  return {
    id: publicId(row.public_id, MARKETPLACE_ORDER_KEY_PATTERN),
    reservationId,
    listingId,
    itemId: token(row.item_key, 64),
    itemName,
    quantity: integer(row.quantity, 1, 1_000_000),
    unitPrice: boundedNumber(row.unit_price, 0.0001, 1e12),
    subtotal: boundedNumber(row.subtotal, 0, 1e15),
    feeAmount: boundedNumber(row.fee_amount, 0, 1e15),
    taxAmount: boundedNumber(row.tax_amount, 0, 1e15),
    total: boundedNumber(row.buyer_total, 0, 1e15),
    sellerProceeds: boundedNumber(row.seller_proceeds, 0, 1e15),
    currencyCode: currency(row.currency_code),
    status: orderStatus(row.status),
    version: integer(row.version, 1, Number.MAX_SAFE_INTEGER),
    role: uuid(row.buyer_player_id) === me ? "buyer" : "seller",
    completedAt: optionalIso(row.completed_at),
    refundedAt: optionalIso(row.refunded_at),
  };
}

function disputeDto(row: Row, orderId: string): PlayerMarketplaceDisputeDto {
  return {
    id: publicId(row.public_id, MARKETPLACE_DISPUTE_KEY_PATTERN),
    orderId,
    reason: text(row.reason, 1000),
    status: disputeStatus(row.status),
    version: integer(row.version, 1, Number.MAX_SAFE_INTEGER),
    resolutionNote: optionalText(row.resolution_note, 1000),
    openedAt: iso(row.opened_at),
    resolvedAt: optionalIso(row.resolved_at),
  };
}

function committed(row: Row, field: string, pattern: RegExp): MarketplaceCommittedResult {
  const outcome = lower(row.outcome);
  if (outcome !== "applied" && outcome !== "replayed") throw invalidRead();
  return {
    outcome,
    targetId: publicId(row[field], pattern),
    status: token(row.status, 40),
    version: row.version === null || row.version === undefined ? null : integer(row.version, 1, Number.MAX_SAFE_INTEGER),
    committedAt: optionalIso(row.completed_at ?? row.updated_at ?? row.created_at),
  };
}

function mapRpcError(error: QueryError): Error {
  const code = `${error.code ?? ""} ${error.message}`.toUpperCase();
  if (code.includes("NOT_FOUND")) return new PlayerMarketplaceError("player_marketplace_not_found", "Marketplace target was not found.", 404);
  if (code.includes("INSUFFICIENT") || code.includes("QUANTITY_UNAVAILABLE")) {
    return new PlayerMarketplaceError("player_marketplace_insufficient_funds", "Marketplace funds or inventory are insufficient.", 409);
  }
  if (code.includes("DISABLED") || code.includes("COUNTRY_BLOCKED") || code.includes("CROSS_COUNTRY_BLOCKED")) {
    return new PlayerMarketplaceError("player_marketplace_disabled", "Marketplace policy does not allow this action.", 409);
  }
  if (code.includes("STALE_VERSION") || code.includes("CONFLICT") || code.includes("TRANSITION") ||
    code.includes("NOT_ACTIVE") || code.includes("RESERVATION_ACTIVE") || code.includes("EXPIRED") ||
    code.includes("SELF_PURCHASE") || code.includes("WINDOW_CLOSED") || code.includes("NOT_DISPUTABLE")) {
    return conflict("Marketplace state changed before the action completed.");
  }
  throw persistence(error);
}
function persistence(error: QueryError): PlayerMarketplacePersistenceError {
  return new PlayerMarketplacePersistenceError(error.code ?? "marketplace_persistence_failed", error.message);
}
function conflict(message: string): PlayerMarketplaceError {
  return new PlayerMarketplaceError("player_marketplace_conflict", message, 409);
}
function invalidRead(): PlayerMarketplacePersistenceError {
  return new PlayerMarketplacePersistenceError("marketplace_response_invalid", "Marketplace persistence returned invalid data.");
}
function assertResult<T>(result: QueryResult<T>): void { if (result.error) throw persistence(result.error); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function uniqueRows(rows: Row[]): Row[] { const seen = new Set<string>(); return rows.filter((row) => { const id = uuid(row.id); if (seen.has(id)) return false; seen.add(id); return true; }); }
function lower(value: unknown): string { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function publicId(value: unknown, pattern: RegExp): string { const result = lower(value); if (!pattern.test(result)) throw invalidRead(); return result; }
function publicReservationFallback(value: unknown): string { const digest = uuid(value).replaceAll("-", ""); return `mpr_${digest}`; }
function uuid(value: unknown): string { const result = lower(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) throw invalidRead(); return result; }
function token(value: unknown, limit: number): string { const result = lower(value).slice(0, limit); if (!/^[a-z0-9][a-z0-9_-]*$/.test(result)) throw invalidRead(); return result; }
function currency(value: unknown): string { const result = typeof value === "string" ? value.trim().toUpperCase() : ""; if (!/^[A-Z0-9]{3,12}$/.test(result)) throw invalidRead(); return result; }
function text(value: unknown, limit: number, fallback = ""): string { const result = typeof value === "string" ? value.trim().slice(0, limit) : ""; if (result) return result; if (fallback) return fallback; throw invalidRead(); }
function optionalText(value: unknown, limit: number): string | null { if (value === null || value === undefined || value === "") return null; return text(value, limit); }
function optionalAsset(value: unknown): string | null { const result = optionalText(value, 500); return result && /^(?:\.\.?\/|\/)[A-Za-z0-9_./-]+$/.test(result) ? result : null; }
function boundedNumber(value: unknown, min: number, max: number, fallback?: number): number { const result = Number(value); if (Number.isFinite(result) && result >= min && result <= max) return result; if (fallback !== undefined) return fallback; throw invalidRead(); }
function integer(value: unknown, min: number, max: number, fallback?: number): number { const result = Number(value); if (Number.isSafeInteger(result) && result >= min && result <= max) return result; if (fallback !== undefined) return fallback; throw invalidRead(); }
function iso(value: unknown): string { const result = text(value, 80); if (Number.isNaN(Date.parse(result))) throw invalidRead(); return result; }
function optionalIso(value: unknown): string | null { if (value === null || value === undefined || value === "") return null; return iso(value); }
function condition(value: unknown): "New" | "Like New" | "Used" | "Damaged" { const result = text(value, 20); if (["New", "Like New", "Used", "Damaged"].includes(result)) return result as never; throw invalidRead(); }
function listingStatus(value: unknown): PlayerMarketplaceListingDto["status"] { const result = lower(value); if (["draft", "active", "moderation_hold", "sold_out", "cancelled", "expired", "rejected"].includes(result)) return result as never; throw invalidRead(); }
function reservationStatus(value: unknown): PlayerMarketplaceReservationDto["status"] { const result = lower(value); if (["reserved", "settling", "settled", "released", "expired"].includes(result)) return result as never; throw invalidRead(); }
function orderStatus(value: unknown): PlayerMarketplaceOrderDto["status"] { const result = lower(value); if (["settling", "completed", "disputed", "refunded"].includes(result)) return result as never; throw invalidRead(); }
function disputeStatus(value: unknown): PlayerMarketplaceDisputeDto["status"] { const result = lower(value); if (["open", "resolved_buyer", "resolved_seller", "rejected"].includes(result)) return result as never; throw invalidRead(); }
