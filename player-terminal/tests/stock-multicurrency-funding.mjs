import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { resourcesForRoute, WRITE_INVALIDATIONS } from "../src/api/resource-plan.js";

const XAL = "bac_11111111111111111111111111111111";
const NOR = "bac_22222222222222222222222222222222";
const DEST = "bac_33333333333333333333333333333333";

test("C3E buy-now payload uses one-to-three public Checking allocations and strips client scope", () => {
  assert.deepEqual(normalizeWritePayload("marketOrder", {
    action: "buy_now",
    ticker: "aura",
    quantity: "2",
    expectedPrice: "105.25",
    expectedTickIndex: "42",
    sourceAccountKey1: XAL,
    targetAmount1: "150.25",
    sourceAccountKey2: NOR,
    targetAmount2: "60.25",
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    stockAssetId: "00000000-0000-4000-8000-000000000101"
  }), {
    action: "buy_now",
    ticker: "AURA",
    quantity: 2,
    expectedPrice: 105.25,
    expectedTickIndex: 42,
    allocations: [
      { sourceAccountKey: XAL, targetAmount: 150.25 },
      { sourceAccountKey: NOR, targetAmount: 60.25 }
    ]
  });
});

test("C3E sell payload selects exactly one public Checking destination", () => {
  assert.deepEqual(normalizeWritePayload("marketOrder", {
    action: "settle_sell",
    ticker: "aura",
    quantity: "1.5",
    expectedPrice: "105.25",
    expectedTickIndex: "43",
    destinationAccountKey: DEST,
    gameSessionId: "00000000-0000-4000-8000-000000000001"
  }), {
    action: "settle_sell",
    ticker: "AURA",
    quantity: 1.5,
    expectedPrice: 105.25,
    expectedTickIndex: 43,
    destinationAccountKey: DEST
  });
});

test("market route and writes include canonical Banking FX read refreshes", () => {
  assert.equal(resourcesForRoute("market").optional.includes("bankingFx"), true);
  assert.equal(resourcesForRoute("market").optional.includes("countries"), true);
  assert.equal(WRITE_INVALIDATIONS.marketOrder.includes("bankingFx"), true);
});

test("C3E funding rejects duplicate or partial Checking allocations", () => {
  assert.throws(() => normalizeWritePayload("marketOrder", {
    action: "buy_now",
    ticker: "AURA",
    quantity: 1,
    expectedPrice: 100,
    expectedTickIndex: 1,
    sourceAccountKey1: XAL,
    targetAmount1: 50,
    sourceAccountKey2: XAL,
    targetAmount2: 50
  }), /valid value/i);
  assert.throws(() => normalizeWritePayload("marketOrder", {
    action: "buy_now",
    ticker: "AURA",
    quantity: 1,
    expectedPrice: 100,
    expectedTickIndex: 1,
    sourceAccountKey1: XAL
  }), /valid value/i);
});
