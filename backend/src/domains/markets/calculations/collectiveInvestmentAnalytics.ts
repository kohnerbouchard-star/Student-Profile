import type {
  FinancialMarketWeightingMethod,
} from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  marketDecimalToNumber,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "./decimalMath.ts";

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

export interface IndexComponentInput {
  readonly componentPublicId: string;
  readonly currentPrice: string;
  readonly basePrice: string;
  readonly marketCapitalization: string;
  readonly floatFactor: number;
  readonly fundamentalScore: number;
  readonly targetWeight: number | null;
  readonly eligible: boolean;
  readonly suspended: boolean;
  readonly delisted: boolean;
}

export interface IndexMethodologyInput {
  readonly indexPublicId: string;
  readonly weightingMethod: FinancialMarketWeightingMethod;
  readonly baseDate: string;
  readonly baseValue: string;
  readonly divisor: string;
  readonly maximumConstituentWeight: number;
  readonly minimumConstituents: number;
  readonly maximumConstituents: number;
  readonly methodologyVersion: string;
}

export interface IndexCalculationResult {
  readonly indexPublicId: string;
  readonly value: string;
  readonly divisor: string;
  readonly totalWeightedMarketValue: string;
  readonly constituentWeights: Readonly<Record<string, number>>;
  readonly constituentPublicIds: readonly string[];
  readonly methodologyVersion: string;
  readonly deterministic: true;
}

export interface DeterministicRebalanceInput {
  readonly methodology: IndexMethodologyInput;
  readonly candidates: readonly IndexComponentInput[];
  readonly effectiveAt: string;
  readonly priorValue?: string | null;
  readonly priorConstituents?: readonly IndexComponentInput[];
}

