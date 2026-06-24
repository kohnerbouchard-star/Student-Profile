import type {
  InventoryEventRecord,
  InventoryHoldingRecord,
  StorePurchaseHistoryInput,
  StorePurchaseHistoryItemDto,
  StorePurchaseQuoteRecord,
  StorePurchaseRecord,
  StoreQuoteRequestInput,
} from "../contracts/storePurchaseContracts.ts";

interface SupabaseStorePurchaseQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseStorePurchaseQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseStorePurchaseQueryError | null;
  readonly count?: number | null;
  readonly status?: number;
  readonly statusText?: string;
}

type StorePurchaseTableName =
  | "store_items"
  | "store_purchase_quotes"
  | "store_purchases"
  | "inventory_holdings"
  | "inventory_events"
  | "mutation_idempotency_keys"
  | "player_country_assignments"
  | "country_profiles"
  | "country_economic_snapshots";

interface SupabaseStorePurchaseClient {
  from(tableName: StorePurchaseTableName): SupabaseStorePurchaseQueryBuilder;
  rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<SupabaseStorePurchaseQueryResponse<T>>;
}

interface SupabaseStorePurchaseQueryBuilder {
  select(columns: string): SupabaseStorePurchaseFilterBuilder;
  insert(values: unknown): SupabaseStorePurchaseInsertBuilder;
}

interface SupabaseStorePurchaseFilterBuilder
  extends PromiseLike<SupabaseStorePurchaseQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseStorePurchaseFilterBuilder;
  lte(column: string, value: unknown): SupabaseStorePurchaseFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseStorePurchaseFilterBuilder;
  limit(count: number): SupabaseStorePurchaseFilterBuilder;
  maybeSingle(): PromiseLike<SupabaseStorePurchaseQueryResponse<unknown>>;
  single(): PromiseLike<SupabaseStorePurchaseQueryResponse<unknown>>;
}

interface SupabaseStorePurchaseInsertBuilder {
  select(columns: string): SupabaseStorePurchaseSelectBuilder;
}

interface SupabaseStorePurchaseSelectBuilder {
  maybeSingle(): PromiseLike<SupabaseStorePurchaseQueryResponse<unknown>>;
  single(): PromiseLike<SupabaseStorePurchaseQueryResponse<unknown>>;
}

const STORE_PURCHASE_QUOTE_SELECT = [
  "id",
  "game_session_id",
  "player_id",
  "store_item_id",
  "quantity",
  "currency_code",
  "item_currency_code",
  "player_currency_code",
  "exchange_rate",
  "item_local_final_unit_price",
  "item_local_final_total_price",
  "base_unit_price",
  "inflation_multiplier",
  "location_multiplier",
  "scarcity_multiplier",
  "discount_amount",
  "final_unit_price",
  "final_total_price",
  "pricing_version",
  "status",
  "created_at",
  "expires_at",
  "used_at",
  "cancelled_at",
].join(",");

const STORE_PURCHASE_HISTORY_SELECT = [
  "id",
  "store_item_id",
  "quantity",
  "final_total_price",
  "currency_code",
  "status",
  "created_at",
  "store_items(name)",
].join(",");

const COUNTRY_ECONOMIC_SNAPSHOT_SELECT = [
  "id",
  "country_profile_id",
  "snapshot_sequence",
  "effective_at",
  "difficulty_preset",
  "price_difficulty_modifier",
  "scarcity_difficulty_modifier",
  "inflation_rate",
  "regional_price_multiplier",
  "supply_constraint_index",
].join(",");

export class StorePurchasePersistenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StorePurchasePersistenceError";
    this.code = code;
  }
}

export class SupabaseStorePurchaseRepository {
  constructor(private readonly client: SupabaseStorePurchaseClient) {}

