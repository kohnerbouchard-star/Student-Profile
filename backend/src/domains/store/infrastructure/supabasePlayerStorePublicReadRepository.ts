import type {
  PlayerStorePublicItemDto,
  PlayerStorePublicPurchaseHistoryItemDto,
  PlayerStorePublicReadRepository,
  PlayerStorePublicScope,
} from "../contracts/playerStorePublicContracts.ts";
import { PlayerStorePublicError } from "../contracts/playerStorePublicContracts.ts";

interface PublicStoreReadClient {
  from(table: string): any;
}

/**
 * Mutation-free Player Store catalog and purchase-history adapter.
 *
 * The live handler composes this class directly so a narrower TypeScript port
 * cannot conceal retired quote or purchase commands.
 */
export class SupabasePlayerStorePublicReadRepository
  implements PlayerStorePublicReadRepository {
  constructor(private readonly client: PublicStoreReadClient) {}

  async listItems(
    input: PlayerStorePublicScope,
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
      description: row.description === null
        ? null
        : String(row.description ?? ""),
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

  async listPurchases(
    input: PlayerStorePublicScope & { readonly limit: number },
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
