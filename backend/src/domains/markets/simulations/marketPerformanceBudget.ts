import {
  addMarketDecimals,
  compareMarketDecimals,
  multiplyMarketDecimals,
} from "../calculations/decimalMath.ts";
import { stableReplayDigest } from "../state/marketReplayConcurrency.ts";

export interface MarketPerformanceRow {
  readonly instrumentPublicId: string;
  readonly quantity: string;
  readonly price: string;
  readonly weight: string;
}

export interface MarketPerformanceBudgetInput {
  readonly rows: readonly MarketPerformanceRow[];
  readonly passes: number;
  readonly maximumOperationCount: number;
}

export interface MarketPerformanceBudgetResult {
  readonly rowCount: number;
  readonly passes: number;
  readonly operationCount: number;
  readonly totalsByPass: readonly string[];
  readonly deterministicDigestFnv1a64: string;
  readonly withinBudget: true;
  readonly wallClockThresholdEnforced: false;
}

export function runDeterministicMarketPerformanceBudget(
  input: MarketPerformanceBudgetInput,
): MarketPerformanceBudgetResult {
  validateBudgetInput(input);
  const rows = [...input.rows].sort((left, right) =>
    left.instrumentPublicId.localeCompare(right.instrumentPublicId)
  );
  const operationCount = rows.length * input.passes * 3;
  if (operationCount > input.maximumOperationCount) {
    throw new Error("market_performance_operation_budget_exceeded");
  }
  const totalsByPass: string[] = [];
  for (let pass = 0; pass < input.passes; pass += 1) {
    let total = "0";
    for (const row of rows) {
      const grossValue = multiplyMarketDecimals(row.quantity, row.price);
      const weightedValue = multiplyMarketDecimals(grossValue, row.weight);
      total = addMarketDecimals(total, weightedValue);
    }
    totalsByPass.push(total);
  }
  return {
    rowCount: rows.length,
    passes: input.passes,
    operationCount,
    totalsByPass,
    deterministicDigestFnv1a64: stableReplayDigest([
      String(rows.length),
      String(input.passes),
      String(operationCount),
      ...rows.map((row) => [
        row.instrumentPublicId,
        row.quantity,
        row.price,
        row.weight,
      ].join("|")),
      ...totalsByPass,
    ]),
    withinBudget: true,
    wallClockThresholdEnforced: false,
  };
}

function validateBudgetInput(input: MarketPerformanceBudgetInput): void {
  if (!Number.isSafeInteger(input.passes) || input.passes < 1 || input.passes > 1000) {
    throw new Error("market_performance_passes_invalid");
  }
  if (
    !Number.isSafeInteger(input.maximumOperationCount) ||
    input.maximumOperationCount < 1 ||
    input.maximumOperationCount > 10_000_000
  ) {
    throw new Error("market_performance_budget_invalid");
  }
  if (input.rows.length < 1 || input.rows.length > 100_000) {
    throw new Error("market_performance_row_count_invalid");
  }
  const seen = new Set<string>();
  for (const row of input.rows) {
    if (!row.instrumentPublicId.trim() || row.instrumentPublicId.length > 180) {
      throw new Error("market_performance_instrument_id_invalid");
    }
    if (seen.has(row.instrumentPublicId)) {
      throw new Error("market_performance_duplicate_instrument");
    }
    seen.add(row.instrumentPublicId);
    if (compareMarketDecimals(row.quantity, "0") < 0) {
      throw new Error("market_performance_quantity_negative");
    }
    if (compareMarketDecimals(row.price, "0") < 0) {
      throw new Error("market_performance_price_negative");
    }
    if (compareMarketDecimals(row.weight, "0") < 0) {
      throw new Error("market_performance_weight_negative");
    }
  }
}
