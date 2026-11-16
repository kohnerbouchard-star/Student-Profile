import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { StoreItemDto } from "../contracts/storeCatalogContracts.ts";
import type { DashboardStoreListingsReadQuery } from "../dashboardReadModel.ts";

interface StoreItemRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly item_key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly category: string;
  readonly price: number | string;
  readonly currency_code: string;
  readonly stock_quantity: number | string;
  readonly status: StoreItemDto["status"];
  readonly visibility: StoreItemDto["visibility"];
  readonly sort_order: number | string;
  readonly created_at: string;
  readonly updated_at: string;
}

const STORE_ITEM_SELECT = [
  "id",
  "game_session_id",
  "item_key",
  "name",
  "description",
  "category",
  "price",
  "currency_code",
  "stock_quantity",
  "status",
  "visibility",
  "sort_order",
  "created_at",
  "updated_at",
].join(",");

export class DashboardStoreListingsReadError extends Error {
  constructor() {
    super("Dashboard Store listings could not be loaded.");
    this.name = "DashboardStoreListingsReadError";
  }
}

export class SupabaseDashboardStoreListingsReadQuery
  implements DashboardStoreListingsReadQuery {
  constructor(private readonly client: Pick<EdgeSupabaseClient, "from">) {}

  async read(gameSessionId: string): Promise<readonly StoreItemDto[]> {
    const response = await this.client
      .from("store_items")
      .select(STORE_ITEM_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .eq("visibility", "visible")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (response.error) {
      throw new DashboardStoreListingsReadError();
    }

    return ((response.data ?? []) as StoreItemRow[]).map(toStoreItemDto);
  }
}

function toStoreItemDto(row: StoreItemRow): StoreItemDto {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    itemKey: row.item_key,
    name: row.name,
    description: row.description ?? null,
    category: row.category,
    price: toFiniteNumber(row.price),
    currencyCode: row.currency_code,
    stockQuantity: Math.trunc(toFiniteNumber(row.stock_quantity)),
    status: row.status,
    visibility: row.visibility,
    sortOrder: Math.trunc(toFiniteNumber(row.sort_order)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFiniteNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
