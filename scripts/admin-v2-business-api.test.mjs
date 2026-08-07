import assert from "node:assert/strict";
import test from "node:test";

import { createBusinessApi } from "../admin/v2/src/routes/business/BusinessApi.js";
import { createBusinessController, normalizeBusinessReadModel } from "../admin/v2/src/routes/business/BusinessController.js";
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
    legal_name: "한강 로보틱스와 미래 산업 주식회사",
    entity_type: "corporation",
    industry_code: "ROBOTICS",
    country_code: "SOLVEND",
    currency_code: "SLV",
    status: "active",
    capitalization: 1000,
    revenue_total: 260,
    expense_total: 110,
    profit_total: 150,
    valuation: 2500,
    reputation_score: 84,
    capacity_units: 12,
    demand_index: 1.08,
    failure_count: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
    closed_at: null,
    owner: { display_name: "김민준", roster_label: "Y10-04", status: "active" },
    ...overrides,
  };
}

test("Business API uses exact read and compliance contracts", async () => {
  const calls = [];
  const api = createBusinessApi({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return init.method === "POST" ? response({ data: { result: { outcome: "applied" } } }) : response({ data: { businesses: [business()] } });
    },
    timeoutMs: 1000,
  });
  await api.readBusinesses({ gameId: GAME_ID });
  await api.setBusinessCompliance({
    gameId: GAME_ID,
    businessKey: BUSINESS_KEY,
    idempotencyKey: "admin.business.compliance.test-0001",
    input: { requirementKey: "operating-license", requirementType: "license", status: "approved", feeAmount: 25, expiresAt: null, reason: "Verified current license" },
  });
  assert.equal(calls[0].url, `/api/admin/games/${GAME_ID}/businesses`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].url, `/api/admin/games/${GAME_ID}/businesses/${BUSINESS_KEY}/compliance`);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(calls[1].init.headers["Idempotency-Key"], "admin.business.compliance.test-0001");
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.policyEffects && Object.keys(body.policyEffects).length, 0);
  assert.equal(body.idempotencyKey, "admin.business.compliance.test-0001");
  assert.equal(api.settleBusinessCycle, undefined);
  assert.equal(api.readBusinessInventory, undefined);
});

test("Business API converts backend detail to safe error envelopes", async () => {
  const api = createBusinessApi({
    fetchImpl: async () => response({ code: "access_denied", message: "service_role select from private table" }, 403),
    timeoutMs: 1000,
  });
  await assert.rejects(api.readBusinesses({ gameId: GAME_ID }), (error) => {
    assert.equal(isAdminErrorEnvelope(error), true);
    assert.equal(error.code, "PERMISSION_DENIED");
    assert.equal(JSON.stringify(error).includes("service_role"), false);
    return true;
  });
});

test("Business read model supports zero, one, many, Korean text, signed profit, and no UUID presentation", () => {
  const empty = normalizeBusinessReadModel({ data: { businesses: [] } });
  assert.equal(empty.isEmpty, true);
  const one = normalizeBusinessReadModel({ data: { businesses: [business()] } });
  assert.equal(one.businesses[0].legalName, "한강 로보틱스와 미래 산업 주식회사");
  assert.equal(one.businesses[0].owner.displayName, "김민준");
  const many = normalizeBusinessReadModel({ data: { businesses: [
    business(),
    business({ public_key: `biz_${"b".repeat(32)}`, legal_name: "Northreach Logistics", status: "distressed", profit_total: -75, owner: { display_name: "Morgan Lee", roster_label: "Y10-05", status: "active" } }),
    business({ public_key: `biz_${"c".repeat(32)}`, legal_name: "Solvend Cooperative", status: "restructuring", reputation_score: null }),
  ] } });
  assert.equal(many.businesses.length, 3);
  assert.equal(many.summary.attentionCount, 2);
  assert.equal(many.businesses[1].profitTotal, -75);
  assert.equal(JSON.stringify(many).includes(OWNER_UUID), false);
  const malicious = normalizeBusinessReadModel({ data: { businesses: [business({ owner: { display_name: OWNER_UUID, roster_label: OWNER_UUID, status: "active" } })] } });
  assert.equal(JSON.stringify(malicious).includes(OWNER_UUID), false);
});

test("Business controller fails closed before reads and preserves stale data on refresh failure", async () => {
  let allowed = false;
  let reads = 0;
  let next = { data: { businesses: [business()] } };
  const api = {
    async readBusinesses() { reads += 1; if (next instanceof Error) throw next; return next; },
    cancelBusinessRequest() { return false; },
    async setBusinessCompliance() { return { data: { result: {} } }; },
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

test("Business controller compliance mutations reuse an idempotency key for retryable failure", async () => {
  const keys = [];
  let attempts = 0;
  const api = {
    async readBusinesses() { return { data: { businesses: [business()] } }; },
    cancelBusinessRequest() { return false; },
    async setBusinessCompliance(input) {
      keys.push(input.idempotencyKey);
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("temporary"), { status: 503 });
      return { data: { result: { outcome: "applied" } } };
    },
  };
  const controller = createBusinessController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => true,
    cryptoObject: { randomUUID: () => "30000000-0000-4000-8000-000000000003" },
  });
  const model = normalizeBusinessReadModel({ data: { businesses: [business()] } });
  const input = { requirementKey: "license", requirementType: "license", status: "approved", feeAmount: 0, expiresAt: null, reason: "Verified" };
  const first = await controller.setCompliance(model.businesses[0], input);
  const second = await controller.setCompliance(model.businesses[0], input);
  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  controller.destroy();
});
