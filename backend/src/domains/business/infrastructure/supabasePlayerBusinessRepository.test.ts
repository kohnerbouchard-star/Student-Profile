import { SupabasePlayerBusinessRepository } from "./supabasePlayerBusinessRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_ID = "00000000-0000-4000-8000-000000000003";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
const RECEIPT_KEY = `spr_${"b".repeat(32)}`;
const QUOTE_KEY = `quote_${"c".repeat(32)}`;
const OFFER_KEY = `sof_${"d".repeat(32)}`;
const ACTIVITY_KEY = `bae_${"e".repeat(32)}`;

Deno.test("Player Business projects committed Store sales without internal identity", async () => {
  const client = fixtureClient({
    business_entities: [{
      id: BUSINESS_ID,
      public_key: BUSINESS_KEY,
      owner_player_id: PLAYER_ID,
      legal_name: "Northreach Fabrication",
      entity_type: "llc",
      industry_code: "manufacturing",
      country_code: "NRC",
      currency_code: "NRC",
      status: "active",
      capacity_units: 100,
      valuation: "POISON_VALUATION",
      revenue_total: "POISON_REVENUE",
      expense_total: "POISON_EXPENSE",
      profit_total: "POISON_PROFIT",
      demand_index: "POISON_DEMAND",
      reputation_score: 50,
      created_at: "2026-08-25T01:00:00.000Z",
    }],
    business_products: [{
      public_key: `bpr_${"f".repeat(32)}`,
      status: "active",
      category: "manufacturing",
      name: "Alloy Form",
      quality_score: 60,
      unit_price: 10,
      unit_input_cost: 4,
      unit_labor_cost: 1,
      reference_price: 10,
      version: 1,
      base_demand_units: "POISON_BASE_DEMAND",
      created_at: "2026-08-25T01:00:00.000Z",
    }],
    account_balances: [{
      game_session_id: GAME_ID,
      player_id: PLAYER_ID,
      account_type: `business:${BUSINESS_KEY}`,
      balance: "125.00",
    }],
    store_offer_purchase_receipts: [{
      id: "00000000-0000-4000-8000-000000000004",
      buyer_player_id: "00000000-0000-4000-8000-000000000005",
      public_key: RECEIPT_KEY,
      quote_key: QUOTE_KEY,
      offer_key: OFFER_KEY,
      store_item_key: "refined_alloy_bundle",
      quantity: 2,
      gross_revenue: "50.0000",
      cost_of_goods_sold: "30.0000",
      gross_margin: "20.0000",
      currency_code: "NRC",
      completed_at: "2026-08-25T02:00:00.000Z",
    }],
    business_activity_events: [{
      id: "00000000-0000-4000-8000-000000000006",
      actor_player_id: "00000000-0000-4000-8000-000000000005",
      public_key: ACTIVITY_KEY,
      event_type: "business.store.sale.completed",
      reason_code: "business_store_offer_purchase",
      metadata: {
        receiptKey: RECEIPT_KEY,
        quoteKey: QUOTE_KEY,
        offerKey: OFFER_KEY,
        quantity: 2,
        grossRevenue: 50,
        costOfGoodsSold: 30,
        grossMargin: 20,
        currencyCode: "NRC",
      },
      occurred_at: "2026-08-25T02:00:00.000Z",
    }],
  });
  const repository = new SupabasePlayerBusinessRepository(client as never);

  const snapshot = await repository.readBusiness({
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
  });

  assertEquals(snapshot.company.cash, 125);
  for (const field of ["valuation", "valuationChange", "revenue", "margin"]) {
    assertEquals(Object.hasOwn(snapshot.company, field), false);
  }
  const serializedSnapshot = JSON.stringify(snapshot);
  for (
    const poison of [
      "POISON_VALUATION",
      "POISON_REVENUE",
      "POISON_EXPENSE",
      "POISON_PROFIT",
      "POISON_DEMAND",
      "POISON_BASE_DEMAND",
    ]
  ) {
    assertEquals(serializedSnapshot.includes(poison), false);
  }
  const businessSelection =
    client.selections.find((entry) => entry.table === "business_entities")
      ?.columns ?? "";
  const productSelection =
    client.selections.find((entry) => entry.table === "business_products")
      ?.columns ?? "";
  for (
    const forbidden of [
      "revenue_total",
      "expense_total",
      "profit_total",
      "valuation",
      "demand_index",
    ]
  ) {
    assertEquals(businessSelection.split(",").includes(forbidden), false);
  }
  assertEquals(
    productSelection.split(",").includes("base_demand_units"),
    false,
  );
  assertEquals(businessSelection, businessSelection.replace("*", ""));
  assertEquals(productSelection, productSelection.replace("*", ""));
  assertEquals(snapshot.storeSales, {
    businessKey: BUSINESS_KEY,
    currencyCode: "NRC",
    recentReceiptCount: 1,
    recentQuantitySold: 2,
    recentGrossRevenue: 50,
    recentCostOfGoodsSold: 30,
    recentGrossMargin: 20,
    sales: [{
      receiptKey: RECEIPT_KEY,
      quoteKey: QUOTE_KEY,
      offerKey: OFFER_KEY,
      itemKey: "refined_alloy_bundle",
      quantity: 2,
      grossRevenue: 50,
      costOfGoodsSold: 30,
      grossMargin: 20,
      currencyCode: "NRC",
      completedAt: "2026-08-25T02:00:00.000Z",
    }],
    activity: [{
      activityKey: ACTIVITY_KEY,
      eventType: "business.store.sale.completed",
      reasonCode: "business_store_offer_purchase",
      receiptKey: RECEIPT_KEY,
      quoteKey: QUOTE_KEY,
      offerKey: OFFER_KEY,
      quantity: 2,
      grossRevenue: 50,
      costOfGoodsSold: 30,
      grossMargin: 20,
      currencyCode: "NRC",
      occurredAt: "2026-08-25T02:00:00.000Z",
    }],
  });
  assertNoUuid(snapshot);
});

