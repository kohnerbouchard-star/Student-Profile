interface ServiceError { readonly code?: string; readonly message: string }
interface ServiceResult<T> { readonly data: T | null; readonly error: ServiceError | null }
interface Filter extends PromiseLike<ServiceResult<Record<string, unknown>[]>> {
  eq(column: string, value: unknown): Filter;
  in(column: string, values: readonly unknown[]): Filter;
  order(column: string, options?: { readonly ascending?: boolean }): Filter;
  limit(count: number): Filter;
  maybeSingle(): PromiseLike<ServiceResult<Record<string, unknown>>>;
}
interface ServiceClient {
  from(table: string): { select(columns: string): Filter };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<ServiceResult<Record<string, unknown>[] | Record<string, unknown>>>;
}

const LISTING = /^lst_[0-9a-f]{32}$/;
const DISPUTE = /^dsp_[0-9a-f]{32}$/;
const PUBLIC = /^(?:lst|mpr|ord|dsp|mae|mfp)_[0-9a-f]{32}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const MAX_BODY_BYTES = 8192;

export interface MarketplaceAdminOperationInput {
  readonly request: Request;
  readonly gameId: string;
  readonly staffUserId: string;
  readonly suffix: string;
}
export interface MarketplaceAdminOperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

export async function handleMarketplaceAdminOperation(
  service: ServiceClient,
  input: MarketplaceAdminOperationInput,
): Promise<MarketplaceAdminOperationResult> {
  if (!input.suffix.startsWith("/marketplace")) return { handled: false };
  try {
    if ((input.suffix === "/marketplace" || input.suffix === "/marketplace/") && input.request.method === "GET") {
      return { handled: true, status: 200, body: { data: await readSnapshot(service, input.gameId) } };
    }
    if (input.suffix === "/marketplace/policy" && input.request.method === "PATCH") {
      const body = await readBody(input.request);
      exactKeys(body, [
        "marketplaceEnabled", "crossCountryTradingEnabled", "moderationRequired",
        "feeRate", "taxRate", "listingDurationHours", "purchaseReservationMinutes",
        "disputeWindowDays", "disputesEnabled", "countryFeeOverrides", "blockedCountryCodes",
      ]);
      const row = await rpcRow(service, "set_marketplace_policy_admin_v2", {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_marketplace_enabled: bool(body.marketplaceEnabled, "marketplaceEnabled"),
        p_cross_country_trading_enabled: bool(body.crossCountryTradingEnabled, "crossCountryTradingEnabled"),
        p_moderation_required: bool(body.moderationRequired, "moderationRequired"),
        p_fee_rate: number(body.feeRate, "feeRate", 0, 0.25),
        p_tax_rate: number(body.taxRate, "taxRate", 0, 0.25),
        p_listing_duration_hours: integer(body.listingDurationHours, "listingDurationHours", 1, 720),
        p_purchase_reservation_minutes: integer(body.purchaseReservationMinutes, "purchaseReservationMinutes", 1, 60),
        p_dispute_window_days: integer(body.disputeWindowDays, "disputeWindowDays", 1, 30),
        p_disputes_enabled: bool(body.disputesEnabled, "disputesEnabled"),
        p_country_fee_overrides: object(body.countryFeeOverrides, "countryFeeOverrides"),
        p_blocked_country_codes: countryCodes(body.blockedCountryCodes),
      });
      return { handled: true, status: 200, body: { data: { policy: policy(row), committed: true } } };
    }

    const listingMatch = input.suffix.match(/^\/marketplace\/listings\/([^/]+)\/(hold|approve|reject)$/u);
    if (listingMatch && input.request.method === "POST") {
      const key = publicKey(listingMatch[1], LISTING, "listingKey");
      const body = await readBody(input.request);
      exactKeys(body, ["reason", "expectedVersion", "idempotencyKey"]);
      const row = await review(service, input, key, listingMatch[2], body);
      return { handled: true, status: 200, body: { data: { result: adminResult(row), committed: true, refreshRequired: true } } };
    }

    const disputeMatch = input.suffix.match(/^\/marketplace\/disputes\/([^/]+)\/(refund|resolve-seller|reject)$/u);
    if (disputeMatch && input.request.method === "POST") {
      const key = publicKey(disputeMatch[1], DISPUTE, "disputeKey");
      const action = disputeMatch[2] === "refund" ? "refund_buyer" : disputeMatch[2] === "resolve-seller" ? "resolve_seller" : "reject";
      const body = await readBody(input.request);
      exactKeys(body, ["reason", "expectedVersion", "idempotencyKey"]);
      const row = await review(service, input, key, action, body);
      return { handled: true, status: 200, body: { data: { result: adminResult(row), committed: true, refreshRequired: true } } };
    }
    return {
      handled: true,
      status: 405,
      body: { code: "marketplace_method_not_allowed", message: "Marketplace administrator method is not allowed." },
    };
  } catch (error) {
    const mapped = mapError(error);
    return { handled: true, status: mapped.status, body: { code: mapped.code, message: mapped.message, retryable: mapped.retryable } };
  }
}

