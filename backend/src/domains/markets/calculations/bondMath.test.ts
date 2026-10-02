import type {
  FinancialMarketBondDefinition,
} from "../contracts/financialMarketContracts.ts";
import {
  buildBondCashFlowIdempotencyKey,
  calculateDayCountFraction,
  calculateBondAccruedInterest,
  calculateBondHoldingCashFlow,
  calculateBondRecoveryValue,
  generateBondCouponSchedule,
  valueBond,
} from "./bondMath.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("bond schedule generates deterministic coupon and maturity rows", () => {
  const schedule = generateBondCouponSchedule(baseBond());
  assertEquals(schedule.length, 4);
  assertEquals(schedule[0].paymentDate, "2026-07-01");
  assertEquals(schedule[3].paymentDate, "2028-01-01");
  assertEquals(schedule[3].principalAmountPerFaceUnit, "1000");
  assert(Number(schedule[0].couponAmountPerFaceUnit) > 0);
});

Deno.test("purchase before and after coupon calculates period-specific accrued interest", () => {
  const beforeCoupon = calculateBondAccruedInterest(
    baseBond(),
    "2026-04-01",
    "2",
  );
  const onCoupon = calculateBondAccruedInterest(
    baseBond(),
    "2026-07-01",
    "2",
  );
  const afterCoupon = calculateBondAccruedInterest(
    baseBond(),
    "2026-07-02",
    "2",
  );

  assert(Number(beforeCoupon) > 0);
  assertEquals(onCoupon, "0");
  assert(Number(afterCoupon) > 0);
  assert(Number(afterCoupon) < Number(beforeCoupon));
});

Deno.test("bond valuation reports clean price, dirty price, and remaining flows", () => {
  const result = valueBond({
    bond: baseBond(),
    settlementDate: "2026-04-01",
    annualYield: 0.055,
    faceQuantity: "2",
  });
  assertEquals(result.defaulted, false);
  assert(Number(result.dirtyPrice) > Number(result.cleanPrice));
  assert(Number(result.accruedInterest) > 0);
  assertEquals(result.remainingCashFlows.length, 4);
});

Deno.test("coupon and maturity entitlements have stable exactly-once identities", () => {
  const bond = baseBond();
  const maturity = generateBondCouponSchedule(bond).at(-1);
  if (!maturity) throw new Error("Missing maturity schedule entry.");
  const first = calculateBondHoldingCashFlow({
    gamePublicId: "game.synthetic-a.v1",
    playerPublicId: "player.synthetic-a.v1",
    bond,
    faceQuantity: "3",
    scheduleEntry: maturity,
    releaseVersion: "release.market-a.v1",
  });
  const second = calculateBondHoldingCashFlow({
    gamePublicId: "game.synthetic-a.v1",
    playerPublicId: "player.synthetic-a.v1",
    bond,
    faceQuantity: "3",
    scheduleEntry: maturity,
    releaseVersion: "release.market-a.v1",
  });
  assertEquals(first, second);
  assertEquals(first.length, 2);
  assertEquals(new Set(first.map((entry) => entry.idempotencyKey)).size, 2);
  assertEquals(first.some((entry) => entry.kind === "coupon"), true);
  assertEquals(first.some((entry) => entry.kind === "maturity"), true);
});

Deno.test("default suppresses future coupons and applies bounded recovery", () => {
  const result = valueBond({
    bond: baseBond(),
    settlementDate: "2027-02-01",
    annualYield: 0.08,
    faceQuantity: "4",
    defaultState: {
      defaultedAt: "2027-01-15",
      recoveryRate: 0.35,
      recoveredAt: null,
    },
  });
  assertEquals(result.defaulted, true);
  assertEquals(result.recoveryValue, "1400");
  assertEquals(result.cleanPrice, "1400");
  assertEquals(result.remainingCashFlows.length, 1);
  assertEquals(result.remainingCashFlows[0].kind, "recovery");
  assertEquals(calculateBondRecoveryValue("1000", "4", 0.35), "1400");
});

Deno.test("zero coupon bonds retain audit periods but value only principal", () => {
  const zero = {
    ...baseBond(),
    bondPublicId: "bond.northreach.sovereign.0002.v1",
    instrumentPublicId: "instrument.northreach.sovereign_bond.0002.v1",
    bondKind: "sovereign" as const,
    couponType: "zero_coupon" as const,
    couponRateAnnual: 0,
  };
  const schedule = generateBondCouponSchedule(zero);
  assert(schedule.every((entry) => entry.couponAmountPerFaceUnit === "0"));
  const value = valueBond({
    bond: zero,
    settlementDate: "2026-03-01",
    annualYield: 0.04,
    faceQuantity: "1",
  });
  assertEquals(value.accruedInterest, "0");
  const positiveFlows = value.remainingCashFlows.filter((flow) =>
    Number(flow.amount) > 0
  );
  assertEquals(positiveFlows.length, 1);
  assertEquals(positiveFlows[0].kind, "maturity");
  assertEquals(positiveFlows[0].amount, "1000");
});