export interface DeterministicRebalanceResult {
  readonly effectiveAt: string;
  readonly selected: readonly IndexComponentInput[];
  readonly removedComponentPublicIds: readonly string[];
  readonly addedComponentPublicIds: readonly string[];
  readonly adjustedDivisor: string;
  readonly continuityValueBefore: string | null;
  readonly continuityValueAfter: string | null;
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

export function calculateIndexValue(
  methodology: IndexMethodologyInput,
  components: readonly IndexComponentInput[],
): IndexCalculationResult {
  validateIndexMethodology(methodology);
  const eligible = components.filter((component) =>
    component.eligible && !component.suspended && !component.delisted
  );
  if (eligible.length < methodology.minimumConstituents ||
    eligible.length > methodology.maximumConstituents) {
    throw new Error("Index constituent count violates methodology.");
  }
  validateIndexComponents(eligible);
  const weights = calculateWeights(methodology, eligible);
  let totalWeightedMarketValue = "0";
  for (const component of eligible) {
    totalWeightedMarketValue = addMarketDecimals(
      totalWeightedMarketValue,
      multiplyMarketDecimals(
        component.currentPrice,
        weights[component.componentPublicId],
      ),
    );
  }
  const value = divideMarketDecimals(
    totalWeightedMarketValue,
    methodology.divisor,
  );
  assertPositiveAmount(value, "indexValue");
  return {
    indexPublicId: methodology.indexPublicId,
    value,
    divisor: methodology.divisor,
    totalWeightedMarketValue,
    constituentWeights: weights,
    constituentPublicIds: eligible
      .map((component) => component.componentPublicId)
      .sort(),
    methodologyVersion: methodology.methodologyVersion,
    deterministic: true,
  };
}

export function rebalanceIndexDeterministically(
  input: DeterministicRebalanceInput,
): DeterministicRebalanceResult {
  validateIndexMethodology(input.methodology);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input.effectiveAt) ||
    Number.isNaN(Date.parse(input.effectiveAt))) {
    throw new Error("Rebalance effectiveAt must be an ISO timestamp.");
  }
  const candidates = input.candidates
    .filter((component) =>
      component.eligible && !component.suspended && !component.delisted
    )
    .sort((left, right) =>
      scoreCandidate(right, input.methodology.weightingMethod) -
        scoreCandidate(left, input.methodology.weightingMethod) ||
      left.componentPublicId.localeCompare(right.componentPublicId)
    );
  validateIndexComponents(candidates);
  if (candidates.length < input.methodology.minimumConstituents) {
    throw new Error("Not enough eligible candidates for deterministic rebalance.");
  }
  const selected = candidates.slice(0, input.methodology.maximumConstituents);
  const selectedIds = new Set(
    selected.map((component) => component.componentPublicId),
  );
  const priorIds = new Set(
    (input.priorConstituents ?? []).map((component) =>
      component.componentPublicId
    ),
  );
  const removedComponentPublicIds = [...priorIds]
    .filter((id) => !selectedIds.has(id))
    .sort();
  const addedComponentPublicIds = [...selectedIds]
    .filter((id) => !priorIds.has(id))
    .sort();
  let adjustedDivisor = input.methodology.divisor;
  let continuityValueBefore: string | null = null;
  let continuityValueAfter: string | null = null;

  if (input.priorValue &&
    input.priorConstituents && input.priorConstituents.length > 0) {
    assertPositiveAmount(input.priorValue, "priorValue");
    const provisional = calculateIndexValue(
      { ...input.methodology, divisor: "1" },
      selected,
    );
    adjustedDivisor = divideMarketDecimals(
      provisional.totalWeightedMarketValue,
      input.priorValue,
    );
    const continued = calculateIndexValue(
      { ...input.methodology, divisor: adjustedDivisor },
      selected,
    );
    continuityValueBefore = input.priorValue;
    continuityValueAfter = continued.value;
    if (Math.abs(
      marketDecimalToNumber(continued.value) -
        marketDecimalToNumber(input.priorValue),
    ) > 0.00001) {
      throw new Error("Index divisor adjustment failed historical continuity.");
    }
  }

  return {
    effectiveAt: input.effectiveAt,
    selected,
    removedComponentPublicIds,
    addedComponentPublicIds,
    adjustedDivisor,
    continuityValueBefore,
    continuityValueAfter,
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

function calculateWeights(
  methodology: IndexMethodologyInput,
  components: readonly IndexComponentInput[],
): Readonly<Record<string, number>> {
  const remaining = components.map((component) => ({
    componentPublicId: component.componentPublicId,
    score: rawWeightScore(component, methodology.weightingMethod),
  }));
  if (remaining.some((entry) =>
    !Number.isFinite(entry.score) || entry.score < 0
  )) {
    throw new Error("Index weighting input is invalid.");
  }
  if (remaining.every((entry) => entry.score === 0)) {
    throw new Error("Index weights have no positive basis.");
  }

  const weights: Record<string, number> = {};
  let unallocated = 1;
  let active = [...remaining];
  for (let iteration = 0; iteration < components.length + 1; iteration += 1) {
    const totalScore = active.reduce((sum, entry) => sum + entry.score, 0);
    if (active.length === 0 || totalScore <= 0 || unallocated < -1e-12) {
      throw new Error("Index concentration cap cannot be satisfied.");
    }
    const overCap = active.filter((entry) =>
      (entry.score / totalScore) * unallocated >
        methodology.maximumConstituentWeight + 1e-12
    );
    if (overCap.length === 0) {
      for (const entry of active) {
        weights[entry.componentPublicId] =
          (entry.score / totalScore) * unallocated;
      }
      unallocated = 0;
      break;
    }
    for (const entry of overCap) {
      weights[entry.componentPublicId] =
        methodology.maximumConstituentWeight;
      unallocated -= methodology.maximumConstituentWeight;
    }
    const capped = new Set(overCap.map((entry) => entry.componentPublicId));
    active = active.filter((entry) => !capped.has(entry.componentPublicId));
  }

  const sum = Object.values(weights)
    .reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > 1e-8 ||
    Object.values(weights).some((weight) =>
      weight < -1e-12 ||
      weight > methodology.maximumConstituentWeight + 1e-8
    )) {
    throw new Error("Index weighting failed concentration validation.");
  }
  const entries: Array<[string, number]> = Object.entries(weights)
    .map(([id, weight]): [string, number] => [id, round(weight, 12)]);
  entries.sort((left, right) => left[0].localeCompare(right[0]));
  return Object.fromEntries(entries);
}

