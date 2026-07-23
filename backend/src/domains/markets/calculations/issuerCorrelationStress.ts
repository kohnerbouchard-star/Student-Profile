import type {
  FinancialMarketAssetClass,
  FinancialMarketCountryCode,
} from "../contracts/financialMarketContracts.ts";

export interface IssuerCorrelationStressPosition {
  readonly instrumentPublicId: string;
  readonly issuerPublicId: string;
  readonly countryCode: FinancialMarketCountryCode;
  readonly assetClass: FinancialMarketAssetClass;
  readonly currentValue: string;
  readonly standaloneLossRate: number;
}

export interface IssuerPairCorrelation {
  readonly leftIssuerPublicId: string;
  readonly rightIssuerPublicId: string;
  readonly correlation: number;
}

export interface IssuerStressContribution {
  readonly issuerPublicId: string;
  readonly currentValue: string;
  readonly standaloneLoss: string;
  readonly correlatedLossContribution: string;
  readonly portfolioValueWeight: number;
  readonly correlatedLossWeight: number;
}

export interface IssuerCorrelationStressResult {
  readonly totalPortfolioValue: string;
  readonly standaloneLossTotal: string;
  readonly correlatedTailLoss: string;
  readonly correlatedTailLossRate: number;
  readonly diversificationRatio: number;
  readonly topIssuerWeight: number;
  readonly issuerHerfindahlIndex: number;
  readonly issuerCount: number;
  readonly contributions: readonly IssuerStressContribution[];
  readonly correlationMatrixDigest: string;
  readonly activationAuthorized: false;
  readonly deterministic: true;
}

export function calculateIssuerCorrelationStress(
  positions: readonly IssuerCorrelationStressPosition[],
  correlations: readonly IssuerPairCorrelation[],
): IssuerCorrelationStressResult {
  if (positions.length === 0) throw new Error("issuer_stress_positions_required");

  const orderedPositions = [...positions].sort((left, right) =>
    left.instrumentPublicId.localeCompare(right.instrumentPublicId)
  );
  validateUniqueInstruments(orderedPositions);
  const grouped = groupByIssuer(orderedPositions);
  const issuerIds = [...grouped.keys()].sort();
  const matrix = buildCorrelationMatrix(issuerIds, correlations);
  const totalPortfolioValue = issuerIds.reduce(
    (total, issuerId) => total + requireValue(grouped.get(issuerId)).value,
    0,
  );
  if (totalPortfolioValue <= 0) throw new Error("issuer_stress_total_value_invalid");

  const standaloneLosses = issuerIds.map((issuerId) =>
    requireValue(grouped.get(issuerId)).standaloneLoss
  );
  const standaloneLossTotal = standaloneLosses.reduce(
    (total, loss) => total + loss,
    0,
  );
  const covarianceProducts = multiplyMatrixVector(matrix, standaloneLosses);
  const variance = standaloneLosses.reduce(
    (total, loss, index) => total + loss * covarianceProducts[index],
    0,
  );
  if (!Number.isFinite(variance) || variance < -1e-9) {
    throw new Error("issuer_stress_variance_invalid");
  }
  const correlatedTailLoss = Math.sqrt(Math.max(0, variance));
  const contributions = issuerIds.map((issuerId, index) => {
    const aggregate = requireValue(grouped.get(issuerId));
    const correlatedContribution = correlatedTailLoss === 0
      ? 0
      : standaloneLosses[index] * covarianceProducts[index] /
        correlatedTailLoss;
    return {
      issuerPublicId: issuerId,
      currentValue: formatNumber(aggregate.value),
      standaloneLoss: formatNumber(aggregate.standaloneLoss),
      correlatedLossContribution: formatNumber(correlatedContribution),
      portfolioValueWeight: round(aggregate.value / totalPortfolioValue),
      correlatedLossWeight: correlatedTailLoss === 0
        ? 0
        : round(correlatedContribution / correlatedTailLoss),
    };
  });

  const portfolioWeights = contributions.map((entry) =>
    entry.portfolioValueWeight
  );
  return {
    totalPortfolioValue: formatNumber(totalPortfolioValue),
    standaloneLossTotal: formatNumber(standaloneLossTotal),
    correlatedTailLoss: formatNumber(correlatedTailLoss),
    correlatedTailLossRate: round(correlatedTailLoss / totalPortfolioValue),
    diversificationRatio: correlatedTailLoss === 0
      ? 0
      : round(standaloneLossTotal / correlatedTailLoss),
    topIssuerWeight: round(Math.max(...portfolioWeights)),
    issuerHerfindahlIndex: round(
      portfolioWeights.reduce((total, weight) => total + weight ** 2, 0),
    ),
    issuerCount: issuerIds.length,
    contributions,
    correlationMatrixDigest: matrixDigest(issuerIds, matrix),
    activationAuthorized: false,
    deterministic: true,
  };
}