Deno.test("retained bond rates reject nonfinite and out-of-range values with existing errors", () => {
  for (const rate of [NaN, Infinity, -Infinity, -0.000001, 1.000001]) {
    assertError(() => valueBond(valuation({ annualYield: rate })), "Bond annual yield must be within 0 and 1.");
    assertError(() => generateBondCouponSchedule({ ...baseBond(), couponRateAnnual: rate }), "Bond coupon rate must be within 0 and 1.");
    assertError(() => calculateBondRecoveryValue("1000", "1", rate), "Bond recovery rate must be within 0 and 1.");
  }
  for (const rate of [0, 1]) {
    assertEquals(valueBond(valuation({ annualYield: rate })).annualYield, rate);
    assertEquals(calculateBondRecoveryValue("1000", "1", rate), String(1000 * rate));
    assert(generateBondCouponSchedule({ ...baseBond(), couponRateAnnual: rate }).length > 0);
  }
});

Deno.test("retained bond amounts reject nonpositive rounded quantities and malformed decimals", () => {
  for (const amount of ["0", "-1", "0.0000004", "-0.0000004"]) {
    assertError(() => valueBond(valuation({ faceQuantity: amount })), "faceQuantity must be positive.");
    assertError(() => generateBondCouponSchedule({ ...baseBond(), faceValue: amount }), "faceValue must be positive.");
  }
  for (const amount of ["", "NaN", "Infinity", "1e3", "01"]) {
    assertError(() => valueBond(valuation({ faceQuantity: amount })), `Invalid market decimal: ${amount}`);
  }
  assertEquals(valueBond(valuation({ faceQuantity: "0.0000005" })).principalValue, "0.001");
  assertEquals(calculateBondRecoveryValue("1.234567", "2", 0.5), "1.234567");
});

Deno.test("retained bond dates reject malformed days and preserve validation precedence", () => {
  for (const [date, message] of [
    ["2026-2-01", "settlementDate must use YYYY-MM-DD."],
    ["2026-02-30", "settlementDate is not a valid date."],
    ["2025-12-31", "Bond settlement cannot precede issue date."],
  ]) assertError(() => valueBond(valuation({ settlementDate: date })), message);
  for (const bond of [
    { ...baseBond(), settlementDate: "2025-12-31" },
    { ...baseBond(), maturityDate: "2026-01-03" },
  ]) assertError(() => generateBondCouponSchedule(bond), "Bond issue, settlement, and maturity dates are invalid.");
  // Bond validation precedes quantity and yield validation; this is parity, not a new policy.
  assertError(() => valueBond(valuation({
    bond: { ...baseBond(), issueDate: "invalid" }, faceQuantity: "0", annualYield: NaN,
  })), "issueDate must use YYYY-MM-DD.");
  assertError(() => calculateDayCountFraction("2026-02-01", "2026-01-01", "actual_365"), "Day-count end date precedes start date.");
});

Deno.test("retained day counts and month-end schedule clamping have explicit references", () => {
  assertEquals(calculateDayCountFraction("2024-02-28", "2024-03-01", "actual_360"), 0.005555555556);
  assertEquals(calculateDayCountFraction("2024-02-28", "2024-03-01", "actual_365"), 0.005479452055);
  assertEquals(calculateDayCountFraction("2026-01-31", "2026-02-28", "thirty_360"), 0.077777777778);
  assertEquals(calculateDayCountFraction("2026-01-01", "2026-01-01", "actual_365"), 0);
  const schedule = generateBondCouponSchedule({
    ...baseBond(), issueDate: "2023-03-01", settlementDate: "2023-03-03", maturityDate: "2024-08-31",
  });
  // Backward month clamping carries February's day into earlier periods; do not normalize it here.
  assertEquals(schedule.map((entry) => entry.paymentDate), ["2023-08-29", "2024-02-29", "2024-08-31"]);
});

Deno.test("retained maturity boundary and continuous zero-coupon discount are characterized separately", () => {
  for (const settlementDate of ["2028-01-01", "2028-01-02"]) {
    const result = valueBond(valuation({ settlementDate }));
    assertEquals([result.cleanPrice, result.dirtyPrice, result.accruedInterest], ["0", "0", "0"]);
    assertEquals(result.remainingCashFlows, []);
    assertEquals(result.principalValue, "1000");
  }
  const result = valueBond(valuation({
    bond: { ...baseBond(), couponType: "zero_coupon", couponRateAnnual: 0 },
    settlementDate: "2027-01-01", annualYield: 0.05,
  }));
  // One-year exp(-0.05) discount uses the retained six-decimal intermediate factor.
  // fixedIncomeAnalytics uses periodic discounting and is not an equivalent oracle.
  assertEquals(result.dirtyPrice, "951.229");
  assertEquals(result.cleanPrice, "951.229");
});

