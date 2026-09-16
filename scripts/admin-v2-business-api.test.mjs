import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createBusinessApi } from "../admin/v2/src/routes/business/BusinessApi.js";
import { createBusinessController, normalizeBusinessDetail, normalizeBusinessReadModel } from "../admin/v2/src/routes/business/BusinessController.js";
import { isAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const OWNER_UUID = "20000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;

function response(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
}
function business(overrides = {}) {
  return {
    public_key: BUSINESS_KEY,
    owner_player_id: OWNER_UUID,
    legal_name: "한강 로보틱스와 미래 산업 주식회사",
    entity_type: "corporation",
    industry_code: "ROBOTICS",
    country_code: "SOLVEND",
    currency_code: "SLV",
    status: "active",
    capitalization: 1000,
    revenue_total: "POISON_REVENUE",
    expense_total: "POISON_EXPENSE",
    profit_total: "POISON_PROFIT",
    valuation: "POISON_VALUATION",
    demand_index: "POISON_DEMAND",
    reputation_score: 84,
    failure_count: 0,
    operational_readiness: "ready",
    attention_flags: [],
    updated_at: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

test("Business API uses exact read-only directory and detail contracts", async () => {
  const calls = [];
  const api = createBusinessApi({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return url.endsWith(`/${BUSINESS_KEY}`)
        ? response({ data: { business: business() } })
        : response({ data: { businesses: [business()] } });
    },
    timeoutMs: 1000,
  });
  await api.readBusinesses({ gameId: GAME_ID });
  await api.readBusiness({ gameId: GAME_ID, businessKey: BUSINESS_KEY });
  assert.equal(calls[0].url, `/api/admin/games/${GAME_ID}/businesses`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].url, `/api/admin/games/${GAME_ID}/businesses/${BUSINESS_KEY}`);
  assert.equal(calls[1].init.method, "GET");
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(calls[1].init.cache, "no-store");
  assert.equal(api.setBusinessCompliance, undefined);
  assert.equal(api.settleBusinessCycle, undefined);
  assert.equal(api.readBusinessInventory, undefined);
});

test("Business API converts backend detail to safe error envelopes", async () => {
  const api = createBusinessApi({
    fetchImpl: async () => response({ code: "access_denied", message: "service_role select from private table" }, 403),
    timeoutMs: 1000,
  });
  await assert.rejects(api.readBusiness({ gameId: GAME_ID, businessKey: BUSINESS_KEY }), (error) => {
    assert.equal(isAdminErrorEnvelope(error), true);
    assert.equal(error.code, "PERMISSION_DENIED");
    assert.equal(JSON.stringify(error).includes("service_role"), false);
    return true;
  });
});

test("Business read model excludes owner UUID and retired cached financial and demand fields", () => {
  const empty = normalizeBusinessReadModel({ data: { businesses: [] } });
  assert.equal(empty.isEmpty, true);
  const one = normalizeBusinessReadModel({ data: { businesses: [business()] } });
  assert.equal(one.businesses[0].legalName, "한강 로보틱스와 미래 산업 주식회사");
  assert.equal(one.businesses[0].owner.displayName, "Owner unavailable");
  assert.equal(one.businesses[0].owner.rosterLabel, "");
  assert.equal(one.businesses[0].owner.status, "");
  assert.equal(JSON.stringify(one).includes(OWNER_UUID), false);
  for (const field of ["revenueTotal", "expenseTotal", "profitTotal", "valuation", "demandIndex"]) {
    assert.equal(Object.hasOwn(one.businesses[0], field), false, `read model retained ${field}`);
  }
  assert.doesNotMatch(JSON.stringify(one), /POISON_(?:REVENUE|EXPENSE|PROFIT|VALUATION|DEMAND)/u);
  const many = normalizeBusinessReadModel({ data: { businesses: [
    business(),
    business({ public_key: `biz_${"b".repeat(32)}`, owner_player_id: "20000000-0000-4000-8000-000000000003", legal_name: "Northreach Logistics", status: "distressed", profit_total: -75, operational_readiness: "attention", attention_flags: ["status:distressed"] }),
    business({ public_key: `biz_${"c".repeat(32)}`, owner_player_id: "20000000-0000-4000-8000-000000000004", legal_name: "Solvend Cooperative", status: "restructuring", reputation_score: null, operational_readiness: "attention", attention_flags: ["status:restructuring"] }),
  ] } });
  assert.equal(many.businesses.length, 3);
  assert.equal(many.summary.attentionCount, 2);
  assert.equal(many.businesses.every((row) => row.owner.displayName === "Owner unavailable"), true);
  assert.equal(JSON.stringify(many).includes("owner_player_id"), false);
});

test("Business route does not render retired cached aggregates", () => {
  const source = readFileSync(
    new URL("../admin/v2/src/routes/business/BusinessRoute.js", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "business.revenueTotal",
    "business.expenseTotal",
    "business.profitTotal",
    "business.valuation",
    "business.demandIndex",
    'label: "Valuation"',
    'label: "Profit"',
    "Compliance",
    "onCompliance",
    "setBusinessCompliance",
  ]) {
    assert.equal(source.includes(forbidden), false, `Business route retained ${forbidden}`);
  }
});

test("Business controller fails closed before reads and preserves stale data on refresh failure", async () => {
  let allowed = false;
  let reads = 0;
  let next = { data: { businesses: [business()] } };
  const api = {
    async readBusinesses() { reads += 1; if (next instanceof Error) throw next; return next; },
    async readBusiness() { return { data: { business: business() } }; },
    cancelBusinessRequest() { return false; },
  };
  const controller = createBusinessController({ api, selectedGameId: GAME_ID, hasPermission: () => allowed });
  await controller.load();
  assert.equal(reads, 0);
  allowed = true;
  await controller.load();
  assert.equal(controller.getState().status, "ready");
  next = Object.assign(new Error("upstream private failure"), { status: 503 });
  await controller.load();
  assert.equal(controller.getState().status, "stale");
  assert.equal(controller.getState().data.businesses.length, 1);
  controller.destroy();
});

test("Business controller loads one public-key detail without retaining private fields", async () => {
  const detailCalls = [];
  const api = {
    async readBusinesses() { return { data: { businesses: [business()] } }; },
    async readBusiness(input) {
      detailCalls.push(input);
      return { data: { business: business({ owner_player_id: OWNER_UUID }) } };
    },
    cancelBusinessRequest() { return false; },
  };
  const controller = createBusinessController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => true,
  });
  const model = normalizeBusinessReadModel({ data: { businesses: [business()] } });
  const detail = await controller.loadDetail(model.businesses[0]);
  assert.equal(detail.businessKey, BUSINESS_KEY);
  assert.equal(detail.operationalReadiness, "ready");
  assert.deepEqual(detail.attentionFlags, []);
  assert.equal(JSON.stringify(detail).includes(OWNER_UUID), false);
  assert.deepEqual(detailCalls, [{ gameId: GAME_ID, businessKey: BUSINESS_KEY }]);
  assert.equal(normalizeBusinessDetail({ data: { business: business() } }).businessKey, BUSINESS_KEY);
  controller.destroy();
});