  async createQuote(
    input: StoreQuoteRequestInput,
  ): Promise<StorePurchaseQuoteRecord> {
    const expiresAt = new Date(Date.parse(input.nowIso) + 3 * 60 * 1000).toISOString();

    const itemResponse = await this.client
      .from("store_items")
      .select("id,name,price,currency_code")
      .eq("game_session_id", input.gameSessionId)
      .eq("id", input.itemId)
      .eq("status", "active")
      .eq("visibility", "visible")
      .maybeSingle();

    if (itemResponse.error) {
      throw new StorePurchasePersistenceError(
        "store_quote_item_lookup_failed",
        "Store item could not be loaded for quote creation.",
      );
    }

    const item = itemResponse.data as StoreQuoteItemRow | null;

    if (!item) {
      throw new StorePurchasePersistenceError(
        "store_quote_item_not_found",
        "Store item is not available for quote creation.",
      );
    }

    const countryAssignment = await this.readActiveCountryAssignment(input);
    const playerCurrencyCode = await this.readCountryProfileCurrencyCode(
      countryAssignment.country_profile_id,
    );
    const itemCurrencyCode = normalizeCurrencyCode(item.currency_code);
    const economicSnapshot = await this.readLatestEffectiveEconomicSnapshot(
      input,
      countryAssignment.country_profile_id,
    );
    const pricingInputs = toStoreQuotePricingInputs(economicSnapshot);

    const baseUnitPrice = Number(item.price);
    const itemLocalFinalUnitPrice = roundCurrency(
      baseUnitPrice
        * pricingInputs.inflationMultiplier
        * pricingInputs.locationMultiplier
        * pricingInputs.scarcityMultiplier,
    );
    const itemLocalFinalTotalPrice = roundCurrency(itemLocalFinalUnitPrice * input.quantity);
    const finalTotalPrice = await this.convertCurrencyAmount(
      input.gameSessionId,
      itemLocalFinalTotalPrice,
      itemCurrencyCode,
      playerCurrencyCode,
    );
    const finalUnitPrice = roundCurrency(finalTotalPrice / input.quantity);
    const exchangeRate = roundExchangeRate(finalTotalPrice / itemLocalFinalTotalPrice);

    const response = await this.client
      .from("store_purchase_quotes")
      .insert({
        game_session_id: input.gameSessionId,
        player_id: input.playerId,
        store_item_id: input.itemId,
        quantity: input.quantity,
        currency_code: playerCurrencyCode,
        item_currency_code: itemCurrencyCode,
        player_currency_code: playerCurrencyCode,
        exchange_rate: exchangeRate,
        item_local_final_unit_price: itemLocalFinalUnitPrice,
        item_local_final_total_price: itemLocalFinalTotalPrice,
        base_unit_price: baseUnitPrice,
        inflation_multiplier: pricingInputs.inflationMultiplier,
        location_multiplier: pricingInputs.locationMultiplier,
        scarcity_multiplier: pricingInputs.scarcityMultiplier,
        discount_amount: 0,
        final_unit_price: finalUnitPrice,
        final_total_price: finalTotalPrice,
        pricing_version: readCountrySnapshotPricingVersion(economicSnapshot),
        status: "CREATED",
        expires_at: expiresAt,
      })
      .select(STORE_PURCHASE_QUOTE_SELECT)
      .single();

    if (response.error || !response.data) {
      throw new StorePurchasePersistenceError(
        "store_quote_create_failed",
        "Store purchase quote could not be created.",
      );
    }

    return toStorePurchaseQuoteRecord(response.data);
  }

  async listPlayerPurchases(
    input: StorePurchaseHistoryInput,
  ): Promise<readonly StorePurchaseHistoryItemDto[]> {
    const response = await this.client
      .from("store_purchases")
      .select(STORE_PURCHASE_HISTORY_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 25);

    if (response.error) {
      throw new StorePurchasePersistenceError(
        "store_purchase_history_failed",
        "Store purchase history could not be loaded.",
      );
    }

    return (response.data ?? []).map(toStorePurchaseHistoryItemDto);
  }

  private async readActiveCountryAssignment(
    input: StoreQuoteRequestInput,
  ): Promise<PlayerCountryAssignmentRow> {
    const response = await this.client
      .from("player_country_assignments")
      .select("id,country_profile_id")
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .eq("status", "active")
      .maybeSingle();

    if (response.error) {
      throw new StorePurchasePersistenceError(
        "store_quote_country_assignment_lookup_failed",
        "Active player country assignment could not be loaded for quote creation.",
      );
    }

    const assignment = response.data as PlayerCountryAssignmentRow | null;

    if (!assignment) {
      throw new StorePurchasePersistenceError(
        "store_quote_country_assignment_not_found",
        "Player must have an active country assignment before a store quote can be created.",
      );
    }

    return assignment;
  }

  private async readCountryProfileCurrencyCode(countryProfileId: string): Promise<string> {
    const response = await this.client
      .from("country_profiles")
      .select("id,currency_code")
      .eq("id", countryProfileId)
      .single();

    if (response.error || !response.data) {
      throw new StorePurchasePersistenceError(
        "store_quote_country_currency_lookup_failed",
        "Country currency could not be loaded for quote creation.",
      );
    }

    const profile = response.data as CountryProfileCurrencyRow;
    return normalizeCurrencyCode(profile.currency_code);
  }

