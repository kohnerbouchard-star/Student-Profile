import type {
  ListStoreCatalogInput,
  NormalizedCreateStoreItemInput,
  NormalizedUpdateStoreItemInput,
  StoreItemRecord,
} from "../contracts/storeCatalogContracts.ts";
import type {
  StoreCatalogRepository,
} from "./storeCatalogRepository.ts";

type SupabaseStoreCatalogClient = any;

const STORE_ITEM_SELECT =
  "id,game_session_id,item_key,name,description,category,price,currency_code,stock_quantity,status,visibility,sort_order,created_at,updated_at";

export class StoreCatalogPersistenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreCatalogPersistenceError";
    this.code = code;
  }
}

export class SupabaseStoreCatalogRepository implements StoreCatalogRepository {
  constructor(private readonly client: SupabaseStoreCatalogClient) {}

  async listStoreItems(
    input: ListStoreCatalogInput,
  ): Promise<readonly StoreItemRecord[]> {
    let query = this.client
      .from("store_items")
      .select(STORE_ITEM_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (input.audience === "player") {
      query = query.eq("status", "active").eq("visibility", "visible");
    }

    const response = await query;

    if (response.error) {
      throw new StoreCatalogPersistenceError(
        "store_catalog_list_failed",
        "Store catalog could not be loaded.",
      );
    }

    return (response.data ?? []) as StoreItemRecord[];
  }

  async createStoreItem(
    input: NormalizedCreateStoreItemInput,
  ): Promise<StoreItemRecord> {
    const response = await this.client
      .from("store_items")
      .insert({
        game_session_id: input.gameSessionId,
        item_key: input.itemKey,
        name: input.name,
        description: input.description,
        category: input.category,
        price: input.price,
        currency_code: input.currencyCode,
        stock_quantity: input.stockQuantity,
        status: input.status,
        visibility: input.visibility,
        sort_order: input.sortOrder,
      })
      .select(STORE_ITEM_SELECT)
      .single();

    if (response.error || !response.data) {
      throw new StoreCatalogPersistenceError(
        "store_catalog_create_failed",
        "Store item could not be created.",
      );
    }

    return response.data as StoreItemRecord;
  }

  async updateStoreItem(
    input: NormalizedUpdateStoreItemInput,
  ): Promise<StoreItemRecord | null> {
    const response = await this.client
      .from("store_items")
      .update(toStoreItemUpdateRow(input))
      .eq("game_session_id", input.gameSessionId)
      .eq("id", input.itemId)
      .select(STORE_ITEM_SELECT)
      .maybeSingle();

    if (response.error) {
      throw new StoreCatalogPersistenceError(
        "store_catalog_update_failed",
        "Store item could not be updated.",
      );
    }

    return (response.data ?? null) as StoreItemRecord | null;
  }
}

function toStoreItemUpdateRow(
  input: NormalizedUpdateStoreItemInput,
): Record<string, unknown> {
  const values = input.values;
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (values.name !== undefined) {
    row.name = values.name;
  }

  if (values.description !== undefined) {
    row.description = values.description;
  }

  if (values.category !== undefined) {
    row.category = values.category;
  }

  if (values.price !== undefined) {
    row.price = values.price;
  }

  if (values.currencyCode !== undefined) {
    row.currency_code = values.currencyCode;
  }

  if (values.stockQuantity !== undefined) {
    row.stock_quantity = values.stockQuantity;
  }

  if (values.status !== undefined) {
    row.status = values.status;
  }

  if (values.visibility !== undefined) {
    row.visibility = values.visibility;
  }

  if (values.sortOrder !== undefined) {
    row.sort_order = values.sortOrder;
  }

  return row;
}
