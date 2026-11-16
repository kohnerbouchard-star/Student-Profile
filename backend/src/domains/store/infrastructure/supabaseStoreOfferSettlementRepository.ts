import {
  type BusinessStoreOfferReceiptDto,
  normalizeBusinessStoreOfferSettlementCommand,
  parseBusinessStoreOfferReceipt,
  type SettleBusinessStoreOfferCommand,
  StoreOfferSettlementContractError,
  type StoreOfferSettlementRepository,
} from "../contracts/storeOfferSettlementContracts.ts";

interface Client {
  rpc<T = unknown>(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: T | null; error: { message?: string } | null }>;
}

export class SupabaseStoreOfferSettlementRepository
  implements StoreOfferSettlementRepository {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }
  async settleBusinessOffer(
    command: SettleBusinessStoreOfferCommand,
  ): Promise<BusinessStoreOfferReceiptDto> {
    const input = normalizeBusinessStoreOfferSettlementCommand(command);
    const response = await this.client.rpc<unknown>(
      "settle_business_store_offer_v2",
      {
        p_game_session_id: input.gameSessionId,
        p_buyer_player_id: input.buyerPlayerId,
        p_offer_key: input.offerKey,
        p_quote_key: input.quoteKey,
        p_quantity: input.quantity,
        p_expected_offer_version: input.expectedOfferVersion,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (response.error || response.data === null) {
      throw new StoreOfferSettlementContractError(
        mapError(response.error?.message),
        "Business Store offer settlement failed.",
      );
    }
    return parseBusinessStoreOfferReceipt(response.data);
  }
}

function mapError(message?: string): string {
  const value = message?.toUpperCase() ?? "";
  if (value.includes("IDEMPOTENCY_CONFLICT")) {
    return "store_offer_settlement_idempotency_conflict";
  }
  if (value.includes("INSUFFICIENT_FUNDS")) {
    return "store_offer_settlement_insufficient_funds";
  }
  if (value.includes("INVENTORY_RESERVED")) {
    return "store_offer_settlement_inventory_reserved";
  }
  if (value.includes("INSUFFICIENT_STOCK")) {
    return "store_offer_settlement_insufficient_stock";
  }
  if (value.includes("QUOTE_EXPIRED")) {
    return "store_offer_settlement_quote_expired";
  }
  if (value.includes("SELF_PURCHASE")) {
    return "store_offer_settlement_self_purchase_forbidden";
  }
  if (
    value.includes("OFFER_VERSION_CONFLICT") ||
    value.includes("OFFER_STATUS_INVALID") ||
    value.includes("OFFER_COMPLETION_FAILED") ||
    value.includes("OFFER_NOT_FOUND")
  ) {
    return "store_offer_settlement_offer_conflict";
  }
  if (
    value.includes("QUOTE_NOT_FOUND") ||
    value.includes("QUOTE_STATUS_INVALID") ||
    value.includes("QUOTE_MISMATCH") ||
    value.includes("QUOTE_COMPLETION_FAILED")
  ) return "store_offer_settlement_quote_unavailable";
  if (value.includes("CUSTODY") || value.includes("LISTING_NOT_FOUND")) {
    return "store_offer_settlement_custody_unavailable";
  }
  if (value.includes("CATALOG") || value.includes("ITEM_UNAVAILABLE")) {
    return "store_offer_settlement_catalog_unavailable";
  }
  if (
    value.includes("BUYER_UNAVAILABLE") ||
    value.includes("SELLER_UNAVAILABLE") ||
    value.includes("BUSINESS_UNAVAILABLE")
  ) return "store_offer_settlement_party_unavailable";
  if (
    value.includes("CURRENCY") ||
    value.includes("MONEY_PRECISION") ||
    value.includes("COST_PRECISION") ||
    value.includes("BUSINESS_CASH_UNAVAILABLE")
  ) return "store_offer_settlement_money_unavailable";
  if (value.includes("INVENTORY")) {
    return "store_offer_settlement_inventory_unavailable";
  }
  if (value.includes("REQUEST_INVALID")) {
    return "invalid_store_offer_settlement_command";
  }
  return "store_offer_settlement_failed";
}