Deno.test("known accrued-interest early-zero quirk bypasses later bond validation", () => {
  const invalid = { ...baseBond(), faceValue: "invalid", couponRateAnnual: NaN };
  for (const date of ["2025-12-31", "2026-01-01", "2028-01-01", "2028-01-02"]) {
    assertEquals(calculateBondAccruedInterest(invalid, date, "1"), "0");
  }
  assertEquals(calculateBondAccruedInterest({ ...invalid, couponType: "zero_coupon" }, "2026-04-01", "1"), "0");
  assertError(() => calculateBondAccruedInterest(invalid, "2026-04-01", "1"), "Invalid market decimal: invalid");
  // Quantity and settlement parsing still run before this early return.
  assertError(() => calculateBondAccruedInterest(invalid, "2026-01-01", "0"), "faceQuantity must be positive.");
  assertError(() => calculateBondAccruedInterest(invalid, "bad-date", "1"), "settlementDate must use YYYY-MM-DD.");
});

Deno.test("retained holding cash-flow guards reject mismatched schedule and blank identity", () => {
  const bond = baseBond();
  const scheduleEntry = generateBondCouponSchedule(bond)[0];
  assertError(() => calculateBondHoldingCashFlow({
    bond, faceQuantity: "1", scheduleEntry: { ...scheduleEntry, bondPublicId: "bond.other.v1" },
    gamePublicId: "game.synthetic-a.v1", playerPublicId: "player.synthetic-a.v1", releaseVersion: "release.market-a.v1",
  }), "Coupon schedule entry does not belong to the bond.");
  for (const missing of ["", " "]) {
    assertError(
      () => buildBondCashFlowIdempotencyKey("game.synthetic-a.v1", "player.synthetic-a.v1", missing, "coupon", "release.market-a.v1"),
      "Bond cash-flow idempotency identity is incomplete.",
    );
  }
});

Deno.test("potential defect: any non-null recoveredAt suppresses flows without date validation", () => {
  const defaultState = { defaultedAt: "2027-01-15", recoveryRate: 0.35, recoveredAt: null };
  const pending = valueBond(valuation({ settlementDate: "2027-02-01", defaultState }));
  assertEquals(pending.remainingCashFlows.length, 1);
  assertEquals(pending.recoveryValue, "350");
  // This records current behavior, NOT approval of malformed/future recovery dates.
  // A separate owner decision/correction is required before treating it as product policy.
  for (const recoveredAt of ["2027-01-20", "2029-01-01", "not-a-date", "2027-02-30", ""]) {
    const result = valueBond(valuation({ settlementDate: "2027-02-01", defaultState: { ...defaultState, recoveredAt } }));
    assertEquals(result.remainingCashFlows, []);
    assertEquals(result.recoveryValue, "350");
    assertEquals(result.cleanPrice, "350");
  }
  assertEquals(valueBond(valuation({ settlementDate: "2027-01-14", defaultState })).defaulted, false);
  assertEquals(valueBond(valuation({ settlementDate: "2027-01-15", defaultState })).defaulted, true);
});

function valuation(overrides: Partial<Parameters<typeof valueBond>[0]> = {}): Parameters<typeof valueBond>[0] {
  return { bond: baseBond(), settlementDate: "2026-04-01", annualYield: 0.05, faceQuantity: "1", ...overrides };
}

function assertError(run: () => unknown, expected: string): void {
  try {
    run();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    assertEquals(error.message, expected);
    return;
  }
  throw new Error(`Expected error: ${expected}`);
}

function baseBond(): FinancialMarketBondDefinition {
  return {
    bondPublicId: "bond.northreach.corporate.0001.v1",
    instrumentPublicId: "instrument.northreach.corporate_bond.0001.v1",
    issuerPublicId: "issuer.northreach.corporate.0001.v1",
    bondKind: "corporate",
    issueDate: "2026-01-01",
    settlementDate: "2026-01-03",
    maturityDate: "2028-01-01",
    faceValue: "1000",
    denominationCurrencyCode: "NRC",
    couponType: "fixed",
    couponRateAnnual: 0.06,
    couponFrequency: "semiannual",
    dayCountConvention: "actual_365",
    businessDayConvention: "following",
    creditRating: "A",
    callable: false,
    callSchedulePublicId: null,
    recoveryPolicyPublicId: "recovery.standard.corporate.v1",
    status: "approved_inactive",
    sourceVersion: "market-universe.1.0.0-draft",
    sourceChecksumSha256: "c".repeat(64),
  };
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
