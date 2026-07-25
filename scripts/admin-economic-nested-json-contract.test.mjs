import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const SOURCE = new URL("../admin/classroom-write-fallback.js", import.meta.url);

test("Admin ledger writes flatten the exact nested JSON terminal envelope", async () => {
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

  await window.fetch(
    "http://127.0.0.1:4173/functions/v1/admin-api/games/game-1/players/player-1/ledger-adjustments",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          adjustmentAmount: "25",
          transactionType: "debit",
          memo: "Correction",
          currency: "syn",
        },
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
  assert.equal(body.currencyCode, "SYN");
  assert.match(body.idempotencyKey, /^[0-9a-f-]{36}$/i);
  assert.equal(request.headers.get("x-idempotency-key"), body.idempotencyKey);
});
