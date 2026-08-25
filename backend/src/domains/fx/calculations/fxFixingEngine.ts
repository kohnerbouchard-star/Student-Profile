import {
  FX_NATIONAL_CURRENCY_DEFINITIONS,
  FX_NUMERAIRE_CURRENCY_CODE,
  type FxCountryCode,
  type FxFixingComponentBreakdown,
  type FxFixingCurrencyInput,
  type FxFixingCurrencyValue,
  type FxFixingEngineInput,
  type FxFixingEngineResult,
  type FxFixingPolicyInput,
  type FxFixingStoryShockInput,
  type FxNationalCurrencyCode,
} from "../contracts/fxFixingContracts.ts";

// Match the persisted numeric(38,18) fixing scale so calculation never loses
// precision before the database stores the immutable rate.
const DECIMAL_PLACES = 18;
const SCALE = 10n ** BigInt(DECIMAL_PLACES);
const MAX_NUMERIC_MAGNITUDE = 10n ** 38n - 1n;
const ZERO_DECIMAL = formatDecimal(0n);
const ONE_DECIMAL = formatDecimal(SCALE);

// The v1 evidence table has this deliberately narrow integrity envelope.
// A policy outside it requires a forward schema-and-engine migration.
const FX_V1_STORAGE_ENVELOPE = Object.freeze({
  normal: 200,
  crisis: 1_500,
  gdp: 50,
  inflation: 45,
  realInterest: 30,
  trade: 40,
  confidenceStability: 35,
});

const EXPECTED_COUNTRY_BY_CURRENCY = new Map<
  FxNationalCurrencyCode,
  FxCountryCode
>(
  FX_NATIONAL_CURRENCY_DEFINITIONS.map((definition) => [
    definition.currencyCode,
    definition.countryCode,
  ]),
);

interface NormalizedCurrencyInput {
  readonly source: FxFixingCurrencyInput;
  readonly previousUnitsPerEco: bigint;
  readonly realGdpIndex: bigint;
  readonly gdpGrowthRate: bigint;
  readonly inflationRate: bigint;
  readonly interestRate: bigint;
  readonly consumerConfidenceIndex: bigint;
  readonly businessConfidenceIndex: bigint;
  readonly importDependencyIndex: bigint;
  readonly currencyStabilityIndex: bigint;
  readonly tradeBalanceIndex: bigint;
  readonly exportStrengthIndex: bigint;
  readonly marketRiskIndex: bigint;
  readonly politicalStabilityIndex: bigint;
}

interface NormalizedInput {
  readonly gameSessionId: string;
  readonly fixingLocalDate: string;
  readonly policyVersion: string;
  readonly policy: NormalizedPolicy;
  readonly currencies: readonly NormalizedCurrencyInput[];
  readonly storyShocks: readonly FxFixingStoryShockInput[];
  readonly canonicalInputJson: string;
}

interface NormalizedPolicy {
  readonly fixingLocalTime: "08:00:00";
  readonly normalMovementCapBasisPoints: number;
  readonly crisisMovementCapBasisPoints: number;
  readonly gdp: {
    readonly capBasisPoints: number;
    readonly levelWeightBasisPoints: number;
    readonly growthWeightBasisPoints: number;
    readonly levelNormalizer: bigint;
    readonly growthNormalizer: bigint;
  };
  readonly inflation: {
    readonly capBasisPoints: number;
    readonly normalizer: bigint;
  };
  readonly realInterest: {
    readonly capBasisPoints: number;
    readonly normalizer: bigint;
  };
  readonly trade: {
    readonly capBasisPoints: number;
    readonly tradeBalanceWeightBasisPoints: number;
    readonly exportStrengthWeightBasisPoints: number;
    readonly inverseImportDependencyWeightBasisPoints: number;
    readonly tradeBalanceNormalizer: bigint;
    readonly exportStrengthNormalizer: bigint;
    readonly importDependencyNormalizer: bigint;
  };
  readonly confidenceStability: {
    readonly capBasisPoints: number;
    readonly signalWeightBasisPoints: number;
    readonly confidenceNormalizer: bigint;
    readonly indexNormalizer: bigint;
  };
  readonly exchangeRateIndexWeightBasisPoints: 0;
  readonly bilateralTradeExposureWeightBasisPoints: 0;
}

