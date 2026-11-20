import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "./decimalMath.ts";
import {
  assertNonNegativeAmount,
  assertPositiveAmount,
  round,
} from "./collectiveInvestmentNumericPolicy.ts";
export type {
  DeterministicRebalanceInput,
  DeterministicRebalanceResult,
  IndexCalculationResult,
  IndexComponentInput,
  IndexMethodologyInput,
} from "./indexMethodology.ts";
export {
  calculateIndexValue,
  rebalanceIndexDeterministically,
} from "./indexMethodology.ts";

export interface CollectiveInvestmentComponent {
  readonly componentPublicId: string;
  readonly componentKind: "instrument" | "benchmark" | "etf" | "fund" | "trust";
  readonly quantity: string;
  readonly price: string;
  readonly targetWeight: number;
  readonly available: boolean;
  readonly suspended: boolean;
  readonly delisted: boolean;
}

export interface CollectiveInvestmentDefinition {
  readonly vehiclePublicId: string;
  readonly vehicleKind: "etf" | "fund" | "trust";
  readonly administratorIssuerPublicId: string;
  readonly sharesOutstanding: string;
  readonly cash: string;
  readonly liabilities: string;
  readonly expenseRatioAnnual: number;
  readonly trackingDifferenceAnnual: number;
  readonly maximumComponentWeight: number;
  readonly circularHoldingsApproved: false;
  readonly sourceVersion: string;
  readonly activationAuthorized: false;
}

export interface CollectiveInvestmentValuation {
  readonly vehiclePublicId: string;
  readonly grossAssetValue: string;
  readonly netAssetValue: string;
  readonly navPerShare: string;
  readonly annualExpenseAmount: string;
  readonly annualTrackingDifferenceAmount: string;
  readonly holdingsWeightSum: number;
  readonly activeHoldingCount: number;
  readonly deterministic: true;
}

export interface BenchmarkComponentInput {
  readonly componentPublicId: string;
  readonly observedValue: string;
  readonly weight: number;
  readonly available: boolean;
}

export interface BenchmarkCalculationResult {
  readonly benchmarkPublicId: string;
  readonly observedAt: string;
  readonly value: string;
  readonly componentCount: number;
  readonly weightSum: number;
  readonly deterministic: true;
}

export interface CollectiveInvestmentValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly activationAuthorized: false;
}

export function validateCollectiveInvestment(
  definition: CollectiveInvestmentDefinition,
  holdings: readonly CollectiveInvestmentComponent[],
): CollectiveInvestmentValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!definition.vehiclePublicId.trim() ||
    !definition.administratorIssuerPublicId.trim()) {
    errors.push("vehicle_identity_required");
  }
  collectPositiveAmount(
    definition.sharesOutstanding,
    "sharesOutstanding",
    errors,
  );
  collectNonNegativeAmount(definition.cash, "cash", errors);
  collectNonNegativeAmount(definition.liabilities, "liabilities", errors);
  if (!Number.isFinite(definition.expenseRatioAnnual) ||
    definition.expenseRatioAnnual < 0 || definition.expenseRatioAnnual > 0.2) {
    errors.push("expense_ratio_out_of_bounds");
  }
  if (!Number.isFinite(definition.trackingDifferenceAnnual) ||
    Math.abs(definition.trackingDifferenceAnnual) > 0.2) {
    errors.push("tracking_difference_out_of_bounds");
  }
  if (!Number.isFinite(definition.maximumComponentWeight) ||
    definition.maximumComponentWeight <= 0 ||
    definition.maximumComponentWeight > 1) {
    errors.push("maximum_component_weight_invalid");
  }
  if (definition.circularHoldingsApproved !== false) {
    errors.push("circular_holdings_must_remain_unapproved");
  }
  if (definition.activationAuthorized !== false) {
    errors.push("vehicle_activation_not_disabled");
  }
  if (!definition.sourceVersion.trim()) {
    errors.push("vehicle_source_version_required");
  }

  const seen = new Set<string>();
  let weightSum = 0;
  for (const holding of [...holdings].sort((left, right) =>
    left.componentPublicId.localeCompare(right.componentPublicId)
  )) {
    if (!holding.componentPublicId.trim()) errors.push("holding_identity_required");
    if (seen.has(holding.componentPublicId)) errors.push("duplicate_holding");
    seen.add(holding.componentPublicId);
    collectNonNegativeAmount(holding.quantity, "holdingQuantity", errors);
    collectNonNegativeAmount(holding.price, "holdingPrice", errors);
    if (!Number.isFinite(holding.targetWeight) || holding.targetWeight < 0 ||
      holding.targetWeight > definition.maximumComponentWeight + 1e-10) {
      errors.push("holding_weight_out_of_bounds");
    }
    weightSum += holding.targetWeight;
    if (!holding.available || holding.delisted) errors.push("unavailable_component");
    if (holding.suspended) warnings.push("suspended_component_requires_rebalance");
    if (holding.componentPublicId === definition.vehiclePublicId ||
      holding.componentKind === definition.vehicleKind) {
      errors.push("circular_holding_not_approved");
    }
  }
  if (holdings.length === 0) errors.push("holdings_required");
  if (Math.abs(weightSum - 1) > 1e-8) {
    errors.push("holding_weights_do_not_sum_to_one");
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
    activationAuthorized: false,
  };
}

