import type {
  ListStoreCatalogInput,
  NormalizedCreateStoreItemInput,
  NormalizedUpdateStoreItemInput,
  StoreItemDto,
  StoreItemRecord,
} from "../contracts/storeCatalogContracts";

export interface StoreCatalogRepository {
  readonly listStoreItems: (
    input: ListStoreCatalogInput,
  ) => Promise<readonly StoreItemRecord[]>;

  readonly createStoreItem: (
    input: NormalizedCreateStoreItemInput,
  ) => Promise<StoreItemRecord>;

  readonly updateStoreItem: (
    input: NormalizedUpdateStoreItemInput,
  ) => Promise<StoreItemRecord | null>;
}

export function toStoreItemDto(record: StoreItemRecord): StoreItemDto {
  return {
    id: record.id,
    gameSessionId: record.game_session_id,
    itemKey: record.item_key,
    name: record.name,
    description: record.description,
    category: record.category,
    price: record.price,
    currencyCode: record.currency_code,
    stockQuantity: record.stock_quantity,
    status: record.status,
    visibility: record.visibility,
    sortOrder: record.sort_order,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
