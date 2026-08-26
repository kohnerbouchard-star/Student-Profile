import {
  FX_NATIONAL_CURRENCY_DEFINITIONS,
  type FxFixingEngineInput,
  type FxFixingStoryShockInput,
} from "../contracts/fxFixingContracts.ts";
import {
  EXPECTED_COUNTRY_BY_CURRENCY,
  type NormalizedCurrencyInput,
  type NormalizedInput,
} from "./fxFixingModel.ts";
import {
  compareCodeUnits,
  decimalConstant,
  formatDecimal,
  parseDecimal,
} from "./fxFixingMath.ts";
import { canonicalPolicy, normalizePolicy } from "./fxFixingPolicy.ts";

export function normalizeInput(input: FxFixingEngineInput): NormalizedInput {
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
