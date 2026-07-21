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
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
