import { readPlayerBusinessBankingRoutePath } from "./playerBusinessBankingRoutePaths.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

const key = (prefix: string, digit: string) => `${prefix}_${digit.repeat(32)}`;

Deno.test("Player Business and Banking routes publish every reviewed operation", () => {
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business"), {
    kind: "businessRead",
    resource: "overview",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/stockroom"), {
    kind: "businessRead",
    resource: "stockroom",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/businesses"), {
    kind: "businessCreate",
    operation: "directCreate",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/formations"), {
    kind: "businessCreate",
    operation: "formationPropose",
  });
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/business/formations/${key("bfp", "f")}/respond`),
    {
      kind: "businessCreate",
      operation: "formationRespond",
      formationKey: key("bfp", "f"),
    },
  );
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/business/formations/${key("bfp", "e")}/activate`),
    {
      kind: "businessCreate",
      operation: "formationActivate",
      formationKey: key("bfp", "e"),
    },
  );
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/products"), {
    kind: "businessProductCreate",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/inputs/purchases"), {
    kind: "businessInputPurchase",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/production-runs"), {
    kind: "businessProduction",
  });
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/business/products/${key("bpr", "a")}/pricing`),
    { kind: "businessPrice", productKey: key("bpr", "a") },
  );
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/employees/hire"), {
    kind: "businessHire",
  });
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/business/employees/${key("emp", "b")}/terminate`),
    { kind: "businessTerminate", employeeKey: key("emp", "b") },
  );
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/status"), {
    kind: "businessStatus",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/banking/transfers"), {
    kind: "playerTransfer",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/banking/savings/transfers"), {
    kind: "savingsTransfer",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/banking/loans"), {
    kind: "loansRead",
  });
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/banking/loans/applications/${key("lop", "c")}`),
    { kind: "loanApply", offerKey: key("lop", "c") },
  );
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/banking/loans/${key("lon", "d")}/payments`),
    { kind: "loanRepay", loanKey: key("lon", "d") },
  );
});

Deno.test("Player Business and Banking routes reject malformed and non-Player paths", () => {
  assertEquals(readPlayerBusinessBankingRoutePath("/games/game/business"), null);
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/stockroom/extra"), null);
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/products/not-a-key/pricing"), null);
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/formations/not-a-key/respond"), null);
  assertEquals(readPlayerBusinessBankingRoutePath(`/players/me/banking/loans/${key("lop", "e")}/payments`), null);
  assertEquals(readPlayerBusinessBankingRoutePath("/players/other/banking/transfers"), null);
});

Deno.test("IPO routes remain exclusively owned by the canonical Business dispatcher", () => {
  for (const path of ["ipos", "ipos/proposals", `ipos/${key("bgp", "a")}/votes`, `ipos/${key("bgp", "a")}/subscriptions`]) {
    assertEquals(readPlayerBusinessBankingRoutePath(`/players/me/business/${path}`), null);
  }
});

// REF025a: application/repository characterization with synthetic clients, no SQL execution.
import { handlePlayerBusinessBankingRequest } from "./playerBusinessBankingHttpHandler.ts";
import { SupabasePlayerBusinessBankingRepository } from "../infrastructure/supabasePlayerBusinessBankingRepository.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";

Deno.test("Loans rejects envelope, body and method before configuration or scope", async () => {
  for (const [method, suffix, headers, body] of [
    ["GET", "?playerId=spoof", {}, undefined],
    ["GET", "", { "x-player-id": "spoof" }, undefined],
    ["POST", "", {}, "{"],
    ["POST", "", {}, "{}"],
  ] as const) {
    const response = await handlePlayerBusinessBankingRequest(
      new Request(`https://example.test/players/me/banking/loans${suffix}`, { method, headers, body }),
      { kind: "loansRead" },
      {
        readEnvironment: () => { throw new Error("configuration must not be read"); },
        createServiceClient: () => { throw new Error("client must not be created"); },
      },
    );
    assertEquals(response.status, method === "POST" && body === "{}" ? 405 : 400);
  }
  const calls: string[] = [];
  const response = await handlePlayerBusinessBankingRequest(
    new Request("https://example.test/players/me/banking/loans"), { kind: "loansRead" },
    {
      readEnvironment: () => { calls.push("environment"); return { ok: false, error: "missing" }; },
      createServiceClient: () => { throw new Error("client must not be created"); },
    },
  );
  assertEquals(response.status, 500);
  assertEquals(calls, ["environment"]);
});

