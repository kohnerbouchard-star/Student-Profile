import {
  DEFAULT_FINANCIAL_STATEMENT_POLICY,
  generateFinancialMarketStatement,
  validateFinancialMarketStatement,
} from "./financialStatements.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const DIGEST = "a".repeat(64);

Deno.test("issuer statements are deterministic and internally reconciled", () => {
  const input = baseInput();
  const first = generateFinancialMarketStatement(input);
  const second = generateFinancialMarketStatement(input);

  assertEquals(first, second);
  const validation = validateFinancialMarketStatement(first);
  assertEquals(validation.valid, true);
  assert(Object.values(validation.checks).every(Boolean));
});

Deno.test("issuer statement periods preserve retained earnings, debt, and share count", () => {
  const first = generateFinancialMarketStatement(baseInput());
  const second = generateFinancialMarketStatement({
    ...baseInput(),
    statementPublicId: "statement.issuer-a.2026-q2.v1",
    periodStart: "2026-04-01",
    periodEnd: "2026-06-30",
    generatedAt: "2026-07-01T00:00:00.000Z",
    deterministicSeed: "issuer-a-q2",
    priorStatement: first,
  });

  const validation = validateFinancialMarketStatement(second, first);
  assertEquals(validation.valid, true);
  assertEquals(second.sharesOutstanding, first.sharesOutstanding);
  assertEquals(validation.checks.retainedEarningsReconciles, true);
  assertEquals(validation.checks.debtChangeReconciles, true);
  assertEquals(validation.checks.cashFlowReconciles, true);
});

Deno.test("statement validation detects tampered accounting history", () => {
  const statement = generateFinancialMarketStatement(baseInput());
  const tampered = {
    ...statement,
    balanceSheet: {
      ...statement.balanceSheet,
      cash: "999999999",
    },
  };
  const validation = validateFinancialMarketStatement(tampered);
  assertEquals(validation.valid, false);
  assertEquals(validation.checks.balanceSheetBalances, false);
  assertEquals(validation.checks.cashFlowReconciles, false);
});

function baseInput() {
  return {
    statementPublicId: "statement.issuer-a.2026-q1.v1",
    gamePublicId: "game.synthetic-a.v1",
    issuerPublicId: "issuer.northreach.corporate.0001.v1",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    reportingCurrencyCode: "NRC",
    generatorVersion: "financial-statement-generator.v1",
    inputDigestSha256: DIGEST,
    generatedAt: "2026-04-01T00:00:00.000Z",
    deterministicSeed: "issuer-a-q1",
    policy: DEFAULT_FINANCIAL_STATEMENT_POLICY,
  } as const;
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}

Deno.test("statement policy remains frozen and repeat calls retain deterministic complete output", async () => {
  assert(Object.isFrozen(DEFAULT_FINANCIAL_STATEMENT_POLICY));
  const first = generateFinancialMarketStatement(baseInput());
  const second = generateFinancialMarketStatement({
    ...baseInput(),
    priorStatement: first,
  });
  const bytes = new TextEncoder().encode(JSON.stringify([first, second]));
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  assertEquals(
    digest,
    "875416a1641bc482c8bd2d5bb400418a9abe53570ed0a4a07fd95fb067ec4e6c",
  );
});

const inputFailures = [
  [
    { statementPublicId: "", periodStart: "bad" },
    "Statement, game, and issuer public IDs are required.",
  ],
  [
    { periodStart: "bad", reportingCurrencyCode: "usd" },
    "Statement period dates are invalid.",
  ],
  [{ periodEnd: "2025-12-31" }, "Statement period dates are invalid."],
  [
    { reportingCurrencyCode: "usd", inputDigestSha256: "bad" },
    "Reporting currency code is invalid.",
  ],
  [
    { inputDigestSha256: "A".repeat(64) },
    "Statement input digest must be SHA-256.",
  ],
] as const;
for (const [change, message] of inputFailures) {
  Deno.test(`statement input validation precedence: ${message} ${JSON.stringify(change)}`, () => {
    assertThrowsMessage(
      () => generateFinancialMarketStatement({ ...baseInput(), ...change }),
      message,
    );
  });
}

