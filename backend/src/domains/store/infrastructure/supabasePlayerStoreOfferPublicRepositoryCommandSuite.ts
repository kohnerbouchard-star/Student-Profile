import { SupabasePlayerStoreOfferPublicRepository } from "./supabasePlayerStoreOfferPublicRepository.ts";
import {
  assertEquals,
  assertPrivateFieldsAbsent,
  assertPublicError,
  BUSINESS_OFFER_KEY,
  BUSINESS_PARTY_KEY,
  businessIdentity,
  BUYER_ID,
  captureError,
  expectedPublicReceipt,
  FakeClient,
  GAME_ID,
  QUOTE_KEY,
  quoteResult,
  RECEIPT_KEY,
  receiptRow,
  settlementResult,
} from "./supabasePlayerStoreOfferPublicRepositoryTestFixtures.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

export function registerPlayerStoreOfferPublicCommandTests(): void {
  Deno.test(
    "Store-offer public quote forwards only trusted scope and public intent to the certified quote authority",
    async () => {
      const client = new FakeClient({
        rpc: { create_business_store_offer_quote_v2: quoteResult() },
        identities: [businessIdentity()],
      });
      const repository = new SupabasePlayerStoreOfferPublicRepository(
        client as never,
      );

      const quote = await repository.createBusinessOfferQuote({
        gameSessionId: GAME_ID,
        playerId: BUYER_ID,
        offerKey: BUSINESS_OFFER_KEY,
        quantity: 2,
        expectedVersion: 3,
        idempotencyKey: "quote-request-0001",
      });

      assertEquals(client.rpcCalls, [{
        functionName: "create_business_store_offer_quote_v2",
        args: {
          p_game_session_id: GAME_ID,
          p_buyer_player_id: BUYER_ID,
          p_offer_key: BUSINESS_OFFER_KEY,
          p_quantity: 2,
          p_expected_offer_version: 3,
          p_idempotency_key: "quote-request-0001",
        },
      }]);
      assertEquals(quote, {
        quoteKey: QUOTE_KEY,
        quoteStatus: "created",
        offerKey: BUSINESS_OFFER_KEY,
        offerVersion: 3,
        businessKey: `biz_${"c".repeat(32)}`,
        businessName: "Orchard Works",
        sellerPartyKey: BUSINESS_PARTY_KEY,
        sellerName: "Orchard Works",
        catalogItemKey: `itm_${"f".repeat(32)}`,
        canonicalItemKey: "curriculum.apple",
        storeItemKey: "apple",
        quantity: 2,
        availableQuantityAtQuote: 10,
        unitPrice: 5,
        totalPrice: 10,
        currencyCode: "ECO",
        expiresAt: "2026-08-25T01:02:00.000Z",
        pricingVersion: "business-offer-fixed-price-v2",
        replayed: false,
      });
      assertPrivateFieldsAbsent(quote);
    },
  );

  Deno.test(
    "Store-offer public purchase composes atomic settlement while stripping account, cost, COGS, and private seller-credit internals",
    async () => {
      const client = new FakeClient({
        rpc: { settle_business_store_offer_v2: settlementResult(false) },
        identities: [businessIdentity()],
      });
      const repository = new SupabasePlayerStoreOfferPublicRepository(
        client as never,
      );

      const receipt = await repository.purchaseBusinessOffer({
        gameSessionId: GAME_ID,
        playerId: BUYER_ID,
        offerKey: BUSINESS_OFFER_KEY,
        quoteKey: QUOTE_KEY,
        quantity: 2,
        expectedVersion: 3,
        idempotencyKey: "purchase-request-0001",
      });

      assertEquals(client.rpcCalls, [{
        functionName: "settle_business_store_offer_v2",
        args: {
          p_game_session_id: GAME_ID,
          p_buyer_player_id: BUYER_ID,
          p_offer_key: BUSINESS_OFFER_KEY,
          p_quote_key: QUOTE_KEY,
          p_quantity: 2,
          p_expected_offer_version: 3,
          p_idempotency_key: "purchase-request-0001",
        },
      }]);
      assertEquals(receipt, expectedPublicReceipt(false));
      assertPrivateFieldsAbsent(receipt);
    },
  );

  Deno.test(
    "Store-offer Buyer receipt read keeps historical seller identity readable and filters trusted game, Buyer, and spr key",
    async () => {
      const client = new FakeClient({
        identities: [businessIdentity({ status: "closed" })],
        receipt: receiptRow(),
      });
      const repository = new SupabasePlayerStoreOfferPublicRepository(
        client as never,
      );

      const receipt = await repository.readBusinessOfferReceipt({
        gameSessionId: GAME_ID,
        playerId: BUYER_ID,
        receiptKey: RECEIPT_KEY,
      });

      const receiptQuery = client.queries[0];
      assertEquals(receiptQuery.table, "store_offer_purchase_receipts");
      assertEquals(
        receiptQuery.selection,
        "public_key,quote_key,offer_key,business_key,seller_party_key,catalog_item_key,canonical_item_key,store_item_key,inventory_transaction_key,quantity,unit_price,total_price,business_credit,currency_code,offer_version_before,offer_version_after,remaining_listed_quantity,completed_at",
      );
      assertEquals(receiptQuery.filters, [
        ["game_session_id", GAME_ID],
        ["buyer_player_id", BUYER_ID],
        ["public_key", RECEIPT_KEY],
      ]);
      const historicalIdentityQuery = client.queries[1];
      assertEquals(historicalIdentityQuery.table, "economic_parties");
      assertEquals(historicalIdentityQuery.filters, [
        ["game_session_id", GAME_ID],
        ["party_kind", "business"],
      ]);
      assertEquals(historicalIdentityQuery.inFilters, [
        ["public_key", [BUSINESS_PARTY_KEY]],
      ]);
      assertEquals(receipt, expectedPublicReceipt(true));
      assertPrivateFieldsAbsent(receipt);
    },
  );

  Deno.test(
    "Store-offer repository maps database failures to stable non-sensitive PlayerStorePublicError values",
    async () => {
      const quoteClient = new FakeClient({
        rpcErrors: {
          create_business_store_offer_quote_v2:
            "STORE_OFFER_QUOTE_VERSION_CONFLICT internal=11111111-1111-4111-8111-111111111111",
        },
        offerState: { status: "active", version: 4 },
      });
      const quoteRepository = new SupabasePlayerStoreOfferPublicRepository(
        quoteClient as never,
      );
      const quoteError = await captureError(() =>
        quoteRepository.createBusinessOfferQuote({
          gameSessionId: GAME_ID,
          playerId: BUYER_ID,
          offerKey: BUSINESS_OFFER_KEY,
          quantity: 2,
          expectedVersion: 3,
          idempotencyKey: "quote-request-0002",
        })
      );
      assertPublicError(quoteError, "store_offer_version_conflict", 409);
      assertEquals(quoteError.message.includes(GAME_ID), false);

      const hiddenReceiptClient = new FakeClient({ receipt: null });
      const receiptRepository = new SupabasePlayerStoreOfferPublicRepository(
        hiddenReceiptClient as never,
      );
      const receiptError = await captureError(() =>
        receiptRepository.readBusinessOfferReceipt({
          gameSessionId: GAME_ID,
          playerId: BUYER_ID,
          receiptKey: RECEIPT_KEY,
        })
      );
      assertPublicError(receiptError, "store_offer_receipt_not_found", 404);
    },
  );

  Deno.test(
    "Store-offer self-purchase is forbidden and withdrawal-pending failures remain distinct",
    async () => {
      const selfPurchaseClient = new FakeClient({
        rpcErrors: {
          create_business_store_offer_quote_v2:
            "STORE_OFFER_QUOTE_SELF_PURCHASE",
        },
      });
      const selfPurchaseRepository =
        new SupabasePlayerStoreOfferPublicRepository(
          selfPurchaseClient as never,
        );
      const selfPurchaseError = await captureError(() =>
        selfPurchaseRepository.createBusinessOfferQuote({
          gameSessionId: GAME_ID,
          playerId: BUYER_ID,
          offerKey: BUSINESS_OFFER_KEY,
          quantity: 1,
          expectedVersion: 3,
          idempotencyKey: "quote-request-self",
        })
      );
      assertPublicError(
        selfPurchaseError,
        "store_offer_self_purchase_forbidden",
        403,
      );

      const withdrawalClient = new FakeClient({
        rpcErrors: {
          settle_business_store_offer_v2:
            "STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID",
        },
        offerState: { status: "withdrawal_pending", version: 4 },
      });
      const withdrawalRepository = new SupabasePlayerStoreOfferPublicRepository(
        withdrawalClient as never,
      );
      const withdrawalError = await captureError(() =>
        withdrawalRepository.purchaseBusinessOffer({
          gameSessionId: GAME_ID,
          playerId: BUYER_ID,
          offerKey: BUSINESS_OFFER_KEY,
          quoteKey: QUOTE_KEY,
          quantity: 1,
          expectedVersion: 3,
          idempotencyKey: "purchase-withdrawal",
        })
      );
      assertPublicError(
        withdrawalError,
        "store_offer_withdrawal_pending",
        409,
      );
      assertEquals(withdrawalClient.queries[0].selection, "status,version");
      assertEquals(withdrawalClient.queries[0].filters, [
        ["game_session_id", GAME_ID],
        ["public_key", BUSINESS_OFFER_KEY],
      ]);
    },
  );

  Deno.test(
    "Store-offer receipt authorization does not distinguish another Buyer's receipt from a missing receipt",
    async () => {
      const client = new FakeClient({ receipt: null });
      const repository = new SupabasePlayerStoreOfferPublicRepository(
        client as never,
      );
      const error = await captureError(() =>
        repository.readBusinessOfferReceipt({
          gameSessionId: GAME_ID,
          playerId: "33333333-3333-4333-8333-333333333333",
          receiptKey: RECEIPT_KEY,
        })
      );
      assertPublicError(error, "store_offer_receipt_not_found", 404);
      assertEquals(error.message, "Store offer receipt was not found.");
      assertEquals(client.queries[0].filters, [
        ["game_session_id", GAME_ID],
        ["buyer_player_id", "33333333-3333-4333-8333-333333333333"],
        ["public_key", RECEIPT_KEY],
      ]);
    },
  );
}
