#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  normalizeProcessDueStoreWithdrawalsCommand,
  normalizeStoreWithdrawalRequestCommand,
  parseProcessDueStoreWithdrawalsResult,
  parseStoreWithdrawalRequestResult,
  StoreWithdrawalContractError,
} from "../backend/src/domains/store/contracts/storeWithdrawalContracts.ts";
import {
  SupabaseStoreWithdrawalRepository,
} from "../backend/src/domains/store/infrastructure/supabaseStoreWithdrawalRepository.ts";

const gameSessionId = "123e4567-e89b-42d3-a456-426614174000";
const businessKey = `biz_${"1".repeat(32)}`;
const offerKey = `sof_${"2".repeat(32)}`;
const requestKey = `swr_${"3".repeat(32)}`;
const accountKey = `iac_${"4".repeat(32)}`;
const transactionKey = `itx_${"5".repeat(32)}`;
const requestedAt = "2026-08-24T12:00:00.000Z";
const effectiveAt = "2026-08-24T12:05:00.000Z";

const normalizedFull = normalizeStoreWithdrawalRequestCommand({
  gameSessionId: ` ${gameSessionId.toUpperCase()} `,
  businessKey: ` ${businessKey.toUpperCase()} `,
  offerKey: ` ${offerKey.toUpperCase()} `,
  mode: "full",
  quantity: null,
  expectedOfferVersion: 7,
  idempotencyKey: "  withdrawal-typed-0001  ",
});
assert.deepEqual(normalizedFull, {
  gameSessionId,
  businessKey,
  offerKey,
  mode: "full",
  quantity: null,
  expectedOfferVersion: 7,
  idempotencyKey: "withdrawal-typed-0001",
});
const normalizedReduction = normalizeStoreWithdrawalRequestCommand({
  ...normalizedFull,
  mode: "reduce",
  quantity: 3,
  idempotencyKey: "withdrawal-typed-0002",
});
assert.equal(normalizedReduction.quantity, 3);
assert.deepEqual(normalizeProcessDueStoreWithdrawalsCommand({ limit: 25 }), {
  limit: 25,
});

for (const invalid of [
  { ...normalizedFull, gameSessionId: "not-a-uuid" },
  { ...normalizedFull, businessKey: "business-1" },
  { ...normalizedFull, offerKey: "offer-1" },
  { ...normalizedFull, mode: "reduce", quantity: null },
  { ...normalizedFull, mode: "full", quantity: 1 },
  { ...normalizedFull, expectedOfferVersion: 0 },
  { ...normalizedFull, idempotencyKey: "short" },
]) {
  assert.throws(
    () => normalizeStoreWithdrawalRequestCommand(invalid),
    (error) =>
      error instanceof StoreWithdrawalContractError &&
      error.code === "invalid_store_withdrawal_command",
  );
}
for (const limit of [0, 101, 1.5, Number.NaN]) {
  assert.throws(
    () => normalizeProcessDueStoreWithdrawalsCommand({ limit }),
    (error) =>
      error instanceof StoreWithdrawalContractError &&
      error.code === "invalid_store_withdrawal_command",
  );
}

const pendingFixture = {
  requestKey,
  requestStatus: "pending",
  offerKey,
  offerStatus: "withdrawal_pending",
  offerVersion: 8,
  mode: "reduce",
  requestedQuantity: 3,
  requestedAt,
  effectiveAt,
  nextAttemptAt: effectiveAt,
  returnedQuantity: null,
  transactionKey: null,
  replayed: false,
};
assert.deepEqual(parseStoreWithdrawalRequestResult(pendingFixture), pendingFixture);

const completedFixture = {
  ...pendingFixture,
  requestStatus: "completed",
  offerStatus: "active",
  offerVersion: 9,
  nextAttemptAt: null,
  returnedQuantity: 3,
  transactionKey,
  replayed: true,
};
assert.deepEqual(parseStoreWithdrawalRequestResult(completedFixture), completedFixture);

for (const invalid of [
  { ...pendingFixture, effectiveAt: "2026-08-24T12:04:59.999Z" },
  { ...pendingFixture, offerStatus: "active" },
  { ...pendingFixture, nextAttemptAt: null },
  { ...pendingFixture, returnedQuantity: 1 },
  { ...pendingFixture, transactionKey },
  { ...pendingFixture, mode: "full" },
  { ...completedFixture, offerStatus: "withdrawal_pending" },
  { ...completedFixture, returnedQuantity: 0 },
  { ...completedFixture, requestKey: "request-private-uuid" },
]) {
  assert.throws(
    () => parseStoreWithdrawalRequestResult(invalid),
    (error) => error instanceof StoreWithdrawalContractError,
  );
}