Deno.test("Player Business returns an explicit empty Store-sales projection", async () => {
  const snapshot = await new SupabasePlayerBusinessRepository(
    fixtureClient({ business_entities: [] }) as never,
  ).readBusiness({ gameSessionId: GAME_ID, playerId: PLAYER_ID });

  assertEquals(snapshot.configured, false);
  assertEquals(snapshot.storeSales, {
    businessKey: "",
    currencyCode: "",
    recentReceiptCount: 0,
    recentQuantitySold: 0,
    recentGrossRevenue: 0,
    recentCostOfGoodsSold: 0,
    recentGrossMargin: 0,
    sales: [],
    activity: [],
  });
});

Deno.test("Player Business fails closed when receipt and activity economics diverge", async () => {
  const client = fixtureClient({
    business_entities: [{
      id: BUSINESS_ID,
      public_key: BUSINESS_KEY,
      owner_player_id: PLAYER_ID,
      legal_name: "Northreach Fabrication",
      entity_type: "llc",
      industry_code: "manufacturing",
      country_code: "NRC",
      currency_code: "NRC",
      status: "active",
    }],
    store_offer_purchase_receipts: [{
      public_key: RECEIPT_KEY,
      quote_key: QUOTE_KEY,
      offer_key: OFFER_KEY,
      store_item_key: "refined_alloy_bundle",
      quantity: 2,
      gross_revenue: 50,
      cost_of_goods_sold: 30,
      gross_margin: 20,
      currency_code: "NRC",
      completed_at: "2026-08-25T02:00:00.000Z",
    }],
    business_activity_events: [{
      public_key: ACTIVITY_KEY,
      event_type: "business.store.sale.completed",
      reason_code: "business_store_offer_purchase",
      metadata: {
        receiptKey: RECEIPT_KEY,
        quoteKey: QUOTE_KEY,
        offerKey: OFFER_KEY,
        quantity: 2,
        grossRevenue: 50,
        costOfGoodsSold: 29,
        grossMargin: 21,
        currencyCode: "NRC",
      },
      occurred_at: "2026-08-25T02:00:00.000Z",
    }],
  });

  let error: unknown;
  try {
    await new SupabasePlayerBusinessRepository(client as never).readBusiness({
      gameSessionId: GAME_ID,
      playerId: PLAYER_ID,
    });
  } catch (caught) {
    error = caught;
  }
  assertEquals(
    (error as { code?: unknown })?.code,
    "business_store_sales_result_invalid",
  );
});

Deno.test("Player Business fails closed when committed sale activity is missing", async () => {
  const client = fixtureClient({
    business_entities: [{
      id: BUSINESS_ID,
      public_key: BUSINESS_KEY,
      owner_player_id: PLAYER_ID,
      legal_name: "Northreach Fabrication",
      entity_type: "llc",
      industry_code: "manufacturing",
      country_code: "NRC",
      currency_code: "NRC",
      status: "active",
    }],
    store_offer_purchase_receipts: [{
      public_key: RECEIPT_KEY,
      quote_key: QUOTE_KEY,
      offer_key: OFFER_KEY,
      store_item_key: "refined_alloy_bundle",
      quantity: 2,
      gross_revenue: 50,
      cost_of_goods_sold: 30,
      gross_margin: 20,
      currency_code: "NRC",
      completed_at: "2026-08-25T02:00:00.000Z",
    }],
  });

  let error: unknown;
  try {
    await new SupabasePlayerBusinessRepository(client as never).readBusiness({
      gameSessionId: GAME_ID,
      playerId: PLAYER_ID,
    });
  } catch (caught) {
    error = caught;
  }
  assertEquals(
    (error as { code?: unknown })?.code,
    "business_store_sales_result_invalid",
  );
});

