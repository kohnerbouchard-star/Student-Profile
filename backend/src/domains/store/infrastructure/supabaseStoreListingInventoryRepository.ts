import {
  normalizeStockBusinessStoreOfferCommand,
  parseStockBusinessStoreOfferResult,
  StoreListingInventoryContractError,
  type StockBusinessStoreOfferCommand,
  type StockBusinessStoreOfferResult,
  type StoreListingInventoryRepository,
} from "../contracts/storeListingInventoryContracts.ts";

interface StoreListingInventoryQueryError {
  readonly message?: string;
  readonly code?: string;
}

interface StoreListingInventoryQueryResponse<T> {
  readonly data: T | null;
  readonly error: StoreListingInventoryQueryError | null;
}

interface StoreListingInventoryClient {
  rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<StoreListingInventoryQueryResponse<T>>;
}

export class SupabaseStoreListingInventoryRepository
  implements StoreListingInventoryRepository {
  constructor(private readonly client: StoreListingInventoryClient) {}

  async stockBusinessOffer(
    command: StockBusinessStoreOfferCommand,
  ): Promise<StockBusinessStoreOfferResult> {
    const normalized = normalizeStockBusinessStoreOfferCommand(command);
    const response = await this.client.rpc<unknown>(
      "stock_business_store_offer_v2",
      {
        p_game_session_id: normalized.gameSessionId,
        p_business_key: normalized.businessKey,
        p_offer_key: normalized.offerKey,
        p_quantity: normalized.quantity,
        p_expected_offer_version: normalized.expectedOfferVersion,
        p_idempotency_key: normalized.idempotencyKey,
      },
    );

    if (response.error || response.data === null) {
      throw new StoreListingInventoryContractError(
        mapStoreListingErrorCode(response.error?.message),
        "Business Store stock could not be placed.",
      );
    }

    return parseStockBusinessStoreOfferResult(response.data);
  }
}

function mapStoreListingErrorCode(message: string | undefined): string {
  const normalized = message?.toUpperCase() ?? "";
  if (normalized.includes("IDEMPOTENCY_CONFLICT")) {
    return "store_listing_idempotency_conflict";
  }
  if (normalized.includes("VERSION_CONFLICT")) {
    return "store_listing_version_conflict";
  }
  if (normalized.includes("INSUFFICIENT_FINISHED_GOODS")) {
    return "store_listing_insufficient_finished_goods";
  }
  if (normalized.includes("OFFER_RETIRED")) {
    return "store_listing_offer_retired";
  }
  return "store_listing_stock_failed";
}
