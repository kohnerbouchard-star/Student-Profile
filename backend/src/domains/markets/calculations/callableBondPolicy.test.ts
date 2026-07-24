import type { FinancialMarketBondDefinition } from "../contracts/financialMarketContracts.ts";
import {
  calculateCallableBondYieldToWorst,
  evaluateCallableBondExercise,
  type CallableBondScheduleEntry,
} from "./callableBondPolicy.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("call policy recommends exercise when refinancing savings exceed all costs", () => {
  const decision = evaluateCallableBondExercise({
    bond: callableBond(),
    callSchedulePublicId: "call.schedule.northreach.0001.v1",
    entries: callEntries(),
    evaluationDate: "2027-12-01",
    refinancingYield: 0.03,
    refinancingCostPerFaceUnit: "5",
    faceQuantity: "10",
  });

  assertEquals(decision.eligible, true);
  assertEquals(decision.exerciseRecommended, true);
  assertEquals(decision.reason, "exercise_recommended");
  assertEquals(decision.couponSavingsBasisPoints, 300);
  assert(Number(decision.netEconomicBenefit) > 0);
  assertEquals(decision.optionalPricingSupported, false);
  assertEquals(decision.activationAuthorized, false);
  assertEquals(decision.deterministic, true);
});

Deno.test("call policy rejects exercise below the explicit savings threshold", () => {
  const decision = evaluateCallableBondExercise({
    bond: callableBond(),
    callSchedulePublicId: "call.schedule.northreach.0001.v1",
    entries: callEntries(),
    evaluationDate: "2027-12-01",
    refinancingYield: 0.055,
    refinancingCostPerFaceUnit: "5",
    faceQuantity: "10",
  });

  assertEquals(decision.eligible, true);
  assertEquals(decision.exerciseRecommended, false);
  assertEquals(decision.reason, "refinancing_savings_below_threshold");
  assertEquals(decision.couponSavingsBasisPoints, 50);
});

Deno.test("yield to worst returns the lowest deterministic call or maturity candidate", () => {
  const result = calculateCallableBondYieldToWorst({
    bond: callableBond(),
    entries: callEntries(),
    settlementDate: "2027-01-01",
    cleanPricePerFaceUnit: "1080",
  });

  assertEquals(result.candidates.length, 3);
  assertEquals(
    result.yieldToWorst,
    Math.min(...result.candidates.map((candidate) => candidate.annualYield)),
  );
  assert(result.candidates.some((candidate) => candidate.candidateKind === "call"));
  assert(result.candidates.some((candidate) => candidate.candidateKind === "maturity"));
  assertEquals(result.optionalPricingSupported, false);
  assertEquals(result.activationAuthorized, false);
});

Deno.test("call schedule validation rejects duplicate dates and dates outside the bond term", () => {
  assertThrows(
    () =>
      calculateCallableBondYieldToWorst({
        bond: callableBond(),
        entries: [
          ...callEntries(),
          {
            ...callEntries()[1],
            callEntryPublicId: "call.entry.northreach.duplicate.v1",
            exerciseDate: callEntries()[0].exerciseDate,
          },
        ],
        settlementDate: "2027-01-01",
        cleanPricePerFaceUnit: "1000",
      }),
    "duplicate_call_exercise_date",
  );
  assertThrows(
    () =>
      calculateCallableBondYieldToWorst({
        bond: callableBond(),
        entries: [{
          ...callEntries()[0],
          exerciseDate: "2031-01-01",
        }],
        settlementDate: "2027-01-01",
        cleanPricePerFaceUnit: "1000",
      }),
    "call_entry_date_outside_bond_term",
  );
});

Deno.test("call policy rejects schedule identity mismatch", () => {
  assertThrows(
    () =>
      evaluateCallableBondExercise({
        bond: callableBond(),
        callSchedulePublicId: "call.schedule.wrong.v1",
        entries: callEntries(),
        evaluationDate: "2027-12-01",
        refinancingYield: 0.03,
        refinancingCostPerFaceUnit: "5",
        faceQuantity: "10",
      }),
    "call_schedule_identity_mismatch",
  );
});

function callableBond(): FinancialMarketBondDefinition {
  return {
    bondPublicId: "bond.northreach.corporate.callable.0001.v1",
    instrumentPublicId: "instrument.northreach.corporate_bond.0101.v1",
    issuerPublicId: "issuer.northreach.corporation.0101.v1",
    bondKind: "corporate",
    issueDate: "2026-01-01",
    settlementDate: "2026-01-03",
    maturityDate: "2031-01-01",
    faceValue: "1000",
    denominationCurrencyCode: "NRC",
    couponType: "fixed",
    couponRateAnnual: 0.06,
    couponFrequency: "annual",
    dayCountConvention: "actual_365",
    businessDayConvention: "following",
    creditRating: "A",
    callable: true,
    callSchedulePublicId: "call.schedule.northreach.0001.v1",
    recoveryPolicyPublicId: "recovery.standard.corporate.v1",
    status: "approved_inactive",
    sourceVersion: "market-universe.1.0.0-draft",
    sourceChecksumSha256: "d".repeat(64),
  };
}

function callEntries(): CallableBondScheduleEntry[] {
  return [
    {
      callEntryPublicId: "call.entry.northreach.0001.v1",
      exerciseDate: "2028-01-01",
      callPricePerFaceUnit: "1020",
      minimumRefinancingSavingsBasisPoints: 100,
      noticeDays: 45,
    },
    {
      callEntryPublicId: "call.entry.northreach.0002.v1",
      exerciseDate: "2029-01-01",
      callPricePerFaceUnit: "1010",
      minimumRefinancingSavingsBasisPoints: 75,
      noticeDays: 45,
    },
  ];
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertThrows(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    throw error;
  }
  throw new Error(`Expected error containing ${expectedMessage}.`);
}
