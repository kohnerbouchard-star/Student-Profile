import {
  parseStoreCatalogOfferGroupRow,
  StoreSellerOfferContractError,
  type StoreCatalogOfferGroupDto,
  type StoreSellerOfferRepository,
} from "../contracts/storeSellerOfferContracts.ts";

interface StoreSellerOfferQueryError {
  readonly message?: string;
  readonly code?: string;
}

interface StoreSellerOfferQueryResponse<T> {
  readonly data: T | null;
  readonly error: StoreSellerOfferQueryError | null;
}

interface StoreSellerOfferClient {
  rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<StoreSellerOfferQueryResponse<T>>;
}

export class SupabaseStoreSellerOfferRepository
  implements StoreSellerOfferRepository {
  constructor(private readonly client: StoreSellerOfferClient) {}

  async listCatalogOfferGroups(
    gameSessionId: string,
  ): Promise<readonly StoreCatalogOfferGroupDto[]> {
    const normalizedGameSessionId = gameSessionId.trim().toLowerCase();
    if (!isUuid(normalizedGameSessionId)) {
      throw new StoreSellerOfferContractError(
        "invalid_store_offer_game_scope",
        "gameSessionId must be a UUID.",
      );
    }

    const response = await this.client.rpc<unknown[]>(
      "read_store_catalog_offer_groups_v2",
      { p_game_session_id: normalizedGameSessionId },
    );
    if (response.error || !Array.isArray(response.data)) {
      throw new StoreSellerOfferContractError(
        "store_offer_catalog_read_failed",
        "Store seller offers could not be loaded.",
      );
    }

    return response.data.map(parseStoreCatalogOfferGroupRow);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    value,
  );
}
