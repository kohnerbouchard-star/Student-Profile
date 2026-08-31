import {
  normalizeBusinessStoreOfferQuoteCommand,
  parseBusinessStoreOfferQuote,
  StoreOfferQuoteContractError,
  type BusinessStoreOfferQuoteDto,
  type CreateBusinessStoreOfferQuoteCommand,
  type StoreOfferQuoteRepository,
} from "../contracts/storeOfferQuoteContracts.ts";

interface StoreOfferQuoteQueryError {
  readonly message?: string;
  readonly code?: string;
}

interface StoreOfferQuoteQueryResponse<T> {
  readonly data: T | null;
  readonly error: StoreOfferQuoteQueryError | null;
}

interface StoreOfferQuoteClient {
  rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<StoreOfferQuoteQueryResponse<T>>;
}

export class SupabaseStoreOfferQuoteRepository
  implements StoreOfferQuoteRepository {
  constructor(private readonly client: StoreOfferQuoteClient) {}

  async createBusinessOfferQuote(
    command: CreateBusinessStoreOfferQuoteCommand,
  ): Promise<BusinessStoreOfferQuoteDto> {
    const normalized = normalizeBusinessStoreOfferQuoteCommand(command);
    const response = await this.client.rpc<unknown>(
      "create_business_store_offer_quote_v2",
      {
        p_game_session_id: normalized.gameSessionId,
        p_buyer_player_id: normalized.buyerPlayerId,
        p_offer_key: normalized.offerKey,
        p_quantity: normalized.quantity,
        p_expected_offer_version: normalized.expectedOfferVersion,
        p_idempotency_key: normalized.idempotencyKey,
      },
    );

    if (response.error || response.data === null) {
      throw new StoreOfferQuoteContractError(
        mapStoreOfferQuoteErrorCode(response.error?.message),
        "Business Store offer quote could not be created.",
      );
    }

    return parseBusinessStoreOfferQuote(response.data);
  }
}

function mapStoreOfferQuoteErrorCode(message: string | undefined): string {
  const normalized = message?.toUpperCase() ?? "";
  if (normalized.includes("IDEMPOTENCY_CONFLICT")) {
    return "store_offer_quote_idempotency_conflict";
  }
  if (normalized.includes("VERSION_CONFLICT")) {
    return "store_offer_quote_version_conflict";
  }
  if (normalized.includes("SELF_PURCHASE")) {
    return "store_offer_quote_self_purchase_forbidden";
  }
  if (normalized.includes("CROSS_CURRENCY")) {
    return "store_offer_quote_offer_unavailable";
  }
  if (normalized.includes("INVENTORY_RESERVED")) {
    return "store_offer_quote_inventory_reserved";
  }
  if (normalized.includes("INSUFFICIENT_STOCK")) {
    return "store_offer_quote_insufficient_stock";
  }
  if (
    normalized.includes("OFFER_STATUS_INVALID") ||
    normalized.includes("OFFER_NOT_FOUND")
  ) {
    return "store_offer_quote_offer_unavailable";
  }
  if (normalized.includes("BUYER_COUNTRY")) {
    return "store_offer_quote_buyer_country_unavailable";
  }
  if (normalized.includes("CUSTODY") || normalized.includes("LISTING")) {
    return "store_offer_quote_custody_unavailable";
  }
  if (
    normalized.includes("CATALOG") ||
    normalized.includes("ITEM_UNAVAILABLE")
  ) {
    return "store_offer_quote_catalog_unavailable";
  }
  if (
    normalized.includes("BUYER_UNAVAILABLE") ||
    normalized.includes("BUSINESS_UNAVAILABLE") ||
    normalized.includes("SELLER_UNAVAILABLE")
  ) {
    return "store_offer_quote_party_unavailable";
  }
  if (normalized.includes("REQUEST_INVALID")) {
    return "invalid_store_offer_quote_command";
  }
  return "store_offer_quote_create_failed";
}
