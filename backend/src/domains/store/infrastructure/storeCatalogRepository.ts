import type {
  ListStoreCatalogInput,
  NormalizedCreateStoreItemInput,
  NormalizedUpdateStoreItemInput,
  StoreItemDto,
  StoreItemRecord,
} from "../contracts/storeCatalogContracts.ts";

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
    sourceType: toStoreItemSourceType(record.game_item?.source_kind),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function toStoreItemSourceType(
  sourceKind: string | undefined,
): StoreItemDto["sourceType"] {
  if (sourceKind === "store_created" || sourceKind === "admin_created") {
    return "custom";
  }
  if (sourceKind === "physical_pack" || sourceKind === "system") {
    return "seeded";
  }
  return undefined;
}
