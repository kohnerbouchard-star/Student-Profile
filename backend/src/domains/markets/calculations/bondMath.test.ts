import type {
  FinancialMarketBondDefinition,
} from "../contracts/financialMarketContracts.ts";
import {
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

Deno.test("zero coupon bonds reject coupon rates and value only principal", () => {
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
  assert(value.remainingCashFlows.every((flow) => flow.kind === "maturity"));
});

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