interface MacroMedians {
  readonly realGdpIndex: bigint;
  readonly gdpGrowthRate: bigint;
  readonly inflationRate: bigint;
  readonly realInterestRate: bigint;
  readonly consumerConfidenceIndex: bigint;
  readonly businessConfidenceIndex: bigint;
  readonly importDependencyIndex: bigint;
  readonly currencyStabilityIndex: bigint;
  readonly tradeBalanceIndex: bigint;
  readonly exportStrengthIndex: bigint;
  readonly marketRiskIndex: bigint;
  readonly politicalStabilityIndex: bigint;
}

export function calculateFxFixing(
  input: FxFixingEngineInput,
): FxFixingEngineResult {
  const normalized = normalizeInput(input);
  const medians = calculateMedians(normalized.currencies);
  const shocksByCurrency = groupStoryShocks(normalized.storyShocks);

  const values: FxFixingCurrencyValue[] = [numeraireValue()];
  for (const currency of normalized.currencies) {
    const shocks = shocksByCurrency.get(currency.source.currencyCode) ?? [];
    const components = calculateComponents(
      currency,
      medians,
      shocks,
      normalized.policy,
    );
    const unitsPerEco = applyBasisPointMovement(
      currency.previousUnitsPerEco,
      components.finalBasisPoints,
    );

    values.push({
      currencyCode: currency.source.currencyCode,
      countryCode: currency.source.countryCode,
      snapshotId: currency.source.snapshotId,
      snapshotSequence: currency.source.snapshotSequence,
      previousUnitsPerEco: formatDecimal(currency.previousUnitsPerEco),
      unitsPerEco: formatDecimal(unitsPerEco),
      components,
      appliedStoryShockIds: shocks.map((shock) => shock.shockId),
    });
  }

  return {
    gameSessionId: normalized.gameSessionId,
    fixingLocalDate: normalized.fixingLocalDate,
    policyVersion: normalized.policyVersion,
    canonicalInputJson: normalized.canonicalInputJson,
    values,
  };
}

/**
 * Returns the stable, validated input representation that the runtime hashes.
 * Cryptographic hashing stays outside the synchronous calculation engine.
 */
export function canonicalizeFxFixingInput(input: FxFixingEngineInput): string {
  return normalizeInput(input).canonicalInputJson;
}

function normalizeInput(input: FxFixingEngineInput): NormalizedInput {
  const gameSessionId = requireNonBlank(input.gameSessionId, "gameSessionId");
  const fixingLocalDate = requireLocalDate(input.fixingLocalDate);
  const policyVersion = requireNonBlank(input.policyVersion, "policyVersion");
  const policy = normalizePolicy(input.policy);

  if (input.currencies.length !== FX_NATIONAL_CURRENCY_DEFINITIONS.length) {
    throw new Error(
      `currencies must contain all ${FX_NATIONAL_CURRENCY_DEFINITIONS.length} official national currencies`,
    );
  }

  const seenCurrencies = new Set<string>();
  const seenCountries = new Set<string>();
  const currencies = input.currencies.map((currency) => {
    const expectedCountry = EXPECTED_COUNTRY_BY_CURRENCY.get(
      currency.currencyCode,
    );
    if (
      expectedCountry === undefined || expectedCountry !== currency.countryCode
    ) {
      throw new Error(
        `currency ${currency.currencyCode} must map to its official country`,
      );
    }
    if (seenCurrencies.has(currency.currencyCode)) {
      throw new Error(`currency ${currency.currencyCode} is duplicated`);
    }
    if (seenCountries.has(currency.countryCode)) {
      throw new Error(`country ${currency.countryCode} is duplicated`);
    }
    seenCurrencies.add(currency.currencyCode);
    seenCountries.add(currency.countryCode);

    if (
      !Number.isSafeInteger(currency.snapshotSequence) ||
      currency.snapshotSequence < 0
    ) {
      throw new Error("snapshotSequence must be a non-negative safe integer");
    }

    const normalized: NormalizedCurrencyInput = {
      source: {
        ...currency,
        snapshotId: requireNonBlank(currency.snapshotId, "snapshotId"),
      },
      previousUnitsPerEco: parseDecimal(
        currency.previousUnitsPerEco,
        "previousUnitsPerEco",
      ),
      realGdpIndex: parseDecimal(currency.realGdpIndex, "realGdpIndex"),
      gdpGrowthRate: parseDecimal(currency.gdpGrowthRate, "gdpGrowthRate"),
      inflationRate: parseDecimal(currency.inflationRate, "inflationRate"),
      interestRate: parseDecimal(currency.interestRate, "interestRate"),
      consumerConfidenceIndex: parseDecimal(
        currency.consumerConfidenceIndex,
        "consumerConfidenceIndex",
      ),
      businessConfidenceIndex: parseDecimal(
        currency.businessConfidenceIndex,
        "businessConfidenceIndex",
      ),
      importDependencyIndex: parseDecimal(
        currency.importDependencyIndex,
        "importDependencyIndex",
      ),
      currencyStabilityIndex: parseDecimal(
        currency.currencyStabilityIndex,
        "currencyStabilityIndex",
      ),
      tradeBalanceIndex: parseDecimal(
        currency.tradeBalanceIndex,
        "tradeBalanceIndex",
      ),
      exportStrengthIndex: parseDecimal(
        currency.exportStrengthIndex,
        "exportStrengthIndex",
      ),
      marketRiskIndex: parseDecimal(
        currency.marketRiskIndex,
        "marketRiskIndex",
      ),
      politicalStabilityIndex: parseDecimal(
        currency.politicalStabilityIndex,
        "politicalStabilityIndex",
      ),
    };

    validateCurrencyRanges(normalized);
    return normalized;
  }).sort((left, right) =>
    compareCodeUnits(left.source.currencyCode, right.source.currencyCode)
  );

  for (const definition of FX_NATIONAL_CURRENCY_DEFINITIONS) {
    if (!seenCurrencies.has(definition.currencyCode)) {
      throw new Error(`currency ${definition.currencyCode} is missing`);
    }
  }

  const storyShocks = normalizeStoryShocks(
    input.storyShocks ?? [],
    policy.crisisMovementCapBasisPoints,
  );
  const canonicalInputJson = JSON.stringify({
    gameSessionId,
    fixingLocalDate,
    policyVersion,
    policy: canonicalPolicy(policy),
    currencies: currencies.map(canonicalCurrency),
    storyShocks,
  });

  return {
    gameSessionId,
    fixingLocalDate,
    policyVersion,
    policy,
    currencies,
    storyShocks,
    canonicalInputJson,
  };
}

