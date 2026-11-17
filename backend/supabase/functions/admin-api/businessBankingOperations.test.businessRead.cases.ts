import { handleBusinessBankingAdminOperation } from "./businessBankingOperations.ts";
import {
  assert,
  assertEquals,
  BUSINESS_KEY,
  GAME_ID,
  NOW,
  PLAYER_ID,
  request,
  service,
  STAFF_ID,
} from "./businessBankingTestSupport.ts";

Deno.test("Admin Business read is game scoped and strips retired aggregate and owner authority", async () => {
  const mock = service({
    business_entities: [{
      public_key: BUSINESS_KEY,
      legal_name: "Atlas Works",
      entity_type: "corporation",
      industry_code: "manufacturing",
      country_code: "NRC",
      currency_code: "NRC",
      status: "active",
      capitalization: "9007199254740993.123456789123456789",
      reputation_score: 80,
      failure_count: 0,
      created_at: NOW,
      updated_at: NOW,
      closed_at: null,
      owner_player_id: PLAYER_ID,
      revenue_total: "POISON_REVENUE",
      expense_total: "POISON_EXPENSE",
      profit_total: "POISON_PROFIT",
      valuation: "POISON_VALUATION",
      demand_index: "POISON_DEMAND",
    }],
  });
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/businesses`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/businesses",
  });
  assertEquals(result.handled, true);
  assertEquals(result.status, 200);
  const businesses =
    (result.body as { data: { businesses: unknown[] } }).data.businesses;
  assertEquals(
    (businesses[0] as Record<string, unknown>).public_key,
    BUSINESS_KEY,
  );
  assertEquals(
    (businesses[0] as Record<string, unknown>).operational_readiness,
    "unknown",
  );
  assertEquals(
    (businesses[0] as Record<string, unknown>).attention_flags,
    [],
  );
  const serialized = JSON.stringify(businesses);
  for (
    const forbidden of [
      PLAYER_ID,
      "owner_player_id",
      "POISON_REVENUE",
      "POISON_EXPENSE",
      "POISON_PROFIT",
      "POISON_VALUATION",
      "POISON_DEMAND",
    ]
  ) {
    assert(
      !serialized.includes(forbidden),
      `Admin Business read leaked ${forbidden}`,
    );
  }
  const selection =
    mock.selects.find((entry) => entry.table === "business_entities")
      ?.columns ?? "";
  assert(
    selection.split(",").includes("capitalization::text"),
    "Capitalization must cross the database boundary as decimal text",
  );
  assertEquals(
    (businesses[0] as Record<string, unknown>).capitalization,
    "9007199254740993.123456789123456789",
  );
  for (
    const forbiddenColumn of [
      "owner_player_id",
      "revenue_total",
      "expense_total",
      "profit_total",
      "valuation",
      "demand_index",
    ]
  ) {
    assert(
      !selection.split(",").includes(forbiddenColumn),
      `Admin Business read selected ${forbiddenColumn}`,
    );
  }
});

Deno.test("Admin Business detail is game scoped, public-key-only, and read-only", async () => {
  const mock = service({
    business_entities: [{
      public_key: BUSINESS_KEY,
      legal_name: "Atlas Works",
      entity_type: "corporation",
      industry_code: "manufacturing",
      country_code: "NRC",
      currency_code: "NRC",
      status: "distressed",
      capitalization: 1_000,
      reputation_score: 55,
      failure_count: 2,
      created_at: NOW,
      updated_at: NOW,
      closed_at: null,
      owner_player_id: PLAYER_ID,
      revenue_total: "POISON_REVENUE",
    }],
  });
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/businesses/${BUSINESS_KEY}`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/businesses/${BUSINESS_KEY}`,
  });
  assertEquals(result.status, 200);
  const business =
    (result.body as { data: { business: Record<string, unknown> } }).data
      .business;
  assertEquals(business.public_key, BUSINESS_KEY);
  assertEquals(business.operational_readiness, "attention");
  assertEquals(business.attention_flags, [
    "status:distressed",
    "recorded-failures",
  ]);
  const serialized = JSON.stringify(business);
  assert(!serialized.includes(PLAYER_ID), "Business detail leaked owner UUID");
  assert(
    !serialized.includes("POISON_REVENUE"),
    "Business detail leaked retired revenue",
  );
  assertEquals(mock.selects, []);
  assertEquals(mock.calls, [{
    functionName: "read_admin_business_supervision_v2",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_business_key: BUSINESS_KEY,
    },
  }]);
});

Deno.test("Admin Business detail returns a bounded not-found response", async () => {
  const mock = service({ business_entities: [] });
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/businesses/${BUSINESS_KEY}`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/businesses/${BUSINESS_KEY}`,
  });
  assertEquals(result.status, 404);
  assertEquals(result.body, {
    code: "business_not_found",
    message:
      "The Business, Banking, or Loans administrator operation could not be completed.",
  });
  assertEquals(mock.calls.length, 1);
});

Deno.test("Admin Business cycle settlement returns stable 410 before parsing or persistence", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: new Request(
      `https://example.test/games/${GAME_ID}/businesses/${BUSINESS_KEY}/settle`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not valid json",
      },
    ),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/businesses/${BUSINESS_KEY}/settle`,
  });
  assertEquals(result, {
    handled: true,
    status: 410,
    body: {
      code: "business_cycle_settlement_retired",
      message:
        "Administrator-authored Business cycle settlement has been retired. Store receipts and guarded server-owned periods are authoritative.",
    },
  });
  assertEquals(mock.calls.length, 0);
  assertEquals(mock.selects.length, 0);
});
