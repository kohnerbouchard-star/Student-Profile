import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const SOURCE = new URL("../admin/classroom-write-fallback.js", import.meta.url);

async function createHarness() {
  const captured = [];
  const storage = new Map();
  const document = { dispatchEvent() {} };
  const window = {
    EconovariaRuntimeConfig: {
      supabaseUrl: "https://staging.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
      classroomApiUrl: "https://staging.supabase.co/functions/v1/classroom-api",
    },
    location: { href: "http://127.0.0.1:4173/admin/" },
    crypto: webcrypto,
    document,
    sessionStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    fetch: async (request) => {
      captured.push(request);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
  const CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  window.CustomEvent = CustomEvent;

  const context = vm.createContext({
    window,
    globalThis: { crypto: webcrypto, CustomEvent },
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    FormData,
    Object,
    String,
    Date,
    JSON,
    CustomEvent,
  });

  vm.runInContext(await readFile(SOURCE, "utf8"), context, {
    filename: "admin/classroom-write-fallback.js",
  });
  return { captured, window };
}

test("Admin ledger writes flatten the exact nested terminal envelope and preserve idempotency", async () => {
  const { captured, window } = await createHarness();
  const idempotencyKey = "ledger.adjustment.browser-envelope.001";

  await window.fetch(
    "http://127.0.0.1:4173/functions/v1/admin-api/games/game-1/players/player-1/ledger-adjustments",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "adjust-player-ledger",
        gameId: "game-1",
        currentSection: "players",
        payload: {
          playerId: "player-1",
          amount: "25",
          adjustmentType: "debit",
          accountType: "cash",
          currencyCode: "NRC",
          reason: "Correction",
          effectiveDate: "2026-07-25",
        },
        idempotencyKey,
        requestId: "request-browser-envelope-001",
      }),
    },
  );

  assert.equal(captured.length, 1);
  const request = captured[0];
  const body = await request.json();
  assert.equal(body.amount, "25");
  assert.equal(body.adjustmentType, "debit");
  assert.equal(body.reason, "Correction");
  assert.equal(body.accountType, "cash");
  assert.equal(body.currencyCode, "NRC");
  assert.equal(body.playerId, "player-1");
  assert.equal(body.effectiveDate, "2026-07-25");
  assert.equal(body.idempotencyKey, idempotencyKey);
  assert.equal(request.headers.get("x-idempotency-key"), idempotencyKey);
  assert.equal(request.headers.get("content-type"), "application/json");
});

test("Admin ledger writes continue to normalize legacy form aliases", async () => {
  const { captured, window } = await createHarness();

  await window.fetch(
    "http://127.0.0.1:4173/functions/v1/admin-api/games/game-1/players/player-1/ledger-adjustments",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        adjustmentAmount: "25",
        transactionType: "debit",
        memo: "Correction",
      }),
    },
  );

  assert.equal(captured.length, 1);
  const request = captured[0];
  const body = await request.json();
  assert.equal(body.amount, "25");
  assert.equal(body.adjustmentType, "debit");
  assert.equal(body.reason, "Correction");
  assert.equal(body.accountType, "cash");
  assert.equal(body.currencyCode, "ECO");
  assert.match(body.idempotencyKey, /^[0-9a-f-]{36}$/i);
  assert.equal(request.headers.get("x-idempotency-key"), body.idempotencyKey);
  assert.equal(typeof window.EconovariaClassroomWriteFallback.canonicalWrite, "function");
});
