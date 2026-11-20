#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  parseStoreCatalogOfferGroupRow,
  StoreSellerOfferContractError,
} from "../backend/src/domains/store/contracts/storeSellerOfferContracts.ts";

const fixture = {
  catalog_item_key: `itm_${"1".repeat(32)}`,
  canonical_item_key: "widget.v1",
  store_item_key: "widget",
  name: "Widget",
  description: "A canonical widget.",
  category: "finished_goods",
  currency_code: "NRC",
  best_unit_price: 8,
  total_available_quantity: 8,
  seller_count: 2,
  offer_count: 2,
  offers: [
    {
      offerKey: `sof_${"2".repeat(32)}`,
      sellerKey: `pty_${"3".repeat(32)}`,
      sellerKind: "business",
      sellerName: "Player Works",
      unitPrice: 8,
      currencyCode: "NRC",
      availableQuantity: 3,
      status: "active",
      version: 2,
    },
    {
      offerKey: `sof_${"4".repeat(32)}`,
      sellerKey: `pty_${"5".repeat(32)}`,
      sellerKind: "seeded",
      sellerName: "Econovaria Store",
      unitPrice: 10,
      currencyCode: "NRC",
      availableQuantity: 5,
      status: "active",
      version: 1,
    },
  ],
  updated_at: "2026-08-24T00:00:00.000Z",
};

const parsed = parseStoreCatalogOfferGroupRow(fixture);
assert.equal(parsed.catalogItemKey, fixture.catalog_item_key);
assert.equal(parsed.bestUnitPrice, 8);
assert.equal(parsed.totalAvailableQuantity, 8);
assert.equal(parsed.sellerCount, 2);
assert.equal(parsed.offerCount, 2);
assert.deepEqual(
  parsed.offers.map((offer) => offer.sellerKind),
  ["business", "seeded"],
);

assert.throws(
  () => parseStoreCatalogOfferGroupRow({
    ...fixture,
    total_available_quantity: 9,
  }),
  (error) =>
    error instanceof StoreSellerOfferContractError &&
    error.code === "invalid_store_offer_group",
);
assert.throws(
  () => parseStoreCatalogOfferGroupRow({
    ...fixture,
    best_unit_price: 7,
  }),
  /best_unit_price/u,
);
assert.throws(
  () => parseStoreCatalogOfferGroupRow({
    ...fixture,
    offers: [
      { ...fixture.offers[0], sellerKind: "player" },
      fixture.offers[1],
    ],
  }),
  /sellerKind/u,
);

console.log("Business Phase 7A typed Store seller-offer contract: PASS");
