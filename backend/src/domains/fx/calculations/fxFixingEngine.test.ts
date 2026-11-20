import type {
  FxFixingCurrencyInput,
  FxFixingEngineInput,
  FxFixingStoryShockInput,
  FxNationalCurrencyCode,
} from "../contracts/fxFixingContracts.ts";
import { fxPolicyV1Input } from "../tests/fxFixingTestFixtures.ts";
import {
  calculateFxFixing,
  canonicalizeFxFixingInput,
} from "./fxFixingEngine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("FX fixing is deterministic and independent of input ordering", () => {
  const input = baseInput({
    storyShocks: [
      shock("NRC", "story-z", 25),
      shock("NRC", "story-a", -10),
    ],
  });
  const reordered: FxFixingEngineInput = {
    ...input,
    currencies: [...input.currencies].reverse(),
    storyShocks: [...(input.storyShocks ?? [])].reverse(),
  };

  assertEquals(calculateFxFixing(input), calculateFxFixing(reordered));
  assertEquals(
    canonicalizeFxFixingInput(input),
    canonicalizeFxFixingInput(reordered),
  );
  assertEquals(
    calculateFxFixing(input).values.map((value) => value.currencyCode),
    [
      "ECO",
      "DRV",
      "ELD",
      "LUM",
      "NRC",
      "SLV",
      "SYN",
      "THD",
      "VAL",
      "XAL",
      "YRC",
    ],
  );
});

Deno.test("canonical evidence uses locale-independent code-unit ordering", () => {
  const input = baseInput({
    storyShocks: [
      shock("NRC", "shock:a", 5),
      shock("NRC", "Shock_a", 10),
      shock("NRC", "shock-a", 15),
    ],
  });
  const result = calculateFxFixing(input);
  const nrc = requiredValue(result, "NRC");
  const canonical = JSON.parse(result.canonicalInputJson);

  assertEquals(nrc.appliedStoryShockIds, ["Shock_a", "shock-a", "shock:a"]);
  assertEquals(
    canonical.storyShocks.map((value: { shockId: string }) => value.shockId),
    ["Shock_a", "shock-a", "shock:a"],
  );
});

Deno.test("identical national macro inputs produce zero movement and ECO remains exactly one", () => {
  const result = calculateFxFixing(baseInput());
  const eco = result.values[0];

  assertEquals(eco.currencyCode, "ECO");
  assertEquals(eco.countryCode, null);
  assertEquals(eco.previousUnitsPerEco, "1.000000000000000000");
  assertEquals(eco.unitsPerEco, "1.000000000000000000");
  assertEquals(eco.components, zeroComponents());

  for (const value of result.values.slice(1)) {
    assertEquals(value.components, zeroComponents());
    assertEquals(value.unitsPerEco, value.previousUnitsPerEco);
  }
});

Deno.test("component signs and approved normalizers follow currency-strength semantics", () => {
  const currencies = baseCurrencies();
  currencies[0] = currency("NRC", "NORTHREACH", {
    realGdpIndex: "125",
    gdpGrowthRate: "0.10",
    inflationRate: "0.10",
    interestRate: "0.23",
    tradeBalanceIndex: "50",
    exportStrengthIndex: "1.5",
    importDependencyIndex: "0.5",
    consumerConfidenceIndex: "150",
    businessConfidenceIndex: "150",
    currencyStabilityIndex: "1.5",
    politicalStabilityIndex: "1.5",
    marketRiskIndex: "0.5",
  });

  const nrc = calculateFxFixing(baseInput({ currencies })).values.find(
    (value) => value.currencyCode === "NRC",
  );
  assert(nrc !== undefined);
  assertEquals(nrc.components, {
    gdpBasisPoints: -50,
    inflationBasisPoints: 45,
    realInterestBasisPoints: -30,
    tradeBasisPoints: -40,
    confidenceStabilityBasisPoints: -35,
    fundamentalBasisPoints: -110,
    storyBasisPoints: 0,
    finalBasisPoints: -110,
  });
});

Deno.test("GDP blend uses half-away-from-zero integer-basis-point rounding", () => {
  const strong = baseCurrencies();
  strong[0] = currency("NRC", "NORTHREACH", { realGdpIndex: "125" });
  const weak = baseCurrencies();
  weak[0] = currency("NRC", "NORTHREACH", { realGdpIndex: "75" });

  assertEquals(componentFor(strong, "NRC").gdpBasisPoints, -13);
  assertEquals(componentFor(weak, "NRC").gdpBasisPoints, 13);
});