const bounds = [
  ["minimumRevenueGrowth", "maximumRevenueGrowth", "revenue growth"],
  ["minimumGrossMargin", "maximumGrossMargin", "gross margin"],
  [
    "minimumOperatingExpenseRatio",
    "maximumOperatingExpenseRatio",
    "operating expense ratio",
  ],
  ["minimumDebtToRevenue", "maximumDebtToRevenue", "debt ratio"],
  ["minimumTaxRate", "maximumTaxRate", "tax rate"],
  ["minimumInterestRate", "maximumInterestRate", "interest rate"],
  ["minimumDistributionRate", "maximumDistributionRate", "distribution rate"],
] as const;
for (const [minimum, maximum, label] of bounds) {
  for (
    const change of [{ [minimum]: NaN }, { [maximum]: Infinity }, {
      [minimum]: 2,
      [maximum]: 1,
    }]
  ) {
    Deno.test(`statement policy rejects ${label}: ${Object.keys(change).join(",")}`, () => {
      assertThrowsMessage(() =>
        generateFinancialMarketStatement({
          ...baseInput(),
          policy: { ...DEFAULT_FINANCIAL_STATEMENT_POLICY, ...change },
        }), `Invalid ${label} bounds.`);
    });
  }
}
for (const [minimum, maximum] of [bounds[1], bounds[2], bounds[4], bounds[6]]) {
  for (const change of [{ [minimum]: -0.01 }, { [maximum]: 1.01 }]) {
    Deno.test(`statement rejects out-of-range ratios: ${JSON.stringify(change)}`, () => {
      assertThrowsMessage(() =>
        generateFinancialMarketStatement({
          ...baseInput(),
          policy: { ...DEFAULT_FINANCIAL_STATEMENT_POLICY, ...change },
        }), "Statement ratio bounds must remain within approved ranges.");
    });
  }
}
for (
  const change of [{ baseRevenue: "0" }, { minimumSharesOutstanding: "0" }, {
    maximumSharesOutstanding: "99999",
  }]
) {
  Deno.test(`statement rejects invalid base amounts: ${JSON.stringify(change)}`, () => {
    assertThrowsMessage(() =>
      generateFinancialMarketStatement({
        ...baseInput(),
        policy: { ...DEFAULT_FINANCIAL_STATEMENT_POLICY, ...change },
      }), "Statement base amounts are invalid.");
  });
}

Deno.test("statement validation preserves complete error and check order", () => {
  const statement = mutableStatement();
  statement.incomeStatement.operatingIncome = "-1";
  statement.incomeStatement.netIncome = "-2";
  statement.balanceSheet.cash = "-3";
  statement.generationMetadata.totalDebtChange = "-4";
  statement.sharesOutstanding = "-5";
  assertEquals(validateFinancialMarketStatement(statement), {
    valid: false,
    errors: [
      "operating_income_mismatch",
      "net_income_mismatch",
      "balance_sheet_mismatch",
      "cash_flow_mismatch",
      "retained_earnings_mismatch",
      "debt_change_mismatch",
      "shares_outstanding_not_positive",
      "negative_required_amount",
    ],
    checks: {
      operatingIncomeReconciles: false,
      netIncomeReconciles: false,
      balanceSheetBalances: false,
      cashFlowReconciles: false,
      retainedEarningsReconciles: false,
      debtChangeReconciles: false,
      sharesOutstandingPositive: false,
      allRequiredAmountsNonNegative: false,
    },
  });
});

