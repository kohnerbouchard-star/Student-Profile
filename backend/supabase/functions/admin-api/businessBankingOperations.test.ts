import { handleBusinessBankingAdminOperation } from "./businessBankingOperations.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000003";
const LOAN_ID = "00000000-0000-4000-8000-000000000004";
const PRODUCT_ID = "00000000-0000-4000-8000-000000000005";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000006";
const BUSINESS_ID = "00000000-0000-4000-8000-000000000007";
const PAYMENT_ID = "00000000-0000-4000-8000-000000000008";
const APP_KEY = `lna_${"a".repeat(32)}`;
const LOAN_KEY = `lon_${"b".repeat(32)}`;
const PRODUCT_KEY = `lop_${"c".repeat(32)}`;
const BUSINESS_KEY = `biz_${"d".repeat(32)}`;
const PAYMENT_KEY = `pay_${"e".repeat(32)}`;
const NOW = "2026-08-10T04:00:00.000Z";

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined
      ? undefined
      : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function thenableQuery(data: unknown[]) {
  const query: any = {
    eq() {
      return query;
    },
    in() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve({ data: data[0] ?? null, error: null });
    },
    then(
      resolve: (value: unknown) => unknown,
      reject?: (error: unknown) => unknown,
    ) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return query;
}

function service(fixtures: Record<string, unknown[]> = {}) {
  const calls: Array<{ functionName: string; args: Record<string, unknown> }> =
    [];
  const selects: Array<{ table: string; columns: string }> = [];
  return {
    calls,
    selects,
    from(table: string) {
      return {
        select(columns: string) {
          selects.push({ table, columns });
          return thenableQuery(fixtures[table] ?? [{ value: GAME_ID }]);
        },
      };
    },
    rpc(functionName: string, args: Record<string, unknown>) {
      calls.push({ functionName, args });
      return Promise.resolve({ data: [{ outcome: "applied" }], error: null });
    },
  };
}

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
      capitalization: 1_000,
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

