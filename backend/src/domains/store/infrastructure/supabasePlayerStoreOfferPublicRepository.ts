import {
  businessSellerOfferKeys,
  businessSellerPartyKeys,
  parsePlayerStoreOfferBuyerReceiptRow,
  type PlayerStoreOfferPublicProductDto,
  type PlayerStoreOfferPublicQuoteDto,
  type PlayerStoreOfferPublicReceiptDto,
  type PlayerStoreOfferPublicRepository,
  type PlayerStoreOfferPublicScope,
  projectPlayerStoreOfferProduct,
  projectPlayerStoreOfferQuote,
  projectPlayerStoreOfferReceipt,
} from "../contracts/playerStoreOfferPublicContracts.ts";
import { PlayerStorePublicError } from "../contracts/playerStorePublicContracts.ts";
import {
  mapPlayerStoreOfferCatalogError,
  mapPlayerStoreOfferQuoteError,
  mapPlayerStoreOfferSettlementError,
  normalizePlayerStoreOfferReceiptKey,
  normalizePlayerStoreOfferScope,
  playerStoreOfferConflict,
  playerStoreOfferUnavailable,
  requiresPlayerStoreOfferFailureProbe,
} from "./playerStoreOfferPublicRepositoryErrors.ts";
import {
  type PlayerStoreOfferClient,
  PlayerStoreOfferPublicReadStore,
  type PlayerStoreOfferQueryResponse,
} from "./playerStoreOfferPublicReadStore.ts";
import { SupabaseStoreOfferQuoteRepository } from "./supabaseStoreOfferQuoteRepository.ts";
import { SupabaseStoreOfferSettlementRepository } from "./supabaseStoreOfferSettlementRepository.ts";
import { SupabaseStoreSellerOfferRepository } from "./supabaseStoreSellerOfferRepository.ts";

interface OfferFailureStateRow {
  readonly status?: unknown;
  readonly version?: unknown;
}

const BUYER_RECEIPT_SELECTION = [
  "public_key",
  "quote_key",
  "offer_key",
  "business_key",
  "seller_party_key",
  "catalog_item_key",
  "canonical_item_key",
  "store_item_key",
  "inventory_transaction_key",
  "quantity",
  "unit_price",
  "total_price",
  "business_credit",
  "currency_code",
  "offer_version_before",
  "offer_version_after",
  "remaining_listed_quantity",
  "completed_at",
].join(",");

