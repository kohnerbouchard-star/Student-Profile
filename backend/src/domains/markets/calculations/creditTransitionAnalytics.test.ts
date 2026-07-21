import {
  analyzeCreditExposure,
  analyzeCreditPortfolio,
  CREDIT_RATINGS,
  selectDeterministicTransition,
  type CreditRating,
  type CreditTransitionMatrix,
  validateCreditTransitionMatrix,
} from "./creditTransitionAnalytics.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "credit transition matrix validates and derives exposure metrics",
  () => {
    const analysis = analyzeCreditExposure({
      instrumentPublicId: "instrument.northreach.corporate_bond.0001.v1",
      currentRating: "BBB",
      exposureAtDefault: "1000",
      recoveryRate: 0.4,
    }, matrix());
    assertEquals(analysis.defaultProbability, 0.02);
    assertEquals(analysis.downgradeProbability, 0.12);
    assertEquals(analysis.upgradeProbability, 0.08);
    assertEquals(analysis.unchangedProbability, 0.8);
    assertEquals(analysis.expectedLoss, "12");
    assertEquals(analysis.expectedRatingIndex, 3.17);
  },
);

Deno.test("portfolio analysis is deterministic and order invariant", () => {
  const exposures = [
    {
      instrumentPublicId: "instrument.northreach.corporate_bond.0001.v1",
      currentRating: "BBB" as const,
      exposureAtDefault: "1000",
      recoveryRate: 0.4,
    },
    {
      instrumentPublicId: "instrument.yrethia.corporate_bond.0002.v1",
      currentRating: "BB" as const,
      exposureAtDefault: "500",
      recoveryRate: 0.3,
    },
  ];
  const forward = analyzeCreditPortfolio(exposures, matrix());
  const reverse = analyzeCreditPortfolio([...exposures].reverse(), matrix());
  assertEquals(forward, reverse);
  assertEquals(forward.totalExpectedLoss, "29.5");
  assertEquals(forward.weightedDefaultProbability, 0.03);
});

Deno.test(
  "deterministic transition selection respects cumulative probabilities",
  () => {
    assertEquals(selectDeterministicTransition("BBB", 0.01, matrix()), "A");
    assertEquals(selectDeterministicTransition("BBB", 0.5, matrix()), "BBB");
    assertEquals(selectDeterministicTransition("BBB", 0.99, matrix()), "D");
  },
);

Deno.test("invalid row sums and non-absorbing default fail closed", () => {
  const invalidSum = matrix();
  const rows = {
    ...invalidSum.rows,
    BBB: { ...invalidSum.rows.BBB, D: 0.03 },
  };
  assertThrows(
    () =>
      validateCreditTransitionMatrix({
        ...invalidSum,
        rows,
      }),
    "credit_matrix_row_sum_invalid:BBB",
  );

  const invalidDefault = matrix();
  const defaultRows = {
    ...invalidDefault.rows,
    D: { ...invalidDefault.rows.D, C: 0.1, D: 0.9 },
  };
  assertThrows(
    () =>
      validateCreditTransitionMatrix({
        ...invalidDefault,
        rows: defaultRows,
      }),
    "credit_matrix_default_state_must_be_absorbing",
  );
});

Deno.test(
  "activation attempts, duplicate exposures, and invalid draws are rejected",
  () => {
    assertThrows(
      () =>
        validateCreditTransitionMatrix({
          ...matrix(),
          activationAuthorized: true as false,
        }),
      "credit_matrix_activation_must_remain_disabled",
    );
    const exposure = {
      instrumentPublicId: "instrument.northreach.corporate_bond.0001.v1",
      currentRating: "BBB" as const,
      exposureAtDefault: "1000",
      recoveryRate: 0.4,
    };
    assertThrows(
      () => analyzeCreditPortfolio([exposure, exposure], matrix()),
      "duplicate_credit_exposure",
    );
    assertThrows(
      () => selectDeterministicTransition("BBB", 1, matrix()),
      "credit_transition_draw_invalid",
    );
  },
);

function matrix(): CreditTransitionMatrix {
  const rows = Object.fromEntries(
    CREDIT_RATINGS.map((rating) => [rating, absorbingRow(rating)]),
  ) as Record<CreditRating, Record<CreditRating, number>>;
  rows.BBB = {
    AAA: 0,
    AA: 0,
    A: 0.08,
    BBB: 0.8,
    BB: 0.07,
    B: 0.03,
    CCC: 0,
    CC: 0,
    C: 0,
    D: 0.02,
  };
  rows.BB = {
    AAA: 0,
    AA: 0,
    A: 0,
    BBB: 0.1,
    BB: 0.72,
    B: 0.1,
    CCC: 0.03,
    CC: 0,
    C: 0,
    D: 0.05,
  };
  return {
    matrixPublicId: "credit-matrix.synthetic.v1",
    version: 1,
    rows,
    activationAuthorized: false,
  };
}

function absorbingRow(rating: CreditRating): Record<CreditRating, number> {
  return Object.fromEntries(
    CREDIT_RATINGS.map((target) => [target, target === rating ? 1 : 0]),
  ) as Record<CreditRating, number>;
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