function normalizePolicy(policy: FxFixingPolicyInput): NormalizedPolicy {
  if (
    policy === null || typeof policy !== "object" ||
    policy.parameters === null || typeof policy.parameters !== "object"
  ) {
    throw new Error("policy must be immutable policy evidence");
  }
  if (policy.fixingLocalTime !== "08:00:00") {
    throw new Error("policy fixingLocalTime must be 08:00:00");
  }

  const normalMovementCapBasisPoints = requireIntegerInRange(
    policy.normalMovementCapBasisPoints,
    1,
    FX_V1_STORAGE_ENVELOPE.normal,
    "normalMovementCapBasisPoints",
  );
  const crisisMovementCapBasisPoints = requireIntegerInRange(
    policy.crisisMovementCapBasisPoints,
    normalMovementCapBasisPoints,
    FX_V1_STORAGE_ENVELOPE.crisis,
    "crisisMovementCapBasisPoints",
  );
  const parameters = policy.parameters;
  if (parameters.numeraireCurrencyCode !== FX_NUMERAIRE_CURRENCY_CODE) {
    throw new Error("policy numeraireCurrencyCode must be ECO");
  }
  if (
    parameters.exchangeRateIndexWeightBasisPoints !== 0 ||
    parameters.bilateralTradeExposureWeightBasisPoints !== 0
  ) {
    throw new Error("non-circular v1 policy weights must remain zero");
  }

  const gdpCap = componentCap(
    parameters.gdp.capBasisPoints,
    "gdp",
    FX_V1_STORAGE_ENVELOPE.gdp,
  );
  const gdpLevelWeight = componentWeight(
    parameters.gdp.levelWeightBasisPoints,
    "gdp.levelWeightBasisPoints",
  );
  const gdpGrowthWeight = componentWeight(
    parameters.gdp.growthWeightBasisPoints,
    "gdp.growthWeightBasisPoints",
  );
  requireWeightTotal(
    [gdpLevelWeight, gdpGrowthWeight],
    "GDP policy weights",
  );

  const inflationCap = componentCap(
    parameters.inflation.capBasisPoints,
    "inflation",
    FX_V1_STORAGE_ENVELOPE.inflation,
  );
  const realInterestCap = componentCap(
    parameters.realInterest.capBasisPoints,
    "realInterest",
    FX_V1_STORAGE_ENVELOPE.realInterest,
  );

  const tradeCap = componentCap(
    parameters.trade.capBasisPoints,
    "trade",
    FX_V1_STORAGE_ENVELOPE.trade,
  );
  const tradeBalanceWeight = componentWeight(
    parameters.trade.tradeBalanceWeightBasisPoints,
    "trade.tradeBalanceWeightBasisPoints",
  );
  const exportStrengthWeight = componentWeight(
    parameters.trade.exportStrengthWeightBasisPoints,
    "trade.exportStrengthWeightBasisPoints",
  );
  const inverseImportDependencyWeight = componentWeight(
    parameters.trade.inverseImportDependencyWeightBasisPoints,
    "trade.inverseImportDependencyWeightBasisPoints",
  );
  requireWeightTotal(
    [tradeBalanceWeight, exportStrengthWeight, inverseImportDependencyWeight],
    "trade policy weights",
  );

  const confidenceCap = componentCap(
    parameters.confidenceStability.capBasisPoints,
    "confidenceStability",
    FX_V1_STORAGE_ENVELOPE.confidenceStability,
  );
  const confidenceSignalWeight = componentWeight(
    parameters.confidenceStability.signalWeightBasisPoints,
    "confidenceStability.signalWeightBasisPoints",
  );
  requireWeightTotal(
    Array(5).fill(confidenceSignalWeight),
    "confidence/stability policy weights",
  );

  if (
    normalMovementCapBasisPoints >
      gdpCap + inflationCap + realInterestCap + tradeCap + confidenceCap
  ) {
    throw new Error("normal movement cap exceeds component capacity");
  }

  return {
    fixingLocalTime: "08:00:00",
    normalMovementCapBasisPoints,
    crisisMovementCapBasisPoints,
    gdp: {
      capBasisPoints: gdpCap,
      levelWeightBasisPoints: gdpLevelWeight,
      growthWeightBasisPoints: gdpGrowthWeight,
      levelNormalizer: positivePolicyDecimal(
        parameters.gdp.levelNormalizer,
        "gdp.levelNormalizer",
      ),
      growthNormalizer: positivePolicyDecimal(
        parameters.gdp.growthNormalizer,
        "gdp.growthNormalizer",
      ),
    },
    inflation: {
      capBasisPoints: inflationCap,
      normalizer: positivePolicyDecimal(
        parameters.inflation.normalizer,
        "inflation.normalizer",
      ),
    },
    realInterest: {
      capBasisPoints: realInterestCap,
      normalizer: positivePolicyDecimal(
        parameters.realInterest.normalizer,
        "realInterest.normalizer",
      ),
    },
    trade: {
      capBasisPoints: tradeCap,
      tradeBalanceWeightBasisPoints: tradeBalanceWeight,
      exportStrengthWeightBasisPoints: exportStrengthWeight,
      inverseImportDependencyWeightBasisPoints: inverseImportDependencyWeight,
      tradeBalanceNormalizer: positivePolicyDecimal(
        parameters.trade.tradeBalanceNormalizer,
        "trade.tradeBalanceNormalizer",
      ),
      exportStrengthNormalizer: positivePolicyDecimal(
        parameters.trade.exportStrengthNormalizer,
        "trade.exportStrengthNormalizer",
      ),
      importDependencyNormalizer: positivePolicyDecimal(
        parameters.trade.importDependencyNormalizer,
        "trade.importDependencyNormalizer",
      ),
    },
    confidenceStability: {
      capBasisPoints: confidenceCap,
      signalWeightBasisPoints: confidenceSignalWeight,
      confidenceNormalizer: positivePolicyDecimal(
        parameters.confidenceStability.confidenceNormalizer,
        "confidenceStability.confidenceNormalizer",
      ),
      indexNormalizer: positivePolicyDecimal(
        parameters.confidenceStability.indexNormalizer,
        "confidenceStability.indexNormalizer",
      ),
    },
    exchangeRateIndexWeightBasisPoints: 0,
    bilateralTradeExposureWeightBasisPoints: 0,
  };
}

