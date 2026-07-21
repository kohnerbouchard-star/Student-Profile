import {
  calculateCollectiveInvestmentValue,
  calculateIndexValue,
  calculateReferenceBenchmark,
  rebalanceIndexDeterministically,
  validateCollectiveInvestment,
} from "./collectiveInvestmentAnalytics.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("ETF, fund, and trust NAV calculations are deterministic", () => {
  for (const vehicleKind of ["etf", "fund", "trust"] as const) {
    const definition = {
      vehiclePublicId: `vehicle.northreach.${vehicleKind}.v1`,
      vehicleKind,
      administratorIssuerPublicId:
        `issuer.northreach.${vehicleKind}.admin.v1`,
      sharesOutstanding: "1000",
      cash: "5000",
      liabilities: "1000",
      expenseRatioAnnual: 0.01,
      trackingDifferenceAnnual: -0.002,
      maximumComponentWeight: 0.6,
      circularHoldingsApproved: false as const,
      sourceVersion: "collective.v1",
      activationAuthorized: false as const,
    };
    const holdings = [
      holding("instrument.northreach.a.v1", "100", "50", 0.5),
      holding("instrument.northreach.b.v1", "200", "25", 0.5),
    ];
    const validation = validateCollectiveInvestment(definition, holdings);
    assertEquals(validation.valid, true);
    const first = calculateCollectiveInvestmentValue(definition, holdings);
    const second = calculateCollectiveInvestmentValue(definition, holdings);
    assertEquals(first, second);
    assertEquals(first.grossAssetValue, "15000");
    assertEquals(first.netAssetValue, "14000");
    assertEquals(first.navPerShare, "14");
    assertEquals(first.holdingsWeightSum, 1);
  }
});

Deno.test("collective investment validation rejects duplicate, unavailable, concentrated, and circular holdings", () => {
  const definition = {
    vehiclePublicId: "vehicle.northreach.etf.v1",
    vehicleKind: "etf" as const,
    administratorIssuerPublicId: "issuer.northreach.etf.admin.v1",
    sharesOutstanding: "1000",
    cash: "0",
    liabilities: "0",
    expenseRatioAnnual: 0.01,
    trackingDifferenceAnnual: 0,
    maximumComponentWeight: 0.6,
    circularHoldingsApproved: false as const,
    sourceVersion: "collective.v1",
    activationAuthorized: false as const,
  };
  const duplicate = holding(
    "instrument.northreach.a.v1",
    "1",
    "1",
    0.7,
  );
  const report = validateCollectiveInvestment(definition, [
    duplicate,
    duplicate,
    {
      ...holding(definition.vehiclePublicId, "1", "1", 0.3),
      componentKind: "etf" as const,
      available: false,
      delisted: true,
    },
  ]);
  assertEquals(report.valid, false);
  assert(report.errors.includes("duplicate_holding"));
  assert(report.errors.includes("unavailable_component"));
  assert(report.errors.includes("holding_weight_out_of_bounds"));
  assert(report.errors.includes("circular_holding_not_approved"));
  assert(report.errors.includes("holding_weights_do_not_sum_to_one"));
});

Deno.test("index weighting respects concentration and deterministic methodology", () => {
  for (const weightingMethod of [
    "equal_weight",
    "market_cap",
    "float_adjusted_market_cap",
    "price_weight",
    "fundamental_weight",
    "fixed_weight",
  ] as const) {
    const methodology = {
      indexPublicId: `index.northreach.${weightingMethod}.v1`,
      weightingMethod,
      baseDate: "2026-01-01",
      baseValue: "1000",
      divisor: "0.1",
      maximumConstituentWeight: 0.5,
      minimumConstituents: 3,
      maximumConstituents: 4,
      methodologyVersion: "index-method.v1",
    };
    const result = calculateIndexValue(methodology, components());
    assert(Number(result.value) > 0);
    assertEquals(result.constituentPublicIds.length, 4);
    assert(
      Math.abs(
        Object.values(result.constituentWeights).reduce(
          (sum, value) => sum + value,
          0,
        ) - 1,
      ) < 0.000001,
    );
    assert(
      Object.values(result.constituentWeights).every((weight) =>
        weight <= 0.500001
      ),
    );
    assertEquals(result, calculateIndexValue(methodology, components()));
  }
});

