import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import test from "node:test";

const SOURCE = new URL("../admin/economic-write-contract.js", import.meta.url);

test("Admin ledger writes normalize amount aliases and attach idempotency before terminal boot", async () => {
  const captured = [];
  const window = {
    location: { href: "http://127.0.0.1:4173/admin/" },
    crypto: webcrypto,
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
    globalThis: { crypto: webcrypto },
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    Object,
    String,
    Date,
    JSON,
  });

  vm.runInContext(await readFile(SOURCE, "utf8"), context, {
    filename: "admin/economic-write-contract.js",
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
});
