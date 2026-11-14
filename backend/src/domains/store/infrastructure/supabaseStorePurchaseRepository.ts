import {
  toStorePurchaseHistoryItemDto,
  toStorePurchaseQuoteRecord,
} from "./storePurchaseRowMapping.ts";
export {
  toInventoryEventRecord,
  toInventoryHoldingRecord,
  toStorePurchaseQuoteRecord,
  toStorePurchaseRecord,
} from "./storePurchaseRowMapping.ts";
import type {
  StorePurchaseHistoryInput,
  StorePurchaseHistoryItemDto,
  StorePurchaseQuoteRecord,
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
  | "country_profiles";

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
    const countryAssignment = await this.readActiveCountryAssignment(input);
    const countryProfile = await this.readCountryProfile(
      countryAssignment.country_profile_id,
    );
    const pricing = await this.resolveStoreQuotePricing(
      input,
      countryProfile.id,
      countryProfile.currency_code,
    );

    const response = await this.client
      .from("store_purchase_quotes")
      .insert({
        game_session_id: input.gameSessionId,
        player_id: input.playerId,
        store_item_id: input.itemId,
        quantity: input.quantity,
        currency_code: pricing.settlement_currency_code,
        item_currency_code: pricing.item_currency_code,
        player_currency_code: pricing.settlement_currency_code,
        exchange_rate: Number(pricing.exchange_rate),
        item_local_final_unit_price: Number(
          pricing.item_local_final_unit_price,
        ),
        item_local_final_total_price: Number(
          pricing.item_local_final_total_price,
        ),
        base_unit_price: Number(pricing.base_unit_price),
        inflation_multiplier: Number(pricing.inflation_multiplier),
        location_multiplier: Number(pricing.location_multiplier),
        scarcity_multiplier: Number(pricing.scarcity_multiplier),
        discount_amount: 0,
        final_unit_price: Number(pricing.final_unit_price),
        final_total_price: Number(pricing.final_total_price),
        pricing_version: pricing.pricing_version,
        status: "CREATED",
        expires_at: pricing.expires_at,
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

  private async readCountryProfile(
    countryProfileId: string,
  ): Promise<CountryProfileRow> {
    const response = await this.client
      .from("country_profiles")
      .select("id,country_code,currency_code")
      .eq("id", countryProfileId)
      .single();

    if (response.error || !response.data) {
      throw new StorePurchasePersistenceError(
        "store_quote_country_currency_lookup_failed",
        "Country currency could not be loaded for quote creation.",
      );
    }

    const profile = response.data as CountryProfileRow;
    return {
      ...profile,
      currency_code: normalizeCurrencyCode(profile.currency_code),
    };
  }

  private async resolveStoreQuotePricing(
    input: StoreQuoteRequestInput,
    countryProfileId: string,
    settlementCurrencyCode: string,
  ): Promise<StoreQuotePricingRow> {
    const response = await this.client.rpc<StoreQuotePricingRow[]>(
      "resolve_store_quote_pricing_v2",
      {
        p_game_session_id: input.gameSessionId,
        p_store_item_id: input.itemId,
        p_country_profile_id: countryProfileId,
        p_settlement_currency_code: settlementCurrencyCode,
        p_quantity: input.quantity,
        p_effective_at: input.nowIso,
      },
    );

    if (response.error) {
      const token = firstErrorToken(response.error.message);
      const mapped = STORE_QUOTE_PRICING_ERRORS[token];
      throw new StorePurchasePersistenceError(
        mapped?.code ?? "store_quote_pricing_failed",
        mapped?.message ?? "Store quote pricing could not be resolved.",
      );
    }

    const pricing = Array.isArray(response.data) ? response.data[0] : null;
    if (!pricing) {
      throw new StorePurchasePersistenceError(
        "store_quote_pricing_failed",
        "Store quote pricing could not be resolved.",
      );
    }

    return pricing;
  }
}

const STORE_QUOTE_PRICING_ERRORS: Readonly<
  Record<string, { readonly code: string; readonly message: string }>
> = Object.freeze({
  STORE_ITEM_NOT_FOUND: {
    code: "store_quote_item_not_found",
    message: "Store item is not available for quote creation.",
  },
  COUNTRY_PROFILE_NOT_FOUND: {
    code: "store_quote_country_currency_lookup_failed",
    message: "Country currency could not be loaded for quote creation.",
  },
  COUNTRY_SNAPSHOT_NOT_FOUND: {
    code: "store_quote_country_snapshot_not_found",
    message:
      "An effective country economic snapshot is required before a store quote can be created.",
  },
  STORE_QUOTE_CURRENCY_INVALID: {
    code: "store_quote_invalid_currency_code",
    message: "Store quote currency code is invalid.",
  },
});

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

function firstErrorToken(message: string): string {
  return message.trim().split(/\s+/u)[0] ?? "";
}

interface PlayerCountryAssignmentRow {
  readonly id: string;
  readonly country_profile_id: string;
}

interface CountryProfileRow {
  readonly id: string;
  readonly country_code: string;
  readonly currency_code: string;
}

interface StoreQuotePricingRow {
  readonly store_item_id: string;
  readonly item_key: string;
  readonly item_name: string;
  readonly game_item_id: string | null;
  readonly inventory_account_id: string | null;
  readonly stock_quantity: number;
  readonly country_profile_id: string;
  readonly country_code: string;
  readonly item_currency_code: string;
  readonly settlement_currency_code: string;
  readonly country_snapshot_id: string;
  readonly snapshot_sequence: number;
  readonly base_unit_price: number | string;
  readonly inflation_multiplier: number | string;
  readonly location_multiplier: number | string;
  readonly scarcity_multiplier: number | string;
  readonly item_local_final_unit_price: number | string;
  readonly item_local_final_total_price: number | string;
  readonly exchange_rate: number | string;
  readonly final_unit_price: number | string;
  readonly final_total_price: number | string;
  readonly pricing_version: string;
  readonly expires_at: string;
}
