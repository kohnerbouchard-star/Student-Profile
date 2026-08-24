#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  normalizeStockBusinessStoreOfferCommand,
  parseStockBusinessStoreOfferResult,
  StoreListingInventoryContractError,
} from "../backend/src/domains/store/contracts/storeListingInventoryContracts.ts";
import {
  SupabaseStoreListingInventoryRepository,
} from "../backend/src/domains/store/infrastructure/supabaseStoreListingInventoryRepository.ts";

const gameSessionId = "123e4567-e89b-42d3-a456-426614174000";
const businessKey = `biz_${"1".repeat(32)}`;
const offerKey = `sof_${"2".repeat(32)}`;
const inventoryAccountKey = `iac_${"3".repeat(32)}`;
const transactionKey = `itx_${"4".repeat(32)}`;

const normalized = normalizeStockBusinessStoreOfferCommand({
  gameSessionId: ` ${gameSessionId.toUpperCase()} `,
  businessKey: ` ${businessKey.toUpperCase()} `,
  offerKey: ` ${offerKey.toUpperCase()} `,
  quantity: 7,
  expectedOfferVersion: 3,
  idempotencyKey: "  stock-widget-typed-0001  ",
});
assert.deepEqual(normalized, {
  gameSessionId,
  businessKey,
  offerKey,
  quantity: 7,
  expectedOfferVersion: 3,
  idempotencyKey: "stock-widget-typed-0001",
});

const fixture = {
  offerKey,
  offerStatus: "draft",
  offerVersion: 4,
  inventoryAccountKey,
  transactionKey,
  quantityAdded: 7,
  listedQuantity: 12,
  availableQuantity: 10,
  averageUnitCost: 4.25,
  costCurrencyCode: "NRC",
  replayed: false,
};
const parsed = parseStockBusinessStoreOfferResult(fixture);
assert.deepEqual(parsed, fixture);

for (const [field, value] of [
  ["offerStatus", "retired"],
  ["offerKey", `off_${"2".repeat(32)}`],
  ["inventoryAccountKey", "iac_private_uuid"],
  ["transactionKey", "itx_private_uuid"],
  ["offerVersion", 0],
  ["quantityAdded", 0],
  ["listedQuantity", -1],
  ["availableQuantity", 13],
  ["averageUnitCost", -1],
  ["costCurrencyCode", "nrc"],
  ["replayed", "false"],
]) {
  assert.throws(
    () => parseStockBusinessStoreOfferResult({ ...fixture, [field]: value }),
    (error) =>
      error instanceof StoreListingInventoryContractError &&
      error.code.startsWith("invalid_store_listing"),
    `Expected ${field}=${String(value)} to fail closed.`,
  );
}

for (const invalid of [
  { ...normalized, gameSessionId: "not-a-uuid" },
  { ...normalized, businessKey: "business-1" },
  { ...normalized, offerKey: "offer-1" },
  { ...normalized, quantity: 0 },
  { ...normalized, quantity: 1.5 },
  { ...normalized, expectedOfferVersion: 0 },
  { ...normalized, idempotencyKey: "short" },
]) {
  assert.throws(
    () => normalizeStockBusinessStoreOfferCommand(invalid),
    (error) =>
      error instanceof StoreListingInventoryContractError &&
      error.code === "invalid_store_listing_command",
  );
}

const calls = [];
const repository = new SupabaseStoreListingInventoryRepository({
  rpc(functionName, args) {
    calls.push({ functionName, args });
    return Promise.resolve({ data: fixture, error: null });
  },
});
const repositoryResult = await repository.stockBusinessOffer(normalized);
assert.deepEqual(repositoryResult, fixture);
assert.deepEqual(calls, [{
  functionName: "stock_business_store_offer_v2",
  args: {
    p_game_session_id: gameSessionId,
    p_business_key: businessKey,
    p_offer_key: offerKey,
    p_quantity: 7,
    p_expected_offer_version: 3,
    p_idempotency_key: "stock-widget-typed-0001",
  },
}]);

for (const [message, code] of [
  ["STORE_LISTING_STOCK_IDEMPOTENCY_CONFLICT", "store_listing_idempotency_conflict"],
  ["STORE_LISTING_STOCK_OFFER_VERSION_CONFLICT", "store_listing_version_conflict"],
  ["STORE_LISTING_STOCK_INSUFFICIENT_FINISHED_GOODS", "store_listing_insufficient_finished_goods"],
  ["STORE_LISTING_STOCK_OFFER_RETIRED", "store_listing_offer_retired"],
  ["unexpected failure", "store_listing_stock_failed"],
]) {
  const failingRepository = new SupabaseStoreListingInventoryRepository({
    rpc() {
      return Promise.resolve({ data: null, error: { message } });
    },
  });
  await assert.rejects(
    () => failingRepository.stockBusinessOffer(normalized),
    (error) =>
      error instanceof StoreListingInventoryContractError &&
      error.code === code,
  );
}

console.log("Business Phase 8A typed Store-listing inventory contract: PASS");
