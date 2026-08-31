import {
  type PlayerStoreBusinessFundingQuoteDto,
  type PlayerStoreBusinessFundingReceiptDto,
  type PlayerStoreFundingPublicRepository,
  type PlayerStoreFundingPublicScope,
  type PlayerStoreSeededFundingQuoteDto,
  type PlayerStoreSeededFundingReceiptDto,
} from "../contracts/playerStoreFundingPublicContracts.ts";
import {
  projectPlayerStoreOfferQuote,
  projectPlayerStoreOfferReceipt,
} from "../contracts/playerStoreOfferPublicContracts.ts";
import {
  PlayerStorePublicError,
} from "../contracts/playerStorePublicContracts.ts";
import { parseBusinessStoreOfferQuote } from "../contracts/storeOfferQuoteContracts.ts";
import { parseBusinessStoreOfferReceipt } from "../contracts/storeOfferSettlementContracts.ts";
import {
  type PlayerStoreOfferClient,
  PlayerStoreOfferPublicReadStore,
  type PlayerStoreOfferQueryResponse,
} from "./playerStoreOfferPublicReadStore.ts";
import { mapFundingRpcError } from "./playerStoreFundingPublicErrors.ts";
import {
  assertFundingBinding,
  invalidPublicResponse,
  parseFundingQuote,
  parseFundingReceipt,
  parseSeededQuote,
  parseSeededReceipt,
  publicRecord,
} from "./playerStoreFundingPublicResponse.ts";

