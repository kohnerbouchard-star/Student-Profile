import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { resolvePlayerBackendRequest } from "../player-terminal/src/api/backend-routes.js";
import { normalizeApiResponse } from "../player-terminal/src/api/response-normalizer.js";
import { ipoPrice, ipoWhole, ipoTotal } from "../player-terminal/src/api/business-ipo-backend-routes.js";
import { renderBusinessIpoPanel } from "../player-terminal/src/features/business-ipo/business-ipo-panel.js";
import { PlayerApi } from "../player-terminal/src/api/player-api.js";
import { ApiRequestError } from "../player-terminal/src/api/errors.js";
import { ipoFixture, ipoReceipt } from "../player-terminal/tests/fixtures/business-ipo-fixture.mjs";

test("retained Market acceptance waits for fresh Market and Banking FX before enumerating tickets", async () => {
  const source = await readFile(new URL("./business-banking-player-market-browser-acceptance.core.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function chooseTradableAsset(page) {");
  const end = source.indexOf("async function selectTicker(page, ticker) {", start);
  assert.ok(start >= 0 && end > start);
  let data;
  let readinessChecked = false;
  let rowWaited = false;
  const choose = runInNewContext(`(${source.slice(start, end).trim()})`, {
    openMarket: async () => {},
    Econovaria: { playerTerminal: { getState: () => ({ data }) } },
  });
  await assert.rejects(choose({
    waitForFunction: async (predicate, argument, options) => {
      assert.equal(argument, null);
      assert.equal(options.timeout, 30_000);
      assert.equal(predicate(), false);
      for (const key of ["market", "bankingFx"]) {
        for (const state of ["unknown", "loading", "stale", "unavailable"]) {
          data = { resourceStatus: { market: { state: "ready" }, bankingFx: { state: "ready" }, [key]: { state } } };
          assert.equal(predicate(), false, `${key} ${state} must not permit ticket inspection`);
        }
      }
      data = { resourceStatus: { market: { state: "ready" }, bankingFx: { state: "ready" } } };
      assert.equal(predicate(), true);
      readinessChecked = true;
    },
    locator: selector => {
      assert.equal(readinessChecked, true);
      assert.equal(selector, "[data-player-market-select]");
      return {
        first: () => ({ waitFor: async options => {
          assert.equal(options.state, "visible");
          assert.equal(options.timeout, 30_000);
          rowWaited = true;
        } }),
        count: async () => { assert.equal(rowWaited, true); return 0; },
      };
    },
  }), /No non-index tradable market asset/u);
  assert.equal(readinessChecked, true);
  assert.equal(rowWaited, true);
});

test("IPO requests use bounded exact strings and public keys", () => {
  assert.equal(ipoTotal("999999.99", "1000000"), "999999990000.00");
  for (const value of ["0", "0.001", "1e2", "1000000.01", 2.5]) assert.equal(ipoPrice(value), false);
  for (const value of ["0", "1.5", "01", "1000001", 8]) assert.equal(ipoWhole(value), false);
  const request = resolvePlayerBackendRequest({ endpointKey: "businessIpoSubscribe", payload: { ipoKey: ipoFixture().offers[0].ipoKey, shares: "8", idempotencyKey: "phase14c-request-001", gameSessionId: "poison" } });
  assert.match(request.path, /^\/players\/me\/business\/ipos\/bgp_[0-9a-f]{32}\/subscriptions$/u);
  assert.deepEqual(Object.keys(request.payload).sort(), ["idempotencyKey", "shares"]);
});
test("IPO response validates allocation, exact receipt arithmetic, identity and request correlation", () => {
  const model = normalizeApiResponse("businessIpos", ipoFixture()); assert.equal(model.ownBusiness.equity, "1000.123456789123456789");
  const malformed = ipoFixture(); malformed.offers[0].remainingShares = "21"; assert.throws(() => normalizeApiResponse("businessIpos", malformed));
  const bad = ipoReceipt(); bad.receipt.total = "19.99"; assert.throws(() => normalizeApiResponse("businessIpoSubscribe", bad));
  assert.throws(() => normalizeApiResponse("businessIpoSubscribe", ipoReceipt(), { intent: { ipoKey: `bgp_${"e".repeat(32)}`, shares: "8" } }));
  const valid = normalizeApiResponse("businessIpoSubscribe", ipoReceipt(), { intent: { ipoKey: ipoReceipt().receipt.ipoKey, shares: "8" } }); assert.equal(valid.receipt.total, "20.00");
  const leaked = ipoFixture(); leaked.offers[0].businessName = "00000000-0000-4000-8000-000000000001"; assert.throws(() => normalizeApiResponse("businessIpos", leaked));
});
test("IPO panel keeps verified data visible but disables stale writes", () => {
  const data = { businessIpos: ipoFixture(), resourceStatus: { businessIpos: { state: "stale" } }, capabilities: { endpointKeys: { businessIpos: true, businessIpoSubscribe: true, businessIpoPropose: true }, actions: { businessIpoSubscribe: true, businessIpoPropose: true } } };
  const html = renderBusinessIpoPanel(data, { issuer: true });
  assert.match(html, /last verified offering data/); assert.match(html, /1,000\.123456789123456789/); assert.match(html, /type="submit" disabled/); assert.match(html, /issued immediately/); assert.match(html, /Existing managers/);
});
test("uncertain IPO subscriptions retain the original idempotency key and reject mismatched receipts", async () => {
  const calls = []; let attempt = 0;
  const api = new PlayerApi({ usePreviewData: false, authenticated: true, csrfToken: "a".repeat(43), publishableKey: "sb_publishable_ipo_fixture", deviceId: "00000000-0000-4000-8000-000000000001", requestTimeoutMs: 1000, writeCooldownMs: 0,
    apiCall: async context => { calls.push(context.idempotencyKey); attempt++; if (attempt === 1) throw new ApiRequestError("Uncertain", { code: "NETWORK_ERROR" }); if (attempt === 2) return ipoReceipt("6"); return ipoReceipt(); } });
  const intent = { ipoKey: ipoReceipt().receipt.ipoKey, shares: "8" };
  await assert.rejects(api.execute("businessIpoSubscribe", intent, { ipoKey: intent.ipoKey }));
  await assert.rejects(api.execute("businessIpoSubscribe", intent, { ipoKey: intent.ipoKey }));
  const recovered = await api.execute("businessIpoSubscribe", intent, { ipoKey: intent.ipoKey });
  assert.equal(recovered.result.receipt.shares, "8"); assert.equal(new Set(calls).size, 1); assert.ok(calls[0]);
});
