import assert from "node:assert/strict";
import test from "node:test";

import { createBankingApiClient } from "../admin/v2/src/routes/banking/BankingApi.js";
import {
  createBankingController,
  normalizeBankingHistory,
  normalizeBankingReadModel,
} from "../admin/v2/src/routes/banking/BankingController.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PLAYER_ID = "20000000-0000-4000-8000-000000000002";
const OTHER_ID = "30000000-0000-4000-8000-000000000003";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function player({
  id = PLAYER_ID,
  displayName = "김민준 학생",
  status = "active",
  balances = [],
} = {}) {
  return {
    id,
    displayName,
    rosterLabel: "Y10-A-01",
    countryName: "Hanmin",
    status,
    balances,
  };
}

test("Banking accepts only Checking and Savings and preserves authoritative local currencies", () => {
  const model = normalizeBankingReadModel({
    data: {
      players: [
        player({
          balances: [
            { accountType: "cash", balance: 900, currencyCode: "HWC", updatedAt: "2026-08-07T01:00:00Z" },
            { accountType: "checking", balance: 0, currencyCode: "HWC", updatedAt: "2026-08-07T02:00:00Z" },
            { accountType: "savings", balance: 1_250.5, currencyCode: "HWC" },
            { accountType: "credit", balance: 99_999, currencyCode: "ECO" },
          ],
        }),
        player({
          id: OTHER_ID,
          displayName: "박서연 학생",
          balances: [
            { accountType: "checking", balance: 150_000, currencyCode: "KRW" },
            { accountType: "savings", balance: 300_000, currencyCode: "KRW" },
          ],
        }),
      ],
    },
  });

  assert.equal(model.isEmpty, false);
  assert.deepEqual(model.currencies, ["HWC", "KRW"]);
  assert.equal(model.players[0].displayName, "김민준 학생");
  assert.equal(model.players[0].checking[0].balance, 0, "non-canonical account rows must not replace Checking");
  assert.equal(model.players[0].savings[0].balance, 1_250.5);
  assert.deepEqual(model.players[0].accounts.map((account) => account.accountType), ["checking", "savings"]);
  assert.equal(model.players[0].accounts.some((account) => account.currencyCode === "ECO"), false);
  assert.equal(model.players[1].checking[0].currencyCode, "KRW");
  assert.equal(model.players[1].savings[0].currencyCode, "KRW");
  assert.equal(model.summary.checkingAccountCount, 2);
  assert.equal(model.summary.savingsAccountCount, 2);
  assert.equal(Object.hasOwn(model.summary, "totalBalance"), false, "multi-currency balances must not be cross-summed");
});

