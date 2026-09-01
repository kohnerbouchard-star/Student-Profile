import {
  BUSINESS_TREASURY_BUSINESS_KEY_PATTERN,
} from "../contracts/businessTreasuryContracts.ts";

const PAYROLL_PERIOD_KEY_PATTERN = /^payroll:[1-9][0-9]{0,18}$/u;
const OPERATING_PERIOD_CLAIM_KEY_PATTERN = /^bocl_[0-9a-f]{32}$/u;
const OPERATING_PERIOD_RECEIPT_KEY_PATTERN = /^bopr_[0-9a-f]{32}$/u;
const PAYROLL_RUN_KEY_PATTERN = /^pyr_[0-9a-f]{32}$/u;
const PAYROLL_RECOVERY_REQUEST_KEY_PATTERN = /^pyrx_[0-9a-f]{32}$/u;
const TAX_ASSESSMENT_KEY_PATTERN = /^bgta_[0-9a-f]{32}$/u;
const TAX_PAYMENT_KEY_PATTERN = /^bgtp_[0-9a-f]{32}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface BusinessOperatingPeriodClaim {
  readonly claimKey: string;
  readonly businessKey: string;
  readonly payrollPeriodKey: string;
  /** Kept as canonical decimal text so PostgreSQL bigint identity is lossless. */
  readonly periodNumber: string;
  readonly dueAt: string;
  readonly leaseToken: string;
  readonly leaseExpiresAt: string;
}

export interface BusinessOperatingPeriodCloseResult {
  readonly closeReceiptKey: string;
  readonly businessKey: string;
  readonly payrollPeriodKey: string;
  readonly replayed: boolean;
}

export interface BusinessOperatingPeriodReleaseResult {
  readonly claimKey: string;
  readonly claimStatus: "released";
  readonly replayed: boolean;
}

export interface BusinessPayrollLiabilityRecoveryResult {
  readonly recoveryRequestKey: string;
  readonly payrollRunKey: string;
  readonly businessKey: string;
  readonly payrollStatus: "completed" | "partially_paid" | "unpaid";
  readonly recovered: boolean;
  readonly liabilityRemaining: boolean;
  readonly replayed: boolean;
}

export interface BusinessTaxLiabilityRecoveryResult {
  readonly taxAssessmentKey: string;
  readonly taxPaymentKey: string | null;
  readonly businessKey: string;
  readonly taxStatus: "paid" | "partially_paid" | "unpaid";
  readonly recovered: boolean;
  readonly liabilityRemaining: boolean;
}

export interface BusinessOperationsWorkerRepository {
  recoverPayrollLiabilities(input: {
    readonly batchLimit: number;
  }): Promise<readonly BusinessPayrollLiabilityRecoveryResult[]>;
  recoverTaxLiabilities(input: {
    readonly batchLimit: number;
  }): Promise<readonly BusinessTaxLiabilityRecoveryResult[]>;
  claimDueOperatingPeriods(input: {
    readonly batchLimit: number;
  }): Promise<readonly BusinessOperatingPeriodClaim[]>;
  closeClaimedOperatingPeriod(input: {
    readonly claim: BusinessOperatingPeriodClaim;
    readonly idempotencyKey: string;
  }): Promise<BusinessOperatingPeriodCloseResult>;
  releaseOperatingPeriodLease(input: {
    readonly claim: BusinessOperatingPeriodClaim;
    readonly reasonCode: string;
    readonly idempotencyKey: string;
  }): Promise<BusinessOperatingPeriodReleaseResult>;
}

export interface BusinessOperationsWorkerResult {
  readonly recoveryScannedCount: number;
  readonly recoveredCount: number;
  readonly recoveryReplayedCount: number;
  readonly recoveryDeferredCount: number;
  readonly taxRecoveryScannedCount: number;
  readonly taxRecoveredCount: number;
  readonly taxRecoveryDeferredCount: number;
  readonly claimedCount: number;
  readonly closedCount: number;
  readonly replayedCount: number;
  readonly failedCount: number;
  readonly releasedCount: number;
  readonly releaseFailedCount: number;
}

export class BusinessOperationsWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 500,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "BusinessOperationsWorkerError";
  }
}

/**
 * Runs one globally bounded due-work batch. The database owns due time, scope,
 * payroll/tax inputs, transactionality and lease validity; this service first
 * gives earlier unpaid wages and assessed tax a bounded recovery attempt,
 * then sequences the three operating-period RPCs and returns privacy-safe
 * aggregate counts.
 */