  private async convertCurrencyAmount(
    gameSessionId: string,
    amount: number,
    fromCurrencyCode: string,
    toCurrencyCode: string,
  ): Promise<number> {
    const response = await this.client.rpc<number | string>(
      "convert_currency_amount",
      {
        p_game_session_id: gameSessionId,
        p_amount: amount,
        p_from_currency_code: fromCurrencyCode,
        p_to_currency_code: toCurrencyCode,
      },
    );

    if (response.error || response.data === null) {
      throw new StorePurchasePersistenceError(
        "store_quote_currency_conversion_failed",
        "Store quote currency conversion failed.",
      );
    }

    return roundCurrency(Number(response.data));
  }

  private async readLatestEffectiveEconomicSnapshot(
    input: StoreQuoteRequestInput,
    countryProfileId: string,
  ): Promise<CountryEconomicSnapshotRow> {
    const response = await this.client
      .from("country_economic_snapshots")
      .select(COUNTRY_ECONOMIC_SNAPSHOT_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("country_profile_id", countryProfileId)
      .lte("effective_at", input.nowIso)
      .order("effective_at", { ascending: false })
      .order("snapshot_sequence", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw new StorePurchasePersistenceError(
        "store_quote_country_snapshot_lookup_failed",
        "Country economic snapshot could not be loaded for quote creation.",
      );
    }

    const snapshot = response.data as CountryEconomicSnapshotRow | null;

    if (!snapshot) {
      throw new StorePurchasePersistenceError(
        "store_quote_country_snapshot_not_found",
        "An effective country economic snapshot is required before a store quote can be created.",
      );
    }

    return snapshot;
  }
}

export function toStorePurchaseQuoteRecord(row: unknown): StorePurchaseQuoteRecord {
  const value = row as StorePurchaseQuoteRow;

  return {
    id: value.id,
    gameSessionId: value.game_session_id,
    playerId: value.player_id,
    storeItemId: value.store_item_id,
    quantity: value.quantity,
    pricing: {
      baseUnitPrice: Number(value.base_unit_price),
      inflationMultiplier: Number(value.inflation_multiplier),
      locationMultiplier: Number(value.location_multiplier),
      scarcityMultiplier: Number(value.scarcity_multiplier),
      discountAmount: Number(value.discount_amount),
      finalUnitPrice: Number(value.final_unit_price),
      finalTotalPrice: Number(value.final_total_price),
      currencyCode: value.currency_code,
      itemCurrencyCode: value.item_currency_code ?? value.currency_code,
      playerCurrencyCode: value.player_currency_code ?? value.currency_code,
      exchangeRate: Number(value.exchange_rate ?? 1),
      itemLocalFinalUnitPrice: Number(value.item_local_final_unit_price ?? value.final_unit_price),
      itemLocalFinalTotalPrice: Number(value.item_local_final_total_price ?? value.final_total_price),
      pricingVersion: value.pricing_version,
    },
    status: value.status,
    createdAt: value.created_at,
    expiresAt: value.expires_at,
    usedAt: value.used_at ?? null,
    cancelledAt: value.cancelled_at ?? null,
  };
}

export function toStorePurchaseRecord(row: unknown): StorePurchaseRecord {
  const value = row as StorePurchaseRow;

  return {
    id: value.id,
    gameSessionId: value.game_session_id,
    playerId: value.player_id,
    storeItemId: value.store_item_id,
    quoteId: value.quote_id ?? null,
    quantity: value.quantity,
    finalUnitPrice: Number(value.final_unit_price),
    finalTotalPrice: Number(value.final_total_price),
    currencyCode: value.currency_code,
    ledgerEntryId: value.ledger_entry_id ?? null,
    idempotencyKey: value.idempotency_key,
    status: value.status,
    clientSubmittedAt: value.client_submitted_at ?? null,
    createdAt: value.created_at,
  };
}

export function toInventoryHoldingRecord(row: unknown): InventoryHoldingRecord {
  const value = row as InventoryHoldingRow;

  return {
    id: value.id,
    gameSessionId: value.game_session_id,
    playerId: value.player_id,
    storeItemId: value.store_item_id,
    quantityOwned: value.quantity_owned,
    quantityReserved: value.quantity_reserved,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

export function toInventoryEventRecord(row: unknown): InventoryEventRecord {
  const value = row as InventoryEventRow;

  return {
    id: value.id,
    gameSessionId: value.game_session_id,
    playerId: value.player_id,
    storeItemId: value.store_item_id,
    quantityDelta: value.quantity_delta,
    eventType: value.event_type,
    sourceDomain: value.source_domain,
    sourceAction: value.source_action,
    sourceId: value.source_id ?? null,
    metadata: value.metadata ?? {},
    createdAt: value.created_at,
  };
}

function toStorePurchaseHistoryItemDto(row: unknown): StorePurchaseHistoryItemDto {
  const value = row as StorePurchaseHistoryRow;

  return {
    purchaseId: value.id,
    itemId: value.store_item_id,
    itemName: value.store_items?.name ?? "Unknown item",
    quantity: value.quantity,
    finalTotalPrice: Number(value.final_total_price),
    currencyCode: value.currency_code,
    status: value.status,
    createdAt: value.created_at,
  };
}

function toStoreQuotePricingInputs(
  snapshot: CountryEconomicSnapshotRow,
): StoreQuotePricingInputs {
  const inflationMultiplier = clampQuoteMultiplier(1 + Number(snapshot.inflation_rate));
  const locationMultiplier = clampQuoteMultiplier(
    Number(snapshot.regional_price_multiplier) * Number(snapshot.price_difficulty_modifier),
  );
  const scarcityMultiplier = clampQuoteMultiplier(
    Number(snapshot.supply_constraint_index) * Number(snapshot.scarcity_difficulty_modifier),
  );

  return {
    inflationMultiplier,
    locationMultiplier,
    scarcityMultiplier,
  };
}

function readCountrySnapshotPricingVersion(snapshot: CountryEconomicSnapshotRow): string {
  return [
    "store-pricing-v1",
    "country-snapshot",
    snapshot.country_profile_id,
    String(snapshot.snapshot_sequence),
  ].join(":");
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundExchangeRate(value: number): number {
  return Math.round(value * 100000000) / 100000000;
}

function normalizeCurrencyCode(value: string): string {
  const normalizedValue = String(value || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{3,16}$/.test(normalizedValue)) {
    throw new StorePurchasePersistenceError(
      "store_quote_invalid_currency_code",
      "Store quote currency code is invalid.",
    );
  }

  return normalizedValue;
}

function clampQuoteMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(value, 0), 4);
}

interface StoreQuotePricingInputs {
  readonly inflationMultiplier: number;
  readonly locationMultiplier: number;
  readonly scarcityMultiplier: number;
}

interface StoreQuoteItemRow {
  readonly id: string;
  readonly name: string;
  readonly price: number | string;
  readonly currency_code: string;
}

interface PlayerCountryAssignmentRow {
  readonly id: string;
  readonly country_profile_id: string;
}

interface CountryProfileCurrencyRow {
  readonly id: string;
  readonly currency_code: string;
}

interface CountryEconomicSnapshotRow {
  readonly id: string;
  readonly country_profile_id: string;
  readonly snapshot_sequence: number;
  readonly effective_at: string;
  readonly difficulty_preset: string;
  readonly price_difficulty_modifier: number | string;
  readonly scarcity_difficulty_modifier: number | string;
  readonly inflation_rate: number | string;
  readonly regional_price_multiplier: number | string;
  readonly supply_constraint_index: number | string;
}

interface StorePurchaseQuoteRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quantity: number;
  readonly currency_code: string;
  readonly item_currency_code?: string | null;
  readonly player_currency_code?: string | null;
  readonly exchange_rate?: number | string | null;
  readonly item_local_final_unit_price?: number | string | null;
  readonly item_local_final_total_price?: number | string | null;
  readonly base_unit_price: number | string;
  readonly inflation_multiplier: number | string;
  readonly location_multiplier: number | string;
  readonly scarcity_multiplier: number | string;
  readonly discount_amount: number | string;
  readonly final_unit_price: number | string;
  readonly final_total_price: number | string;
  readonly pricing_version: string;
  readonly status: StorePurchaseQuoteRecord["status"];
  readonly created_at: string;
  readonly expires_at: string;
  readonly used_at?: string | null;
  readonly cancelled_at?: string | null;
}

interface StorePurchaseRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quote_id?: string | null;
  readonly quantity: number;
  readonly currency_code: string;
  readonly final_unit_price: number | string;
  readonly final_total_price: number | string;
  readonly ledger_entry_id?: string | null;
  readonly idempotency_key: string;
  readonly status: StorePurchaseRecord["status"];
  readonly client_submitted_at?: string | null;
  readonly created_at: string;
}

interface InventoryHoldingRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quantity_owned: number;
  readonly quantity_reserved: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface InventoryEventRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quantity_delta: number;
  readonly event_type: InventoryEventRecord["eventType"];
  readonly source_domain: string;
  readonly source_action: string;
  readonly source_id?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly created_at: string;
}

interface StorePurchaseHistoryRow {
  readonly id: string;
  readonly store_item_id: string;
  readonly quantity: number;
  readonly final_total_price: number | string;
  readonly currency_code: string;
  readonly status: StorePurchaseHistoryItemDto["status"];
  readonly created_at: string;
  readonly store_items?: {
    readonly name?: string | null;
  } | null;
}