const processFixture = {
  asOf: effectiveAt,
  selectedCount: 2,
  completedCount: 1,
  blockedCount: 1,
  results: [
    {
      requestKey,
      offerKey,
      outcome: "blocked",
      blockReason: "inventory_reserved",
      reservedQuantity: 2,
      nextAttemptAt: "2026-08-24T12:06:00.000Z",
      offerVersion: 8,
    },
    {
      requestKey: `swr_${"6".repeat(32)}`,
      offerKey: `sof_${"7".repeat(32)}`,
      outcome: "completed",
      mode: "full",
      returnedQuantity: 4,
      remainingListedQuantity: 0,
      offerStatus: "paused",
      offerVersion: 4,
      inventoryAccountKey: accountKey,
      transactionKey,
      completedAt: effectiveAt,
    },
  ],
};
assert.deepEqual(parseProcessDueStoreWithdrawalsResult(processFixture), processFixture);
for (const invalid of [
  { ...processFixture, selectedCount: 3 },
  { ...processFixture, completedCount: 2 },
  {
    ...processFixture,
    results: [{ ...processFixture.results[0], reservedQuantity: 0 }],
    selectedCount: 1,
    completedCount: 0,
    blockedCount: 1,
  },
  {
    ...processFixture,
    results: [{ ...processFixture.results[1], offerStatus: "withdrawal_pending" }],
    selectedCount: 1,
    completedCount: 1,
    blockedCount: 0,
  },
]) {
  assert.throws(
    () => parseProcessDueStoreWithdrawalsResult(invalid),
    (error) => error instanceof StoreWithdrawalContractError,
  );
}

const calls = [];
const repository = new SupabaseStoreWithdrawalRepository({
  rpc(functionName, args) {
    calls.push({ functionName, args });
    return Promise.resolve({
      data: functionName === "request_business_store_offer_withdrawal_v2"
        ? pendingFixture
        : processFixture,
      error: null,
    });
  },
});
assert.deepEqual(
  await repository.requestBusinessWithdrawal(normalizedReduction),
  pendingFixture,
);
assert.deepEqual(
  await repository.processDueWithdrawals({ limit: 25 }),
  processFixture,
);
assert.deepEqual(calls, [
  {
    functionName: "request_business_store_offer_withdrawal_v2",
    args: {
      p_game_session_id: gameSessionId,
      p_business_key: businessKey,
      p_offer_key: offerKey,
      p_mode: "reduce",
      p_quantity: 3,
      p_expected_offer_version: 7,
      p_idempotency_key: "withdrawal-typed-0002",
    },
  },
  {
    functionName: "process_due_store_offer_withdrawals_v2",
    args: { p_limit: 25 },
  },
]);

for (const [message, code] of [
  ["STORE_WITHDRAWAL_IDEMPOTENCY_CONFLICT", "store_withdrawal_idempotency_conflict"],
  ["STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT", "store_withdrawal_version_conflict"],
  ["STORE_WITHDRAWAL_REDUCTION_EXCEEDS_AVAILABLE", "store_withdrawal_reduction_exceeds_available"],
  ["STORE_WITHDRAWAL_PENDING_EXISTS", "store_withdrawal_offer_unavailable"],
  ["STORE_WITHDRAWAL_ACCOUNT_UNAVAILABLE", "store_withdrawal_custody_unavailable"],
  ["unexpected request failure", "store_withdrawal_request_failed"],
]) {
  const failingRepository = new SupabaseStoreWithdrawalRepository({
    rpc() {
      return Promise.resolve({ data: null, error: { message } });
    },
  });
  await assert.rejects(
    () => failingRepository.requestBusinessWithdrawal(normalizedFull),
    (error) =>
      error instanceof StoreWithdrawalContractError && error.code === code,
  );
}

for (const [message, code] of [
  ["STORE_WITHDRAWAL_PROCESS_LIMIT_INVALID", "store_withdrawal_process_limit_invalid"],
  ["STORE_WITHDRAWAL_PROCESS_TOO_EARLY", "store_withdrawal_process_too_early"],
  ["STORE_WITHDRAWAL_PROCESS_FINISHED_PROJECTION_MISMATCH", "store_withdrawal_projection_mismatch"],
  ["STORE_WITHDRAWAL_PROCESS_OFFER_SCOPE_INVALID", "store_withdrawal_scope_invalid"],
  ["unexpected process failure", "store_withdrawal_process_failed"],
]) {
  const failingRepository = new SupabaseStoreWithdrawalRepository({
    rpc() {
      return Promise.resolve({ data: null, error: { message } });
    },
  });
  await assert.rejects(
    () => failingRepository.processDueWithdrawals({ limit: 25 }),
    (error) =>
      error instanceof StoreWithdrawalContractError && error.code === code,
  );
}

console.log("Business Phase 9A typed Store withdrawal contract: PASS");
