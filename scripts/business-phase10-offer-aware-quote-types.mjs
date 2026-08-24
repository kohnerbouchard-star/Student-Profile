#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION,
  normalizeBusinessStoreOfferQuoteCommand,
  parseBusinessStoreOfferQuote,
} from "../backend/src/domains/store/contracts/storeOfferQuoteContracts.ts";

const command = normalizeBusinessStoreOfferQuoteCommand({
  gameSessionId: "11111111-1111-4111-8111-111111111111",
  buyerPlayerId: "22222222-2222-4222-8222-222222222222",
  offerKey: `sof_${"a".repeat(32)}`,
  quantity: 3,
  expectedOfferVersion: 7,
  idempotencyKey: "offer-quote-command-0001",
});

assert.equal(command.quantity, 3);
assert.equal(command.expectedOfferVersion, 7);
assert.equal(
  BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION,
  "business-offer-fixed-price-v2",
);

assert.throws(
  () => normalizeBusinessStoreOfferQuoteCommand({ ...command, quantity: 0 }),
  /positive integer/u,
);
assert.throws(
  () => normalizeBusinessStoreOfferQuoteCommand({ ...command, quantity: 1_000_001 }),
  /must not exceed/u,
);
assert.throws(
  () => normalizeBusinessStoreOfferQuoteCommand({ ...command, offerKey: "bad" }),
  /invalid public format/u,
);
assert.throws(
  () => normalizeBusinessStoreOfferQuoteCommand({ ...command, idempotencyKey: "short" }),
  /8 to 160/u,
);

const quote = parseBusinessStoreOfferQuote({
  quoteKey: `quote_${"b".repeat(32)}`,
  quoteStatus: "created",
  offerKey: command.offerKey,
  offerVersion: command.expectedOfferVersion,
  businessKey: `biz_${"c".repeat(32)}`,
  sellerPartyKey: `pty_${"d".repeat(32)}`,
  catalogItemKey: `itm_${"e".repeat(32)}`,
  canonicalItemKey: "business.widget",
  storeItemKey: "business_widget",
  inventoryAccountKey: `iac_${"f".repeat(32)}`,
  buyerCountryCode: "NORTHREACH",
  quantity: 3,
  availableQuantityAtQuote: 20,
  sellerUnitPrice: 12.5,
  finalUnitPrice: 12.5,
  sellerTotalPrice: 37.5,
  finalTotalPrice: 37.5,
  sellerCurrencyCode: "NRC",
  buyerCurrencyCode: "NRC",
  exchangeRate: 1,
  pricingVersion: BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION,
  createdAt: "2026-08-25T01:00:00.000Z",
  expiresAt: "2026-08-25T01:02:00.000Z",
  replayed: false,
});

assert.equal(quote.finalTotalPrice, 37.5);
assert.equal(quote.availableQuantityAtQuote, 20);

assert.throws(
  () => parseBusinessStoreOfferQuote({ ...quote, finalTotalPrice: 40 }),
  /preserve the exact seller price/u,
);
assert.throws(
  () => parseBusinessStoreOfferQuote({ ...quote, buyerCurrencyCode: "ALT" }),
  /must settle in one currency/u,
);
assert.throws(
  () => parseBusinessStoreOfferQuote({ ...quote, exchangeRate: 1.2 }),
  /exchangeRate 1/u,
);
assert.throws(
  () => parseBusinessStoreOfferQuote({ ...quote, availableQuantityAtQuote: 2 }),
  /must cover quantity/u,
);
assert.throws(
  () => parseBusinessStoreOfferQuote({ ...quote, pricingVersion: "other" }),
  /not the fixed Business offer policy/u,
);

console.log("Business Phase 10A.2 offer-aware quote typed contract: PASS");