function rawWeightScore(
  component: IndexComponentInput,
  method: FinancialMarketWeightingMethod,
): number {
  if (method === "equal_weight") return 1;
  if (method === "fixed_weight") return component.targetWeight ?? 0;
  if (method === "price_weight") {
    return marketDecimalToNumber(component.currentPrice);
  }
  if (method === "market_cap") {
    return marketDecimalToNumber(component.marketCapitalization);
  }
  if (method === "float_adjusted_market_cap") {
    return marketDecimalToNumber(component.marketCapitalization) *
      component.floatFactor;
  }
  return component.fundamentalScore;
}

function scoreCandidate(
  component: IndexComponentInput,
  method: FinancialMarketWeightingMethod,
): number {
  return rawWeightScore(component, method);
}

function validateIndexMethodology(
  methodology: IndexMethodologyInput,
): void {
  if (!methodology.indexPublicId.trim() ||
    !methodology.methodologyVersion.trim()) {
    throw new Error("Index identity and methodology version are required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(methodology.baseDate) ||
    Number.isNaN(Date.parse(`${methodology.baseDate}T00:00:00.000Z`))) {
    throw new Error("Index base date is invalid.");
  }
  assertPositiveAmount(methodology.baseValue, "baseValue");
  assertPositiveAmount(methodology.divisor, "divisor");
  if (!Number.isFinite(methodology.maximumConstituentWeight) ||
    methodology.maximumConstituentWeight <= 0 ||
    methodology.maximumConstituentWeight > 1 ||
    !Number.isInteger(methodology.minimumConstituents) ||
    !Number.isInteger(methodology.maximumConstituents) ||
    methodology.minimumConstituents < 1 ||
    methodology.maximumConstituents < methodology.minimumConstituents ||
    methodology.maximumConstituents > 1_000 ||
    methodology.maximumConstituentWeight *
      methodology.minimumConstituents < 1 - 1e-8) {
    throw new Error("Index methodology bounds are invalid.");
  }
}

function validateIndexComponents(
  components: readonly IndexComponentInput[],
): void {
  const seen = new Set<string>();
  for (const component of components) {
    if (!component.componentPublicId.trim()) {
      throw new Error("Index component identity is required.");
    }
    if (seen.has(component.componentPublicId)) {
      throw new Error("Index component is duplicated.");
    }
    seen.add(component.componentPublicId);
    assertPositiveAmount(component.currentPrice, "currentPrice");
    assertPositiveAmount(component.basePrice, "basePrice");
    assertNonNegativeAmount(
      component.marketCapitalization,
      "marketCapitalization",
    );
    if (!Number.isFinite(component.floatFactor) ||
      component.floatFactor < 0 || component.floatFactor > 1 ||
      !Number.isFinite(component.fundamentalScore) ||
      component.fundamentalScore < 0 ||
      (component.targetWeight !== null &&
        (!Number.isFinite(component.targetWeight) ||
          component.targetWeight < 0 || component.targetWeight > 1))) {
      throw new Error("Index component factors are invalid.");
    }
  }
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

function assertPositiveAmount(value: string, fieldName: string): void {
  try {
    if (compareMarketDecimals(value, "0") <= 0) {
      throw new Error(`${fieldName} must be positive.`);
    }
  } catch (error) {
    if (error instanceof Error &&
      error.message === `${fieldName} must be positive.`) {
      throw error;
    }
    throw new Error(`${fieldName} is invalid.`);
  }
}

function assertNonNegativeAmount(value: string, fieldName: string): void {
  try {
    if (compareMarketDecimals(value, "0") < 0) {
      throw new Error(`${fieldName} must be non-negative.`);
    }
  } catch (error) {
    if (error instanceof Error &&
      error.message === `${fieldName} must be non-negative.`) {
      throw error;
    }
    throw new Error(`${fieldName} is invalid.`);
  }
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