export async function runBusinessOperationsWorker(input: {
  readonly repository: BusinessOperationsWorkerRepository;
  readonly batchLimit?: number;
}): Promise<BusinessOperationsWorkerResult> {
  const batchLimit = input.batchLimit ?? 25;
  if (!Number.isSafeInteger(batchLimit) || batchLimit < 1 || batchLimit > 100) {
    throw new BusinessOperationsWorkerError(
      "business_operating_period_batch_limit_invalid",
      "Business operations worker batch configuration is invalid.",
      500,
      false,
    );
  }

  const recoveries = await input.repository.recoverPayrollLiabilities({
    batchLimit,
  });
  assertRecoveryResults(recoveries, batchLimit);
  const recoveredCount = recoveries.filter((result) => result.recovered).length;
  const recoveryReplayedCount = recoveries.filter((result) => result.replayed)
    .length;
  const recoveryDeferredCount = recoveries.filter((result) =>
    result.liabilityRemaining
  ).length;

  const taxRecoveries = await input.repository.recoverTaxLiabilities({
    batchLimit,
  });
  assertTaxRecoveryResults(taxRecoveries, batchLimit);
  const taxRecoveredCount = taxRecoveries.filter((result) => result.recovered)
    .length;
  const taxRecoveryDeferredCount = taxRecoveries.filter((result) =>
    result.liabilityRemaining
  ).length;

  const claims = await input.repository.claimDueOperatingPeriods({
    batchLimit,
  });
  const ordered = [...claims].sort((left, right) =>
    compare(left.dueAt, right.dueAt) || compare(left.claimKey, right.claimKey)
  );
  assertClaims(ordered, batchLimit);

  let closedCount = 0;
  let replayedCount = 0;
  let failedCount = 0;
  let releasedCount = 0;
  let releaseFailedCount = 0;

  for (const claim of ordered) {
    try {
      const close = await input.repository.closeClaimedOperatingPeriod({
        claim,
        idempotencyKey: `business-period-close:${claim.claimKey}`,
      });
      assertCloseResult(close, claim);
      if (close.replayed) replayedCount += 1;
      else closedCount += 1;
    } catch (error) {
      failedCount += 1;
      try {
        const release = await input.repository.releaseOperatingPeriodLease({
          claim,
          reasonCode: failureReasonCode(error),
          idempotencyKey:
            `business-period-release:${claim.claimKey}:${claim.leaseToken}`,
        });
        assertReleaseResult(release, claim);
        releasedCount += 1;
      } catch (_releaseError) {
        releaseFailedCount += 1;
      }
    }
  }

  return Object.freeze({
    recoveryScannedCount: recoveries.length,
    recoveredCount,
    recoveryReplayedCount,
    recoveryDeferredCount,
    taxRecoveryScannedCount: taxRecoveries.length,
    taxRecoveredCount,
    taxRecoveryDeferredCount,
    claimedCount: ordered.length,
    closedCount,
    replayedCount,
    failedCount,
    releasedCount,
    releaseFailedCount,
  });
}

function assertTaxRecoveryResults(
  results: readonly BusinessTaxLiabilityRecoveryResult[],
  batchLimit: number,
): void {
  if (!Array.isArray(results) || results.length > batchLimit) {
    throw invalidTaxRecoveryResult();
  }

  const assessmentKeys = new Set<string>();
  const paymentKeys = new Set<string>();
  for (const result of results) {
    const statusMatchesLiability = result.liabilityRemaining
      ? result.taxStatus === "partially_paid" || result.taxStatus === "unpaid"
      : result.taxStatus === "paid";
    const paymentMatchesRecovery = result.recovered
      ? typeof result.taxPaymentKey === "string" &&
        TAX_PAYMENT_KEY_PATTERN.test(result.taxPaymentKey)
      : result.taxPaymentKey === null;
    if (
      !TAX_ASSESSMENT_KEY_PATTERN.test(result.taxAssessmentKey) ||
      !BUSINESS_TREASURY_BUSINESS_KEY_PATTERN.test(result.businessKey) ||
      !statusMatchesLiability ||
      !paymentMatchesRecovery ||
      typeof result.recovered !== "boolean" ||
      typeof result.liabilityRemaining !== "boolean" ||
      (result.recovered && result.taxStatus === "unpaid") ||
      (!result.recovered && !result.liabilityRemaining) ||
      assessmentKeys.has(result.taxAssessmentKey) ||
      (result.taxPaymentKey !== null && paymentKeys.has(result.taxPaymentKey))
    ) {
      throw invalidTaxRecoveryResult();
    }
    assessmentKeys.add(result.taxAssessmentKey);
    if (result.taxPaymentKey !== null) paymentKeys.add(result.taxPaymentKey);
  }
}