Deno.test("Admin Loans supervision projects authoritative data without internal ownership UUIDs", async () => {
  const mock = service({
    player_loans: [{
      id: LOAN_ID,
      public_key: LOAN_KEY,
      player_id: PLAYER_ID,
      business_id: BUSINESS_ID,
      loan_product_id: PRODUCT_ID,
      application_id: APPLICATION_ID,
      currency_code: "ECO",
      original_principal: 1000,
      principal_balance: 800,
      accrued_interest: 20,
      annual_rate: 0.08,
      origination_fee: 10,
      scheduled_payment: 120,
      status: "active",
      next_due_at: NOW,
      last_accrued_at: NOW,
      delinquent_at: null,
      defaulted_at: null,
      closed_at: null,
      created_at: NOW,
      updated_at: NOW,
    }],
    loan_payments: [{
      id: PAYMENT_ID,
      public_key: PAYMENT_KEY,
      player_id: PLAYER_ID,
      loan_id: LOAN_ID,
      amount: 200,
      principal_amount: 180,
      interest_amount: 20,
      status: "posted",
      created_at: NOW,
    }],
    loan_applications: [{
      id: APPLICATION_ID,
      public_key: APP_KEY,
      player_id: PLAYER_ID,
      business_id: BUSINESS_ID,
      loan_product_id: PRODUCT_ID,
      amount: 1000,
      purpose: "Working capital",
      credit_score: 720,
      projected_payment: 120,
      affordability_ratio: 0.2,
      status: "pending_review",
      reviewed_at: null,
      created_at: NOW,
      updated_at: NOW,
    }],
    loan_products: [{
      id: PRODUCT_ID,
      public_key: PRODUCT_KEY,
      name: "Growth Credit",
      borrower_type: "business",
      status: "active",
      currency_code: "ECO",
      minimum_amount: 100,
      maximum_amount: 5000,
      annual_rate: 0.08,
      origination_fee_rate: 0.01,
      term_cycles: 12,
      payment_frequency_cycles: 1,
      minimum_credit_score: 600,
      maximum_payment_to_income: 0.35,
      delinquency_grace_days: 7,
      default_after_days: 30,
      disclosure_text:
        "Authoritative lending disclosure for the configured credit facility.",
      created_at: NOW,
      updated_at: NOW,
    }],
    business_entities: [{
      id: BUSINESS_ID,
      public_key: BUSINESS_KEY,
      legal_name: "Atlas Works",
      status: "active",
    }],
    players: [{
      id: PLAYER_ID,
      display_name: "Avery",
      player_identifier: "PLY-1001",
      roster_label: "A-01",
      status: "active",
    }],
  });
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/economy/loans`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/economy/loans",
  });
  assertEquals(result.status, 200);
  const snapshot = (result.body as { data: Record<string, any> }).data;
  assertEquals(snapshot.summary.openLoanCount, 1);
  assertEquals(snapshot.summary.pendingApplicationCount, 1);
  assertEquals(snapshot.loans[0].id, LOAN_KEY);
  assertEquals(snapshot.loans[0].borrower.playerIdentifier, "PLY-1001");
  assertEquals(snapshot.loans[0].business.id, BUSINESS_KEY);
  assertEquals(snapshot.loans[0].product.id, PRODUCT_KEY);
  assertEquals(snapshot.payments[0].id, PAYMENT_KEY);
  const serialized = JSON.stringify(snapshot);
  for (
    const internalId of [
      PLAYER_ID,
      LOAN_ID,
      PRODUCT_ID,
      APPLICATION_ID,
      BUSINESS_ID,
      PAYMENT_ID,
    ]
  ) {
    assert(
      !serialized.includes(internalId),
      `Loans snapshot leaked internal UUID ${internalId}`,
    );
  }
  for (
    const forbidden of [
      "ledger_entry_id",
      "request_hash",
      "idempotency_key",
      "repayment_source",
    ]
  ) {
    assert(
      !serialized.includes(forbidden),
      `Loans snapshot leaked internal field ${forbidden}`,
    );
  }
});

Deno.test("Admin loan application read projects public evidence without internal UUIDs", async () => {
  const mock = service({
    loan_applications: [{
      public_key: APP_KEY,
      player_id: PLAYER_ID,
      business_id: BUSINESS_ID,
      loan_product_id: PRODUCT_ID,
      amount: 1000,
      purpose: "Working capital",
      repayment_source: "Internal-only evidence",
      credit_score: 720,
      projected_payment: 120,
      affordability_ratio: 0.2,
      status: "pending_review",
      reviewed_at: null,
      review_reason: null,
      created_at: NOW,
    }],
  });
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/loan-applications`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/loan-applications",
  });
  assertEquals(result.status, 200);
  const applications =
    (result.body as { data: { applications: unknown[] } }).data.applications;
  assertEquals(
    (applications[0] as Record<string, unknown>).public_key,
    APP_KEY,
  );
  const serialized = JSON.stringify(applications);
  for (
    const forbidden of [
      PLAYER_ID,
      BUSINESS_ID,
      PRODUCT_ID,
      "player_id",
      "business_id",
      "loan_product_id",
      "repayment_source",
      "Internal-only evidence",
    ]
  ) {
    assert(
      !serialized.includes(forbidden),
      `Loan application read leaked ${forbidden}`,
    );
  }
  const selection =
    mock.selects.find((entry) => entry.table === "loan_applications")
      ?.columns ?? "";
  for (
    const forbiddenColumn of [
      "player_id",
      "business_id",
      "loan_product_id",
      "repayment_source",
    ]
  ) {
    assert(
      !selection.split(",").includes(forbiddenColumn),
      `Loan application read selected ${forbiddenColumn}`,
    );
  }
});

Deno.test("Admin loan review supports the economy-scoped V2 route", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request(
      "POST",
      `/games/${GAME_ID}/economy/loan-applications/${APP_KEY}/review`,
      {
        decision: "approve",
        reason: "Verified economic eligibility",
        idempotencyKey: "loan-review-0001",
      },
    ),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/economy/loan-applications/${APP_KEY}/review`,
  });
  assertEquals(result.status, 200);
  assertEquals(mock.calls[0], {
    functionName: "review_player_loan_application_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_application_key: APP_KEY,
      p_decision: "approve",
      p_reason: "Verified economic eligibility",
      p_idempotency_key: "loan-review-0001",
    },
  });
});

Deno.test("Admin correction rejects invalid replay keys before persistence", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("POST", `/games/${GAME_ID}/business-banking/corrections`, {
      playerId: PLAYER_ID,
      accountType: "cash",
      currencyCode: "LUM",
      amount: 10,
      targetType: "business",
      targetPublicKey: BUSINESS_KEY,
      reason: "Correct duplicated settlement entry",
      idempotencyKey: "short",
    }),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/business-banking/corrections",
  });
  assertEquals(result.handled, true);
  assertEquals(result.status, 400);
  assertEquals(mock.calls.length, 0);
});

Deno.test("Admin Business handler leaves unrelated routes untouched", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/players`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/players",
  });
  assertEquals(result, { handled: false });
});
