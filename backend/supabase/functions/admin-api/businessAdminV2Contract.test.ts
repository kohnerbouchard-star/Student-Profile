import { handleBusinessBankingAdminOperation } from "./businessBankingOperations.ts";
import { normalizedAdminAction, requiredAdminPermission } from "./adminSecurityGuard.ts";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000000-0000-4000-8000-000000000002";
const OWNER_ID = "00000000-0000-4000-8000-000000000003";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test("Business Admin routes require business.manage and use a bounded Business action", () => {
  assertEquals(requiredAdminPermission("GET", `/games/${GAME_ID}/businesses`), "business.manage");
  assertEquals(requiredAdminPermission("POST", `/games/${GAME_ID}/businesses/${BUSINESS_KEY}/compliance`), "business.manage");
  assertEquals(normalizedAdminAction("GET", `/games/${GAME_ID}/businesses`), "staff.admin.read.businesses");
  assertEquals(normalizedAdminAction("POST", `/games/${GAME_ID}/businesses/${BUSINESS_KEY}/compliance`), "staff.admin.write.businesses");
});

Deno.test("Business Admin read resolves owner presentation server-side and omits private player UUID", async () => {
  const business = {
    public_key: BUSINESS_KEY,
    owner_player_id: OWNER_ID,
    legal_name: "한강 로보틱스",
    entity_type: "corporation",
    industry_code: "ROBOTICS",
    country_code: "SOLVEND",
    currency_code: "SLV",
    status: "active",
    capitalization: 1000,
    revenue_total: 250,
    expense_total: 100,
    profit_total: 150,
    valuation: 2400,
    reputation_score: 82,
    capacity_units: 12,
    demand_index: 1.1,
    failure_count: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
    closed_at: null,
  };
  const service = {
    from(table: string) {
      if (table === "business_entities") {
        const query = { select: () => query, eq: () => query, order: async () => ({ data: [business], error: null }) };
        return query;
      }
      if (table === "players") {
        const query = {
          select: () => query,
          eq: () => query,
          in: async () => ({ data: [{ id: OWNER_ID, display_name: "김민준", roster_label: "Y10-04", status: "active" }], error: null }),
        };
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const result = await handleBusinessBankingAdminOperation(service, {
    request: new Request(`https://example.test/games/${GAME_ID}/businesses`), gameId: GAME_ID, staffUserId: STAFF_ID, suffix: "/businesses",
  });
  assertEquals(result.status, 200);
  const serialized = JSON.stringify(result.body);
  if (serialized.includes(OWNER_ID) || serialized.includes("owner_player_id")) throw new Error("Private owner UUID leaked through the Business Admin projection.");
  const row = (result.body as { data: { businesses: Record<string, unknown>[] } }).data.businesses[0];
  assertEquals(row.owner, { display_name: "김민준", roster_label: "Y10-04", status: "active" });
  assertEquals(row.capacity_units, 12);
  assertEquals(row.demand_index, 1.1);
});

Deno.test("Business compliance mutation remains the existing RPC contract", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const service = {
    from() { throw new Error("Read not expected"); },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: [{ outcome: "applied" }], error: null });
    },
  };
  const request = new Request(`https://example.test/games/${GAME_ID}/businesses/${BUSINESS_KEY}/compliance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requirementKey: "operating-license", requirementType: "license", status: "approved", feeAmount: 25, policyEffects: {}, expiresAt: null, reason: "Verified current license", idempotencyKey: "admin.business.compliance.test-0001" }),
  });
  const result = await handleBusinessBankingAdminOperation(service, { request, gameId: GAME_ID, staffUserId: STAFF_ID, suffix: `/businesses/${BUSINESS_KEY}/compliance` });
  assertEquals(result.status, 200);
  assertEquals(calls[0].name, "set_business_compliance_v1");
  assertEquals(calls[0].args.p_business_key, BUSINESS_KEY);
  assertEquals(calls[0].args.p_staff_user_id, STAFF_ID);
});