async function review(
  service: ServiceClient,
  input: MarketplaceAdminOperationInput,
  targetKey: string,
  action: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return rpcRow(service, "review_marketplace_admin_v2", {
    p_game_session_id: input.gameId,
    p_staff_user_id: input.staffUserId,
    p_target_key: targetKey,
    p_action: action,
    p_reason: text(body.reason, "reason", 1, 1000),
    p_expected_version: integer(body.expectedVersion, "expectedVersion", 1, Number.MAX_SAFE_INTEGER),
    p_idempotency_key: idempotency(body.idempotencyKey),
  });
}

async function readSnapshot(service: ServiceClient, gameId: string) {
  await rpcValue(service, "expire_marketplace_purchase_reservations_v1", { p_game_session_id: gameId, p_now: new Date().toISOString() });
  await rpcValue(service, "expire_marketplace_listings_v1", { p_game_session_id: gameId, p_now: new Date().toISOString() });
  const [policyResult, listingResult, reservationResult, orderResult, disputeResult, auditResult, postingResult] = await Promise.all([
    service.from("marketplace_policies").select("marketplace_enabled,cross_country_trading_enabled,moderation_required,fee_rate,tax_rate,listing_duration_hours,purchase_reservation_minutes,dispute_window_days,disputes_enabled,country_fee_overrides,blocked_country_codes,updated_at").eq("game_session_id", gameId).maybeSingle(),
    service.from("marketplace_listings").select("id,public_id,seller_player_id,seller_country_code,item_key,quantity_initial,quantity_available,unit_price,currency_code,condition_label,status,version,expires_at,moderation_reason,created_at,updated_at").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(500),
    service.from("marketplace_purchase_reservations").select("id,public_id,listing_id,buyer_player_id,seller_player_id,quantity,buyer_total,currency_code,status,version,expires_at,release_reason,created_at,updated_at").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(500),
    service.from("marketplace_orders").select("id,public_id,reservation_id,listing_id,buyer_player_id,seller_player_id,item_key,quantity,subtotal,fee_amount,tax_amount,buyer_total,seller_proceeds,currency_code,status,version,completed_at,refunded_at,created_at,updated_at").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(500),
    service.from("marketplace_disputes").select("id,public_id,order_id,opened_by_player_id,reason,status,version,resolution_note,opened_at,resolved_at,updated_at").eq("game_session_id", gameId).order("opened_at", { ascending: false }).limit(500),
    service.from("marketplace_audit_events").select("public_id,listing_id,reservation_id,order_id,dispute_id,actor_type,action,metadata,created_at").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(500),
    service.from("marketplace_financial_postings").select("public_id,order_id,posting_group,posting_type,amount,currency_code,created_at").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(500),
  ]);
  for (const result of [policyResult, listingResult, reservationResult, orderResult, disputeResult, auditResult, postingResult]) assertResult(result);
  const listings = listingResult.data ?? [];
  const reservations = reservationResult.data ?? [];
  const orders = orderResult.data ?? [];
  const disputes = disputeResult.data ?? [];
  const playerIds = unique([
    ...listings.map((row) => uuid(row.seller_player_id)),
    ...reservations.flatMap((row) => [uuid(row.buyer_player_id), uuid(row.seller_player_id)]),
    ...orders.flatMap((row) => [uuid(row.buyer_player_id), uuid(row.seller_player_id)]),
    ...disputes.map((row) => uuid(row.opened_by_player_id)),
  ]);
  const playersResult = playerIds.length
    ? await service.from("players").select("id,display_name,player_identifier,roster_label").eq("game_session_id", gameId).in("id", playerIds)
    : { data: [], error: null };
  assertResult(playersResult);
  const players = new Map((playersResult.data ?? []).map((row) => [uuid(row.id), playerReference(row)]));
  const listingKeys = new Map(listings.map((row) => [uuid(row.id), publicKey(row.public_id, LISTING, "listingId")]));
  const reservationKeys = new Map(reservations.map((row) => [uuid(row.id), publicKey(row.public_id, /^mpr_[0-9a-f]{32}$/, "reservationId")]));
  const orderKeys = new Map(orders.map((row) => [uuid(row.id), publicKey(row.public_id, /^ord_[0-9a-f]{32}$/, "orderId")]));
  const disputeKeys = new Map(disputes.map((row) => [uuid(row.id), publicKey(row.public_id, DISPUTE, "disputeId")]));
  return {
    policy: policy(policyResult.data),
    listings: listings.map((row) => ({
      id: listingKeys.get(uuid(row.id)), itemId: token(row.item_key), seller: players.get(uuid(row.seller_player_id)),
      countryCode: token(row.seller_country_code).toUpperCase(), quantityInitial: int(row.quantity_initial), quantityAvailable: int(row.quantity_available),
      unitPrice: finite(row.unit_price), currencyCode: currency(row.currency_code), condition: safeText(row.condition_label, 30),
      status: token(row.status), version: int(row.version), expiresAt: iso(row.expires_at), moderationReason: nullableText(row.moderation_reason, 1000),
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    })),
    reservations: reservations.map((row) => ({
      id: reservationKeys.get(uuid(row.id)), listingId: listingKeys.get(uuid(row.listing_id)), buyer: players.get(uuid(row.buyer_player_id)), seller: players.get(uuid(row.seller_player_id)),
      quantity: int(row.quantity), total: finite(row.buyer_total), currencyCode: currency(row.currency_code), status: token(row.status), version: int(row.version),
      expiresAt: iso(row.expires_at), releaseReason: nullableText(row.release_reason, 200), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    })),
    orders: orders.map((row) => ({
      id: orderKeys.get(uuid(row.id)), reservationId: reservationKeys.get(uuid(row.reservation_id)), listingId: listingKeys.get(uuid(row.listing_id)),
      buyer: players.get(uuid(row.buyer_player_id)), seller: players.get(uuid(row.seller_player_id)), itemId: token(row.item_key), quantity: int(row.quantity),
      subtotal: finite(row.subtotal), feeAmount: finite(row.fee_amount), taxAmount: finite(row.tax_amount), total: finite(row.buyer_total), sellerProceeds: finite(row.seller_proceeds),
      currencyCode: currency(row.currency_code), status: token(row.status), version: int(row.version), completedAt: nullableIso(row.completed_at), refundedAt: nullableIso(row.refunded_at),
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    })),
    disputes: disputes.map((row) => ({
      id: disputeKeys.get(uuid(row.id)), orderId: orderKeys.get(uuid(row.order_id)), openedBy: players.get(uuid(row.opened_by_player_id)), reason: safeText(row.reason, 1000),
      status: token(row.status), version: int(row.version), resolutionNote: nullableText(row.resolution_note, 1000), openedAt: iso(row.opened_at), resolvedAt: nullableIso(row.resolved_at), updatedAt: iso(row.updated_at),
    })),
    audit: (auditResult.data ?? []).map((row) => ({
      id: publicKey(row.public_id, /^mae_[0-9a-f]{32}$/, "auditId"), listingId: optionalMapped(row.listing_id, listingKeys), reservationId: optionalMapped(row.reservation_id, reservationKeys),
      orderId: optionalMapped(row.order_id, orderKeys), disputeId: optionalMapped(row.dispute_id, disputeKeys), actorType: token(row.actor_type), action: token(row.action),
      metadata: sanitizeMetadata(row.metadata), createdAt: iso(row.created_at),
    })),
    postings: (postingResult.data ?? []).map((row) => ({
      id: publicKey(row.public_id, /^mfp_[0-9a-f]{32}$/, "postingId"), orderId: orderKeys.get(uuid(row.order_id)), postingGroup: token(row.posting_group),
      postingType: token(row.posting_type), amount: finite(row.amount), currencyCode: currency(row.currency_code), createdAt: iso(row.created_at),
    })),
  };
}