Deno.test(
  "Player Business maps C4 procurement funding failures case-insensitively and sanitizes unknown diagnostics",
  async () => {
    const cases = [
      [
        "p0001: business_store_procurement_payment_retired",
        "business_store_procurement_payment_retired",
        410,
        false,
      ],
      [
        "PURCHASE_FUNDING_QUOTE_EXPIRED",
        "purchase_funding_quote_expired",
        409,
        false,
      ],
      [
        "purchase_funding_quote_conflict: changed request",
        "purchase_funding_quote_conflict",
        409,
        false,
      ],
      ["BANK_ACCOUNT_NOT_FOUND", "bank_account_not_found", 404, false],
      ["BANK_ACCOUNT_NOT_ACTIVE", "bank_account_not_active", 409, false],
      [
        "BANK_ACCOUNT_CURRENCY_INVALID",
        "bank_account_currency_invalid",
        409,
        false,
      ],
      ["FUNDING_INSUFFICIENT", "funding_insufficient", 409, false],
      [
        "PURCHASE_FUNDING_TARGET_ROUNDS_TO_ZERO",
        "purchase_funding_target_rounds_to_zero",
        409,
        false,
      ],
      [
        "FX_LIQUIDITY_UNAVAILABLE",
        "fx_liquidity_unavailable",
        409,
        true,
      ],
    ] as const;

    for (const [message, code, status, retryable] of cases) {
      const error = await executeError(message);
      assertEquals(
        [error.code, error.status, error.retryable],
        [code, status, retryable],
      );
    }

    const unknown = await executeError(
      "relation private.business_owner_identity secret diagnostic",
    );
    assertEquals(
      [unknown.code, unknown.status, unknown.message],
      [
        "business_operation_failed",
        500,
        "The business operation could not be completed.",
      ],
    );
  },
);

Deno.test(
  "Player Business maps guarded operating-period close conflicts to stable 409 responses",
  async () => {
    const cases = [
      [
        "P0001: BUSINESS_OPERATING_PERIOD_CLOSE_REQUIRED",
        "business_operating_period_close_required",
        "The due Business operating period must close before this Business can close.",
      ],
      [
        "business_operating_period_close_pending: active payroll remains",
        "business_operating_period_close_pending",
        "Active payroll and Store receipt processing must finish before this Business can close.",
      ],
      [
        "P0001: BUSINESS_OUTSTANDING_PAYROLL_LIABILITY",
        "business_outstanding_payroll_liability",
        "Unpaid payroll must be recovered before this Business can close.",
      ],
      [
        "P0001: BUSINESS_OUTSTANDING_TAX_LIABILITY",
        "business_outstanding_tax_liability",
        "Assessed unpaid tax must be settled before this Business can close.",
      ],
    ] as const;

    for (const [message, code, expectedMessage] of cases) {
      const error = await executeError(message);
      assertEquals(
        [error.code, error.status, error.retryable, error.message],
        [code, 409, false, expectedMessage],
      );
    }
  },
);

type PublicBusinessError = Readonly<
  Record<"code" | "status" | "retryable" | "message", unknown>
>;

async function executeError(message: string): Promise<PublicBusinessError> {
  const repository = new SupabasePlayerBusinessRepository({
    rpc() {
      return Promise.resolve({ data: null, error: { message } });
    },
  } as never);
  try {
    await repository.execute("purchase_business_store_quote_v2", {});
  } catch (error) {
    return error as PublicBusinessError;
  }
  throw new Error(`Expected database failure: ${message}`);
}

function fixtureClient(overrides: Record<string, unknown[]>) {
  const fixtures: Record<string, unknown[]> = {
    business_entities: [],
    business_products: [],
    business_employees: [],
    business_inventory: [],
    business_production_runs: [],
    account_balances: [],
    store_offer_purchase_receipts: [],
    business_activity_events: [],
    ...overrides,
  };
  const selections: Array<{ table: string; columns: string }> = [];
  return {
    selections,
    from(table: string) {
      return new FixtureBuilder(
        fixtures[table] ?? [],
        (columns) => selections.push({ table, columns }),
      );
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
  };
}

class FixtureBuilder implements
  PromiseLike<{
    data: unknown[];
    error: null;
  }> {
  constructor(
    private readonly data: unknown[],
    private readonly onSelect: (columns: string) => void,
  ) {}
  select(columns: string) {
    this.onSelect(columns);
    return this;
  }
  eq() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((
        value: { data: unknown[]; error: null },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.data, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
      .test(serialized)
  ) {
    throw new Error(
      `Business Store-sales projection leaked an internal UUID: ${serialized}`,
    );
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