Deno.test("rebalance replacement preserves historical continuity", () => {
  const methodology = {
    indexPublicId: "index.northreach.continuity.v1",
    weightingMethod: "fixed_weight" as const,
    baseDate: "2026-01-01",
    baseValue: "1000",
    divisor: "0.1",
    maximumConstituentWeight: 0.5,
    minimumConstituents: 3,
    maximumConstituents: 3,
    methodologyVersion: "index-method.v1",
  };
  const base = components().map((entry) => ({
    ...entry,
    currentPrice: "100",
  }));
  const prior = [
    { ...base[0], targetWeight: 0.5 },
    { ...base[1], targetWeight: 0.25 },
    { ...base[2], targetWeight: 0.25 },
  ];
  const priorValue = calculateIndexValue(methodology, prior).value;
  const candidates = [
    { ...base[0], targetWeight: 0.5, delisted: true },
    { ...base[1], targetWeight: 0.25 },
    { ...base[2], targetWeight: 0.25 },
    { ...base[3], targetWeight: 0.1 },
    component(
      "instrument.northreach.replacement.v1",
      "100",
      "900000",
      0.9,
      0.9,
      0.5,
    ),
  ];
  const first = rebalanceIndexDeterministically({
    methodology,
    candidates,
    effectiveAt: "2026-04-01T00:00:00.000Z",
    priorValue,
    priorConstituents: prior,
  });
  const second = rebalanceIndexDeterministically({
    methodology,
    candidates,
    effectiveAt: "2026-04-01T00:00:00.000Z",
    priorValue,
    priorConstituents: prior,
  });
  assertEquals(first, second);
  assert(
    first.removedComponentPublicIds.includes(
      "instrument.northreach.a.v1",
    ),
  );
  assert(
    first.addedComponentPublicIds.includes(
      "instrument.northreach.replacement.v1",
    ),
  );
  assertEquals(first.continuityValueBefore, priorValue);
  assertEquals(first.continuityValueAfter, priorValue);
});

Deno.test("suspension and delisting exclude components while insufficient universes fail closed", () => {
  const methodology = {
    indexPublicId: "index.northreach.availability.v1",
    weightingMethod: "equal_weight" as const,
    baseDate: "2026-01-01",
    baseValue: "1000",
    divisor: "0.1",
    maximumConstituentWeight: 0.5,
    minimumConstituents: 3,
    maximumConstituents: 4,
    methodologyVersion: "index-method.v1",
  };
  assertThrows(() =>
    calculateIndexValue(
      methodology,
      components().map((entry, index) =>
        index < 2 ? { ...entry, suspended: true } : entry
      ),
    )
  );
  assertThrows(() =>
    calculateIndexValue(methodology, [
      ...components(),
      components()[0],
    ])
  );
});

Deno.test("commodity and economic reference benchmarks are reproducible and bounded", () => {
  const benchmarkComponents = [
    {
      componentPublicId: "commodity.energy.v1",
      observedValue: "80",
      weight: 0.4,
      available: true,
    },
    {
      componentPublicId: "commodity.metals.v1",
      observedValue: "120",
      weight: 0.35,
      available: true,
    },
    {
      componentPublicId: "economic.shipping.v1",
      observedValue: "95",
      weight: 0.25,
      available: true,
    },
  ];
  const result = calculateReferenceBenchmark({
    benchmarkPublicId: "benchmark.northreach.composite.v1",
    observedAt: "2026-01-01T00:00:00.000Z",
    components: benchmarkComponents,
  });
  assertEquals(result.value, "97.75");
  assertEquals(result.weightSum, 1);
  assertEquals(
    result,
    calculateReferenceBenchmark({
      benchmarkPublicId: "benchmark.northreach.composite.v1",
      observedAt: "2026-01-01T00:00:00.000Z",
      components: benchmarkComponents,
    }),
  );
  assertThrows(() =>
    calculateReferenceBenchmark({
      benchmarkPublicId: "benchmark.northreach.bad.v1",
      observedAt: "2026-01-01T00:00:00.000Z",
      components: [...benchmarkComponents, benchmarkComponents[0]],
    })
  );
});

function holding(
  componentPublicId: string,
  quantity: string,
  price: string,
  targetWeight: number,
) {
  return {
    componentPublicId,
    componentKind: "instrument" as const,
    quantity,
    price,
    targetWeight,
    available: true,
    suspended: false,
    delisted: false,
  };
}

function components() {
  return [
    component(
      "instrument.northreach.a.v1",
      "100",
      "1000000",
      1,
      0.7,
      0.25,
    ),
    component(
      "instrument.northreach.b.v1",
      "80",
      "700000",
      0.8,
      0.6,
      0.25,
    ),
    component(
      "instrument.northreach.c.v1",
      "60",
      "400000",
      0.7,
      0.8,
      0.25,
    ),
    component(
      "instrument.northreach.d.v1",
      "40",
      "200000",
      0.6,
      0.5,
      0.25,
    ),
  ];
}

function component(
  componentPublicId: string,
  currentPrice: string,
  marketCapitalization: string,
  floatFactor: number,
  fundamentalScore: number,
  targetWeight: number,
) {
  return {
    componentPublicId,
    currentPrice,
    basePrice: "50",
    marketCapitalization,
    floatFactor,
    fundamentalScore,
    targetWeight,
    eligible: true,
    suspended: false,
    delisted: false,
  };
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
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
