/** Synthetic unit/integration evidence only: no hosted DB, RLS, or runtime certification. */
// Dependency-free assertions keep this Deno suite usable with the repository's npm layout.
const stable = (value: unknown): string =>
  JSON.stringify(
    value,
    (_key, entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? Object.fromEntries(
          Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
        )
        : entry,
  );
const assert: {
  ok: (value: unknown, message?: unknown) => asserts value;
  equal: (actual: unknown, expected: unknown) => void;
  deepEqual: (actual: unknown, expected: unknown) => void;
} = {
  ok(value, message) {
    if (!value) {
      throw new Error(`Assertion failed: ${String(message ?? value)}`);
    }
  },
  equal(actual, expected) {
    if (!Object.is(actual, expected)) {
      throw new Error(
        `Expected ${String(expected)}, received ${String(actual)}`,
      );
    }
  },
  deepEqual(actual, expected) {
    if (stable(actual) !== stable(expected)) {
      throw new Error(
        `Expected ${stable(expected)}, received ${stable(actual)}`,
      );
    }
  },
};
import { projectLoanLifecycle } from "../backend/src/domains/business-banking/domain/loanCurrencyProjection.ts";
import { SupabasePlayerBusinessBankingRepository } from "../backend/src/domains/business-banking/infrastructure/supabasePlayerBusinessBankingRepository.ts";
import { handlePlayerBusinessBankingRequest } from "../backend/src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts";
import type { EdgeSupabaseClient } from "../backend/src/platform/supabase/edgeStaffSession.ts";
import { sha256Hex } from "../backend/src/platform/supabase/edgeCrypto.ts";

type Row = Record<string, unknown>;
const scope = { gameSessionId: "game-internal", playerId: "player-internal" };
const key = (prefix: string, index = 1) =>
  `${prefix}_${index.toString(16).padStart(32, "0")}`;
const timestamp = "2026-11-09T10:00:00.123456Z";
const hidden = {
  staff_notes: "SECRET-NOTES",
  reviewed_by: "SECRET-STAFF",
  request_hash: "SECRET-HASH",
  idempotency_key: "SECRET-IDEMPOTENCY",
  purpose: "SECRET-PURPOSE",
  repayment_source: "SECRET-SOURCE",
  ledger_transaction_id: "SECRET-LEDGER",
};
const base = {
  ...hidden,
  game_session_id: scope.gameSessionId,
  player_id: scope.playerId,
  liability_kind: "legacy_v1",
  created_at: timestamp,
  updated_at: timestamp,
};
const product = (index = 1, extra: Row = {}): Row => ({
  ...base,
  id: `product-internal-${index}`,
  public_key: key("lop", index),
  name: "Recorded product",
  currency_code: "USD",
  status: "active",
  borrower_type: "player",
  maximum_amount: 1000,
  maximum_amount_exact: "1000.00",
  minimum_amount: 1,
  minimum_credit_score: 550,
  term_cycles: 1,
  payment_frequency_cycles: 1,
  annual_rate: 0.1,
  origination_fee_rate: 0,
  ...extra,
});
const application = (index = 1, extra: Row = {}): Row => ({
  ...base,
  id: `application-internal-${index}`,
  public_key: key("lna", index),
  loan_product_id: "product-internal-1",
  status: "pending_review",
  amount_exact: "100.00",
  projected_payment_exact: "10.00",
  reviewed_at: null,
  ...extra,
});
const facility = (index = 1, extra: Row = {}): Row => ({
  ...base,
  id: `loan-internal-${index}`,
  public_key: key("lon", index),
  loan_product_id: "product-internal-1",
  status: "active",
  currency_code: "USD",
  original_principal: 100,
  original_principal_exact: "100.00",
  principal_balance: 90,
  principal_balance_exact: "90.00",
  accrued_interest: 1,
  accrued_interest_exact: "1.00",
  scheduled_payment: 10,
  scheduled_payment_exact: "10.00",
  next_due_at: timestamp,
  last_accrued_at: timestamp,
  defaulted_at: null,
  closed_at: null,
  ...extra,
});
const payment = (index = 1, extra: Row = {}): Row => ({
  ...base,
  id: `payment-internal-${index}`,
  public_key: key("pay", index),
  loan_id: "loan-internal-1",
  status: "posted",
  amount_exact: "10.00",
  principal_amount_exact: "9.00",
  interest_amount_exact: "1.00",
  applied_due_at: null,
  ...extra,
});
type ProjectionInput = Parameters<typeof projectLoanLifecycle>[0];
function project(extra: Partial<ProjectionInput> = {}) {
  const result = projectLoanLifecycle({
    applicationCount: extra.applications?.length ?? 1,
    facilityCount: extra.facilities?.length ?? 1,
    paymentCount: extra.payments?.length ?? 1,
    applications: [application()],
    facilities: [facility()],
    payments: [payment()],
    products: [product()],
    paymentLoans: [facility()],
    ...extra,
  });
  assert.equal(result.state, "available");
  if (result.state !== "available") throw new Error("Expected lifecycle");
  return result;
}
function privacy(value: unknown) {
  const serialized = JSON.stringify(value);
  for (
    const secret of [
      ...Object.values(hidden),
      "game-internal",
      "player-internal",
      "product-internal",
      "loan-internal",
      "application-internal",
      "payment-internal",
      "business_v1",
    ]
  ) assert.ok(!serialized.includes(String(secret)), secret);
  for (const field of Object.keys(hidden)) {
    assert.ok(!serialized.includes(`"${field}"`), field);
  }
}

Deno.test("lifecycle preserves every supported application/facility/payment status and nullable dates", () => {
  const statuses = [
    "active",
    "delinquent",
    "restructured",
    "defaulted",
    "paid",
  ];
  const result = project({
    applications: ["pending_review", "approved", "declined", "cancelled"].map((
      status,
      i,
    ) => application(i + 1, { status })),
    facilities: statuses.map((status, i) =>
      facility(i + 1, {
        status,
        ...(status === "paid"
          ? {
            principal_balance_exact: "0.00",
            accrued_interest_exact: "0.00",
            closed_at: timestamp,
          }
          : {}),
        ...(status === "defaulted" ? { defaulted_at: timestamp } : {}),
      })
    ),
    payments: [
      payment(),
      payment(2, { status: "reversed", applied_due_at: timestamp }),
    ],
  });
  assert.deepEqual(result.applications.items.map((x) => x.status), [
    "pending_review",
    "approved",
    "declined",
    "cancelled",
  ]);
  assert.deepEqual(result.facilities.items.map((x) => x.status), statuses);
  assert.equal(result.facilities.items[3].defaultedAt, timestamp);
  assert.equal(result.facilities.items[4].closedAt, timestamp);
  assert.equal(result.facilities.items[0].defaultedAt, null);
  assert.equal(result.applications.items[0].reviewedAt, null);
  assert.deepEqual(
    result.payments.items.map((x) => [x.status, x.appliedDueAt]),
    [["posted", null], ["reversed", timestamp]],
  );
  assert.equal(result.recordedDebt.groups[0].outstanding, "364.00");
  privacy(result);
});
Deno.test("application currency is unknown; current product metadata is not historical obligation currency", () => {
  const result = project({ products: [product(1, { currency_code: "EUR" })] });
  assert.equal(result.applications.items[0].currencyCode, null);
  assert.equal(
    result.applications.items[0].currentProduct?.currencyCode,
    "EUR",
  );
  assert.equal(result.facilities.items[0].currencyCode, "USD");
  assert.equal(result.payments.items[0].currencyCode, "USD");
});
Deno.test("exact bigint money and recorded interest remain separate by currency, including defaulted debt", () => {
  const result = project({
    facilities: [
      facility(1, {
        principal_balance_exact: "999999999999.99",
        accrued_interest_exact: "0.01",
        status: "defaulted",
      }),
      facility(2, {
        principal_balance_exact: "0.01",
        accrued_interest_exact: "0.00",
      }),
      facility(3, {
        currency_code: "EUR",
        principal_balance_exact: "0.10",
        accrued_interest_exact: "0.20",
      }),
    ],
  });
  assert.deepEqual(result.recordedDebt.groups, [{
    currencyCode: "EUR",
    principalBalance: "0.10",
    accruedInterest: "0.20",
    outstanding: "0.30",
  }, {
    currencyCode: "USD",
    principalBalance: "1000000000000.00",
    accruedInterest: "0.01",
    outstanding: "1000000000000.01",
  }]);
  assert.equal(result.facilities.items[0].lastAccruedAt, timestamp);
});
for (const count of [0, 99, 100, 101]) {
  Deno.test(`projection collection boundary ${count}`, () => {
    const result = project({
      applications: Array.from({ length: count }, (_, i) => application(i + 1)),
      facilities: Array.from({ length: count }, (_, i) => facility(i + 1)),
      payments: Array.from({ length: count }, (_, i) => payment(i + 1)),
    });
    for (
      const collection of [
        result.applications,
        result.facilities,
        result.payments,
      ]
    ) {
      assert.equal(collection.items.length, Math.min(count, 100));
      assert.equal(collection.hasMore, count > 100);
      assert.equal(collection.complete, count <= 100);
    }
    assert.equal(result.recordedDebt.complete, count <= 100);
    if (count > 100) {
      assert.equal(result.recordedDebt.groups[0].outstanding, null);
    }
    if (count === 0) assert.deepEqual(result.recordedDebt.groups, []);
  });
}
for (
  const value of [
    null,
    undefined,
    90,
    "90",
    "90.001",
    "-1.00",
    "NaN",
    "1e2",
    "1000000000000.00",
  ]
) {
  Deno.test(`reject inexact or invalid money ${String(value)}`, () => {
    const result = project({
      facilities: [facility(1, { principal_balance_exact: value })],
    });
    assert.equal(result.facilities.complete, false);
    assert.equal(result.facilities.items[0].principalBalance, null);
    assert.equal(result.recordedDebt.complete, false);
    assert.equal(result.recordedDebt.groups[0]?.outstanding ?? null, null);
  });
}
Deno.test("paid debt and missing currency are explicit invalid debt, never a zero payoff", () => {
  const paid = project({ facilities: [facility(1, { status: "paid" })] });
  assert.equal(paid.facilities.items[0].recordedOutstanding, "91.00");
  assert.equal(paid.recordedDebt.complete, false);
  assert.equal(paid.recordedDebt.groups[0].outstanding, null);
  const unknown = project({
    facilities: [facility(1, { currency_code: null })],
  });
  assert.equal(unknown.recordedDebt.unknownCurrencyRows, 1);
  assert.equal(unknown.recordedDebt.complete, false);
  assert.equal(unknown.facilities.items[0].currencyCode, null);
});
Deno.test("duplicates cannot double count or claim complete collections", () => {
  const result = project({
    applications: [application(), application()],
    facilities: [facility(), facility()],
    payments: [payment(), payment()],
  });
  for (
    const collection of [
      result.applications,
      result.facilities,
      result.payments,
    ]
  ) {
    assert.equal(collection.items.length, 1);
    assert.equal(collection.complete, false);
  }
  assert.equal(result.recordedDebt.complete, false);
  assert.equal(result.recordedDebt.groups[0].outstanding, null);
});
Deno.test("missing product joins remain nullable and incomplete; payment loan join is mandatory", () => {
  const result = project({ products: [], paymentLoans: [] });
  assert.equal(result.applications.items[0].currentProduct, null);
  assert.equal(result.applications.complete, false);
  assert.equal(result.facilities.items[0].currentProduct, null);
  assert.equal(result.facilities.complete, false);
  assert.deepEqual(result.payments.items, []);
  assert.equal(result.payments.complete, false);
});
Deno.test("payment breakdown is exact, mismatch invalid, currency comes only from associated loan", () => {
  const result = project({
    payments: [
      payment(1, {
        amount_exact: "0.30",
        principal_amount_exact: "0.10",
        interest_amount_exact: "0.20",
        currency_code: "JPY",
      }),
    ],
    paymentLoans: [facility(1, { currency_code: "EUR" })],
  });
  assert.deepEqual([
    result.payments.items[0].amount,
    result.payments.items[0].principalAmount,
    result.payments.items[0].interestAmount,
    result.payments.items[0].currencyCode,
  ], ["0.30", "0.10", "0.20", "EUR"]);
  assert.equal(result.payments.complete, true);
  assert.equal(
    project({ payments: [payment(1, { amount_exact: "10.01" })] }).payments
      .complete,
    false,
  );
  assert.equal(
    project({ payments: [payment(1, { principal_amount_exact: null })] })
      .payments.complete,
    false,
  );
});
Deno.test("malformed IDs/status/date and reserved business liabilities never masquerade as valid legacy records", () => {
  for (
    const patch of [{ public_key: "uuid-private" }, { status: "unknown" }, {
      liability_kind: "business_v1",
    }]
  ) {
    const result = project({
      applications: [application(1, patch)],
      facilities: [facility(1, patch)],
    });
    assert.deepEqual(result.applications.items, []);
    assert.deepEqual(result.facilities.items, []);
    assert.equal(result.recordedDebt.complete, false);
    privacy(result);
  }
  const business = project({
    paymentLoans: [facility(1, { liability_kind: "business_v1" })],
  });
  assert.deepEqual(business.payments.items, []);
  assert.equal(business.payments.complete, false);
  privacy(business);
  const dates = project({
    facilities: [facility(1, { last_accrued_at: "not a date" })],
    payments: [payment(1, { applied_due_at: "bad" })],
  });
  assert.equal(dates.facilities.items[0].lastAccruedAt, null);
  assert.equal(dates.facilities.complete, false);
  assert.equal(dates.payments.items[0].appliedDueAt, null);
  assert.equal(dates.payments.complete, false);
});

// Executes filters, ordering, limits, and selected columns, rather than returning pre-scoped canned DTOs.
type Query = {
  table: string;
  columns: string;
  filters: [string, unknown][];
  ins: [string, readonly unknown[]][];
  orders: [string, boolean][];
  limit?: number;
  single?: boolean;
  count?: "exact";
  signal?: AbortSignal;
};
type Database = Record<string, Row[]>;
function synthetic(
  database: Database,
  fail: (query: Query) => boolean = () => false,
  options: {
    serverCap?: number;
    omitCount?: boolean;
    neverSettle?: (query: Query) => boolean;
    defer?: (query: Query) => Promise<void> | undefined;
  } = {},
) {
  const queries: Query[] = [];
  const rpcs: [string, unknown][] = [];
  const client = {
    from(table: string) {
      const query: Query = {
        table,
        columns: "",
        filters: [],
        ins: [],
        orders: [],
      };
      queries.push(query);
      const execute = () => {
        if (fail(query)) {
          return {
            data: null,
            error: { message: "synthetic added-read failure SECRET-NOTES" },
          };
        }
        let result = [...(database[table] ?? [])].filter((row) =>
          query.filters.every(([k, v]) => row[k] === v) &&
          query.ins.every(([k, values]) => values.includes(row[k]))
        );
        result.sort((a, b) => {
          for (const [k, ascending] of query.orders) {
            if (a[k] === b[k]) continue;
            return (String(a[k]) < String(b[k]) ? -1 : 1) *
              (ascending ? 1 : -1);
          }
          return 0;
        });
        const count = query.count === "exact" && !options.omitCount
          ? result.length
          : null;
        if (query.limit !== undefined) result = result.slice(0, query.limit);
        if (query.count && options.serverCap !== undefined) {
          result = result.slice(0, options.serverCap);
        }
        result = result.map((row) => {
          if (query.columns.split(",").includes("*")) return { ...row };
          return Object.fromEntries(
            query.columns.split(",").map((column) => {
              const name = column.split(":")[0];
              return [name, row[name]];
            }),
          );
        });
        return {
          data: query.single ? result[0] ?? null : result,
          error: null,
          count,
        };
      };
      const builder = {
        select(columns: string, options?: { count: "exact" }) {
          query.columns = columns;
          if (options) query.count = options.count;
          return builder;
        },
        abortSignal(signal: AbortSignal) {
          query.signal = signal;
          return builder;
        },
        eq(k: string, v: unknown) {
          query.filters.push([k, v]);
          return builder;
        },
        in(k: string, values: readonly unknown[]) {
          query.ins.push([k, values]);
          return builder;
        },
        order(k: string, options: { ascending: boolean }) {
          query.orders.push([k, options.ascending]);
          return builder;
        },
        limit(value: number) {
          query.limit = value;
          return builder;
        },
        maybeSingle() {
          query.single = true;
          return Promise.resolve(execute());
        },
        then(
          resolve: (value: ReturnType<typeof execute>) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          if (options.neverSettle?.(query)) {
            return new Promise<ReturnType<typeof execute>>(() => {}).then(
              resolve,
              reject,
            );
          }
          const deferred = options.defer?.(query);
          if (deferred) return deferred.then(execute).then(resolve, reject);
          return Promise.resolve(execute()).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(name: string, args: unknown) {
      rpcs.push([name, args]);
      assert.equal(name, "resolve_player_economic_context_v1");
      return Promise.resolve({
        data: { country_code: "US", currency_code: "USD" },
        error: null,
      });
    },
  } as unknown as EdgeSupabaseClient;
  return { client, queries, rpcs };
}
const database = (): Database => ({
  loan_products: [product()],
  loan_applications: [application()],
  player_loans: [facility()],
  loan_payments: [payment()],
  credit_profiles: [{ ...base, score: 650, on_time_payment_rate: 0.9 }],
  business_entities: [],
});
const read = (fake: ReturnType<typeof synthetic>) =>
  new SupabasePlayerBusinessBankingRepository(fake.client).readLoans(scope);
const added = (q: Query) =>
  q.limit === 101 || q.columns === "id,public_key,name,currency_code" ||
  q.columns === "id,public_key,liability_kind,currency_code";

Deno.test("real repository added windows use own game/player, legacy filters, deterministic order and 101 sentinel", async () => {
  const fake = synthetic(database());
  const result = await read(fake);
  assert.equal(result.lifecycle?.state, "available");
  const windows = fake.queries.filter((q) => q.limit === 101);
  assert.equal(windows.length, 3);
  for (const q of windows) {
    assert.equal(q.count, "exact");
    assert.ok(
      q.filters.some(([k, v]) =>
        k === "game_session_id" && v === scope.gameSessionId
      ),
    );
    assert.ok(
      q.filters.some(([k, v]) => k === "player_id" && v === scope.playerId),
    );
    assert.deepEqual(q.orders, [["created_at", false], ["public_key", false]]);
    assert.ok(!q.columns.includes("*"));
    if (q.table !== "loan_payments") {
      assert.ok(
        q.filters.some(([k, v]) => k === "liability_kind" && v === "legacy_v1"),
      );
    }
  }
  const joins = fake.queries.filter((q) => q.ins.length);
  assert.equal(joins.length, 2);
  assert.deepEqual(joins.find((q) => q.table === "loan_products")?.filters, [[
    "game_session_id",
    scope.gameSessionId,
  ]]);
  assert.deepEqual(joins.find((q) => q.table === "player_loans")?.filters, [
    ["game_session_id", scope.gameSessionId],
    ["player_id", scope.playerId],
    ["liability_kind", "legacy_v1"],
  ]);
  assert.deepEqual(fake.rpcs, [["resolve_player_economic_context_v1", {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
  }]]);
  privacy(result.lifecycle);
});
for (const count of [0, 99, 100, 101]) {
  Deno.test(`real repository collection boundary ${count} and tie-break ordering`, async () => {
    const db = database();
    db.loan_applications = Array.from(
      { length: count },
      (_, i) => application(i + 1),
    );
    db.player_loans = Array.from({ length: count }, (_, i) => facility(i + 1));
    db.loan_payments = Array.from({ length: count }, (_, i) => payment(i + 1));
    const result = (await read(synthetic(db))).lifecycle;
    assert.ok(result?.state === "available");
    for (
      const collection of [
        result.applications,
        result.facilities,
        result.payments,
      ]
    ) {
      assert.equal(collection.items.length, Math.min(count, 100));
      assert.equal(collection.hasMore, count > 100);
      assert.equal(collection.complete, count <= 100);
    }
    if (count) assert.equal(result.facilities.items[0].id, key("lon", count));
    assert.equal(result.recordedDebt.complete, count <= 100);
  });
}
Deno.test("repository isolates other games/players, cross-game product joins, mismatched and business loan associations", async () => {
  const db = database();
  db.loan_products.push(product(2, { game_session_id: "other-game" }));
  db.loan_applications.push(
    application(2, { loan_product_id: "product-internal-2" }),
    application(3, { game_session_id: "other-game" }),
    application(4, { player_id: "other-player" }),
    application(5, { liability_kind: "business_v1" }),
  );
  db.player_loans.push(
    facility(2, { game_session_id: "other-game" }),
    facility(3, { player_id: "other-player" }),
    facility(4, { liability_kind: "business_v1" }),
  );
  db.loan_payments.push(
    payment(2, { loan_id: "loan-internal-2" }),
    payment(3, { loan_id: "loan-internal-3" }),
    payment(4, { loan_id: "loan-internal-4" }),
    payment(5, { game_session_id: "other-game" }),
    payment(6, { player_id: "other-player" }),
  );
  const result = (await read(synthetic(db))).lifecycle;
  assert.ok(result?.state === "available");
  assert.deepEqual(result.applications.items.map((x) => x.id), [
    key("lna", 2),
    key("lna", 1),
  ]);
  assert.equal(result.applications.items[0].currentProduct, null);
  assert.equal(result.applications.complete, false);
  assert.deepEqual(result.facilities.items.map((x) => x.id), [key("lon")]);
  assert.deepEqual(result.payments.items.map((x) => x.id), [key("pay")]);
  assert.equal(result.payments.complete, false);
  privacy(result);
});
Deno.test("old snapshot and original query shapes unchanged when lifecycle succeeds or fails", async () => {
  const ok = synthetic(database());
  const failed = synthetic(database(), added);
  const { lifecycle: success, repaymentForecast: _successForecast, ...before } = await read(ok);
  const { lifecycle: unavailable, repaymentForecast: _unavailableForecast, ...after } = await read(failed);
  assert.equal(success?.state, "available");
  assert.deepEqual(unavailable, { version: 1, state: "unavailable" });
  assert.deepEqual(after, before);
  assert.deepEqual(
    ok.queries.filter((q) => !added(q)),
    failed.queries.filter((q) => !added(q)),
  );
  const originals = ok.queries.filter((q) => !added(q));
  assert.equal(originals.length, 5);
  assert.deepEqual(originals.map((q) => [q.table, q.limit ?? null, q.orders]), [
    ["loan_products", null, [["minimum_amount", true]]],
    ["player_loans", null, [["created_at", false]]],
    ["credit_profiles", 1, []],
    ["loan_payments", 500, [["created_at", false]]],
    ["business_entities", null, []],
  ]);
  assert.ok(
    originals.every((q) => !q.filters.some(([k]) => k === "liability_kind")),
  );
  assert.equal(before.outstanding, 91);
  assert.equal(before.availableCredit, 1000);
  assert.equal(before.paymentsMade, 1);
  assert.equal(before.creditScore, 650);
  assert.equal(before.activeLoans.length, 1);
});
for (
  const target of [
    "loan_applications",
    "player_loans",
    "loan_payments",
    "productJoin",
    "paymentLoanJoin",
  ]
) {
  Deno.test(`added ${target} failure is explicitly unavailable without breaking existing read`, async () => {
    const fake = synthetic(
      database(),
      (q) =>
        target === "productJoin"
          ? q.table === "loan_products" && q.ins.length > 0
          : target === "paymentLoanJoin"
          ? q.table === "player_loans" && q.ins.length > 0
          : q.table === target && q.limit === 101,
    );
    const result = await read(fake);
    assert.deepEqual(result.lifecycle, { version: 1, state: "unavailable" });
    assert.equal(result.outstanding, 91);
    assert.equal(result.configured, true);
    assert.ok(!JSON.stringify(result).includes("synthetic added-read failure"));
  });
}

const env = () => ({
  ok: true as const,
  value: {
    supabaseUrl: "https://synthetic.invalid",
    supabaseAnonKey: "synthetic-anon",
    supabaseServiceRoleKey: "synthetic-service",
  },
});
async function authenticatedDatabase(): Promise<Database> {
  return {
    ...database(),
    player_sessions: [{
      id: "session-internal",
      game_session_id: scope.gameSessionId,
      player_id: scope.playerId,
      status: "active",
      expires_at: "2099-01-01T00:00:00Z",
      revoked_at: null,
      session_token_hash: await sha256Hex("synthetic-player-token"),
    }],
    game_sessions: [{
      id: scope.gameSessionId,
      name: "Synthetic classroom",
      status: "active",
    }],
    players: [{
      id: scope.playerId,
      game_session_id: scope.gameSessionId,
      display_name: "Synthetic player",
      status: "active",
      roster_label: null,
    }],
  };
}
function http(
  fake: ReturnType<typeof synthetic>,
  headers: Record<string, string> = {
    "x-player-session-token": "synthetic-player-token",
  },
  suffix = "",
) {
  return handlePlayerBusinessBankingRequest(
    new Request(`https://synthetic.invalid/api/player/loans${suffix}`, {
      headers,
    }),
    { kind: "loansRead" },
    { createServiceClient: () => fake.client, readEnvironment: env },
  );
}
Deno.test("real HTTP handler resolves actual player scope, returns private no-store lifecycle and no secrets", async () => {
  const fake = synthetic(await authenticatedDatabase());
  const response = await http(fake);
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(
    response.headers.get("vary"),
    "authorization, x-player-session-token",
  );
  const body = await response.json();
  assert.equal(body.lifecycle.state, "available");
  privacy(body.lifecycle);
  assert.ok(fake.queries.some((q) => q.table === "player_sessions"));
  assert.ok(
    fake.queries.some((q) =>
      q.table === "players" &&
      q.filters.some(([k, v]) =>
        k === "game_session_id" && v === scope.gameSessionId
      )
    ),
  );
});
for (
  const [name, headers, suffix, status] of [
    ["anonymous", {}, "", 401],
    [
      "staff bearer without player session",
      { authorization: "Bearer synthetic-staff-token" },
      "",
      401,
    ],
    [
      "invalid player token",
      { "x-player-session-token": "wrong-token" },
      "",
      401,
    ],
    [
      "wrong game header",
      {
        "x-player-session-token": "synthetic-player-token",
        "x-game-session-id": "other-game",
      },
      "",
      400,
    ],
    [
      "wrong player header",
      {
        "x-player-session-token": "synthetic-player-token",
        "x-player-id": "other-player",
      },
      "",
      400,
    ],
    [
      "game query override",
      { "x-player-session-token": "synthetic-player-token" },
      "?gameSessionId=other-game",
      400,
    ],
    [
      "player query override",
      { "x-player-session-token": "synthetic-player-token" },
      "?playerId=other-player",
      400,
    ],
  ] as const
) {
  Deno.test(`HTTP rejects ${name} before Loans reads`, async () => {
    const fake = synthetic(await authenticatedDatabase());
    const response = await http(fake, headers, suffix);
    assert.equal(response.status, status);
    assert.equal(fake.rpcs.length, 0);
    assert.ok(!fake.queries.some((q) => q.table === "loan_applications"));
    assert.ok(!(await response.text()).includes("lifecycle"));
  });
}
for (
  const target of [
    "game",
    "player",
    "revoked",
    "expired",
    "inactivePlayer",
  ] as const
) {
  Deno.test(`HTTP rejects ${target} session mismatch or invalidity`, async () => {
    const db = await authenticatedDatabase();
    if (target === "game") db.game_sessions[0].id = "other-game";
    if (target === "player") db.players[0].game_session_id = "other-game";
    if (target === "revoked") db.player_sessions[0].revoked_at = timestamp;
    if (target === "expired") {
      db.player_sessions[0].expires_at = "2000-01-01T00:00:00Z";
    }
    if (target === "inactivePlayer") db.players[0].status = "inactive";
    const fake = synthetic(db);
    assert.equal((await http(fake)).status, 401);
    assert.equal(fake.rpcs.length, 0);
  });
}

for (const count of [null, 0, 2, 101, -1, 1.5, Number.NaN]) {
  Deno.test(`unverified or inconsistent count ${count} cannot certify complete debt`, () => {
    const result = project({
      applicationCount: count,
      facilityCount: count,
      paymentCount: count,
    });
    for (
      const window of [result.applications, result.facilities, result.payments]
    ) assert.equal(window.complete, false);
    assert.equal(result.recordedDebt.complete, false);
    assert.equal(result.recordedDebt.groups[0].outstanding, null);
    if (count === null || !Number.isSafeInteger(count) || count < 0) {
      assert.equal(result.facilities.hasMore, null);
    }
    if (count === 101) assert.equal(result.facilities.hasMore, true);
  });
}
Deno.test("observed sentinel establishes hasMore even without count, never complete debt", () => {
  const result = project({
    facilities: Array.from({ length: 101 }, (_, i) => facility(i + 1)),
    facilityCount: null,
  });
  assert.equal(result.facilities.hasMore, true);
  assert.equal(result.facilities.complete, false);
  assert.equal(result.recordedDebt.complete, false);
});
for (const options of [{ serverCap: 1 }, { omitCount: true }]) {
  Deno.test(`repository detects server under-return or absent counts ${JSON.stringify(options)}`, async () => {
    const db = database();
    db.loan_applications.push(application(2));
    db.player_loans.push(facility(2));
    db.loan_payments.push(payment(2));
    const lifecycle = (await read(synthetic(db, () =>
      false, options))).lifecycle;
    assert.ok(lifecycle?.state === "available");
    for (
      const window of [
        lifecycle.applications,
        lifecycle.facilities,
        lifecycle.payments,
      ]
    ) assert.equal(window.complete, false);
    assert.equal(lifecycle.recordedDebt.complete, false);
    assert.equal(lifecycle.recordedDebt.groups[0].outstanding, null);
  });
}
Deno.test("legacy snapshot golden fixture retains every original field and value", async () => {
  const { lifecycle: _lifecycle, repaymentForecast: _forecast, ...legacy } = await read(
    synthetic(database()),
  );
  assert.deepEqual(legacy, {
    configured: true,
    creditScore: 650,
    availableCredit: 1000,
    outstanding: 91,
    nextPayment: { amount: 10, due: timestamp },
    onTimeRate: 90,
    paymentsMade: 1,
    offers: [{
      currencyCode: "USD",
      id: key("lop"),
      name: "Recorded product",
      purpose: "Player finance",
      description: "",
      limit: 1000,
      minimumAmount: 1,
      apr: 10,
      fee: 0,
      termCycles: 1,
      risk: "Moderate",
      borrowerType: "player",
      disclosure: "",
      icon: "banking",
    }],
    activeLoans: [{
      currencyCode: "USD",
      id: key("lon"),
      name: "Recorded product",
      status: "Active",
      balance: 91,
      originalAmount: 100,
      nextPayment: 10,
      nextDue: timestamp,
      repaidPercent: 10,
      accruedInterest: 1,
      businessId: null,
    }],
    schedule: [{
      currencyCode: "USD",
      cycle: "Payment 1",
      due: "2026-11-09T10:00:00.123Z",
      amount: 10,
      status: "Scheduled",
    }],
    currencyProjection: {
      version: 1,
      complete: true,
      unknownCurrencyRows: 0,
      groups: [{
        currencyCode: "USD",
        availableCredit: "1000.00",
        outstanding: "91.00",
        nextPayment: { amount: "10.00", due: timestamp },
        schedule: [{ due: "2026-11-09T10:00:00.123Z", amount: "10.00" }],
      }],
    },
  });
});

// The outer deadline fails a regression instead of leaving the Deno test process hanging.
async function withinDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() =>
          reject(
            new Error(
              "Optional lifecycle history blocked the original read beyond 500ms",
            ),
          ), 500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
for (
  const target of [
    "loan_applications",
    "player_loans",
    "loan_payments",
    "productJoin",
    "paymentLoanJoin",
  ]
) {
  Deno.test(`never-settling ${target} is bounded, aborts siblings, and preserves original snapshot`, async () => {
    const baseline = await read(synthetic(database()));
    const { lifecycle: _baselineLifecycle, repaymentForecast: _baselineForecast, ...expected } = baseline;
    const fake = synthetic(database(), () => false, {
      neverSettle: (q) =>
        target === "productJoin"
          ? q.table === "loan_products" && q.ins.length > 0
          : target === "paymentLoanJoin"
          ? q.table === "player_loans" && q.ins.length > 0
          : q.table === target && q.limit === 101,
    });
    const { lifecycle, repaymentForecast: _forecast, ...original } = await withinDeadline(
      new SupabasePlayerBusinessBankingRepository(fake.client, 5).readLoans(
        scope,
      ),
    );
    assert.deepEqual(original, expected);
    assert.deepEqual(lifecycle, { version: 1, state: "unavailable" });
    const extra = fake.queries.filter(added);
    assert.ok(extra.length >= 3);
    const signal = extra[0].signal;
    assert.ok(signal);
    assert.equal(signal.aborted, true);
    for (const query of extra) assert.equal(query.signal, signal);
    for (const query of fake.queries.filter((q) => !added(q))) {
      assert.equal(query.signal, undefined);
    }
    const queryCount = fake.queries.length;
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fake.queries.length, queryCount);
    if (!target.endsWith("Join")) {
      assert.equal(fake.queries.filter((q) => q.ins.length > 0).length, 0);
    }
  });
}
for (
  const target of [
    "loan_products",
    "player_loans",
    "credit_profiles",
    "loan_payments",
    "business_entities",
  ]
) {
  Deno.test(`original ${target} failure never starts optional history`, async () => {
    const fake = synthetic(database(), (q) => q.table === target && !added(q));
    let failed = false;
    try {
      await withinDeadline(
        new SupabasePlayerBusinessBankingRepository(fake.client, 5).readLoans(
          scope,
        ),
      );
    } catch {
      failed = true;
    }
    assert.equal(failed, true);
    assert.equal(fake.queries.filter(added).length, 0);
    assert.ok(fake.queries.every((q) => q.signal === undefined));
  });
}
Deno.test("successful and failed history abort the shared query signal and release deadline timers", async () => {
  for (
    const fail of [() => false, (q: Query) => q.table === "loan_applications"]
  ) {
    const fake = synthetic(database(), fail);
    await read(fake);
    const extra = fake.queries.filter(added);
    const signal = extra[0].signal;
    assert.ok(signal);
    assert.equal(signal.aborted, true);
    assert.ok(extra.every((q) => q.signal === signal));
  }
});
Deno.test("late collection completion after timeout cannot start metadata joins", async () => {
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fake = synthetic(database(), () => false, {
    defer: (q) => q.table === "loan_applications" ? deferred : undefined,
  });
  const result = await withinDeadline(
    new SupabasePlayerBusinessBankingRepository(fake.client, 5).readLoans(
      scope,
    ),
  );
  assert.deepEqual(result.lifecycle, { version: 1, state: "unavailable" });
  assert.equal(fake.queries.filter((q) => q.ins.length > 0).length, 0);
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fake.queries.filter((q) => q.ins.length > 0).length, 0);
});
