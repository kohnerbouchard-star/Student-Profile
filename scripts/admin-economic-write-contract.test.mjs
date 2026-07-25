import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const SOURCE = new URL("../admin/auth-session-manager.js", import.meta.url);

test("Admin ledger writes normalize amount aliases and attach idempotency before terminal transport capture", async () => {
  const captured = [];
  const storage = new Map();
  const window = {
    EconovariaRuntimeConfig: {
      supabaseUrl: "https://staging.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
    },
    location: { href: "http://127.0.0.1:4173/admin/" },
    crypto: webcrypto,
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
    dispatchEvent() {},
    fetch: async (request) => {
      captured.push(request);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
  const context = vm.createContext({
    window,
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
    Math,
    atob,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  });

  vm.runInContext(await readFile(SOURCE, "utf8"), context, {
    filename: "admin/auth-session-manager.js",
  });

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
  assert.equal(typeof window.EconovariaAdminAuthSession.getUsableSession, "function");
});