test("Banking preserves zero balances, Unicode names, and large rosters", () => {
  const players = Array.from({ length: 1_500 }, (_unused, index) => ({
    id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000001`,
    displayName: index === 0
      ? "아주 긴 한국어 플레이어 이름 가나다라마바 사아자차카타파하"
      : `Player ${index + 1}`,
    status: "active",
    balances: [
      { accountType: "checking", balance: index, currencyCode: "LOC" },
      { accountType: "savings", balance: 0, currencyCode: "LOC" },
    ],
  }));
  const model = normalizeBankingReadModel({ data: { players } });

  assert.equal(model.players.length, 1_500);
  assert.equal(model.players[0].checking[0].balance, 0);
  assert.equal(model.players[0].savings[0].balance, 0);
  assert.match(model.players[0].displayName, /한국어/);
  assert.equal(model.summary.checkingAccountCount, 1_500);
  assert.equal(model.summary.savingsAccountCount, 1_500);
});

test("Banking handles zero-player and unprovisioned-account datasets", () => {
  const empty = normalizeBankingReadModel({ data: { players: [] } });
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.summary.playerCount, 0);

  const unprovisioned = normalizeBankingReadModel({ data: { players: [player()] } });
  assert.equal(unprovisioned.isEmpty, false);
  assert.deepEqual(unprovisioned.players[0].accounts, []);
  assert.equal(unprovisioned.summary.playersWithAccounts, 0);
});

test("Banking suppresses UUID-shaped display text while retaining internal request identity", () => {
  const model = normalizeBankingReadModel({
    data: {
      players: [player({ displayName: `Student ${OTHER_ID}` })],
    },
  });
  assert.equal(model.players[0].displayName, "Unnamed player");
  assert.equal(model.players[0].resourceId, PLAYER_ID, "resource identity remains internal for BFF requests");
  assert.doesNotMatch(model.players[0].rowKey, /[0-9a-f]{8}-[0-9a-f]{4}/i);
});

test("Banking history presents posted Checking/Savings transfers without inventing a transfer mutation", () => {
  const history = normalizeBankingHistory({
    data: {
      ledgerEntries: [
        {
          id: OTHER_ID,
          player_id: PLAYER_ID,
          account_type: "checking",
          amount: -25,
          currency_code: "HWC",
          entry_type: "debit",
          source_domain: "banking",
          source_action: "savings_transfer",
          source_id: OTHER_ID,
          created_at: "2026-08-07T03:00:00Z",
        },
        {
          account_type: "savings",
          amount: 25,
          currency_code: "HWC",
          entry_type: "credit",
          source_domain: "banking",
          source_action: "savings_transfer",
          created_at: "2026-08-07T03:00:00Z",
        },
        {
          account_type: "checking",
          amount: 10,
          currency_code: "HWC",
          entry_type: "credit",
          source_domain: "players",
          source_action: "staff_player_balance_adjustment",
          created_at: "2026-08-07T04:00:00Z",
        },
        {
          account_type: "cash",
          amount: 999,
          currency_code: "HWC",
          entry_type: "credit",
          source_domain: "legacy",
          source_action: "legacy_balance",
        },
        {
          account_type: "loan",
          amount: -100,
          currency_code: "HWC",
          entry_type: "debit",
          source_domain: "loans",
          source_action: "repayment",
        },
      ],
    },
  });

  assert.equal(history.entries.length, 3);
  assert.deepEqual(history.entries.map((entry) => entry.accountType), ["checking", "savings", "checking"]);
  assert.equal(history.entries[0].description, "Account transfer");
  assert.equal(history.entries[1].description, "Account transfer");
  assert.equal(history.entries[2].description, "Administrative adjustment");
  assert.equal(JSON.stringify(history).includes(PLAYER_ID), false);
  assert.equal(JSON.stringify(history).includes(OTHER_ID), false);
});

test("Banking API uses only the economy.adjust-authorized personal Banking contracts", async () => {
  const calls = [];
  const api = createBankingApiClient({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/banking/players")) return jsonResponse({ data: { players: [] } });
      if (url.endsWith("/history-audit")) return jsonResponse({ data: { ledgerEntries: [] } });
      return jsonResponse({ data: { adjusted: true, outcome: "applied" } });
    },
    timeoutMs: 1_000,
  });

  await api.readBanking({ gameId: GAME_ID });
  await api.readBankingHistory({ gameId: GAME_ID, playerId: PLAYER_ID });
  await api.adjustBankingBalance({
    gameId: GAME_ID,
    playerId: PLAYER_ID,
    accountType: "savings",
    currencyCode: "HWC",
    amount: -10.5,
    reason: "Correction",
    idempotencyKey: "admin.banking.test.12345678",
  });

  assert.deepEqual(calls.map((call) => call.url), [
    `/api/admin/games/${GAME_ID}/banking/players`,
    `/api/admin/games/${GAME_ID}/banking/players/${PLAYER_ID}/history-audit`,
    `/api/admin/games/${GAME_ID}/banking/players/${PLAYER_ID}/ledger-adjustments`,
  ]);
  assert.equal(calls.every((call) => call.url.includes("/banking/players")), true);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].options.method, "GET");
  assert.equal(calls[2].options.method, "POST");
  assert.equal("Authorization" in calls[2].options.headers, false);
  const body = JSON.parse(calls[2].options.body);
  assert.deepEqual(body, {
    amount: -10.5,
    reason: "Correction",
    accountType: "savings",
    currencyCode: "HWC",
    idempotencyKey: "admin.banking.test.12345678",
  });
  assert.equal(JSON.stringify(body).includes('"ECO"'), false);
});

test("Banking API rejects adjustments without an authoritative currency", async () => {
  let called = false;
  const api = createBankingApiClient({
    fetchImpl: async () => {
      called = true;
      return jsonResponse({ data: { adjusted: true } });
    },
  });
  await assert.rejects(
    api.adjustBankingBalance({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      accountType: "checking",
      amount: 5,
      reason: "Correction",
      idempotencyKey: "admin.banking.test.abcdefgh",
    }),
    (error) => error?.code === "VALIDATION_FAILED",
  );
  assert.equal(called, false);
});

test("Banking controller posts adjustments only to an existing active account and retains stale data", async () => {
  let failRefresh = false;
  let adjustment = null;
  const api = {
    readBanking: async () => {
      if (failRefresh) throw { status: 503, code: "SERVICE_UNAVAILABLE" };
      return {
        data: {
          players: [player({
            balances: [{ accountType: "checking", balance: 0, currencyCode: "HWC" }],
          })],
        },
      };
    },
    readBankingHistory: async () => ({ data: { ledgerEntries: [] } }),
    adjustBankingBalance: async (input) => {
      adjustment = input;
      return { data: { adjusted: true } };
    },
    cancelBankingRequest: () => false,
    cancelBankingHistoryRequest: () => false,
  };
  const controller = createBankingController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "economy.adjust",
    cryptoObject: { randomUUID: () => OTHER_ID },
  });

  await controller.load();
  const firstState = controller.getState();
  assert.equal(firstState.status, "ready");
  const currentPlayer = firstState.data.players[0];
  const result = await controller.adjustBalance(currentPlayer, currentPlayer.checking[0], {
    amount: 5,
    reason: "Manual correction",
  });
  assert.equal(result.ok, true);
  assert.equal(adjustment.accountType, "checking");
  assert.equal(adjustment.currencyCode, "HWC");
  assert.equal(adjustment.amount, 5);
  assert.match(adjustment.idempotencyKey, /^admin\.banking\.adjust\./);

  failRefresh = true;
  await controller.load();
  assert.equal(controller.getState().status, "stale");
  assert.equal(controller.getState().data, firstState.data);
  controller.destroy();
});

test("Banking controller fails closed when economy.adjust is absent", async () => {
  let readCalled = false;
  const api = {
    readBanking: async () => {
      readCalled = true;
      return { data: { players: [] } };
    },
    readBankingHistory: async () => ({ data: { ledgerEntries: [] } }),
    adjustBankingBalance: async () => ({ data: { adjusted: true } }),
    cancelBankingRequest: () => false,
    cancelBankingHistoryRequest: () => false,
  };
  const controller = createBankingController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => false,
  });

  await controller.load();
  assert.equal(readCalled, false);
  const denied = await controller.adjustBalance(
    { resourceId: PLAYER_ID, status: "active", accounts: [] },
    {},
    { amount: 5, reason: "Correction" },
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  controller.destroy();
});