Deno.test("Loans preserves injected scope denial and never constructs its repository", async () => {
  const response = await handlePlayerBusinessBankingRequest(
    new Request("https://example.test/players/me/banking/loans"), { kind: "loansRead" },
    {
      readEnvironment: () => ({ ok: true, value: { supabaseUrl: "https://example.test", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture" } }),
      createServiceClient: () => ({} as EdgeSupabaseClient),
      resolveScope: () => { throw new EdgeActivationError("invalid_player_session_scope", "Denied", 403); },
      createRepository: () => { throw new Error("repository must not be created"); },
    },
  );
  assertEquals(response.status, 403);
  assertEquals((await response.json()).error.code, "invalid_player_session_scope");
});

Deno.test("Loans retains five scoped reads and the borrower/account projection contract", async () => {
  for (const [businessCount, missingCurrency] of [0, 1, 2].flatMap((count) =>
    [false, true].map((missing) => [count, missing] as const)
  )) {
    const calls: unknown[][] = [];
    const businessKey = key("biz", "a");
    const fixtures: Record<string, Record<string, unknown>[]> = {
      loan_products: [{ id: "product", public_key: key("lop", "b"), currency_code: "NRC", borrower_type: "business", status: "active", minimum_credit_score: 550, maximum_amount: "100.10", term_cycles: 2 }],
      player_loans: [
        { public_key: key("lon", "c"), currency_code: "NRC", loan_product_id: "product", business_id: "business0", status: "active", principal_balance: "10.10", accrued_interest: "0.20", original_principal: "20", scheduled_payment: "3", next_due_at: "2026-10-05T00:00:00.000Z" },
        { public_key: key("lon", "d"), currency_code: "LUM", loan_product_id: "foreign-product", status: "delinquent", principal_balance: "20.20", accrued_interest: "0.30", original_principal: "30", scheduled_payment: "4", next_due_at: "2026-10-06T00:00:00.000Z" },
      ],
      credit_profiles: [],
      loan_payments: [{ status: "posted" }, { status: "reversed" }],
      business_entities: Array.from({ length: businessCount }, (_, i) => ({ id: `business${i}`, public_key: businessKey, status: "active" })),
    };
    for (const row of fixtures.loan_products) row.maximum_amount_exact = row.maximum_amount;
    for (const row of fixtures.player_loans) {
      row.principal_balance_exact = row.principal_balance;
      row.accrued_interest_exact = row.accrued_interest;
      row.scheduled_payment_exact = `${row.scheduled_payment}.00`;
    }
    if (missingCurrency) {
      for (const row of [...fixtures.loan_products, ...fixtures.player_loans]) {
        row.currency_code = [null, undefined, "   "][businessCount];
      }
    }
    const client = {
      rpc(name: string, args: unknown) {
        calls.push(["rpc", name, args]);
        return Promise.resolve({ data: [{ country_code: "NRC", currency_code: "NRC" }], error: null });
      },
      from(table: string) {
        const query = {
          select(value: string) { calls.push([table, "select", value]); return query; },
          eq(column: string, value: unknown) { calls.push([table, "eq", column, value]); return query; },
          order(column: string, options: unknown) { calls.push([table, "order", column, options]); return query; },
          limit(value: number) { calls.push([table, "limit", value]); return query; },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: fixtures[table], error: null }).then(resolve); },
        };
        return query;
      },
    } as unknown as EdgeSupabaseClient;
    const result = await new SupabasePlayerBusinessBankingRepository(client).readLoans({ gameSessionId: "game-fixture", playerId: "player-fixture" });
    assertEquals(calls, [
      ["rpc", "resolve_player_economic_context_v1", { p_game_session_id: "game-fixture", p_player_id: "player-fixture" }],
      ["loan_products", "select", "*,maximum_amount_exact:maximum_amount::text"], ["loan_products", "eq", "game_session_id", "game-fixture"], ["loan_products", "eq", "currency_code", "NRC"], ["loan_products", "order", "minimum_amount", { ascending: true }],
      ["player_loans", "select", "*,principal_balance_exact:principal_balance::text,accrued_interest_exact:accrued_interest::text,scheduled_payment_exact:scheduled_payment::text"], ["player_loans", "eq", "game_session_id", "game-fixture"], ["player_loans", "eq", "player_id", "player-fixture"], ["player_loans", "order", "created_at", { ascending: false }],
      ["credit_profiles", "select", "*"], ["credit_profiles", "eq", "game_session_id", "game-fixture"], ["credit_profiles", "eq", "player_id", "player-fixture"], ["credit_profiles", "limit", 1],
      ["loan_payments", "select", "*"], ["loan_payments", "eq", "game_session_id", "game-fixture"], ["loan_payments", "eq", "player_id", "player-fixture"], ["loan_payments", "order", "created_at", { ascending: false }], ["loan_payments", "limit", 500],
      ["business_entities", "select", "id,public_key,status"], ["business_entities", "eq", "game_session_id", "game-fixture"], ["business_entities", "eq", "owner_player_id", "player-fixture"],
    ]);
    assertEquals([result.outstanding, result.creditScore, result.paymentsMade], [30.8, 600, 1]);
    assertEquals(result.availableCredit, businessCount ? 100.1 : 0);
    assertEquals(result.activeLoans[0].businessId, businessCount ? businessKey : null);
    assertEquals(result.nextPayment, { amount: 3, due: "2026-10-05T00:00:00.000Z" });
    assertEquals(result.schedule.map((item) => item.amount), [3, 3, 4]);
    const currency = (code: string) => missingCurrency ? null : code;
    assertEquals(result.offers.map((row) => row.currencyCode), businessCount ? [currency("NRC")] : []);
    assertEquals(result.activeLoans.map((row) => row.currencyCode), [currency("NRC"), currency("LUM")]);
    assertEquals(result.schedule.map((row) => row.currencyCode), [currency("NRC"), currency("NRC"), currency("LUM")]);
    // Strip only additive metadata, then compare the entire retained response.
    const stripCurrency = ({ currencyCode: _currency, ...row }: { currencyCode?: string | null }) => row;
    const { currencyProjection, ...retained } = result;
    assertEquals(currencyProjection, missingCurrency
      ? { version: 1, complete: false, unknownCurrencyRows: businessCount ? 3 : 2, groups: [] }
      : { version: 1, complete: true, unknownCurrencyRows: 0, groups: [
        { currencyCode: "LUM", availableCredit: "0.00", outstanding: "20.50",
          nextPayment: { amount: "4.00", due: "2026-10-06T00:00:00.000Z" },
          schedule: [{ due: "2026-10-06T00:00:00.000Z", amount: "4.00" }] },
        { currencyCode: "NRC", availableCredit: businessCount ? "100.10" : "0.00", outstanding: "10.30",
          nextPayment: { amount: "3.00", due: "2026-10-05T00:00:00.000Z" },
          schedule: [{ due: "2026-10-05T00:00:00.000Z", amount: "3.00" },
            { due: "2026-10-12T00:00:00.000Z", amount: "3.00" }] },
      ] });
    assertEquals({ ...retained, offers: result.offers.map(stripCurrency),
      activeLoans: result.activeLoans.map(stripCurrency), schedule: result.schedule.map(stripCurrency) }, {
      configured: true, creditScore: 600, availableCredit: businessCount ? 100.1 : 0,
      outstanding: 30.8, nextPayment: { amount: 3, due: "2026-10-05T00:00:00.000Z" },
      onTimeRate: 100, paymentsMade: 1,
      offers: businessCount ? [{ id: key("lop", "b"), name: "Credit facility", purpose: "Business finance",
        description: "", limit: 100.1, minimumAmount: 0, apr: 0, fee: 0, termCycles: 2,
        risk: "Moderate", borrowerType: "business", disclosure: "", icon: "business" }] : [],
      activeLoans: [
        { id: key("lon", "c"), name: "Credit facility", status: "Active", balance: 10.3,
          originalAmount: 20, nextPayment: 3, nextDue: "2026-10-05T00:00:00.000Z",
          repaidPercent: 49.5, accruedInterest: 0.2, businessId: businessCount ? businessKey : null },
        { id: key("lon", "d"), name: "Credit facility", status: "Delinquent", balance: 20.5,
          originalAmount: 30, nextPayment: 4, nextDue: "2026-10-06T00:00:00.000Z",
          repaidPercent: 32.7, accruedInterest: 0.3, businessId: null },
      ],
      schedule: [
        { cycle: "Payment 1", due: "2026-10-05T00:00:00.000Z", amount: 3, status: "Scheduled" },
        { cycle: "Payment 2", due: "2026-10-12T00:00:00.000Z", amount: 3, status: "Scheduled" },
        { cycle: "Payment 1", due: "2026-10-06T00:00:00.000Z", amount: 4, status: "Late" },
      ],
    });
  }
});