const UUID_EXACT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class SupabasePlayerStoreFundingPublicRepository
  implements PlayerStoreFundingPublicRepository {
  private readonly readStore: PlayerStoreOfferPublicReadStore;

  constructor(private readonly client: PlayerStoreOfferClient) {
    this.readStore = new PlayerStoreOfferPublicReadStore(client);
  }

  async createSystemOfferQuote(
    input: Parameters<
      PlayerStoreFundingPublicRepository["createSystemOfferQuote"]
    >[0],
  ): Promise<PlayerStoreSeededFundingQuoteDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "create_system_store_offer_funding_quote_v2",
      {
        p_game_session_id: scope.gameSessionId,
        p_player_id: scope.playerId,
        p_offer_key: input.offerKey,
        p_quantity: input.quantity,
        p_expected_offer_version: input.expectedVersion,
        p_allocations: input.allocations,
        p_idempotency_key: input.idempotencyKey,
      },
      "quote",
    );
    return parseSeededQuote(raw);
  }

  async settleSystemOfferPurchase(
    input: Parameters<
      PlayerStoreFundingPublicRepository["settleSystemOfferPurchase"]
    >[0],
  ): Promise<PlayerStoreSeededFundingReceiptDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "settle_system_store_offer_funding_v2",
      {
        p_game_session_id: scope.gameSessionId,
        p_player_id: scope.playerId,
        p_quote_key: input.quoteKey,
        p_idempotency_key: input.idempotencyKey,
      },
      "purchase",
    );
    return parseSeededReceipt(raw);
  }

  async createBusinessOfferQuote(
    input: Parameters<
      PlayerStoreFundingPublicRepository["createBusinessOfferQuote"]
    >[0],
  ): Promise<PlayerStoreBusinessFundingQuoteDto> {
    const scope = normalizeScope(input);
    const row = publicRecord(
      await this.callRpc(
        "create_business_store_offer_funding_quote_v1",
        {
          p_game_session_id: scope.gameSessionId,
          p_buyer_player_id: scope.playerId,
          p_offer_key: input.offerKey,
          p_quantity: input.quantity,
          p_expected_offer_version: input.expectedVersion,
          p_allocations: input.allocations,
          p_idempotency_key: input.idempotencyKey,
        },
        "quote",
      ),
    );

    const fundingQuote = parseFundingQuote(row.fundingQuote);
    const contextDigest = parseContextDigest(row.contextDigest);
    const {
      fundingQuote: _fundingQuote,
      contextDigest: _contextDigest,
      ...quotePayload
    } = row;
    const quote = parseBusinessStoreOfferQuote(quotePayload);
    assertFundingBinding(
      fundingQuote,
      "store.business-offer",
      quote.quoteKey,
      quote.sellerCurrencyCode,
      quote.sellerTotalPrice,
    );
    const identity = await this.readStore.requireBusinessIdentity(
      scope.gameSessionId,
      quote.sellerPartyKey,
      quote.businessKey,
    );
    return Object.freeze({
      ...projectPlayerStoreOfferQuote(quote, identity),
      contextDigest,
      fundingQuote,
    });
  }

  async settleBusinessOfferPurchase(
    input: Parameters<
      PlayerStoreFundingPublicRepository["settleBusinessOfferPurchase"]
    >[0],
  ): Promise<PlayerStoreBusinessFundingReceiptDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "settle_business_store_offer_funding_v2",
      {
        p_game_session_id: scope.gameSessionId,
        p_buyer_player_id: scope.playerId,
        p_quote_key: input.quoteKey,
        p_idempotency_key: input.idempotencyKey,
      },
      "purchase",
    );
    return await this.parseBusinessReceipt(scope, raw);
  }

  async readBusinessOfferReceipt(
    input: Parameters<
      PlayerStoreFundingPublicRepository["readBusinessOfferReceipt"]
    >[0],
  ): Promise<PlayerStoreBusinessFundingReceiptDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "read_business_store_offer_funding_receipt_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_buyer_player_id: scope.playerId,
        p_receipt_key: input.receiptKey,
      },
      "receipt",
    );
    return await this.parseBusinessReceipt(scope, raw);
  }

  private async parseBusinessReceipt(
    scope: PlayerStoreFundingPublicScope,
    raw: unknown,
  ): Promise<PlayerStoreBusinessFundingReceiptDto> {
    const row = publicRecord(raw);
    const fundingReceipt = parseFundingReceipt(
      row.fundingReceipt,
      "business_offer_purchase_funding",
    );
    const contextDigest = parseContextDigest(row.contextDigest);
    const {
      fundingReceipt: _fundingReceipt,
      contextDigest: _contextDigest,
      ...receiptPayload
    } = row;
    const receipt = parseBusinessStoreOfferReceipt(receiptPayload);
    assertFundingBinding(
      fundingReceipt,
      "store.business-offer",
      receipt.quoteKey,
      receipt.currencyCode,
      receipt.totalPrice,
    );
    const identity = await this.readStore.requireBusinessIdentity(
      scope.gameSessionId,
      receipt.sellerPartyKey,
      receipt.businessKey,
      { requireActive: false },
    );
    return Object.freeze({
      ...projectPlayerStoreOfferReceipt(receipt, identity),
      contextDigest,
      fundingReceipt,
    });
  }

  private async callRpc(
    functionName: string,
    args: Record<string, unknown>,
    phase: "quote" | "purchase" | "receipt",
  ): Promise<unknown> {
    const response = await this.client.rpc<unknown>(
      functionName,
      args,
    ) as PlayerStoreOfferQueryResponse<unknown>;
    if (response.error) throw mapFundingRpcError(response.error, phase);
    if (response.data === null || response.data === undefined) {
      throw invalidPublicResponse();
    }
    return response.data;
  }
}

function parseContextDigest(value: unknown): string {
  const digest = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/u.test(digest)) throw invalidPublicResponse();
  return digest;
}

function normalizeScope(
  input: PlayerStoreFundingPublicScope,
): PlayerStoreFundingPublicScope {
  const gameSessionId = String(input.gameSessionId ?? "").trim().toLowerCase();
  const playerId = String(input.playerId ?? "").trim().toLowerCase();
  if (!UUID_EXACT.test(gameSessionId) || !UUID_EXACT.test(playerId)) {
    throw new PlayerStorePublicError(
      "player_store_funding_scope_invalid",
      "Player Store funding scope is invalid.",
      500,
      false,
    );
  }
  return Object.freeze({ gameSessionId, playerId });
}