export function calculateCollectiveInvestmentValue(
  definition: CollectiveInvestmentDefinition,
  holdings: readonly CollectiveInvestmentComponent[],
): CollectiveInvestmentValuation {
  const validation = validateCollectiveInvestment(definition, holdings);
  if (!validation.valid) {
    throw new Error(`Invalid collective investment: ${validation.errors.join(",")}`);
  }
  let holdingsValue = "0";
  for (const holding of holdings) {
    holdingsValue = addMarketDecimals(
      holdingsValue,
      multiplyMarketDecimals(holding.quantity, holding.price),
    );
  }
  const grossAssetValue = addMarketDecimals(holdingsValue, definition.cash);
  const netAssetValue = subtractMarketDecimals(
    grossAssetValue,
    definition.liabilities,
  );
  assertPositiveAmount(netAssetValue, "netAssetValue");
  const navPerShare = divideMarketDecimals(
    netAssetValue,
    definition.sharesOutstanding,
  );
  return {
    vehiclePublicId: definition.vehiclePublicId,
    grossAssetValue,
    netAssetValue,
    navPerShare,
    annualExpenseAmount: multiplyMarketDecimals(
      netAssetValue,
      definition.expenseRatioAnnual,
    ),
    annualTrackingDifferenceAmount: multiplyMarketDecimals(
      netAssetValue,
      definition.trackingDifferenceAnnual,
    ),
    holdingsWeightSum: round(
      holdings.reduce((sum, holding) => sum + holding.targetWeight, 0),
      10,
    ),
    activeHoldingCount: holdings.filter((holding) =>
      holding.available && !holding.suspended && !holding.delisted
    ).length,
    deterministic: true,
  };
}

export function calculateReferenceBenchmark(input: {
  readonly benchmarkPublicId: string;
  readonly observedAt: string;
  readonly components: readonly BenchmarkComponentInput[];
}): BenchmarkCalculationResult {
  if (!input.benchmarkPublicId.trim() || Number.isNaN(Date.parse(input.observedAt))) {
    throw new Error("Benchmark identity or observation time is invalid.");
  }
  if (input.components.length === 0 || input.components.length > 512) {
    throw new Error("Benchmark component count is invalid.");
  }
  const seen = new Set<string>();
  let weightSum = 0;
  let value = "0";
  for (const component of [...input.components].sort((left, right) =>
    left.componentPublicId.localeCompare(right.componentPublicId)
  )) {
    if (!component.componentPublicId.trim()) {
      throw new Error("Benchmark component identity is required.");
    }
    if (seen.has(component.componentPublicId)) {
      throw new Error("Benchmark component is duplicated.");
    }
    seen.add(component.componentPublicId);
    if (!component.available) {
      throw new Error("Benchmark component is unavailable.");
    }
    if (!Number.isFinite(component.weight) || component.weight < 0 ||
      component.weight > 1) {
      throw new Error("Benchmark component weight is invalid.");
    }
    assertNonNegativeAmount(component.observedValue, "benchmarkValue");
    weightSum += component.weight;
    value = addMarketDecimals(
      value,
      multiplyMarketDecimals(component.observedValue, component.weight),
    );
  }
  if (Math.abs(weightSum - 1) > 1e-8) {
    throw new Error("Benchmark weights must sum to one.");
  }
  assertPositiveAmount(value, "benchmarkValue");
  return {
    benchmarkPublicId: input.benchmarkPublicId,
    observedAt: input.observedAt,
    value,
    componentCount: input.components.length,
    weightSum: round(weightSum, 10),
    deterministic: true,
  };
}

function collectPositiveAmount(
  value: string,
  fieldName: string,
  errors: string[],
): void {
  try {
    if (compareMarketDecimals(value, "0") <= 0) {
      errors.push(`${fieldName}_not_positive`);
    }
  } catch {
    errors.push(`${fieldName}_invalid`);
  }
}

function collectNonNegativeAmount(
  value: string,
  fieldName: string,
  errors: string[],
): void {
  try {
    if (compareMarketDecimals(value, "0") < 0) {
      errors.push(`${fieldName}_negative`);
    }
  } catch {
    errors.push(`${fieldName}_invalid`);
  }
}
