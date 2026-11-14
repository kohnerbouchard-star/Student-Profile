import {
  MARKETPLACE_DISPUTE_KEY_PATTERN,
  MARKETPLACE_LISTING_KEY_PATTERN,
  MARKETPLACE_ORDER_KEY_PATTERN,
  MARKETPLACE_RESERVATION_KEY_PATTERN,
  type MarketplaceCommittedResult,
  PlayerMarketplaceError,
  PlayerMarketplacePersistenceError,
  type PlayerMarketplaceDisputeDto,
  type PlayerMarketplaceListingDto,
  type PlayerMarketplaceOrderDto,
  type PlayerMarketplacePolicyDto,
  type PlayerMarketplaceReservationDto,
} from "../contracts/playerMarketplaceContracts.ts";
import type { QueryError, QueryResult, Row } from "./marketplaceRepositoryRows.ts";

export function policyDto(row: Row | null): PlayerMarketplacePolicyDto {
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

export function listingDto(
  row: Row,
  player: Row | undefined,
  item: Row | undefined,
  me: string,
): PlayerMarketplaceListingDto {
  const sellerId = uuid(row.seller_player_id);
  return {
    id: publicId(row.public_id, MARKETPLACE_LISTING_KEY_PATTERN),
    itemId: token(row.item_key, 64),
    name: text(item?.name, 180, "Marketplace item"),
    description: optionalText(item?.description, 1200) ?? "No description is available.",
    category: token(item?.category ?? "other", 64),
    image: null,
    country: token(row.seller_country_code, 32),
    condition: condition(row.condition_label),
    seller: text(player?.display_name, 180, "Player"),
    sellerReference: optionalText(player?.player_identifier, 80) ??
      optionalText(player?.roster_label, 80),
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

export function reservationDto(row: Row, listingId: string): PlayerMarketplaceReservationDto {
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

export function orderDto(
  row: Row,
  reservationId: string,
  listingId: string,
  itemName: string,
  me: string,
): PlayerMarketplaceOrderDto {
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

export function disputeDto(row: Row, orderId: string): PlayerMarketplaceDisputeDto {
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

export function committed(row: Row, field: string, pattern: RegExp): MarketplaceCommittedResult {
  const outcome = lower(row.outcome);
  if (outcome !== "applied" && outcome !== "replayed") throw invalidRead();
  return {
    outcome,
    targetId: publicId(row[field], pattern),
    status: token(row.status, 40),
    version: row.version === null || row.version === undefined
      ? null
      : integer(row.version, 1, Number.MAX_SAFE_INTEGER),
    committedAt: optionalIso(row.completed_at ?? row.updated_at ?? row.created_at),
  };
}

export function mapRpcError(error: QueryError): Error {
  const code = `${error.code ?? ""} ${error.message}`.toUpperCase();
  if (code.includes("NOT_FOUND")) {
    return new PlayerMarketplaceError(
      "player_marketplace_not_found",
      "Marketplace target was not found.",
      404,
    );
  }
  if (code.includes("INSUFFICIENT") || code.includes("QUANTITY_UNAVAILABLE")) {
    return new PlayerMarketplaceError(
      "player_marketplace_insufficient_funds",
      "Marketplace funds or inventory are insufficient.",
      409,
    );
  }
  if (
    code.includes("DISABLED") || code.includes("COUNTRY_BLOCKED") ||
    code.includes("CROSS_COUNTRY_BLOCKED")
  ) {
    return new PlayerMarketplaceError(
      "player_marketplace_disabled",
      "Marketplace policy does not allow this action.",
      409,
    );
  }
  if (
    code.includes("STALE_VERSION") || code.includes("CONFLICT") ||
    code.includes("TRANSITION") || code.includes("NOT_ACTIVE") ||
    code.includes("SCOPE_INACTIVE") || code.includes("GAME_PAUSED") ||
    code.includes("GAME_ENDED") || code.includes("RESERVATION_ACTIVE") ||
    code.includes("EXPIRED") ||
    code.includes("SELF_PURCHASE") || code.includes("WINDOW_CLOSED") ||
    code.includes("NOT_DISPUTABLE")
  ) {
    return conflict("Marketplace state changed before the action completed.");
  }
  return persistence(error);
}
export function persistence(error: QueryError): PlayerMarketplacePersistenceError {
  return new PlayerMarketplacePersistenceError(
    error.code ?? "marketplace_persistence_failed",
    error.message,
  );
}
export function conflict(message: string): PlayerMarketplaceError {
  return new PlayerMarketplaceError("player_marketplace_conflict", message, 409);
}
export function invalidRead(): PlayerMarketplacePersistenceError {
  return new PlayerMarketplacePersistenceError(
    "marketplace_response_invalid",
    "Marketplace persistence returned invalid data.",
  );
}
export function assertResult<T>(result: QueryResult<T>): void {
  if (result.error) throw persistence(result.error);
}
export function unique(values: string[]): string[] { return [...new Set(values)]; }
export function uniqueRows(rows: Row[]): Row[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = uuid(row.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
export function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
export function publicId(value: unknown, pattern: RegExp): string {
  const result = lower(value);
  if (!pattern.test(result)) throw invalidRead();
  return result;
}
export function uuid(value: unknown): string {
  const result = lower(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    throw invalidRead();
  }
  return result;
}
export function token(value: unknown, limit: number): string {
  const result = lower(value).slice(0, limit);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(result)) throw invalidRead();
  return result;
}
function currency(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{3,12}$/.test(result)) throw invalidRead();
  return result;
}
export function text(value: unknown, limit: number, fallback = ""): string {
  const result = typeof value === "string" ? value.trim().slice(0, limit) : "";
  if (result) return result;
  if (fallback) return fallback;
  throw invalidRead();
}
function optionalText(value: unknown, limit: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, limit);
}
function optionalAsset(value: unknown): string | null {
  const result = optionalText(value, 500);
  return result && /^(?:\.\.?\/|\/)[A-Za-z0-9_./-]+$/.test(result) ? result : null;
}
function boundedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback?: number,
): number {
  const result = Number(value);
  if (Number.isFinite(result) && result >= min && result <= max) return result;
  if (fallback !== undefined) return fallback;
  throw invalidRead();
}
function integer(
  value: unknown,
  min: number,
  max: number,
  fallback?: number,
): number {
  const result = Number(value);
  if (Number.isSafeInteger(result) && result >= min && result <= max) return result;
  if (fallback !== undefined) return fallback;
  throw invalidRead();
}
function iso(value: unknown): string {
  const result = text(value, 80);
  if (Number.isNaN(Date.parse(result))) throw invalidRead();
  return result;
}
function optionalIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return iso(value);
}
function condition(value: unknown): "New" | "Like New" | "Used" | "Damaged" {
  const result = text(value, 20);
  if (["New", "Like New", "Used", "Damaged"].includes(result)) return result as never;
  throw invalidRead();
}
function listingStatus(value: unknown): PlayerMarketplaceListingDto["status"] {
  const result = lower(value);
  if (["draft", "active", "moderation_hold", "sold_out", "cancelled", "expired", "rejected"].includes(result)) {
    return result as never;
  }
  throw invalidRead();
}
function reservationStatus(value: unknown): PlayerMarketplaceReservationDto["status"] {
  const result = lower(value);
  if (["reserved", "settling", "settled", "released", "expired"].includes(result)) return result as never;
  throw invalidRead();
}
function orderStatus(value: unknown): PlayerMarketplaceOrderDto["status"] {
  const result = lower(value);
  if (["settling", "completed", "disputed", "refunded"].includes(result)) return result as never;
  throw invalidRead();
}
function disputeStatus(value: unknown): PlayerMarketplaceDisputeDto["status"] {
  const result = lower(value);
  if (["open", "resolved_buyer", "resolved_seller", "rejected"].includes(result)) return result as never;
  throw invalidRead();
}