export class SupabasePlayerStoreOfferPublicRepository
  implements PlayerStoreOfferPublicRepository {
  private readonly catalogRepository: SupabaseStoreSellerOfferRepository;
  private readonly quoteRepository: SupabaseStoreOfferQuoteRepository;
  private readonly settlementRepository: SupabaseStoreOfferSettlementRepository;
  private readonly readStore: PlayerStoreOfferPublicReadStore;

  constructor(private readonly client: PlayerStoreOfferClient) {
    this.catalogRepository = new SupabaseStoreSellerOfferRepository(client);
    this.quoteRepository = new SupabaseStoreOfferQuoteRepository(client);
    this.settlementRepository = new SupabaseStoreOfferSettlementRepository(
      client,
    );
    this.readStore = new PlayerStoreOfferPublicReadStore(client);
  }

  async listOfferProducts(
    input: PlayerStoreOfferPublicScope,
  ): Promise<readonly PlayerStoreOfferPublicProductDto[]> {
    const scope = normalizePlayerStoreOfferScope(input);
    try {
      const groups = await this.catalogRepository.listCatalogOfferGroups(
        scope.gameSessionId,
      );
      const identities = await this.readStore.readBusinessIdentities(
        scope.gameSessionId,
        businessSellerPartyKeys(groups),
      );
      const buyerOwnedBusinessIds = await this.readStore
        .readBuyerOwnedBusinessIds(
          scope,
          [...identities.values()].map((identity) => identity.businessId),
        );
      const unreservedBusinessOfferKeys = await this.readStore
        .readUnreservedBusinessOfferKeys(
          scope.gameSessionId,
          businessSellerOfferKeys(groups),
        );
      return groups.map((group) =>
        projectPlayerStoreOfferProduct(
          group,
          identities,
          scope.playerId,
          unreservedBusinessOfferKeys,
          buyerOwnedBusinessIds,
        )
      );
    } catch (error) {
      throw mapPlayerStoreOfferCatalogError(error);
    }
  }

  async createBusinessOfferQuote(
    input: PlayerStoreOfferPublicScope & {
      readonly offerKey: string;
      readonly quantity: number;
      readonly expectedVersion: number;
      readonly idempotencyKey: string;
    },
  ): Promise<PlayerStoreOfferPublicQuoteDto> {
    const scope = normalizePlayerStoreOfferScope(input);
    try {
      const quote = await this.quoteRepository.createBusinessOfferQuote({
        gameSessionId: scope.gameSessionId,
        buyerPlayerId: scope.playerId,
        offerKey: input.offerKey,
        quantity: input.quantity,
        expectedOfferVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
      });
      const identity = await this.readStore.requireBusinessIdentity(
        scope.gameSessionId,
        quote.sellerPartyKey,
        quote.businessKey,
      );
      return projectPlayerStoreOfferQuote(quote, identity);
    } catch (error) {
      const stateError = await this.mapOfferFailureState(
        error,
        scope.gameSessionId,
        input.offerKey,
        input.expectedVersion,
      );
      if (stateError) throw stateError;
      throw mapPlayerStoreOfferQuoteError(error);
    }
  }

  async purchaseBusinessOffer(
    input: PlayerStoreOfferPublicScope & {
      readonly offerKey: string;
      readonly quoteKey: string;
      readonly quantity: number;
      readonly expectedVersion: number;
      readonly idempotencyKey: string;
    },
  ): Promise<PlayerStoreOfferPublicReceiptDto> {
    const scope = normalizePlayerStoreOfferScope(input);
    try {
      const receipt = await this.settlementRepository.settleBusinessOffer({
        gameSessionId: scope.gameSessionId,
        buyerPlayerId: scope.playerId,
        offerKey: input.offerKey,
        quoteKey: input.quoteKey,
        quantity: input.quantity,
        expectedOfferVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
      });
      const identity = await this.readStore.requireBusinessIdentity(
        scope.gameSessionId,
        receipt.sellerPartyKey,
        receipt.businessKey,
        { requireActive: false },
      );
      return projectPlayerStoreOfferReceipt(receipt, identity);
    } catch (error) {
      const stateError = await this.mapOfferFailureState(
        error,
        scope.gameSessionId,
        input.offerKey,
        input.expectedVersion,
      );
      if (stateError) throw stateError;
      throw mapPlayerStoreOfferSettlementError(error);
    }
  }

  async readBusinessOfferReceipt(
    input: PlayerStoreOfferPublicScope & { readonly receiptKey: string },
  ): Promise<PlayerStoreOfferPublicReceiptDto> {
    const scope = normalizePlayerStoreOfferScope(input);
    const receiptKey = normalizePlayerStoreOfferReceiptKey(input.receiptKey);
    const response = await this.client
      .from("store_offer_purchase_receipts")
      .select(BUYER_RECEIPT_SELECTION)
      .eq("game_session_id", scope.gameSessionId)
      .eq("buyer_player_id", scope.playerId)
      .eq("public_key", receiptKey)
      .maybeSingle() as PlayerStoreOfferQueryResponse<unknown>;

    if (response.error) {
      throw playerStoreOfferUnavailable(
        "player_store_offer_receipt_read_failed",
        "Store offer receipt could not be loaded.",
      );
    }
    if (!response.data) {
      throw new PlayerStorePublicError(
        "store_offer_receipt_not_found",
        "Store offer receipt was not found.",
        404,
        false,
      );
    }

    try {
      const receipt = parsePlayerStoreOfferBuyerReceiptRow(response.data);
      const identity = await this.readStore.requireBusinessIdentity(
        scope.gameSessionId,
        receipt.sellerPartyKey,
        receipt.businessKey,
        { requireActive: false },
      );
      return {
        receiptKey: receipt.receiptKey,
        quoteKey: receipt.quoteKey,
        offerKey: receipt.offerKey,
        businessKey: receipt.businessKey,
        businessName: identity.businessName,
        sellerPartyKey: receipt.sellerPartyKey,
        sellerName: identity.businessName,
        catalogItemKey: receipt.catalogItemKey,
        canonicalItemKey: receipt.canonicalItemKey,
        storeItemKey: receipt.storeItemKey,
        inventoryTransactionKey: receipt.inventoryTransactionKey,
        quantity: receipt.quantity,
        unitPrice: receipt.unitPrice,
        totalPrice: receipt.totalPrice,
        sellerProceeds: receipt.sellerProceeds,
        currencyCode: receipt.currencyCode,
        offerVersionBefore: receipt.offerVersionBefore,
        offerVersionAfter: receipt.offerVersionAfter,
        remainingListedQuantity: receipt.remainingListedQuantity,
        completedAt: receipt.completedAt,
        alreadyCompleted: true,
      };
    } catch (error) {
      if (error instanceof PlayerStorePublicError) throw error;
      throw playerStoreOfferUnavailable(
        "player_store_offer_receipt_read_failed",
        "Store offer receipt could not be loaded.",
      );
    }
  }

  private async mapOfferFailureState(
    error: unknown,
    gameSessionId: string,
    offerKey: string,
    expectedVersion: number,
  ): Promise<PlayerStorePublicError | null> {
    if (!requiresPlayerStoreOfferFailureProbe(error)) return null;
    const response = await this.client
      .from("store_seller_offers")
      .select("status,version")
      .eq("game_session_id", gameSessionId)
      .eq("public_key", offerKey)
      .maybeSingle() as PlayerStoreOfferQueryResponse<OfferFailureStateRow>;
    if (response.error) return null;
    if (!response.data) {
      return playerStoreOfferConflict(
        "store_offer_not_available",
        "Store offer is not available.",
      );
    }
    const status = typeof response.data.status === "string"
      ? response.data.status.trim().toLowerCase()
      : "";
    if (status === "withdrawal_pending") {
      return playerStoreOfferConflict(
        "store_offer_withdrawal_pending",
        "Store offer is being withdrawn.",
      );
    }
    if (status !== "active") {
      return playerStoreOfferConflict(
        "store_offer_not_available",
        "Store offer is not available.",
      );
    }
    const version = Number(response.data.version);
    if (Number.isSafeInteger(version) && version !== expectedVersion) {
      return playerStoreOfferConflict(
        "store_offer_version_conflict",
        "The Store offer changed before the request could complete.",
      );
    }
    return null;
  }
}