Deno.test("normal movement caps at 200 bp and aggregated Story movement caps final movement at 1500 bp", () => {
  const currencies = baseCurrencies();
  currencies[0] = currency("NRC", "NORTHREACH", {
    realGdpIndex: "75",
    gdpGrowthRate: "-0.10",
    inflationRate: "0.10",
    interestRate: "0.03",
    tradeBalanceIndex: "-50",
    exportStrengthIndex: "0.5",
    importDependencyIndex: "1.5",
    consumerConfidenceIndex: "50",
    businessConfidenceIndex: "50",
    currencyStabilityIndex: "0.5",
    politicalStabilityIndex: "0.5",
    marketRiskIndex: "1.5",
  });
  const result = calculateFxFixing(baseInput({
    currencies,
    storyShocks: [
      shock("NRC", "story-second", 900),
      shock("NRC", "story-first", 1_000),
    ],
  }));
  const nrc = requiredValue(result, "NRC");

  assertEquals(nrc.components, {
    gdpBasisPoints: 50,
    inflationBasisPoints: 45,
    realInterestBasisPoints: 30,
    tradeBasisPoints: 40,
    confidenceStabilityBasisPoints: 35,
    fundamentalBasisPoints: 200,
    storyBasisPoints: 1_500,
    finalBasisPoints: 1_500,
  });
  assertEquals(nrc.unitsPerEco, "1.150000000000000000");
  assertEquals(nrc.appliedStoryShockIds, ["story-first", "story-second"]);
});

Deno.test("fixed-point settlement rounds a half unit away from zero", () => {
  const currencies = baseCurrencies();
  currencies[0] = currency("NRC", "NORTHREACH", {
    previousUnitsPerEco: "0.000000000000000005",
  });
  const nrc = requiredValue(
    calculateFxFixing(baseInput({
      currencies,
      storyShocks: [shock("NRC", "story-rounding", 1_000)],
    })),
    "NRC",
  );

  assertEquals(nrc.unitsPerEco, "0.000000000000000006");
});

Deno.test("decimal canonicalization is fixed precision and rounds excess precision away from zero", () => {
  const currencies = baseCurrencies();
  currencies[0] = currency("NRC", "NORTHREACH", {
    previousUnitsPerEco: "1.0000000000000000005",
  });
  currencies[1] = currency("YRC", "YRETHIA", {
    gdpGrowthRate: "-0.0000000000000000005",
  });
  const canonical = JSON.parse(
    canonicalizeFxFixingInput(baseInput({ currencies })),
  );

  assertEquals(
    canonical.currencies.find(
      (value: { currencyCode: string }) => value.currencyCode === "NRC",
    ).previousUnitsPerEco,
    "1.000000000000000001",
  );
  assertEquals(
    canonical.currencies.find(
      (value: { currencyCode: string }) => value.currencyCode === "YRC",
    ).gdpGrowthRate,
    "-0.000000000000000001",
  );
});

Deno.test("engine fails closed for incomplete, mismapped, or malformed evidence", () => {
  assertThrows(
    () =>
      calculateFxFixing(baseInput({ currencies: baseCurrencies().slice(1) })),
    "all 10 official national currencies",
  );

  const mismapped = baseCurrencies();
  mismapped[0] = {
    ...mismapped[0],
    countryCode: "YRETHIA",
  } as FxFixingCurrencyInput;
  assertThrows(
    () => calculateFxFixing(baseInput({ currencies: mismapped })),
    "must map to its official country",
  );

  const exponent = baseCurrencies();
  exponent[0] = { ...exponent[0], inflationRate: "1e-2" };
  assertThrows(
    () => calculateFxFixing(baseInput({ currencies: exponent })),
    "without exponent notation",
  );

  assertThrows(
    () => calculateFxFixing(baseInput({ fixingLocalDate: "2026-02-30" })),
    "valid calendar date",
  );
});

Deno.test("engine rejects duplicate Story evidence and out-of-policy Story movement", () => {
  assertThrows(
    () =>
      calculateFxFixing(baseInput({
        storyShocks: [
          shock("NRC", "duplicate-story", 10),
          shock("NRC", "duplicate-story", -10),
        ],
      })),
    "is duplicated",
  );
  assertThrows(
    () =>
      calculateFxFixing(baseInput({
        storyShocks: [shock("NRC", "too-large", 1_501)],
      })),
    "between -1500 and 1500",
  );
});

Deno.test("engine consumes the immutable versioned policy instead of hardcoded weights", () => {
  const policy = fxPolicyV1Input();
  const currencies = baseCurrencies();
  currencies[0] = currency("NRC", "NORTHREACH", { inflationRate: "0.10" });

  const result = calculateFxFixing(baseInput({
    currencies,
    policy: {
      ...policy,
      normalMovementCapBasisPoints: 175,
      parameters: {
        ...policy.parameters,
        inflation: {
          ...policy.parameters.inflation,
          capBasisPoints: 20,
        },
      },
    },
  }));

  assertEquals(
    requiredValue(result, "NRC").components.inflationBasisPoints,
    20,
  );
  assertEquals(
    JSON.parse(result.canonicalInputJson).policy.parameters.inflation
      .capBasisPoints,
    20,
  );
});