function groupByIssuer(
  positions: readonly IssuerCorrelationStressPosition[],
): Map<string, { value: number; standaloneLoss: number }> {
  const grouped = new Map<string, { value: number; standaloneLoss: number }>();
  for (const position of positions) {
    validatePosition(position);
    const value = Number(position.currentValue);
    const existing = grouped.get(position.issuerPublicId) ?? {
      value: 0,
      standaloneLoss: 0,
    };
    existing.value += value;
    existing.standaloneLoss += value * position.standaloneLossRate;
    grouped.set(position.issuerPublicId, existing);
  }
  return grouped;
}

function buildCorrelationMatrix(
  issuerIds: readonly string[],
  correlations: readonly IssuerPairCorrelation[],
): number[][] {
  const issuerIndex = new Map(issuerIds.map((issuerId, index) => [issuerId, index]));
  const matrix = issuerIds.map((_, row) =>
    issuerIds.map((__, column) => row === column ? 1 : 0)
  );
  const seenPairs = new Set<string>();
  for (const pair of [...correlations].sort(compareCorrelationPairs)) {
    validateIdentity(pair.leftIssuerPublicId, "left_issuer_public_id_invalid");
    validateIdentity(pair.rightIssuerPublicId, "right_issuer_public_id_invalid");
    if (pair.leftIssuerPublicId === pair.rightIssuerPublicId) {
      throw new Error("issuer_correlation_self_pair_prohibited");
    }
    if (!Number.isFinite(pair.correlation) || pair.correlation < -1 || pair.correlation > 1) {
      throw new Error("issuer_correlation_invalid");
    }
    const leftIndex = issuerIndex.get(pair.leftIssuerPublicId);
    const rightIndex = issuerIndex.get(pair.rightIssuerPublicId);
    if (leftIndex === undefined || rightIndex === undefined) {
      throw new Error("issuer_correlation_unknown_issuer");
    }
    const key = [pair.leftIssuerPublicId, pair.rightIssuerPublicId].sort().join("\u0000");
    if (seenPairs.has(key)) throw new Error("duplicate_issuer_correlation_pair");
    seenPairs.add(key);
    matrix[leftIndex][rightIndex] = pair.correlation;
    matrix[rightIndex][leftIndex] = pair.correlation;
  }
  assertPositiveSemidefinite(matrix);
  return matrix;
}

function assertPositiveSemidefinite(matrix: readonly (readonly number[])[]): void {
  const tolerance = 1e-9;
  const lower = matrix.map((row) => row.map(() => 0));
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let residual = matrix[row][column];
      for (let index = 0; index < column; index += 1) {
        residual -= lower[row][index] * lower[column][index];
      }
      if (row === column) {
        if (residual < -tolerance) {
          throw new Error("issuer_correlation_matrix_not_positive_semidefinite");
        }
        lower[row][column] = Math.sqrt(Math.max(0, residual));
      } else if (lower[column][column] > tolerance) {
        lower[row][column] = residual / lower[column][column];
      } else if (Math.abs(residual) > tolerance) {
        throw new Error("issuer_correlation_matrix_not_positive_semidefinite");
      }
    }
  }
}

function multiplyMatrixVector(
  matrix: readonly (readonly number[])[],
  vector: readonly number[],
): number[] {
  return matrix.map((row) =>
    row.reduce((total, coefficient, index) =>
      total + coefficient * vector[index], 0)
  );
}

function validatePosition(position: IssuerCorrelationStressPosition): void {
  validateIdentity(position.instrumentPublicId, "stress_instrument_public_id_invalid");
  validateIdentity(position.issuerPublicId, "stress_issuer_public_id_invalid");
  const value = Number(position.currentValue);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value * 1_000_000))) {
    throw new Error("issuer_stress_position_value_invalid");
  }
  if (
    !Number.isFinite(position.standaloneLossRate) ||
    position.standaloneLossRate < 0 ||
    position.standaloneLossRate > 1
  ) {
    throw new Error("issuer_stress_loss_rate_invalid");
  }
}

function validateUniqueInstruments(
  positions: readonly IssuerCorrelationStressPosition[],
): void {
  const seen = new Set<string>();
  for (const position of positions) {
    if (seen.has(position.instrumentPublicId)) {
      throw new Error("duplicate_issuer_stress_instrument");
    }
    seen.add(position.instrumentPublicId);
  }
}

function validateIdentity(value: string, errorCode: string): void {
  if (!value.trim() || value.length > 180) throw new Error(errorCode);
}

function compareCorrelationPairs(
  left: IssuerPairCorrelation,
  right: IssuerPairCorrelation,
): number {
  return left.leftIssuerPublicId.localeCompare(right.leftIssuerPublicId) ||
    left.rightIssuerPublicId.localeCompare(right.rightIssuerPublicId);
}

function matrixDigest(
  issuerIds: readonly string[],
  matrix: readonly (readonly number[])[],
): string {
  const canonical = JSON.stringify([
    issuerIds,
    matrix.map((row) => row.map(round)),
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function requireValue<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("issuer_stress_internal_value_missing");
  return value;
}

function formatNumber(value: number): string {
  return round(value).toString();
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