Deno.test("statement reconciliation uses six-place rounding rather than string equality", () => {
  const statement = mutableStatement();
  // Use a decimal-equivalent spelling, including insignificant sub-scale precision.
  const original = generateFinancialMarketStatement(baseInput());
  statement.incomeStatement.operatingIncome = `${
    Number(original.incomeStatement.operatingIncome).toFixed(6)
  }4`;
  assertEquals(validateFinancialMarketStatement(statement).valid, true);
  statement.incomeStatement.operatingIncome = `${
    Number(original.incomeStatement.operatingIncome).toFixed(6)
  }5`;
  assertEquals(validateFinancialMarketStatement(statement).errors, [
    "operating_income_mismatch",
    "net_income_mismatch",
  ]);
});

Deno.test("statement date validation retains shape-only calendar semantics", () => {
  const statement = generateFinancialMarketStatement({
    ...baseInput(),
    periodStart: "2026-02-30",
    periodEnd: "2026-02-31",
  });
  assertEquals(statement.periodStart, "2026-02-30");
  assertEquals(validateFinancialMarketStatement(statement).valid, true);
});

Deno.test("statement generation retains losses without tax or distributions", () => {
  const statement = generateFinancialMarketStatement({
    ...baseInput(),
    policy: {
      ...DEFAULT_FINANCIAL_STATEMENT_POLICY,
      minimumGrossMargin: 0,
      maximumGrossMargin: 0,
      minimumOperatingExpenseRatio: 0.1,
      maximumOperatingExpenseRatio: 0.1,
    },
  });
  assertEquals(statement.incomeStatement.taxExpense, "0");
  assertEquals(statement.generationMetadata.distributionAmount, "0");
  assert(statement.incomeStatement.netIncome.startsWith("-"));
  assertEquals(validateFinancialMarketStatement(statement).valid, true);
});

Deno.test("statement validation preserves malformed-decimal exception precedence", () => {
  const statement = mutableStatement();
  statement.incomeStatement.revenue = "bad-revenue";
  statement.sharesOutstanding = "bad-shares";
  assertThrowsMessage(
    () => validateFinancialMarketStatement(statement),
    "Invalid market decimal: bad-revenue",
  );
});

function assertThrowsMessage(run: () => unknown, message: string): void {
  try {
    run();
  } catch (error) {
    assertEquals((error as Error).message, message);
    return;
  }
  throw new Error(`Expected error: ${message}`);
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
function mutableStatement(): Mutable<
  ReturnType<typeof generateFinancialMarketStatement>
> {
  return structuredClone(generateFinancialMarketStatement(baseInput()));
}

const nonNegativeFields = {
  incomeStatement: [
    "revenue",
    "costOfRevenue",
    "operatingExpenses",
    "interestExpense",
    "taxExpense",
  ],
  balanceSheet: [
    "cash",
    "receivables",
    "inventory",
    "propertyPlantEquipment",
    "otherAssets",
    "shortTermDebt",
    "longTermDebt",
    "payables",
    "otherLiabilities",
    "contributedCapital",
  ],
  cashFlowStatement: ["capitalExpenditure"],
} as const;
for (const [section, fields] of Object.entries(nonNegativeFields)) {
  for (const field of fields) {
    Deno.test(`statement required nonnegative amount: ${section}.${field}`, () => {
      const original = generateFinancialMarketStatement(baseInput());
      const statement = {
        ...original,
        [section]: {
          ...original[section as keyof typeof nonNegativeFields],
          [field]: "-0.000001",
        },
      };
      assertEquals(
        validateFinancialMarketStatement(statement).checks
          .allRequiredAmountsNonNegative,
        false,
      );
    });
  }
}

Deno.test("statement generation rejects unreconciled generated negative assets", () => {
  assertThrowsMessage(
    () =>
      generateFinancialMarketStatement({
        ...baseInput(),
        policy: {
          ...DEFAULT_FINANCIAL_STATEMENT_POLICY,
          minimumDebtToRevenue: -100,
          maximumDebtToRevenue: -100,
        },
      }),
    "Generated statement failed reconciliation: negative_required_amount",
  );
});
