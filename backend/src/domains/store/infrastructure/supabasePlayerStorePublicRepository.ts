import type {
  PlayerStorePublicItemDto,
  PlayerStorePublicPurchaseHistoryItemDto,
  PlayerStorePublicQuoteDto,
  PlayerStorePublicReceiptDto,
  PlayerStorePublicRepository,
} from "../contracts/playerStorePublicContracts.ts";
import { PlayerStorePublicError } from "../contracts/playerStorePublicContracts.ts";
import { SupabaseStorePurchaseRepository } from "./supabaseStorePurchaseRepository.ts";

interface QueryError {
  readonly message?: string;
  readonly code?: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface PublicStoreClient {
  from(table: string): any;
  rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<QueryResponse<T>>;
}

interface PublicPurchaseRpcRow {
  readonly receipt_key: string;
  readonly quote_key: string;
  readonly item_key: string;
  readonly item_name: string;
  readonly quantity: number;
  readonly final_unit_price: number | string;
  readonly final_total_price: number | string;
  readonly currency_code: string;
  readonly inventory_quantity_owned: number;
  readonly completed_at: string;
  readonly already_completed: boolean;
}

export class SupabasePlayerStorePublicRepository
  implements PlayerStorePublicRepository {
  constructor(private readonly client: PublicStoreClient) {}

  async listItems(
    input: { readonly gameSessionId: string; readonly playerId: string },
  ): Promise<readonly PlayerStorePublicItemDto[]> {
    const response = await this.client
      .from("store_items")
      .select(
        "item_key,name,description,category,price,currency_code,stock_quantity,status,visibility,sort_order,updated_at",
      )
      .eq("game_session_id", input.gameSessionId)
      .eq("status", "active")
      .eq("visibility", "visible")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (response.error) {
      throw new PlayerStorePublicError(
        "player_store_catalog_failed",
        "Store items could not be loaded.",
        500,
        false,
      );
    }

    return (response.data ?? []).map((row: any) => ({
      itemKey: String(row.item_key),
      name: String(row.name),
      description: row.description === null ? null : String(row.description ?? ""),
      category: String(row.category),
      price: Number(row.price),
      currencyCode: String(row.currency_code),
      stockQuantity: Number(row.stock_quantity),
      status: "active" as const,
      visibility: "visible" as const,
      sortOrder: Number(row.sort_order),
      updatedAt: String(row.updated_at),
    }));
  }

  async createQuote(
    input: {
      readonly gameSessionId: string;
      readonly playerId: string;
      readonly itemKey: string;
      readonly quantity: number;
      readonly nowIso: string;
    },
  ): Promise<PlayerStorePublicQuoteDto> {
    const itemResponse = await this.client
      .from("store_items")
      .select("id,item_key,name")
      .eq("game_session_id", input.gameSessionId)
      .eq("item_key", input.itemKey)
      .eq("status", "active")
      .eq("visibility", "visible")
      .maybeSingle();

    if (itemResponse.error) {
      throw new PlayerStorePublicError(
        "player_store_quote_failed",
        "Store item could not be loaded for quote creation.",
        500,
        false,
      );
    }
    if (!itemResponse.data) {
      throw new PlayerStorePublicError(
        "store_item_not_available",
        "Store item is not available.",
        404,
        false,
      );
    }

    const item = itemResponse.data as {
      readonly id: string;
      readonly item_key: string;
      readonly name: string;
    };
    const legacyRepository = new SupabaseStorePurchaseRepository(
      this.client as never,
    );
    const quote = await legacyRepository.createQuote({
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      itemId: item.id,
      quantity: input.quantity,
      nowIso: input.nowIso,
    });

    const keyResponse = await this.client
      .from("store_purchase_quotes")
      .select("public_quote_key")
      .eq("id", quote.id)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .single();

    if (keyResponse.error || !keyResponse.data) {
      throw new PlayerStorePublicError(
        "player_store_quote_public_key_failed",
        "Store quote could not be finalized.",
        500,
        false,
      );
    }

    return {
      quoteKey: String((keyResponse.data as any).public_quote_key),
      itemKey: item.item_key,
      itemName: item.name,
      quantity: quote.quantity,
      baseUnitPrice: quote.pricing.baseUnitPrice,
      inflationMultiplier: quote.pricing.inflationMultiplier,
      locationMultiplier: quote.pricing.locationMultiplier,
      scarcityMultiplier: quote.pricing.scarcityMultiplier,
      discountAmount: quote.pricing.discountAmount,
      finalUnitPrice: quote.pricing.finalUnitPrice,
      finalTotalPrice: quote.pricing.finalTotalPrice,
      currencyCode: quote.pricing.currencyCode,
      itemCurrencyCode: quote.pricing.itemCurrencyCode,
      playerCurrencyCode: quote.pricing.playerCurrencyCode,
      exchangeRate: quote.pricing.exchangeRate,
      itemLocalFinalUnitPrice: quote.pricing.itemLocalFinalUnitPrice,
      itemLocalFinalTotalPrice: quote.pricing.itemLocalFinalTotalPrice,
      expiresAt: quote.expiresAt,
      pricingVersion: quote.pricing.pricingVersion,
    };
  }

  async purchase(
    input: {
      readonly gameSessionId: string;
      readonly playerId: string;
      readonly quoteKey: string;
      readonly idempotencyKey: string;
      readonly clientSubmittedAt: string | null;
    },
  ): Promise<PlayerStorePublicReceiptDto> {
    const response = await this.client.rpc<PublicPurchaseRpcRow[]>(
      "purchase_quoted_store_item_public_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
        p_quote_key: input.quoteKey,
        p_idempotency_key: input.idempotencyKey,
        p_client_submitted_at: input.clientSubmittedAt,
        p_request_metadata: {
          route: "players.me.store.purchases.public.v1",
        },
      },
    );

    if (response.error || !response.data?.[0]) {
      throw mapPurchaseError(response.error?.message ?? "STORE_PURCHASE_FAILED");
    }

    const row = response.data[0];
    return {
      receiptKey: row.receipt_key,
      quoteKey: row.quote_key,
      itemKey: row.item_key,
      itemName: row.item_name,
      quantity: Number(row.quantity),
      finalUnitPrice: Number(row.final_unit_price),
      finalTotalPrice: Number(row.final_total_price),
      currencyCode: row.currency_code,
      inventoryQuantityOwned: Number(row.inventory_quantity_owned),
      completedAt: row.completed_at,
      alreadyCompleted: row.already_completed === true,
    };
  }

