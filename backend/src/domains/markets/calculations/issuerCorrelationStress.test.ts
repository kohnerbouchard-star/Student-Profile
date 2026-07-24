import {
  calculateIssuerCorrelationStress,
  type IssuerCorrelationStressPosition,
  type IssuerPairCorrelation,
} from "./issuerCorrelationStress.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("issuer stress calculates deterministic correlation and concentration metrics", () => {
  const result = calculateIssuerCorrelationStress(
    basePositions(),
    baseCorrelations(),
  );

  assertEquals(result.totalPortfolioValue, "200");
  assertEquals(result.standaloneLossTotal, "30");
  assertEquals(result.correlatedTailLoss, "26.457513");
  assertEquals(result.correlatedTailLossRate, 0.132288);
  assertEquals(result.diversificationRatio, 1.133893);
  assertEquals(result.topIssuerWeight, 0.5);
  assertEquals(result.issuerHerfindahlIndex, 0.5);
  assertEquals(result.issuerCount, 2);
  assertEquals(result.contributions, [
    {
      issuerPublicId: "issuer.northreach.corporation.0001.v1",
      currentValue: "100",
      standaloneLoss: "10",
      correlatedLossContribution: "7.559289",
      portfolioValueWeight: 0.5,
      correlatedLossWeight: 0.285714,
    },
    {
      issuerPublicId: "issuer.yrethia.government.0001.v1",
      currentValue: "100",
      standaloneLoss: "20",
      correlatedLossContribution: "18.898224",
      portfolioValueWeight: 0.5,
      correlatedLossWeight: 0.714286,
    },
  ]);
  assert(/^[0-9a-f]{8}$/.test(result.correlationMatrixDigest));
  assertEquals(result.activationAuthorized, false);
  assertEquals(result.deterministic, true);
});

Deno.test("issuer stress is invariant to position and correlation input order", () => {
  const forward = calculateIssuerCorrelationStress(
    basePositions(),
    baseCorrelations(),
  );
  const reverse = calculateIssuerCorrelationStress(
    [...basePositions()].reverse(),
    [...baseCorrelations()].reverse(),
  );
  assertEquals(forward, reverse);
});

Deno.test("perfect correlation removes diversification benefit", () => {
  const result = calculateIssuerCorrelationStress(basePositions(), [{
    leftIssuerPublicId: "issuer.northreach.corporation.0001.v1",
    rightIssuerPublicId: "issuer.yrethia.government.0001.v1",
    correlation: 1,
  }]);
  assertEquals(result.correlatedTailLoss, "30");
  assertEquals(result.diversificationRatio, 1);
});

Deno.test("issuer stress rejects duplicate instruments and unknown issuers", () => {
  assertThrows(
    () =>
      calculateIssuerCorrelationStress([
        ...basePositions(),
        basePositions()[0],
      ], baseCorrelations()),
    "duplicate_issuer_stress_instrument",
  );
  assertThrows(
    () =>
      calculateIssuerCorrelationStress(basePositions(), [{
        leftIssuerPublicId: "issuer.northreach.corporation.0001.v1",
        rightIssuerPublicId: "issuer.unknown.corporation.0001.v1",
        correlation: 0.5,
      }]),
    "issuer_correlation_unknown_issuer",
  );
});

Deno.test("issuer stress rejects invalid and non-positive-semidefinite matrices", () => {
  const threePositions: IssuerCorrelationStressPosition[] = [
    ...basePositions(),
    {
      instrumentPublicId: "instrument.thaloris.common_equity.0001.v1",
      issuerPublicId: "issuer.thaloris.corporation.0001.v1",
      countryCode: "THALORIS",
      assetClass: "equity",
      currentValue: "100",
      standaloneLossRate: 0.15,
    },
  ];
  assertThrows(
    () =>
      calculateIssuerCorrelationStress(threePositions, [
        {
          leftIssuerPublicId: "issuer.northreach.corporation.0001.v1",
          rightIssuerPublicId: "issuer.yrethia.government.0001.v1",
          correlation: 0.9,
        },
        {
          leftIssuerPublicId: "issuer.northreach.corporation.0001.v1",
          rightIssuerPublicId: "issuer.thaloris.corporation.0001.v1",
          correlation: 0.9,
        },
        {
          leftIssuerPublicId: "issuer.yrethia.government.0001.v1",
          rightIssuerPublicId: "issuer.thaloris.corporation.0001.v1",
          correlation: -0.9,
        },
      ]),
    "issuer_correlation_matrix_not_positive_semidefinite",
  );
  assertThrows(
    () =>
      calculateIssuerCorrelationStress(basePositions(), [{
        ...baseCorrelations()[0],
        correlation: 1.1,
      }]),
    "issuer_correlation_invalid",
  );
});

function basePositions(): IssuerCorrelationStressPosition[] {
  return [
    {
      instrumentPublicId: "instrument.northreach.common_equity.0001.v1",
      issuerPublicId: "issuer.northreach.corporation.0001.v1",
      countryCode: "NORTHREACH",
      assetClass: "equity",
      currentValue: "100",
      standaloneLossRate: 0.1,
    },
    {
      instrumentPublicId: "instrument.yrethia.sovereign_bond.0001.v1",
      issuerPublicId: "issuer.yrethia.government.0001.v1",
      countryCode: "YRETHIA",
      assetClass: "fixed_income",
      currentValue: "100",
      standaloneLossRate: 0.2,
    },
  ];
}

function baseCorrelations(): IssuerPairCorrelation[] {
  return [{
    leftIssuerPublicId: "issuer.northreach.corporation.0001.v1",
    rightIssuerPublicId: "issuer.yrethia.government.0001.v1",
    correlation: 0.5,
  }];
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