function canonicalPolicy(policy: NormalizedPolicy): FxFixingPolicyInput {
  return {
    fixingLocalTime: policy.fixingLocalTime,
    normalMovementCapBasisPoints: policy.normalMovementCapBasisPoints,
    crisisMovementCapBasisPoints: policy.crisisMovementCapBasisPoints,
    parameters: {
      numeraireCurrencyCode: FX_NUMERAIRE_CURRENCY_CODE,
      gdp: {
        capBasisPoints: policy.gdp.capBasisPoints,
        levelWeightBasisPoints: policy.gdp.levelWeightBasisPoints,
        growthWeightBasisPoints: policy.gdp.growthWeightBasisPoints,
        levelNormalizer: formatDecimal(policy.gdp.levelNormalizer),
        growthNormalizer: formatDecimal(policy.gdp.growthNormalizer),
      },
      inflation: {
        capBasisPoints: policy.inflation.capBasisPoints,
        normalizer: formatDecimal(policy.inflation.normalizer),
      },
      realInterest: {
        capBasisPoints: policy.realInterest.capBasisPoints,
        normalizer: formatDecimal(policy.realInterest.normalizer),
      },
      trade: {
        capBasisPoints: policy.trade.capBasisPoints,
        tradeBalanceWeightBasisPoints:
          policy.trade.tradeBalanceWeightBasisPoints,
        exportStrengthWeightBasisPoints:
          policy.trade.exportStrengthWeightBasisPoints,
        inverseImportDependencyWeightBasisPoints:
          policy.trade.inverseImportDependencyWeightBasisPoints,
        tradeBalanceNormalizer: formatDecimal(
          policy.trade.tradeBalanceNormalizer,
        ),
        exportStrengthNormalizer: formatDecimal(
          policy.trade.exportStrengthNormalizer,
        ),
        importDependencyNormalizer: formatDecimal(
          policy.trade.importDependencyNormalizer,
        ),
      },
      confidenceStability: {
        capBasisPoints: policy.confidenceStability.capBasisPoints,
        signalWeightBasisPoints:
          policy.confidenceStability.signalWeightBasisPoints,
        confidenceNormalizer: formatDecimal(
          policy.confidenceStability.confidenceNormalizer,
        ),
        indexNormalizer: formatDecimal(
          policy.confidenceStability.indexNormalizer,
        ),
      },
      exchangeRateIndexWeightBasisPoints: 0,
      bilateralTradeExposureWeightBasisPoints: 0,
    },
  };
}

