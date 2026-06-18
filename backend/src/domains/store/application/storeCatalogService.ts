import type {
  CreateStoreItemInput,
  ListStoreCatalogInput,
  StoreItemDto,
  UpdateStoreItemInput,
} from "../contracts/storeCatalogContracts.ts";
import {
  normalizeCreateStoreItemInput,
  normalizeUpdateStoreItemInput,
} from "../domain/storeCatalogRules.ts";
import {
  toStoreItemDto,
  type StoreCatalogRepository,
} from "../infrastructure/storeCatalogRepository.ts";

export interface StoreCatalogDependencies {
  readonly storeCatalogRepository: StoreCatalogRepository;
}

export async function listStoreCatalogItems(
  input: ListStoreCatalogInput,
  dependencies: StoreCatalogDependencies,
): Promise<readonly StoreItemDto[]> {
  const records = await dependencies.storeCatalogRepository.listStoreItems(input);
  return records.map(toStoreItemDto);
}

export async function createStoreCatalogItem(
  input: CreateStoreItemInput,
  dependencies: StoreCatalogDependencies,
): Promise<StoreItemDto> {
  const normalizedInput = normalizeCreateStoreItemInput(input);
  const record = await dependencies.storeCatalogRepository.createStoreItem(
    normalizedInput,
  );

  return toStoreItemDto(record);
}

export async function updateStoreCatalogItem(
  input: UpdateStoreItemInput,
  dependencies: StoreCatalogDependencies,
): Promise<StoreItemDto | null> {
  const normalizedInput = normalizeUpdateStoreItemInput(input);
  const record = await dependencies.storeCatalogRepository.updateStoreItem(
    normalizedInput,
  );

  return record ? toStoreItemDto(record) : null;
}
