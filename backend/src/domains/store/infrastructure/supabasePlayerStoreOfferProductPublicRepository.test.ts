import { SupabasePlayerStoreOfferProductPublicRepository } from "./supabasePlayerStoreOfferProductPublicRepository.ts";
import {
  assertEquals,
  BUSINESS_OFFER_KEY,
  businessIdentity,
  BUYER_ID,
  catalogGroup,
  FakeClient,
  GAME_ID,
  NPC_OFFER_KEY,
  SEEDED_OFFER_KEY,
} from "./supabasePlayerStoreOfferPublicRepositoryTestFixtures.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("read-only Store offer adapter leaves cross-currency eligibility to funded checkout", async () => {
  const client = new FakeClient({
    rpc: { read_store_catalog_offer_groups_v2: [catalogGroup()] },
    identities: [businessIdentity()],
    countryProfile: { currency_code: "USD" },
  });
  const repository = new SupabasePlayerStoreOfferProductPublicRepository(
    client as never,
  );

  const [product] = await repository.listOfferProducts({
    gameSessionId: GAME_ID,
    playerId: BUYER_ID,
  });
  const businessOffer = product.offers.find((offer) =>
    offer.offerKey === BUSINESS_OFFER_KEY
  );

  assertEquals(businessOffer?.purchasable, true);
  assertEquals(product.bestOfferKey, BUSINESS_OFFER_KEY);
  assertEquals(
    client.queries.some((query) =>
      query.table === "player_country_assignments" ||
      query.table === "country_profiles"
    ),
    false,
  );
});

Deno.test("mixed-currency Store offers retain exact row currencies without a false aggregate best price", async () => {
  const baseGroup = catalogGroup();
  const group = {
    ...baseGroup,
    best_unit_price: null,
    offers: baseGroup.offers.map((offer, index) => ({
      ...offer,
      currencyCode: index === 0 ? "USD" : offer.currencyCode,
    })),
  };
  const client = new FakeClient({
    rpc: { read_store_catalog_offer_groups_v2: [group] },
    identities: [businessIdentity({ currencyCode: "USD" })],
  });
  const repository = new SupabasePlayerStoreOfferProductPublicRepository(
    client as never,
  );

  const [product] = await repository.listOfferProducts({
    gameSessionId: GAME_ID,
    playerId: BUYER_ID,
  });

  assertEquals(product.bestOfferKey, null);
  assertEquals(product.bestUnitPrice, null);
  assertEquals(
    product.offers.map((offer) => [offer.offerKey, offer.currencyCode]),
    [
      [BUSINESS_OFFER_KEY, "USD"],
      [SEEDED_OFFER_KEY, "ECO"],
      [NPC_OFFER_KEY, "ECO"],
    ],
  );
});