function assertRecoveryResults(
  results: readonly BusinessPayrollLiabilityRecoveryResult[],
  batchLimit: number,
): void {
  if (!Array.isArray(results) || results.length > batchLimit) {
    throw invalidRecoveryResult();
  }

  const requestKeys = new Set<string>();
  const payrollRunKeys = new Set<string>();
  for (const result of results) {
    const statusMatchesLiability = result.liabilityRemaining
      ? result.payrollStatus === "partially_paid" ||
        result.payrollStatus === "unpaid"
      : result.payrollStatus === "completed";
    if (
      !PAYROLL_RECOVERY_REQUEST_KEY_PATTERN.test(result.recoveryRequestKey) ||
      !PAYROLL_RUN_KEY_PATTERN.test(result.payrollRunKey) ||
      !BUSINESS_TREASURY_BUSINESS_KEY_PATTERN.test(result.businessKey) ||
      !statusMatchesLiability ||
      typeof result.recovered !== "boolean" ||
      typeof result.liabilityRemaining !== "boolean" ||
      typeof result.replayed !== "boolean" ||
      (result.recovered && result.replayed) ||
      (result.recovered && result.payrollStatus === "unpaid") ||
      (!result.recovered && !result.liabilityRemaining && !result.replayed) ||
      requestKeys.has(result.recoveryRequestKey) ||
      payrollRunKeys.has(result.payrollRunKey)
    ) {
      throw invalidRecoveryResult();
    }
    requestKeys.add(result.recoveryRequestKey);
    payrollRunKeys.add(result.payrollRunKey);
  }
}

function assertClaims(
  claims: readonly BusinessOperatingPeriodClaim[],
  batchLimit: number,
): void {
  if (claims.length > batchLimit) throw invalidClaimResult();

  const claimKeys = new Set<string>();
  const leaseTokens = new Set<string>();
  for (const claim of claims) {
    if (
      !OPERATING_PERIOD_CLAIM_KEY_PATTERN.test(claim.claimKey) ||
      !BUSINESS_TREASURY_BUSINESS_KEY_PATTERN.test(claim.businessKey) ||
      !PAYROLL_PERIOD_KEY_PATTERN.test(claim.payrollPeriodKey) ||
      !/^[1-9][0-9]{0,18}$/u.test(claim.periodNumber) ||
      !isTimestamp(claim.dueAt) ||
      !UUID_PATTERN.test(claim.leaseToken) ||
      !isTimestamp(claim.leaseExpiresAt) ||
      Date.parse(claim.leaseExpiresAt) <= Date.parse(claim.dueAt) ||
      claimKeys.has(claim.claimKey) ||
      leaseTokens.has(claim.leaseToken)
    ) {
      throw invalidClaimResult();
    }
    claimKeys.add(claim.claimKey);
    leaseTokens.add(claim.leaseToken);
  }
}

function assertCloseResult(
  result: BusinessOperatingPeriodCloseResult,
  claim: BusinessOperatingPeriodClaim,
): void {
  if (
    !OPERATING_PERIOD_RECEIPT_KEY_PATTERN.test(result.closeReceiptKey) ||
    result.businessKey !== claim.businessKey ||
    result.payrollPeriodKey !== claim.payrollPeriodKey ||
    typeof result.replayed !== "boolean"
  ) {
    throw new BusinessOperationsWorkerError(
      "business_operating_period_close_result_invalid",
      "Business operating-period close returned an invalid result.",
    );
  }
}

function assertReleaseResult(
  result: BusinessOperatingPeriodReleaseResult,
  claim: BusinessOperatingPeriodClaim,
): void {
  if (
    result.claimKey !== claim.claimKey ||
    result.claimStatus !== "released" ||
    typeof result.replayed !== "boolean"
  ) {
    throw new BusinessOperationsWorkerError(
      "business_operating_period_release_result_invalid",
      "Business operating-period lease release returned an invalid result.",
    );
  }
}

function failureReasonCode(error: unknown): string {
  const candidate = error instanceof BusinessOperationsWorkerError
    ? error.code
    : "";
  const normalized = candidate.trim().toUpperCase().replace(/[^A-Z0-9_]/gu, "_")
    .replace(/_+/gu, "_").slice(0, 120);
  return /^[A-Z][A-Z0-9_]{1,119}$/u.test(normalized)
    ? normalized
    : "BUSINESS_OPERATING_PERIOD_CLOSE_FAILED";
}

function invalidClaimResult(): BusinessOperationsWorkerError {
  return new BusinessOperationsWorkerError(
    "business_operating_period_claim_result_invalid",
    "Business operating-period claim returned an invalid result.",
  );
}

function invalidRecoveryResult(): BusinessOperationsWorkerError {
  return new BusinessOperationsWorkerError(
    "business_payroll_recovery_result_invalid",
    "Business payroll-liability recovery returned an invalid result.",
  );
}

function invalidTaxRecoveryResult(): BusinessOperationsWorkerError {
  return new BusinessOperationsWorkerError(
    "business_tax_recovery_result_invalid",
    "Business tax-liability recovery returned an invalid result.",
  );
}

function isTimestamp(value: string): boolean {
  return typeof value === "string" && value.length <= 40 &&
    Number.isFinite(Date.parse(value));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
