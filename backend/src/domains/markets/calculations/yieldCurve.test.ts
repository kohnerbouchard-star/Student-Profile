import type {
  FinancialMarketYieldCurveVersion,
} from "../contracts/financialMarketContracts.ts";
import {
  calculateIssuerYield,
  interpolateYieldCurve,
  validateYieldCurve,
} from "./yieldCurve.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("yield curve resolves exact and interpolated tenors deterministically", () => {
  const curve = baseCurve();
  assertEquals(interpolateYieldCurve(curve, 365), {
    riskFreeRate: 0.04,
    interpolationKind: "exact",
  });
  assertEquals(interpolateYieldCurve(curve, 730), {
    riskFreeRate: 0.045,
    interpolationKind: "interpolated",
  });
});

Deno.test("yield curve extrapolation is bounded", () => {
  const curve = baseCurve();
  const short = interpolateYieldCurve(curve, 30);
  const long = interpolateYieldCurve(curve, 5_000);
  assertEquals(short.interpolationKind, "extrapolated_short");
  assertEquals(long.interpolationKind, "extrapolated_long");
  assert(short.riskFreeRate >= 0 && short.riskFreeRate <= 0.6);
  assert(long.riskFreeRate >= 0 && long.riskFreeRate <= 0.6);
});

Deno.test("issuer yield adds bounded credit, liquidity, and event adjustments", () => {
  const result = calculateIssuerYield({
    curve: baseCurve(),
    tenorDays: 730,
    issuerCreditSpread: 0.025,
    issueLiquiditySpread: 0.006,
    issueEventAdjustment: 0.004,
  });
  assertEquals(result.riskFreeRate, 0.045);
  assertEquals(result.yieldRate, 0.08);
  assertEquals(result.curveVersion, 1);
});

Deno.test("negative rates and malformed tenors fail closed", () => {
  const invalid = {
    ...baseCurve(),
    points: [
      { tenorDays: 30, continuouslyCompoundedZeroRate: -0.01 },
      { tenorDays: 365, continuouslyCompoundedZeroRate: 0.02 },
    ],
  };
  assertEquals(validateYieldCurve(invalid).length, 1);
  assertThrows(() => interpolateYieldCurve(baseCurve(), 0));
  assertThrows(() => interpolateYieldCurve(baseCurve(), 20_000));
});

function baseCurve(): FinancialMarketYieldCurveVersion {
  return {
    curvePublicId: "curve.northreach.nrc.2026-q1.v1",
    gamePublicId: "game.synthetic-a.v1",
    countryCode: "NORTHREACH",
    currencyCode: "NRC",
    observedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    riskFreeBaseline: 0.03,
    liquidityAdjustment: 0,
    eventAdjustment: 0,
    points: [
      { tenorDays: 90, continuouslyCompoundedZeroRate: 0.03 },
      { tenorDays: 365, continuouslyCompoundedZeroRate: 0.04 },
      { tenorDays: 1_095, continuouslyCompoundedZeroRate: 0.05 },
      { tenorDays: 3_650, continuouslyCompoundedZeroRate: 0.06 },
    ],
    inputDigestSha256: "b".repeat(64),
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

function assertThrows(run: () => unknown): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected function to throw.");
}