Deno.test("Loans unavailable context fails before table reads, database errors remain errors", async () => {
  for (const error of [null, { message: "LOAN_PRODUCT_NOT_FOUND" }, { message: "PLAYER_NOT_FOUND" }]) {
    const client = {
      rpc: () => Promise.resolve({ data: null, error }),
      from: () => { throw new Error("tables must not be read"); },
    } as unknown as EdgeSupabaseClient;
    let failure: unknown;
    try { await new SupabasePlayerBusinessBankingRepository(client).readLoans({ gameSessionId: "game", playerId: "player" }); }
    catch (caught) { failure = caught; }
    assertEquals((failure as { code: string }).code, error ? error.message.toLowerCase() : "player_economic_context_missing");
  }
});

Deno.test("Loan application passes account intent and server identity to one atomic command", async () => {
  const calls: unknown[] = [];
  const response = await handlePlayerBusinessBankingRequest(
    new Request("https://example.test/players/me/banking/loans/applications/fixture", {
      method: "POST", body: JSON.stringify({ businessKey: key("biz", "a"), amount: 12.345,
        purpose: "Equipment", repaymentSource: `business:${key("biz", "a")}`, idempotencyKey: "apply-fixture-01" }),
    }),
    { kind: "loanApply", offerKey: key("lop", "b") },
    {
      readEnvironment: () => ({ ok: true, value: { supabaseUrl: "https://example.test", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture" } }),
      createServiceClient: () => ({} as EdgeSupabaseClient),
      resolveScope: () => Promise.resolve({ gameId: "server-game", playerUuid: "server-player" }),
      createRepository: () => ({
        readLoans: () => { throw new Error("must not read loans during application"); },
        readEconomicContext: () => Promise.resolve({ countryCode: "NRC", currencyCode: "NRC" }),
        execute: (command, args) => { calls.push([command, args]); return Promise.resolve({ application_key: key("lna", "c"), status: "pending_review" }); },
      }),
    },
  );
  assertEquals(response.status, 200);
  assertEquals(calls, [["apply_player_loan_v1", {
    p_game_session_id: "server-game", p_player_id: "server-player", p_offer_key: key("lop", "b"),
    p_business_key: key("biz", "a"), p_amount: 12.35, p_purpose: "Equipment",
    p_repayment_source: `business:${key("biz", "a")}`, p_idempotency_key: "apply-fixture-01",
  }]]);
  assertEquals(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assertEquals(await response.json(), { ok: true, result: { application_key: key("lna", "c"), status: "pending_review" }, refreshRequired: true });
});

Deno.test("Loans table read failure cannot become an empty currency projection", async () => {
  const client = {
    rpc: () => Promise.resolve({ data: { country_code: "NRC", currency_code: "NRC" }, error: null }),
    from(table: string) {
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: [], error: table === "player_loans" ? { message: "database unavailable" } : null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as EdgeSupabaseClient;
  let failure: unknown;
  try { await new SupabasePlayerBusinessBankingRepository(client).readLoans({ gameSessionId: "game", playerId: "player" }); }
  catch (caught) { failure = caught; }
  assertEquals((failure as { code: string }).code, "database");
});

import { projectLoanCurrencies } from "../domain/loanCurrencyProjection.ts";

Deno.test("Loan currency totals use exact text beyond safe integers and combine only matching due dates", () => {
  const due = "2026-10-05T00:00:00.000Z";
  const loans = Array.from({ length: 100 }, () => ({ currency_code: "NRC",
    principal_balance_exact: "999999999999.99", accrued_interest_exact: "0.00",
    scheduled_payment_exact: "0.01", next_due_at: due }));
  const schedule = loans.map(() => ({ currencyCode: "NRC", due, exactAmount: "0.01" }));
  const result = projectLoanCurrencies([], loans, schedule);
  assertEquals(result.complete, true);
  assertEquals(result.groups[0], { currencyCode: "NRC", availableCredit: "0.00",
    outstanding: "99999999999999.00", nextPayment: { amount: "1.00", due },
    schedule: [{ due, amount: "1.00" }] });
  const later = "2026-10-06T00:00:00.000Z";
  const ordered = projectLoanCurrencies([], [
    { ...loans[0], next_due_at: later, scheduled_payment_exact: "9.00" },
    { ...loans[0], scheduled_payment_exact: "2.00" },
    { ...loans[0], scheduled_payment_exact: "3.00" },
  ], [{ currencyCode: "NRC", due: later, exactAmount: "9.00" },
    { currencyCode: "NRC", due, exactAmount: "2.00" }, { currencyCode: "NRC", due, exactAmount: "3.00" }]);
  assertEquals(ordered.groups[0].nextPayment, { amount: "5.00", due });
  assertEquals(ordered.groups[0].schedule, [{ due, amount: "5.00" }, { due: later, amount: "9.00" }]);
});

Deno.test("Loan exact projection distinguishes empty and zero from unavailable input without numeric coercion", () => {
  assertEquals(projectLoanCurrencies([], [], []), { version: 1, complete: true, unknownCurrencyRows: 0, groups: [] });
  const zero = projectLoanCurrencies([{ currency_code: "NRC", maximum_amount_exact: "0.00" }], [], []);
  assertEquals(zero.groups[0], { currencyCode: "NRC", availableCredit: "0.00", outstanding: "0.00", nextPayment: null, schedule: [] });
  for (const invalid of [null, undefined, 0.01, "0", "0.001", "0.000000000000000001", "-1.00"]) {
    const due = "2026-10-05T00:00:00.000Z";
    const loan = { currency_code: "NRC", principal_balance_exact: invalid, accrued_interest_exact: "0.00",
      scheduled_payment_exact: invalid, next_due_at: due, principal_balance: 42, scheduled_payment: 7 };
    for (const amounts of [[invalid, "1.00"], ["1.00", invalid]]) {
      const result = projectLoanCurrencies([{ currency_code: "NRC", maximum_amount_exact: invalid }], [loan],
        amounts.map((exactAmount) => ({ currencyCode: "NRC", due, exactAmount })));
      assertEquals(result.complete, false);
      assertEquals(result.groups[0], { currencyCode: "NRC", availableCredit: null, outstanding: null,
        nextPayment: { amount: null, due }, schedule: [{ due, amount: null }] });
    }
  }
  const badDate = projectLoanCurrencies([], [{ currency_code: "NRC", principal_balance_exact: "0.00",
    accrued_interest_exact: "0.00", scheduled_payment_exact: "1.00", next_due_at: "invalid" }], []);
  assertEquals(badDate.complete, false);
  assertEquals(badDate.groups[0].nextPayment, { amount: null, due: null });
});
