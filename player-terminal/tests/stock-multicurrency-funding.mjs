import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { resourcesForRoute, WRITE_INVALIDATIONS } from "../src/api/resource-plan.js";

const XAL = "bac_11111111111111111111111111111111";
const NOR = "bac_22222222222222222222222222222222";
const DEST = "bac_33333333333333333333333333333333";
const QUOTE = "sbq_44444444444444444444444444444444";

const buyInput = {
  action: "create_buy_quote",
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
};

test("C3E buy quote payload uses one-to-three public Checking allocations and strips client scope", () => {
  assert.deepEqual(normalizeWritePayload("marketOrder", buyInput), {
    action: "create_buy_quote",
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

test("C3E settlement accepts only the public immutable quote key", () => {
  assert.deepEqual(normalizeWritePayload("marketOrder", {
    action: "settle_buy_quote",
    quoteKey: QUOTE,
    playerId: "00000000-0000-4000-8000-000000000001"
  }), { action: "settle_buy_quote", quoteKey: QUOTE });
  assert.throws(() => normalizeWritePayload("marketOrder", {
    action: "settle_buy_quote",
    quoteKey: "00000000-0000-4000-8000-000000000001"
  }), /valid value|invalid/i);
});

test("C3E retained buy-now orchestration uses the same constrained funding payload", () => {
  assert.equal(normalizeWritePayload("marketOrder", { ...buyInput, action: "buy_now" }).action, "buy_now");
});

test("C3E sell payload selects exactly one public Checking destination", () => {
  assert.deepEqual(normalizeWritePayload("marketOrder", {
    action: "settle_sell",
    ticker: "aura",
    quantity: "1.5",
    expectedPrice: "105.25",
    expectedTickIndex: "42",
    destinationAccountKey: DEST,
    playerSessionId: "00000000-0000-4000-8000-000000000002"
  }), {
    action: "settle_sell",
    ticker: "AURA",
    quantity: 1.5,
    expectedPrice: 105.25,
    expectedTickIndex: 42,
    destinationAccountKey: DEST
  });
});

test("market route and writes include canonical Banking FX read refreshes", () => {
  const plan = resourcesForRoute("market");
  assert.equal(plan.optional.includes("bankingFx"), true);
  assert.equal(WRITE_INVALIDATIONS.marketOrder.includes("bankingFx"), true);
});

test("C3E funding rejects duplicate, partial, or over-bounded Checking allocations", () => {
  assert.throws(() => normalizeWritePayload("marketOrder", {
    ...buyInput,
    sourceAccountKey2: XAL
  }), /valid value|invalid/i);
  assert.throws(() => normalizeWritePayload("marketOrder", {
    ...buyInput,
    targetAmount2: ""
  }), /valid value|invalid/i);
  assert.throws(() => normalizeWritePayload("marketOrder", {
    action: "create_buy_quote",
    ticker: "AURA",
    quantity: 1,
    expectedPrice: 1,
    expectedTickIndex: 1,
    allocations: [1, 2, 3, 4].map((value) => ({
      sourceAccountKey: `bac_${String(value).repeat(32)}`,
      targetAmount: 0.25
    }))
  }), /valid value|invalid/i);
});