function canonicalCurrency(currency: NormalizedCurrencyInput) {
  return {
    currencyCode: currency.source.currencyCode,
    countryCode: currency.source.countryCode,
    previousUnitsPerEco: formatDecimal(currency.previousUnitsPerEco),
    snapshotId: currency.source.snapshotId,
    snapshotSequence: currency.source.snapshotSequence,
    realGdpIndex: formatDecimal(currency.realGdpIndex),
    gdpGrowthRate: formatDecimal(currency.gdpGrowthRate),
    inflationRate: formatDecimal(currency.inflationRate),
    interestRate: formatDecimal(currency.interestRate),
    consumerConfidenceIndex: formatDecimal(
      currency.consumerConfidenceIndex,
    ),
    businessConfidenceIndex: formatDecimal(
      currency.businessConfidenceIndex,
    ),
    importDependencyIndex: formatDecimal(currency.importDependencyIndex),
    currencyStabilityIndex: formatDecimal(currency.currencyStabilityIndex),
    tradeBalanceIndex: formatDecimal(currency.tradeBalanceIndex),
    exportStrengthIndex: formatDecimal(currency.exportStrengthIndex),
    marketRiskIndex: formatDecimal(currency.marketRiskIndex),
    politicalStabilityIndex: formatDecimal(
      currency.politicalStabilityIndex,
    ),
  };
}

function normalizeStoryShocks(
  storyShocks: readonly FxFixingStoryShockInput[],
  crisisMovementCapBasisPoints: number,
): readonly FxFixingStoryShockInput[] {
  const seenShockLegs = new Set<string>();
  return storyShocks.map((shock) => {
    const shockId = requireNonBlank(shock.shockId, "shockId");
    if (!EXPECTED_COUNTRY_BY_CURRENCY.has(shock.currencyCode)) {
      throw new Error(`story shock currency ${shock.currencyCode} is invalid`);
    }
    const shockLeg = `${shockId}\u0000${shock.currencyCode}`;
    if (seenShockLegs.has(shockLeg)) {
      throw new Error(
        `story shock ${shockId} is duplicated for ${shock.currencyCode}`,
      );
    }
    seenShockLegs.add(shockLeg);
    if (
      !Number.isSafeInteger(shock.basisPoints) || shock.basisPoints === 0 ||
      Math.abs(shock.basisPoints) > crisisMovementCapBasisPoints
    ) {
      throw new Error(
        `story shock basisPoints must be a non-zero integer between -${crisisMovementCapBasisPoints} and ${crisisMovementCapBasisPoints}`,
      );
    }
    return {
      shockId,
      currencyCode: shock.currencyCode,
      basisPoints: shock.basisPoints,
    };
  }).sort((left, right) =>
    compareCodeUnits(left.currencyCode, right.currencyCode) ||
    compareCodeUnits(left.shockId, right.shockId)
  );
}