  async listPurchases(
    input: {
      readonly gameSessionId: string;
      readonly playerId: string;
      readonly limit: number;
    },
  ): Promise<readonly PlayerStorePublicPurchaseHistoryItemDto[]> {
    const response = await this.client
      .from("store_purchases")
      .select(
        "public_receipt_key,quantity,final_total_price,currency_code,status,created_at,store_purchase_quotes(public_quote_key),store_items(item_key,name)",
      )
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("created_at", { ascending: false })
      .limit(input.limit);

    if (response.error) {
      throw new PlayerStorePublicError(
        "player_store_purchase_history_failed",
        "Store purchase history could not be loaded.",
        500,
        false,
      );
    }

    return (response.data ?? []).map((row: any) => ({
      receiptKey: String(row.public_receipt_key),
      quoteKey: row.store_purchase_quotes?.public_quote_key
        ? String(row.store_purchase_quotes.public_quote_key)
        : null,
      itemKey: String(row.store_items?.item_key ?? ""),
      itemName: String(row.store_items?.name ?? "Unknown item"),
      quantity: Number(row.quantity),
      finalTotalPrice: Number(row.final_total_price),
      currencyCode: String(row.currency_code),
      status: row.status,
      createdAt: String(row.created_at),
    }));
  }
}

function mapPurchaseError(message: string): PlayerStorePublicError {
  const code = String(message || "").toUpperCase();
  if (code.includes("QUOTE_NOT_FOUND")) {
    return new PlayerStorePublicError(
      "store_quote_not_found",
      "Store quote was not found.",
      404,
      false,
    );
  }
  if (code.includes("QUOTE_EXPIRED")) {
    return new PlayerStorePublicError(
      "store_quote_expired",
      "Store quote has expired.",
      409,
      false,
    );
  }
  if (code.includes("QUOTE_NOT_USABLE")) {
    return new PlayerStorePublicError(
      "store_quote_already_used",
      "Store quote can no longer be used.",
      409,
      false,
    );
  }
  if (code.includes("INSUFFICIENT_BALANCE")) {
    return new PlayerStorePublicError(
      "store_insufficient_balance",
      "Available cash is insufficient for this purchase.",
      409,
      false,
    );
  }
  if (code.includes("INSUFFICIENT_STOCK")) {
    return new PlayerStorePublicError(
      "store_insufficient_stock",
      "Store stock is insufficient for this purchase.",
      409,
      false,
    );
  }
  if (code.includes("ITEM_UNAVAILABLE") || code.includes("ITEM_NOT_FOUND")) {
    return new PlayerStorePublicError(
      "store_item_not_available",
      "Store item is not available.",
      409,
      false,
    );
  }
  if (code.includes("IDEMPOTENCY_CONFLICT")) {
    return new PlayerStorePublicError(
      "store_idempotency_conflict",
      "This idempotency key was already used for another purchase.",
      409,
      false,
    );
  }
  if (code.includes("IDEMPOTENCY_IN_PROGRESS")) {
    return new PlayerStorePublicError(
      "store_purchase_in_progress",
      "This Store purchase is still processing.",
      409,
      true,
    );
  }
  if (code.includes("GAME_SESSION_DISABLED")) {
    return new PlayerStorePublicError(
      "store_game_paused",
      "Store purchases are paused for this game.",
      409,
      true,
    );
  }
  if (code.includes("GAME_SESSION_ARCHIVED")) {
    return new PlayerStorePublicError(
      "store_game_ended",
      "Store purchases are closed because this game has ended.",
      409,
      false,
    );
  }
  if (
    code.includes("GAME_SESSION_NOT_ACTIVE") ||
    code.includes("GAME_SESSION_NOT_FOUND")
  ) {
    return new PlayerStorePublicError(
      "store_game_unavailable",
      "Store purchases are unavailable for this game.",
      409,
      false,
    );
  }
  return new PlayerStorePublicError(
    "player_store_purchase_failed",
    "Store purchase could not be completed.",
    500,
    false,
  );
}