Deno.test("engine fails closed for malformed or circular policy evidence", () => {
  const policy = fxPolicyV1Input();
  assertThrows(
    () =>
      calculateFxFixing(baseInput({
        policy: {
          ...policy,
          parameters: {
            ...policy.parameters,
            gdp: {
              ...policy.parameters.gdp,
              growthWeightBasisPoints: 7_499,
            },
          },
        },
      })),
    "GDP policy weights must total 10000",
  );
  assertThrows(
    () =>
      calculateFxFixing(baseInput({
        policy: {
          ...policy,
          parameters: {
            ...policy.parameters,
            exchangeRateIndexWeightBasisPoints: 1 as 0,
          },
        },
      })),
    "non-circular v1 policy weights must remain zero",
  );
  assertThrows(
    () =>
      calculateFxFixing(baseInput({
        policy: {
          ...policy,
          crisisMovementCapBasisPoints: 1_501,
        },
      })),
    "crisisMovementCapBasisPoints must be an integer from 200 to 1500",
  );
});

Deno.test("one Story authorization may contribute distinct currency legs", () => {
  const result = calculateFxFixing(baseInput({
    storyShocks: [
      shock("NRC", "shared-authorization", 25),
      shock("YRC", "shared-authorization", -40),
    ],
  }));

  assertEquals(
    requiredValue(result, "NRC").appliedStoryShockIds,
    ["shared-authorization"],
  );
  assertEquals(
    requiredValue(result, "YRC").appliedStoryShockIds,
    ["shared-authorization"],
  );
});

function baseInput(
  overrides: Partial<FxFixingEngineInput> = {},
): FxFixingEngineInput {
  return {
    gameSessionId: "game-alpha",
    fixingLocalDate: "2026-08-26",
    policyVersion: "fx-policy-v1",
    policy: fxPolicyV1Input(),
    currencies: baseCurrencies(),
    storyShocks: [],
    ...overrides,
  };
}

function baseCurrencies(): FxFixingCurrencyInput[] {
  return [
    currency("NRC", "NORTHREACH"),
    currency("YRC", "YRETHIA"),
    currency("THD", "THALORIS"),
    currency("SLV", "SOLVEND"),
    currency("ELD", "ELDORAN"),
    currency("VAL", "VALERION"),
    currency("LUM", "LUMENOR"),
    currency("SYN", "SYNDALIS"),
    currency("XAL", "XALVORIA"),
    currency("DRV", "DRAVENLOK"),
  ];
}

function currency(
  currencyCode: FxFixingCurrencyInput["currencyCode"],
  countryCode: FxFixingCurrencyInput["countryCode"],
  overrides: Partial<FxFixingCurrencyInput> = {},
): FxFixingCurrencyInput {
  return {
    currencyCode,
    countryCode,
    previousUnitsPerEco: "1",
    snapshotId: `snapshot-${currencyCode.toLowerCase()}`,
    snapshotSequence: 7,
    realGdpIndex: "100",
    gdpGrowthRate: "0",
    inflationRate: "0",
    interestRate: "0.03",
    consumerConfidenceIndex: "100",
    businessConfidenceIndex: "100",
    importDependencyIndex: "1",
    currencyStabilityIndex: "1",
    tradeBalanceIndex: "0",
    exportStrengthIndex: "1",
    marketRiskIndex: "1",
    politicalStabilityIndex: "1",
    ...overrides,
  };
}

function shock(
  currencyCode: FxNationalCurrencyCode,
  shockId: string,
  basisPoints: number,
): FxFixingStoryShockInput {
  return { shockId, currencyCode, basisPoints };
}

function componentFor(
  currencies: FxFixingCurrencyInput[],
  currencyCode: FxNationalCurrencyCode,
) {
  return requiredValue(
    calculateFxFixing(baseInput({ currencies })),
    currencyCode,
  ).components;
}

function requiredValue(
  result: ReturnType<typeof calculateFxFixing>,
  currencyCode: FxNationalCurrencyCode,
) {
  const value = result.values.find((candidate) =>
    candidate.currencyCode === currencyCode
  );
  if (value === undefined) throw new Error(`${currencyCode} result missing`);
  return value;
}

function zeroComponents() {
  return {
    gdpBasisPoints: 0,
    inflationBasisPoints: 0,
    realInterestBasisPoints: 0,
    tradeBasisPoints: 0,
    confidenceStabilityBasisPoints: 0,
    fundamentalBasisPoints: 0,
    storyBasisPoints: 0,
    finalBasisPoints: 0,
  };
}

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`expected ${expectedJson}, received ${actualJson}`);
  }
}

function assertThrows(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(
        `expected error containing ${expectedMessage}, received ${message}`,
      );
    }
    return;
  }
  throw new Error(`expected error containing ${expectedMessage}`);
}