function policy(row: Record<string, unknown> | null) {
  return {
    marketplaceEnabled: row?.marketplace_enabled !== false,
    crossCountryTradingEnabled: row?.cross_country_trading_enabled !== false,
    moderationRequired: row?.moderation_required === true,
    feeRate: finite(row?.fee_rate ?? 0.025), taxRate: finite(row?.tax_rate ?? 0),
    listingDurationHours: int(row?.listing_duration_hours ?? 168), purchaseReservationMinutes: int(row?.purchase_reservation_minutes ?? 5),
    disputeWindowDays: int(row?.dispute_window_days ?? 7), disputesEnabled: row?.disputes_enabled !== false,
    countryFeeOverrides: objectOrEmpty(row?.country_fee_overrides), blockedCountryCodes: Array.isArray(row?.blocked_country_codes) ? row!.blocked_country_codes.map((value) => token(value).toUpperCase()) : [],
    updatedAt: nullableIso(row?.updated_at),
  };
}
function adminResult(row: Record<string, unknown>) { return { outcome: token(row.outcome), id: publicKey(row.target_key, PUBLIC, "targetKey"), targetType: token(row.target_type), status: token(row.status), version: int(row.version), updatedAt: iso(row.updated_at) }; }
async function rpcRow(service: ServiceClient, name: string, args: Record<string, unknown>) { const result = await service.rpc(name, args); if (result.error) throw result.error; const row = Array.isArray(result.data) ? result.data[0] : result.data; if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("MARKETPLACE_ADMIN_RESPONSE_INVALID"); return row as Record<string, unknown>; }
async function rpcValue(service: ServiceClient, name: string, args: Record<string, unknown>) { const result = await service.rpc(name, args); if (result.error) throw result.error; return result.data; }
async function readBody(request: Request) { const type = request.headers.get("content-type")?.toLowerCase() ?? ""; if (!type.startsWith("application/json")) throw new Error("MARKETPLACE_ADMIN_JSON_REQUIRED"); const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("MARKETPLACE_ADMIN_BODY_TOO_LARGE"); let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error("MARKETPLACE_ADMIN_JSON_INVALID"); } if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("MARKETPLACE_ADMIN_BODY_INVALID"); return parsed as Record<string, unknown>; }
function exactKeys(body: Record<string, unknown>, allowed: readonly string[]) { const set = new Set(allowed); const keys = Object.keys(body); if (keys.length !== allowed.length || keys.some((key) => !set.has(key))) throw new Error("MARKETPLACE_ADMIN_FIELDS_INVALID"); }
function publicKey(value: unknown, pattern: RegExp, field: string) { let result = ""; try { result = decodeURIComponent(String(value ?? "")).trim().toLowerCase(); } catch { /* invalid */ } if (!pattern.test(result)) throw new Error(`MARKETPLACE_ADMIN_${field.toUpperCase()}_INVALID`); return result; }
function idempotency(value: unknown) { const result = String(value ?? "").trim(); if (!IDEMPOTENCY.test(result)) throw new Error("MARKETPLACE_ADMIN_IDEMPOTENCY_INVALID"); return result; }
function text(value: unknown, field: string, min: number, max: number) { const result = String(value ?? "").trim(); if (result.length < min || result.length > max) throw new Error(`MARKETPLACE_ADMIN_${field.toUpperCase()}_INVALID`); return result; }
function bool(value: unknown, field: string) { if (typeof value !== "boolean") throw new Error(`MARKETPLACE_ADMIN_${field.toUpperCase()}_INVALID`); return value; }
function integer(value: unknown, field: string, min: number, max: number) { const result = Number(value); if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`MARKETPLACE_ADMIN_${field.toUpperCase()}_INVALID`); return result; }
function number(value: unknown, field: string, min: number, max: number) { const result = Number(value); if (!Number.isFinite(result) || result < min || result > max) throw new Error(`MARKETPLACE_ADMIN_${field.toUpperCase()}_INVALID`); return result; }
function object(value: unknown, field: string) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`MARKETPLACE_ADMIN_${field.toUpperCase()}_INVALID`); return value as Record<string, unknown>; }
function countryCodes(value: unknown) { if (!Array.isArray(value) || value.length > 100) throw new Error("MARKETPLACE_ADMIN_COUNTRY_CODES_INVALID"); return [...new Set(value.map((entry) => token(entry).toUpperCase()))]; }
function mapError(error: unknown) { const message = String((error as any)?.message ?? error).toUpperCase(); if (message.includes("NOT_FOUND")) return { status: 404, code: "marketplace_not_found", message: "Marketplace target was not found.", retryable: false }; if (message.includes("STALE") || message.includes("CONFLICT") || message.includes("TRANSITION") || message.includes("RESERVATION") || message.includes("INSUFFICIENT")) return { status: 409, code: "marketplace_conflict", message: "Marketplace state changed before the administrator action completed.", retryable: false }; if (message.includes("INVALID") || message.includes("JSON") || message.includes("FIELDS")) return { status: 400, code: "invalid_marketplace_admin_request", message: "Marketplace administrator request is invalid.", retryable: false }; return { status: 503, code: "marketplace_admin_unavailable", message: "Marketplace administrator operation is temporarily unavailable.", retryable: true }; }
function assertResult(result: ServiceResult<unknown>) { if (result.error) throw result.error; }
function uuid(value: unknown) { const result = String(value ?? "").trim().toLowerCase(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) throw new Error("MARKETPLACE_ADMIN_INTERNAL_SCOPE_INVALID"); return result; }
function playerReference(row: Record<string, unknown>) { return { id: nullableText(row.player_identifier, 80) ?? nullableText(row.roster_label, 80) ?? `player-${uuid(row.id).replaceAll("-", "").slice(-8)}`, displayName: safeText(row.display_name, 180) }; }
function unique(values: string[]) { return [...new Set(values)]; }
function token(value: unknown) { const result = String(value ?? "").trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(result)) throw new Error("MARKETPLACE_ADMIN_TOKEN_INVALID"); return result; }
function safeText(value: unknown, max: number) { const result = String(value ?? "").trim().slice(0, max); if (!result) throw new Error("MARKETPLACE_ADMIN_TEXT_INVALID"); return result; }
function nullableText(value: unknown, max: number) { if (value === null || value === undefined || value === "") return null; return safeText(value, max); }
function int(value: unknown) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 0) throw new Error("MARKETPLACE_ADMIN_INTEGER_INVALID"); return result; }
function finite(value: unknown) { const result = Number(value); if (!Number.isFinite(result)) throw new Error("MARKETPLACE_ADMIN_NUMBER_INVALID"); return result; }
function currency(value: unknown) { const result = String(value ?? "").trim().toUpperCase(); if (!/^[A-Z0-9]{3,12}$/.test(result)) throw new Error("MARKETPLACE_ADMIN_CURRENCY_INVALID"); return result; }
function iso(value: unknown) { const result = String(value ?? "").trim(); if (Number.isNaN(Date.parse(result))) throw new Error("MARKETPLACE_ADMIN_DATE_INVALID"); return result; }
function nullableIso(value: unknown) { if (value === null || value === undefined || value === "") return null; return iso(value); }
function optionalMapped(value: unknown, map: Map<string, string>) { if (value === null || value === undefined || value === "") return null; return map.get(uuid(value)) ?? null; }
function objectOrEmpty(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function sanitizeMetadata(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const source = value as Record<string, unknown>; return Object.fromEntries(Object.entries(source).filter(([key, entry]) => !/(uuid|player_id|game_id|session|token|secret)/i.test(key) && ["string", "number", "boolean"].includes(typeof entry)).slice(0, 30)); }
