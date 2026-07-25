import {
  addMarketDecimals,
  multiplyMarketDecimals,
} from "./decimalMath.ts";

export const CREDIT_RATINGS = [
  "AAA",
  "AA",
  "A",
  "BBB",
  "BB",
  "B",
  "CCC",
  "CC",
  "C",
  "D",
] as const;

export type CreditRating = typeof CREDIT_RATINGS[number];

export interface CreditTransitionMatrix {
  readonly matrixPublicId: string;
  readonly version: number;
  readonly rows: Readonly<
    Record<CreditRating, Readonly<Record<CreditRating, number>>>
  >;
  readonly activationAuthorized: false;
}

export interface CreditExposure {
  readonly instrumentPublicId: string;
  readonly currentRating: CreditRating;
  readonly exposureAtDefault: string;
  readonly recoveryRate: number;
}

export interface CreditTransitionAnalysis {
  readonly instrumentPublicId: string;
  readonly currentRating: CreditRating;
  readonly defaultProbability: number;
  readonly downgradeProbability: number;
  readonly upgradeProbability: number;
  readonly unchangedProbability: number;
  readonly expectedLoss: string;
  readonly expectedRatingIndex: number;
  readonly activationAuthorized: false;
  readonly deterministic: true;
}

export interface PortfolioCreditAnalysis {
  readonly totalExpectedLoss: string;
  readonly weightedDefaultProbability: number;
  readonly exposureCount: number;
  readonly analyses: readonly CreditTransitionAnalysis[];
  readonly deterministic: true;
}

export function validateCreditTransitionMatrix(
  matrix: CreditTransitionMatrix,
): void {
  if (!matrix.matrixPublicId.trim() || matrix.matrixPublicId.length > 180) {
    throw new Error("credit_matrix_public_id_invalid");
  }
  if (!Number.isInteger(matrix.version) || matrix.version < 1) {
    throw new Error("credit_matrix_version_invalid");
  }
  if (matrix.activationAuthorized !== false) {
    throw new Error("credit_matrix_activation_must_remain_disabled");
  }

  for (const sourceRating of CREDIT_RATINGS) {
    const row = matrix.rows[sourceRating];
    if (!row) throw new Error(`credit_matrix_row_missing:${sourceRating}`);
    let sum = 0;
    for (const targetRating of CREDIT_RATINGS) {
      const probability = row[targetRating];
      if (
        !Number.isFinite(probability) ||
        probability < 0 ||
        probability > 1
      ) {
        throw new Error(
          `credit_matrix_probability_invalid:${sourceRating}:${targetRating}`,
        );
      }
      sum += probability;
    }
    if (Math.abs(sum - 1) > 1e-9) {
      throw new Error(`credit_matrix_row_sum_invalid:${sourceRating}`);
    }
  }

  const defaultRow = matrix.rows.D;
  if (
    defaultRow.D !== 1 ||
    CREDIT_RATINGS.some((rating) =>
      rating !== "D" && defaultRow[rating] !== 0
    )
  ) {
    throw new Error("credit_matrix_default_state_must_be_absorbing");
  }
}

export function analyzeCreditExposure(
  exposure: CreditExposure,
  matrix: CreditTransitionMatrix,
): CreditTransitionAnalysis {
  validateCreditTransitionMatrix(matrix);
  validateExposure(exposure);
  const row = matrix.rows[exposure.currentRating];
  const currentIndex = CREDIT_RATINGS.indexOf(exposure.currentRating);
  let downgradeProbability = 0;
  let upgradeProbability = 0;
  let expectedRatingIndex = 0;

  for (const targetRating of CREDIT_RATINGS) {
    const targetIndex = CREDIT_RATINGS.indexOf(targetRating);
    const probability = row[targetRating];
    if (targetIndex > currentIndex) downgradeProbability += probability;
    if (targetIndex < currentIndex) upgradeProbability += probability;
    expectedRatingIndex += targetIndex * probability;
  }

  const defaultProbability = row.D;
  const lossGivenDefault = 1 - exposure.recoveryRate;
  return {
    instrumentPublicId: exposure.instrumentPublicId,
    currentRating: exposure.currentRating,
    defaultProbability: round(defaultProbability),
    downgradeProbability: round(downgradeProbability),
    upgradeProbability: round(upgradeProbability),
    unchangedProbability: round(row[exposure.currentRating]),
    expectedLoss: multiplyMarketDecimals(
      exposure.exposureAtDefault,
      defaultProbability * lossGivenDefault,
    ),
    expectedRatingIndex: round(expectedRatingIndex),
    activationAuthorized: false,
    deterministic: true,
  };
}

export function analyzeCreditPortfolio(
  exposures: readonly CreditExposure[],
  matrix: CreditTransitionMatrix,
): PortfolioCreditAnalysis {
  validateCreditTransitionMatrix(matrix);
  if (exposures.length === 0) throw new Error("credit_exposures_required");
  const ordered = [...exposures].sort((left, right) =>
    left.instrumentPublicId.localeCompare(right.instrumentPublicId)
  );
  const seen = new Set<string>();
  let totalExpectedLoss = "0";
  let totalExposure = 0;
  let weightedDefaultNumerator = 0;
  const analyses: CreditTransitionAnalysis[] = [];

  for (const exposure of ordered) {
    validateExposure(exposure);
    if (seen.has(exposure.instrumentPublicId)) {
      throw new Error("duplicate_credit_exposure");
    }
    seen.add(exposure.instrumentPublicId);
    const analysis = analyzeCreditExposure(exposure, matrix);
    analyses.push(analysis);
    totalExpectedLoss = addMarketDecimals(
      totalExpectedLoss,
      analysis.expectedLoss,
    );
    const numericExposure = Number(exposure.exposureAtDefault);
    totalExposure += numericExposure;
    weightedDefaultNumerator +=
      numericExposure * analysis.defaultProbability;
  }

  if (!Number.isFinite(totalExposure) || totalExposure <= 0) {
    throw new Error("credit_total_exposure_invalid");
  }
  return {
    totalExpectedLoss,
    weightedDefaultProbability: round(
      weightedDefaultNumerator / totalExposure,
    ),
    exposureCount: analyses.length,
    analyses,
    deterministic: true,
  };
}

export function selectDeterministicTransition(
  currentRating: CreditRating,
  unitIntervalDraw: number,
  matrix: CreditTransitionMatrix,
): CreditRating {
  validateCreditTransitionMatrix(matrix);
  if (
    !Number.isFinite(unitIntervalDraw) ||
    unitIntervalDraw < 0 ||
    unitIntervalDraw >= 1
  ) {
    throw new Error("credit_transition_draw_invalid");
  }
  let cumulative = 0;
  for (const targetRating of CREDIT_RATINGS) {
    cumulative += matrix.rows[currentRating][targetRating];
    if (unitIntervalDraw < cumulative) return targetRating;
  }
  return "D";
}

function validateExposure(exposure: CreditExposure): void {
  if (
    !exposure.instrumentPublicId.trim() ||
    exposure.instrumentPublicId.length > 180
  ) {
    throw new Error("credit_instrument_public_id_invalid");
  }
  const numericExposure = Number(exposure.exposureAtDefault);
  if (!Number.isFinite(numericExposure) || numericExposure <= 0) {
    throw new Error("credit_exposure_at_default_invalid");
  }
  if (
    !Number.isFinite(exposure.recoveryRate) ||
    exposure.recoveryRate < 0 ||
    exposure.recoveryRate > 1
  ) {
    throw new Error("credit_recovery_rate_invalid");
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
