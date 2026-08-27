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
import {
  invalidPublicResponse,
  mapFundingRpcError,
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

  async createSeededQuote(
    input: Parameters<PlayerStoreFundingPublicRepository["createSeededQuote"]>[0],
  ): Promise<PlayerStoreSeededFundingQuoteDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "create_seeded_store_funding_quote_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_player_id: scope.playerId,
        p_item_key: input.itemKey,
        p_quantity: input.quantity,
        p_allocations: input.allocations,
        p_idempotency_key: input.idempotencyKey,
        p_effective_at: input.effectiveAt,
      },
      "quote",
    );
    return parseSeededQuote(raw);
  }

  async settleSeededPurchase(
    input: Parameters<
      PlayerStoreFundingPublicRepository["settleSeededPurchase"]
    >[0],
  ): Promise<PlayerStoreSeededFundingReceiptDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "settle_seeded_store_funding_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_player_id: scope.playerId,
        p_quote_key: input.quoteKey,
        p_idempotency_key: input.idempotencyKey,
        p_client_submitted_at: input.clientSubmittedAt,
        p_request_metadata: {},
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
    const row = publicRecord(await this.callRpc(
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
    ));

    const fundingQuote = parseFundingQuote(row.fundingQuote);
    const quote = parseBusinessStoreOfferQuote(row);
    const identity = await this.readStore.requireBusinessIdentity(
      scope.gameSessionId,
      quote.sellerPartyKey,
      quote.businessKey,
    );
    return Object.freeze({
      ...projectPlayerStoreOfferQuote(quote, identity),
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
      "settle_business_store_offer_funding_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_buyer_player_id: scope.playerId,
        p_offer_key: input.offerKey,
        p_quote_key: input.quoteKey,
        p_quantity: input.quantity,
        p_expected_offer_version: input.expectedVersion,
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
    const fundingReceipt = parseFundingReceipt(row.fundingReceipt);
    const { fundingReceipt: _fundingReceipt, ...receiptPayload } = row;
    const receipt = parseBusinessStoreOfferReceipt(receiptPayload);
    const identity = await this.readStore.requireBusinessIdentity(
      scope.gameSessionId,
      receipt.sellerPartyKey,
      receipt.businessKey,
      { requireActive: false },
    );
    return Object.freeze({
      ...projectPlayerStoreOfferReceipt(receipt, identity),
      fundingReceipt,
    });
  }

  private async callRpc(
    functionName: string,
    args: Record<string, unknown>,
    phase: "quote" | "purchase" | "receipt",
  ): Promise<unknown> {
    const response = await this.client.rpc<unknown>(functionName, args) as
      PlayerStoreOfferQueryResponse<unknown>;
    if (response.error) throw mapFundingRpcError(response.error, phase);
    if (response.data === null || response.data === undefined) {
      throw invalidPublicResponse();
    }
    return response.data;
  }
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
