import { SupabasePlayerStoreOfferPublicRepository } from "./supabasePlayerStoreOfferPublicRepository.ts";
import {
  assertEquals,
  assertPrivateFieldsAbsent,
  BUSINESS_ID,
  BUSINESS_OFFER_KEY,
  BUSINESS_PARTY_KEY,
  businessIdentity,
  BUYER_ID,
  CATALOG_ITEM_KEY,
  catalogGroup,
  FakeClient,
  GAME_ID,
  GAME_ITEM_ID,
  INVENTORY_ACCOUNT_ID,
  NPC_OFFER_KEY,
  NPC_PARTY_KEY,
  SEEDED_OFFER_KEY,
  SEEDED_PARTY_KEY,
} from "./supabasePlayerStoreOfferPublicRepositoryTestFixtures.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

export function registerPlayerStoreOfferPublicCatalogTests(): void {
  Deno.test(
    "Store-offer public catalog composes aggregation and game-scoped Business identity from current offer rows",
    async () => {
      const client = new FakeClient({
        rpc: { read_store_catalog_offer_groups_v2: [catalogGroup()] },
        identities: [businessIdentity()],
      });
      const repository = new SupabasePlayerStoreOfferPublicRepository(
        client as never,
      );

      const products = await repository.listOfferProducts({
        gameSessionId: GAME_ID,
        playerId: BUYER_ID,
      });

      assertEquals(client.rpcCalls, [{
        functionName: "read_store_catalog_offer_groups_v2",
        args: { p_game_session_id: GAME_ID },
      }]);
      assertEquals(client.queries.length, 4);
      assertEquals(client.queries[0].table, "economic_parties");
      assertEquals(
        client.queries[0].selection,
        "public_key,business:business_entities!economic_parties_business_scope_fk(id,public_key,legal_name,owner_player_id,status,currency_code)",
      );
      assertEquals(client.queries[0].filters, [
        ["game_session_id", GAME_ID],
        ["party_kind", "business"],
        ["status", "active"],
      ]);
      assertEquals(client.queries[0].inFilters, [
        ["public_key", [BUSINESS_PARTY_KEY]],
      ]);
      assertEquals(client.queries[1].table, "business_ownership_positions");
      assertEquals(client.queries[1].selection, "business_id");
      assertEquals(client.queries[1].filters, [
        ["game_session_id", GAME_ID],
        ["player_id", BUYER_ID],
        ["status", "active"],
      ]);
      assertEquals(client.queries[1].inFilters, [
        ["business_id", [BUSINESS_ID]],
      ]);
      assertEquals(client.queries[2].table, "store_seller_offers");
      assertEquals(
        client.queries[2].selection,
        "public_key,inventory_account_id,game_item_id",
      );
      assertEquals(client.queries[2].filters, [
        ["game_session_id", GAME_ID],
        ["seller_kind", "business"],
        ["status", "active"],
      ]);
      assertEquals(client.queries[2].inFilters, [
        ["public_key", [BUSINESS_OFFER_KEY]],
      ]);
      assertEquals(client.queries[3].table, "inventory_holdings");
      assertEquals(
        client.queries[3].selection,
        "inventory_account_id,game_item_id,quantity_reserved",
      );
      assertEquals(client.queries[3].filters, [["game_session_id", GAME_ID]]);
      assertEquals(client.queries[3].inFilters, [
        ["inventory_account_id", [INVENTORY_ACCOUNT_ID]],
      ]);
      assertEquals(products, [{
        catalogItemKey: CATALOG_ITEM_KEY,
        canonicalItemKey: "curriculum.apple",
        storeItemKey: "apple",
        name: "Apple",
        description: "A canonical apple.",
        category: "food",
        currencyCode: "ECO",
        bestOfferKey: BUSINESS_OFFER_KEY,
        bestUnitPrice: 5,
        totalAvailableQuantity: 35,
        sellerCount: 3,
        offerCount: 3,
        offers: [
          {
            offerKey: BUSINESS_OFFER_KEY,
            sellerKind: "business",
            sellerPartyKey: BUSINESS_PARTY_KEY,
            sellerName: "Orchard Works",
            businessKey: `biz_${"c".repeat(32)}`,
            businessName: "Orchard Works",
            unitPrice: 5,
            currencyCode: "ECO",
            availableQuantity: 10,
            status: "active",
            purchasability: "business_offer",
            purchasable: true,
            version: 3,
          },
          {
            offerKey: SEEDED_OFFER_KEY,
            sellerKind: "seeded",
            sellerPartyKey: SEEDED_PARTY_KEY,
            sellerName: "Econovaria Store",
            businessKey: null,
            businessName: null,
            unitPrice: 6,
            currencyCode: "ECO",
            availableQuantity: 20,
            status: "active",
            purchasability: "system_offer",
            purchasable: true,
            version: 1,
          },
          {
            offerKey: NPC_OFFER_KEY,
            sellerKind: "npc",
            sellerPartyKey: NPC_PARTY_KEY,
            sellerName: "Market Bot",
            businessKey: null,
            businessName: null,
            unitPrice: 7,
            currencyCode: "ECO",
            availableQuantity: 5,
            status: "active",
            purchasability: "system_offer",
            purchasable: true,
            version: 2,
          },
        ],
        updatedAt: "2026-08-25T01:00:00.000Z",
      }]);
      assertPrivateFieldsAbsent(products);
    },
  );

  Deno.test(
    "Store-offer public catalog disables self-owned, non-active, seller-mismatched, and reserved Business offers without leaking why",
    async () => {
      const cases = [
        {
          name: "self-owned",
          identity: businessIdentity({ ownerPlayerId: BUYER_ID }),
        },
        {
          name: "non-active",
          identity: businessIdentity({ status: "distressed" }),
        },
        {
          name: "seller-currency-mismatch",
          identity: businessIdentity({ currencyCode: "USD" }),
        },
        {
          name: "listing-reserved",
          identity: businessIdentity(),
          quantityReserved: 1,
        },
        {
          name: "active-co-owner",
          identity: businessIdentity(),
          coOwner: true,
        },
      ] as const;

      for (const testCase of cases) {
        const client = new FakeClient({
          rpc: { read_store_catalog_offer_groups_v2: [catalogGroup()] },
          identities: [testCase.identity],
          holdingReservations: [{
            inventory_account_id: INVENTORY_ACCOUNT_ID,
            game_item_id: GAME_ITEM_ID,
            quantity_reserved: "quantityReserved" in testCase
              ? testCase.quantityReserved
              : 0,
          }],
          ownershipPositions: "coOwner" in testCase && testCase.coOwner
            ? [{ business_id: BUSINESS_ID }]
            : [],
        });
        const repository = new SupabasePlayerStoreOfferPublicRepository(
          client as never,
        );
        const [product] = await repository.listOfferProducts({
          gameSessionId: GAME_ID,
          playerId: BUYER_ID,
        });
        const businessOffer = product.offers[0];
        assertEquals(businessOffer.purchasability, "business_offer");
        assertEquals(businessOffer.purchasable, false);
        assertEquals(product.bestOfferKey, SEEDED_OFFER_KEY);
        assertEquals(product.bestUnitPrice, 6);
        assertEquals(product.totalAvailableQuantity, 25);
        assertEquals(product.sellerCount, 2);
        assertEquals(product.offerCount, 3);
        assertPrivateFieldsAbsent(product);
        assertEquals(JSON.stringify(product).includes(testCase.name), false);
      }
    },
  );
}