function calculateMedians(
  currencies: readonly NormalizedCurrencyInput[],
): MacroMedians {
  return {
    realGdpIndex: median(currencies.map((currency) => currency.realGdpIndex)),
    gdpGrowthRate: median(
      currencies.map((currency) => currency.gdpGrowthRate),
    ),
    inflationRate: median(
      currencies.map((currency) => currency.inflationRate),
    ),
    realInterestRate: median(
      currencies.map((currency) =>
        currency.interestRate - currency.inflationRate
      ),
    ),
    consumerConfidenceIndex: median(
      currencies.map((currency) => currency.consumerConfidenceIndex),
    ),
    businessConfidenceIndex: median(
      currencies.map((currency) => currency.businessConfidenceIndex),
    ),
    importDependencyIndex: median(
      currencies.map((currency) => currency.importDependencyIndex),
    ),
    currencyStabilityIndex: median(
      currencies.map((currency) => currency.currencyStabilityIndex),
    ),
    tradeBalanceIndex: median(
      currencies.map((currency) => currency.tradeBalanceIndex),
    ),
    exportStrengthIndex: median(
      currencies.map((currency) => currency.exportStrengthIndex),
    ),
    marketRiskIndex: median(
      currencies.map((currency) => currency.marketRiskIndex),
    ),
    politicalStabilityIndex: median(
      currencies.map((currency) => currency.politicalStabilityIndex),
    ),
  };
}

