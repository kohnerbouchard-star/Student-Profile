export type StoreItemStatus = "active" | "disabled" | "archived";
export type StoreItemVisibility = "visible" | "hidden";

export interface StoreItemRecord {
  readonly id: string;
  readonly game_session_id: string;
  readonly item_key: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly price: number;
  readonly currency_code: string;
  readonly stock_quantity: number;
  readonly status: StoreItemStatus;
  readonly visibility: StoreItemVisibility;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface StoreItemDto {
  readonly id: string;
  readonly gameSessionId: string;
  readonly itemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly price: number;
  readonly currencyCode: string;
  readonly stockQuantity: number;
  readonly status: StoreItemStatus;
  readonly visibility: StoreItemVisibility;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListStoreCatalogInput {
  readonly gameSessionId: string;
  readonly audience: "staff" | "player";
}

export interface CreateStoreItemInput {
  readonly gameSessionId: string;
  readonly itemKey?: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly price?: number | null;
  readonly currencyCode?: string | null;
  readonly stockQuantity?: number | null;
  readonly status?: StoreItemStatus | null;
  readonly visibility?: StoreItemVisibility | null;
  readonly sortOrder?: number | null;
}

export interface UpdateStoreItemInput {
  readonly gameSessionId: string;
  readonly itemId: string;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly price?: number | null;
  readonly currencyCode?: string | null;
  readonly stockQuantity?: number | null;
  readonly status?: StoreItemStatus | null;
  readonly visibility?: StoreItemVisibility | null;
  readonly sortOrder?: number | null;
}

export interface NormalizedCreateStoreItemInput {
  readonly gameSessionId: string;
  readonly itemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly price: number;
  readonly currencyCode: string;
  readonly stockQuantity: number;
  readonly status: StoreItemStatus;
  readonly visibility: StoreItemVisibility;
  readonly sortOrder: number;
}

export interface StoreItemUpdateValues {
  name?: string;
  description?: string | null;
  category?: string;
  price?: number;
  currencyCode?: string;
  stockQuantity?: number;
  status?: StoreItemStatus;
  visibility?: StoreItemVisibility;
  sortOrder?: number;
}

export interface NormalizedUpdateStoreItemInput {
  readonly gameSessionId: string;
  readonly itemId: string;
  readonly values: StoreItemUpdateValues;
}

export interface StoreCatalogRouteRequest {
  readonly gameSessionId: string;
  readonly itemId?: string | null;
  readonly body?: unknown;
  readonly audience: "staff" | "player";
  readonly requestId?: string | null;
}

export type StoreCatalogRouteResult =
  | StoreCatalogRouteSuccessResult
  | StoreCatalogRouteErrorResult;

export interface StoreCatalogRouteSuccessResult {
  readonly ok: true;
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface StoreCatalogRouteErrorResult {
  readonly ok: false;
  readonly status: number;
  readonly body: {
    readonly error: {
      readonly code: string;
      readonly message: string;
      readonly details?: unknown;
    };
  };
}
