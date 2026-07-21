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
  readonly componentKind: "instrument" | "benchmark" | "fund" | "trust";
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
  if (!definition.vehiclePublicId || !definition.administratorIssuerPublicId) {
    errors.push("vehicle_identity_required");
  }
  validatePositiveAmount(definition.sharesOutstanding, "sharesOutstanding", errors);
  validateNonNegativeAmount(definition.cash, "cash", errors);
  validateNonNegativeAmount(definition.liabilities, "liabilities", errors);
  if (!Number.isFinite(definition.expenseRatioAnnual) ||
    definition.expenseRatioAnnual < 0 || definition.expenseRatioAnnual > 0.2) {
    errors.push("expense_ratio_out_of_bounds");
  }
  if (!Number.isFinite(definition.trackingDifferenceAnnual) ||
    Math.abs(definition.trackingDifferenceAnnual) > 0.2) {
    errors.push("tracking_difference_out_of_bounds");
  }
  if (!Number.isFinite(definition.maximumComponentWeight) ||
    definition.maximumComponentWeight <= 0 || definition.maximumComponentWeight > 1) {
    errors.push("maximum_component_weight_invalid");
  }
  if (definition.circularHoldingsApproved !== false) {
    errors.push("circular_holdings_must_remain_unapproved");
  }
  if (definition.activationAuthorized !== false) {
    errors.push("vehicle_activation_not_disabled");
  }
  if (!definition.sourceVersion.trim()) errors.push("vehicle_source_version_required");

  const seen = new Set<string>();
  let weightSum = 0;
  for (const holding of [...holdings].sort((a, b) =>
    a.componentPublicId.localeCompare(b.componentPublicId)
  )) {
    if (!holding.componentPublicId) errors.push("holding_identity_required");
    if (seen.has(holding.componentPublicId)) errors.push("duplicate_holding");
    seen.add(holding.componentPublicId);
    validateNonNegativeAmount(holding.quantity, "holdingQuantity", errors);
    validateNonNegativeAmount(holding.price, "holdingPrice", errors);
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
  if (Math.abs(weightSum - 1) > 1e-8) errors.push("holding_weights_do_not_sum_to_one");
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
  if (!validation.valid) throw new Error(`Invalid collective investment: ${validation.errors.join(",")}`);
  let holdingsValue = "0";
  for (const holding of holdings) {
    holdingsValue = addMarketDecimals(
      holdingsValue,
      multiplyMarketDecimals(holding.quantity, holding.price),
    );
  }
  const grossAssetValue = addMarketDecimals(holdingsValue, definition.cash);
  const netAssetValue = subtractMarketDecimals(grossAssetValue, definition.liabilities);
  if (compareMarketDecimals(netAssetValue, "0") <= 0) {
    throw new Error("Collective investment NAV must remain positive.");
  }
  const navPerShare = divideMarketDecimals(
    netAssetValue,
    definition.sharesOutstanding,
  );
  const annualExpenseAmount = multiplyMarketDecimals(
    netAssetValue,
    definition.expenseRatioAnnual,
  );
  const annualTrackingDifferenceAmount = multiplyMarketDecimals(
    netAssetValue,
    definition.trackingDifferenceAnnual,
  );
  return {
    vehiclePublicId: definition.vehiclePublicId,
    grossAssetValue,
    netAssetValue,
    navPerShare,
    annualExpenseAmount,
    annualTrackingDifferenceAmount,
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
  reportDuplicateComponents(eligible);
  const weights = calculateWeights(methodology, eligible);
  let totalWeightedMarketValue = "0";
  for (const component of eligible) {
    const weighted = multiplyMarketDecimals(
      component.currentPrice,
      weights[component.componentPublicId],
    );
    totalWeightedMarketValue = addMarketDecimals(totalWeightedMarketValue, weighted);
  }
  const value = divideMarketDecimals(totalWeightedMarketValue, methodology.divisor);
  if (compareMarketDecimals(value, "0") <= 0) throw new Error("Index value must remain positive.");
  return {
    indexPublicId: methodology.indexPublicId,
    value,
    divisor: methodology.divisor,
    totalWeightedMarketValue,
    constituentWeights: weights,
    constituentPublicIds: eligible.map((component) => component.componentPublicId).sort(),
    methodologyVersion: methodology.methodologyVersion,
    deterministic: true,
  };
}

export function rebalanceIndexDeterministically(
  input: DeterministicRebalanceInput,
): DeterministicRebalanceResult {
  validateIndexMethodology(input.methodology);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input.effectiveAt)) {
    throw new Error("Rebalance effectiveAt must be an ISO timestamp.");
  }
  const candidates = input.candidates
    .filter((component) => component.eligible && !component.suspended && !component.delisted)
    .sort((left, right) =>
      scoreCandidate(right, input.methodology.weightingMethod) -
        scoreCandidate(left, input.methodology.weightingMethod) ||
      left.componentPublicId.localeCompare(right.componentPublicId)
    );
  if (candidates.length < input.methodology.minimumConstituents) {
    throw new Error("Not enough eligible candidates for deterministic rebalance.");
  }
  const selected = candidates.slice(0, input.methodology.maximumConstituents);
  const selectedIds = new Set(selected.map((component) => component.componentPublicId));
  const priorIds = new Set((input.priorConstituents ?? []).map((component) =>
    component.componentPublicId
  ));
  const removedComponentPublicIds = [...priorIds].filter((id) => !selectedIds.has(id)).sort();
  const addedComponentPublicIds = [...selectedIds].filter((id) => !priorIds.has(id)).sort();
  let adjustedDivisor = input.methodology.divisor;
  let continuityValueBefore: string | null = null;
  let continuityValueAfter: string | null = null;
  if (input.priorValue && input.priorConstituents && input.priorConstituents.length > 0) {
    validatePositiveAmount(input.priorValue, "priorValue", []);
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
    if (Math.abs(marketDecimalToNumber(continued.value) -
      marketDecimalToNumber(input.priorValue)) > 0.00001) {
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
  if (!input.benchmarkPublicId || Number.isNaN(Date.parse(input.observedAt))) {
    throw new Error("Benchmark identity or observation time is invalid.");
  }
  if (input.components.length === 0 || input.components.length > 512) {
    throw new Error("Benchmark component count is invalid.");
  }
  const seen = new Set<string>();
  let weightSum = 0;
  let value = "0";
  for (const component of [...input.components].sort((a, b) =>
    a.componentPublicId.localeCompare(b.componentPublicId)
  )) {
    if (seen.has(component.componentPublicId)) throw new Error("Benchmark component is duplicated.");
    seen.add(component.componentPublicId);
    if (!component.available) throw new Error("Benchmark component is unavailable.");
    if (!Number.isFinite(component.weight) || component.weight < 0 || component.weight > 1) {
      throw new Error("Benchmark component weight is invalid.");
    }
    validateNonNegativeAmount(component.observedValue, "benchmarkValue", []);
    weightSum += component.weight;
    value = addMarketDecimals(
      value,
      multiplyMarketDecimals(component.observedValue, component.weight),
    );
  }
  if (Math.abs(weightSum - 1) > 1e-8) throw new Error("Benchmark weights must sum to one.");
  if (compareMarketDecimals(value, "0") <= 0) throw new Error("Benchmark value must remain positive.");
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
  const raw = components.map((component) => ({
    componentPublicId: component.componentPublicId,
    score: rawWeightScore(component, methodology.weightingMethod),
  }));
  if (raw.some((entry) => !Number.isFinite(entry.score) || entry.score < 0)) {
    throw new Error("Index weighting input is invalid.");
  }
  if (raw.every((entry) => entry.score === 0)) throw new Error("Index weights have no positive basis.");
  let weights = normalizeWeights(raw);
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const over = Object.entries(weights).filter(([, weight]) =>
      weight > methodology.maximumConstituentWeight + 1e-12
    );
    if (over.length === 0) break;
    const cappedIds = new Set(over.map(([id]) => id));
    const cappedTotal = cappedIds.size * methodology.maximumConstituentWeight;
    const uncapped = raw.filter((entry) => !cappedIds.has(entry.componentPublicId));
    const uncappedScore = uncapped.reduce((sum, entry) => sum + entry.score, 0);
    if (uncapped.length === 0 || cappedTotal >= 1 || uncappedScore <= 0) {
      throw new Error("Index concentration cap cannot be satisfied.");
    }
    const next: Record<string, number> = {};
    for (const entry of raw) {
      next[entry.componentPublicId] = cappedIds.has(entry.componentPublicId)
        ? methodology.maximumConstituentWeight
        : (entry.score / uncappedScore) * (1 - cappedTotal);
    }
    weights = next;
  }
  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > 1e-8 ||
    Object.values(weights).some((weight) =>
      weight > methodology.maximumConstituentWeight + 1e-8
    )) {
    throw new Error("Index weighting failed concentration validation.");
  }
  return Object.fromEntries(Object.entries(weights)
    .map(([id, weight]) => [id, round(weight, 12)])
    .sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeWeights(
  entries: readonly { readonly componentPublicId: string; readonly score: number }[],
): Record<string, number> {
  const total = entries.reduce((sum, entry) => sum + entry.score, 0);
  return Object.fromEntries(entries.map((entry) => [
    entry.componentPublicId,
    entry.score / total,
  ]));
}

function rawWeightScore(
  component: IndexComponentInput,
  method: FinancialMarketWeightingMethod,
): number {
  if (method === "equal_weight") return 1;
  if (method === "fixed_weight") return component.targetWeight ?? 0;
  if (method === "price_weight") return marketDecimalToNumber(component.currentPrice);
  if (method === "market_cap") return marketDecimalToNumber(component.marketCapitalization);
  if (method === "float_adjusted_market_cap") {
    return marketDecimalToNumber(component.marketCapitalization) * component.floatFactor;
  }
  return component.fundamentalScore;
}

function scoreCandidate(
  component: IndexComponentInput,
  method: FinancialMarketWeightingMethod,
): number {
  return rawWeightScore(component, method);
}

function validateIndexMethodology(methodology: IndexMethodologyInput): void {
  if (!methodology.indexPublicId || !methodology.methodologyVersion.trim()) {
    throw new Error("Index identity and methodology version are required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(methodology.baseDate)) {
    throw new Error("Index base date is invalid.");
  }
  validatePositiveAmount(methodology.baseValue, "baseValue", []);
  validatePositiveAmount(methodology.divisor, "divisor", []);
  if (!Number.isFinite(methodology.maximumConstituentWeight) ||
    methodology.maximumConstituentWeight <= 0 ||
    methodology.maximumConstituentWeight > 1 ||
    !Number.isInteger(methodology.minimumConstituents) ||
    !Number.isInteger(methodology.maximumConstituents) ||
    methodology.minimumConstituents < 1 ||
    methodology.maximumConstituents < methodology.minimumConstituents ||
    methodology.maximumConstituents > 1_000 ||
    methodology.maximumConstituentWeight * methodology.minimumConstituents < 1 - 1e-8) {
    throw new Error("Index methodology bounds are invalid.");
  }
}

function reportDuplicateComponents(components: readonly IndexComponentInput[]): void {
  const seen = new Set<string>();
  for (const component of components) {
    if (seen.has(component.componentPublicId)) throw new Error("Index component is duplicated.");
    seen.add(component.componentPublicId);
    validatePositiveAmount(component.currentPrice, "currentPrice", []);
    validatePositiveAmount(component.basePrice, "basePrice", []);
    validateNonNegativeAmount(component.marketCapitalization, "marketCapitalization", []);
    if (!Number.isFinite(component.floatFactor) || component.floatFactor < 0 ||
      component.floatFactor > 1 || !Number.isFinite(component.fundamentalScore) ||
      component.fundamentalScore < 0) {
      throw new Error("Index component factors are invalid.");
    }
  }
}

function validatePositiveAmount(
  value: string,
  fieldName: string,
  errors: string[],
): void {
  try {
    if (compareMarketDecimals(value, "0") <= 0) errors.push(`${fieldName}_not_positive`);
  } catch {
    errors.push(`${fieldName}_invalid`);
  }
  if (errors.length > 0 && errors[errors.length - 1].startsWith(fieldName)) {
    if (errors === EMPTY_ERRORS) throw new Error(`${fieldName} must be positive.`);
  }
}

function validateNonNegativeAmount(
  value: string,
  fieldName: string,
  errors: string[],
): void {
  try {
    if (compareMarketDecimals(value, "0") < 0) errors.push(`${fieldName}_negative`);
  } catch {
    errors.push(`${fieldName}_invalid`);
  }
}

const EMPTY_ERRORS: string[] = [];

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