function calculateComponents(
  currency: NormalizedCurrencyInput,
  medians: MacroMedians,
  storyShocks: readonly FxFixingStoryShockInput[],
  policy: NormalizedPolicy,
): FxFixingComponentBreakdown {
  const gdpStrength = weightedAverage([
    [
      normalizedDifference(
        currency.realGdpIndex,
        medians.realGdpIndex,
        policy.gdp.levelNormalizer,
      ),
      policy.gdp.levelWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.gdpGrowthRate,
        medians.gdpGrowthRate,
        policy.gdp.growthNormalizer,
      ),
      policy.gdp.growthWeightBasisPoints,
    ],
  ]);
  const gdpBasisPoints = componentBasisPoints(
    -gdpStrength,
    policy.gdp.capBasisPoints,
  );

  const inflationPressure = normalizedDifference(
    currency.inflationRate,
    medians.inflationRate,
    policy.inflation.normalizer,
  );
  const inflationBasisPoints = componentBasisPoints(
    inflationPressure,
    policy.inflation.capBasisPoints,
  );

  const realInterestStrength = normalizedDifference(
    currency.interestRate - currency.inflationRate,
    medians.realInterestRate,
    policy.realInterest.normalizer,
  );
  const realInterestBasisPoints = componentBasisPoints(
    -realInterestStrength,
    policy.realInterest.capBasisPoints,
  );

  const tradeStrength = weightedAverage([
    [
      normalizedDifference(
        currency.tradeBalanceIndex,
        medians.tradeBalanceIndex,
        policy.trade.tradeBalanceNormalizer,
      ),
      policy.trade.tradeBalanceWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.exportStrengthIndex,
        medians.exportStrengthIndex,
        policy.trade.exportStrengthNormalizer,
      ),
      policy.trade.exportStrengthWeightBasisPoints,
    ],
    [
      -normalizedDifference(
        currency.importDependencyIndex,
        medians.importDependencyIndex,
        policy.trade.importDependencyNormalizer,
      ),
      policy.trade.inverseImportDependencyWeightBasisPoints,
    ],
  ]);
  const tradeBasisPoints = componentBasisPoints(
    -tradeStrength,
    policy.trade.capBasisPoints,
  );

  const confidenceStabilityStrength = weightedAverage([
    [
      normalizedDifference(
        currency.consumerConfidenceIndex,
        medians.consumerConfidenceIndex,
        policy.confidenceStability.confidenceNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.businessConfidenceIndex,
        medians.businessConfidenceIndex,
        policy.confidenceStability.confidenceNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.currencyStabilityIndex,
        medians.currencyStabilityIndex,
        policy.confidenceStability.indexNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.politicalStabilityIndex,
        medians.politicalStabilityIndex,
        policy.confidenceStability.indexNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
    [
      -normalizedDifference(
        currency.marketRiskIndex,
        medians.marketRiskIndex,
        policy.confidenceStability.indexNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
  ]);
  const confidenceStabilityBasisPoints = componentBasisPoints(
    -confidenceStabilityStrength,
    policy.confidenceStability.capBasisPoints,
  );

  const fundamentalBasisPoints = clampNumber(
    gdpBasisPoints + inflationBasisPoints + realInterestBasisPoints +
      tradeBasisPoints + confidenceStabilityBasisPoints,
    -policy.normalMovementCapBasisPoints,
    policy.normalMovementCapBasisPoints,
  );
  const storyBasisPoints = clampNumber(
    storyShocks.reduce((total, shock) => total + shock.basisPoints, 0),
    -policy.crisisMovementCapBasisPoints,
    policy.crisisMovementCapBasisPoints,
  );
  const finalBasisPoints = storyShocks.length === 0
    ? fundamentalBasisPoints
    : clampNumber(
      fundamentalBasisPoints + storyBasisPoints,
      -policy.crisisMovementCapBasisPoints,
      policy.crisisMovementCapBasisPoints,
    );

  return {
    gdpBasisPoints,
    inflationBasisPoints,
    realInterestBasisPoints,
    tradeBasisPoints,
    confidenceStabilityBasisPoints,
    fundamentalBasisPoints,
    storyBasisPoints,
    finalBasisPoints,
  };
}

function groupStoryShocks(
  shocks: readonly FxFixingStoryShockInput[],
): ReadonlyMap<FxNationalCurrencyCode, readonly FxFixingStoryShockInput[]> {
  const grouped = new Map<
    FxNationalCurrencyCode,
    FxFixingStoryShockInput[]
  >();
  for (const shock of shocks) {
    const existing = grouped.get(shock.currencyCode) ?? [];
    existing.push(shock);
    grouped.set(shock.currencyCode, existing);
  }
  return grouped;
}

function numeraireValue(): FxFixingCurrencyValue {
  return {
    currencyCode: FX_NUMERAIRE_CURRENCY_CODE,
    countryCode: null,
    snapshotId: null,
    snapshotSequence: null,
    previousUnitsPerEco: ONE_DECIMAL,
    unitsPerEco: ONE_DECIMAL,
    components: zeroComponents(),
    appliedStoryShockIds: [],
  };
}

function zeroComponents(): FxFixingComponentBreakdown {
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

function normalizedDifference(
  value: bigint,
  benchmark: bigint,
  normalizer: bigint,
): bigint {
  return clampBigInt(
    roundDivideHalfAwayFromZero((value - benchmark) * SCALE, normalizer),
    -SCALE,
    SCALE,
  );
}

function weightedAverage(
  values: readonly (readonly [value: bigint, weight: number])[],
): bigint {
  const totalWeight = values.reduce((total, [, weight]) => total + weight, 0);
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
    throw new Error("component weights must have a positive safe-integer sum");
  }
  const weightedTotal = values.reduce(
    (total, [value, weight]) => total + value * BigInt(weight),
    0n,
  );
  return roundDivideHalfAwayFromZero(weightedTotal, BigInt(totalWeight));
}

function componentBasisPoints(normalized: bigint, cap: number): number {
  const rounded = roundDivideHalfAwayFromZero(
    normalized * BigInt(cap),
    SCALE,
  );
  return Number(clampBigInt(rounded, BigInt(-cap), BigInt(cap)));
}

function applyBasisPointMovement(
  previousUnitsPerEco: bigint,
  basisPoints: number,
): bigint {
  const multiplierBasisPoints = 10_000 + basisPoints;
  const result = roundDivideHalfAwayFromZero(
    previousUnitsPerEco * BigInt(multiplierBasisPoints),
    10_000n,
  );
  if (result <= 0n) {
    throw new Error("calculated unitsPerEco must be greater than zero");
  }
  if (result > MAX_NUMERIC_MAGNITUDE) {
    throw new Error("calculated unitsPerEco exceeds numeric(38,18)");
  }
  return result;
}

function median(values: readonly bigint[]): bigint {
  if (values.length === 0) {
    throw new Error("median requires at least one value");
  }
  const sorted = [...values].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint];
  return roundDivideHalfAwayFromZero(
    sorted[midpoint - 1] + sorted[midpoint],
    2n,
  );
}

function parseDecimal(value: string, label: string): bigint {
  if (typeof value !== "string" || value.length > 128) {
    throw new Error(`${label} must be a bounded decimal string`);
  }
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (match === null || match[2].length > 30) {
    throw new Error(
      `${label} must be a base-10 decimal without exponent notation`,
    );
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = match[3] ?? "";
  const retained = fraction.slice(0, DECIMAL_PLACES).padEnd(
    DECIMAL_PLACES,
    "0",
  );
  let magnitude = whole * SCALE + BigInt(retained);
  if (
    fraction.length > DECIMAL_PLACES &&
    fraction[DECIMAL_PLACES] >= "5"
  ) {
    magnitude += 1n;
  }
  if (magnitude > MAX_NUMERIC_MAGNITUDE) {
    throw new Error(`${label} exceeds numeric(38,18)`);
  }
  return sign * magnitude;
}

function formatDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const whole = magnitude / SCALE;
  const fraction = (magnitude % SCALE).toString().padStart(DECIMAL_PLACES, "0");
  return `${sign}${whole}.${fraction}`;
}

function decimalConstant(value: string): bigint {
  return parseDecimal(value, "policy decimal");
}

function roundDivideHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return sign * rounded;
}

function validateCurrencyRanges(currency: NormalizedCurrencyInput): void {
  requireRange(
    currency.previousUnitsPerEco,
    decimalConstant("0.000000000000000001"),
    null,
    "previousUnitsPerEco",
  );
  requireRange(
    currency.realGdpIndex,
    decimalConstant("50"),
    decimalConstant("200"),
    "realGdpIndex",
  );
  requireRange(
    currency.gdpGrowthRate,
    decimalConstant("-0.25"),
    decimalConstant("0.50"),
    "gdpGrowthRate",
  );
  requireRange(
    currency.inflationRate,
    decimalConstant("-0.05"),
    decimalConstant("0.50"),
    "inflationRate",
  );
  requireRange(
    currency.interestRate,
    0n,
    decimalConstant("0.50"),
    "interestRate",
  );
  requireRange(
    currency.consumerConfidenceIndex,
    decimalConstant("25"),
    decimalConstant("200"),
    "consumerConfidenceIndex",
  );
  requireRange(
    currency.businessConfidenceIndex,
    decimalConstant("25"),
    decimalConstant("200"),
    "businessConfidenceIndex",
  );
  requireRange(
    currency.importDependencyIndex,
    decimalConstant("0.50"),
    decimalConstant("2"),
    "importDependencyIndex",
  );
  requireRange(
    currency.currencyStabilityIndex,
    decimalConstant("0.50"),
    decimalConstant("2"),
    "currencyStabilityIndex",
  );
  requireRange(
    currency.tradeBalanceIndex,
    decimalConstant("-100"),
    decimalConstant("100"),
    "tradeBalanceIndex",
  );
  requireRange(
    currency.exportStrengthIndex,
    decimalConstant("0.50"),
    decimalConstant("2"),
    "exportStrengthIndex",
  );
  requireRange(
    currency.marketRiskIndex,
    decimalConstant("0.50"),
    decimalConstant("2"),
    "marketRiskIndex",
  );
  requireRange(
    currency.politicalStabilityIndex,
    decimalConstant("0.50"),
    decimalConstant("2"),
    "politicalStabilityIndex",
  );
}

function componentCap(
  value: number,
  label: string,
  maximum: number,
): number {
  return requireIntegerInRange(value, 1, maximum, `${label}.capBasisPoints`);
}

function componentWeight(value: number, label: string): number {
  return requireIntegerInRange(value, 0, 10_000, label);
}

function requireWeightTotal(values: readonly number[], label: string): void {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total !== 10_000) {
    throw new Error(`${label} must total 10000 basis points`);
  }
}

function positivePolicyDecimal(value: string, label: string): bigint {
  const parsed = parseDecimal(value, label);
  if (parsed <= 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) || value < minimum || value > maximum
  ) {
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

function requireRange(
  value: bigint,
  minimum: bigint,
  maximum: bigint | null,
  label: string,
): void {
  if (value < minimum || (maximum !== null && value > maximum)) {
    throw new Error(`${label} is outside the canonical macro range`);
  }
}

function requireNonBlank(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be non-blank`);
  }
  return value.trim();
}

function requireLocalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("fixingLocalDate must use YYYY-MM-DD");
  }
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day
  ) {
    throw new Error("fixingLocalDate must be a valid calendar date");
  }
  return value;
}

function clampBigInt(value: bigint, minimum: bigint, maximum: bigint): bigint {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const FX_FIXING_ZERO_DECIMAL = ZERO_DECIMAL;
