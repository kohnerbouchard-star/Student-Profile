import {
  type BusinessOperatingPeriodClaim,
  type BusinessOperatingPeriodCloseResult,
  type BusinessOperatingPeriodReleaseResult,
  BusinessOperationsWorkerError,
  type BusinessOperationsWorkerRepository,
  type BusinessPayrollLiabilityRecoveryResult,
  type BusinessTaxLiabilityRecoveryResult,
} from "../services/businessOperationsWorker.ts";

interface RpcError {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface RpcResponse<T> {
  readonly data: T | null;
  readonly error: RpcError | null;
}

export interface BusinessOperationsSupabaseClient {
  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<RpcResponse<T>>;
}

interface ClaimRow {
  readonly claim_key?: unknown;
  readonly business_key?: unknown;
  readonly payroll_period_key?: unknown;
  readonly period_number?: unknown;
  readonly due_at?: unknown;
  readonly lease_token?: unknown;
  readonly lease_expires_at?: unknown;
}

interface CloseRow {
  readonly close_receipt_key?: unknown;
  readonly business_key?: unknown;
  readonly payroll_period_key?: unknown;
  readonly replayed?: unknown;
}

interface ReleaseRow {
  readonly claim_key?: unknown;
  readonly claim_status?: unknown;
  readonly replayed?: unknown;
}

interface PayrollRecoveryRow {
  readonly recovery_request_key?: unknown;
  readonly payroll_run_key?: unknown;
  readonly business_key?: unknown;
  readonly payroll_status?: unknown;
  readonly recovered?: unknown;
  readonly liability_remaining?: unknown;
  readonly replayed?: unknown;
}

interface TaxRecoveryRow {
  readonly tax_assessment_key?: unknown;
  readonly tax_payment_key?: unknown;
  readonly business_key?: unknown;
  readonly tax_status?: unknown;
  readonly recovered?: unknown;
  readonly liability_remaining?: unknown;
}

const KNOWN_DATABASE_ERRORS = new Map<string, {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
}>([
  ["BUSINESS_PAYROLL_RECOVERY_BATCH_LIMIT_INVALID", {
    code: "business_payroll_recovery_batch_limit_invalid",
    status: 500,
    retryable: false,
  }],
  ["BUSINESS_TAX_RECOVERY_BATCH_LIMIT_INVALID", {
    code: "business_tax_recovery_batch_limit_invalid",
    status: 500,
    retryable: false,
  }],
  ["BUSINESS_OPERATING_PERIOD_CLAIM_LIMIT_INVALID", {
    code: "business_operating_period_claim_limit_invalid",
    status: 500,
    retryable: false,
  }],
  ["BUSINESS_OPERATING_PERIOD_CLAIM_NOT_FOUND", {
    code: "business_operating_period_claim_not_found",
    status: 409,
    retryable: true,
  }],
  ["BUSINESS_OPERATING_PERIOD_LEASE_TOKEN_INVALID", {
    code: "business_operating_period_lease_token_invalid",
    status: 409,
    retryable: false,
  }],
  ["BUSINESS_OPERATING_PERIOD_LEASE_EXPIRED", {
    code: "business_operating_period_lease_expired",
    status: 409,
    retryable: true,
  }],
  ["BUSINESS_OPERATING_PERIOD_CLAIM_STALE", {
    code: "business_operating_period_claim_stale",
    status: 409,
    retryable: true,
  }],
  ["BUSINESS_OPERATING_PERIOD_CLOSE_REQUEST_INVALID", {
    code: "business_operating_period_close_request_invalid",
    status: 500,
    retryable: false,
  }],
  ["IDEMPOTENCY_KEY_CONFLICT", {
    code: "business_operating_period_idempotency_conflict",
    status: 409,
    retryable: false,
  }],
]);

export class SupabaseBusinessOperationsRepository
  implements BusinessOperationsWorkerRepository {
  constructor(private readonly client: BusinessOperationsSupabaseClient) {}

  async recoverPayrollLiabilities(input: {
    readonly batchLimit: number;
  }): Promise<readonly BusinessPayrollLiabilityRecoveryResult[]> {
    const response = await this.client.rpc<readonly PayrollRecoveryRow[]>(
      "recover_due_business_payroll_liabilities_v1",
      { p_batch_limit: input.batchLimit },
    );
    if (response.error) {
      throw mapRpcError(
        response.error,
        "business_payroll_recovery_failed",
      );
    }
    if (
      !Array.isArray(response.data) || response.data.length > input.batchLimit
    ) {
      throw invalidResult(
        "Business payroll-liability recovery returned an invalid result.",
      );
    }
    return Object.freeze(response.data.map(mapPayrollRecovery));
  }

  async recoverTaxLiabilities(input: {
    readonly batchLimit: number;
  }): Promise<readonly BusinessTaxLiabilityRecoveryResult[]> {
    const response = await this.client.rpc<readonly TaxRecoveryRow[]>(
      "recover_due_business_tax_liabilities_v1",
      { p_batch_limit: input.batchLimit },
    );
    if (response.error) {
      throw mapRpcError(response.error, "business_tax_recovery_failed");
    }
    if (
      !Array.isArray(response.data) || response.data.length > input.batchLimit
    ) {
      throw invalidResult(
        "Business tax-liability recovery returned an invalid result.",
      );
    }
    return Object.freeze(response.data.map(mapTaxRecovery));
  }

  async claimDueOperatingPeriods(input: {
    readonly batchLimit: number;
  }): Promise<readonly BusinessOperatingPeriodClaim[]> {
    const response = await this.client.rpc<readonly ClaimRow[]>(
      "claim_due_business_operating_periods_v1",
      { p_batch_limit: input.batchLimit },
    );
    if (response.error) {
      throw mapRpcError(
        response.error,
        "business_operating_period_claim_failed",
      );
    }
    if (
      !Array.isArray(response.data) || response.data.length > input.batchLimit
    ) {
      throw invalidResult(
        "Business operating-period claim returned an invalid result.",
      );
    }
    return Object.freeze(response.data.map(mapClaim));
  }

  async closeClaimedOperatingPeriod(input: {
    readonly claim: BusinessOperatingPeriodClaim;
    readonly idempotencyKey: string;
  }): Promise<BusinessOperatingPeriodCloseResult> {
    const response = await this.client.rpc<readonly CloseRow[]>(
      "close_claimed_business_operating_period_v1",
      {
        p_claim_key: input.claim.claimKey,
        p_lease_token: input.claim.leaseToken,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (response.error) {
      throw mapRpcError(
        response.error,
        "business_operating_period_close_failed",
      );
    }
    const row = onlyRow(response.data);
    return Object.freeze({
      closeReceiptKey: requiredText(row.close_receipt_key, "close_receipt_key"),
      businessKey: requiredText(row.business_key, "business_key"),
      payrollPeriodKey: requiredText(
        row.payroll_period_key,
        "payroll_period_key",
      ),
      replayed: requiredBoolean(row.replayed, "replayed"),
    });
  }

  async releaseOperatingPeriodLease(input: {
    readonly claim: BusinessOperatingPeriodClaim;
    readonly reasonCode: string;
    readonly idempotencyKey: string;
  }): Promise<BusinessOperatingPeriodReleaseResult> {
    const response = await this.client.rpc<readonly ReleaseRow[]>(
      "release_business_operating_period_lease_v1",
      {
        p_claim_key: input.claim.claimKey,
        p_lease_token: input.claim.leaseToken,
        p_reason_code: input.reasonCode,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (response.error) {
      throw mapRpcError(
        response.error,
        "business_operating_period_release_failed",
      );
    }
    const row = onlyRow(response.data);
    const claimStatus = requiredText(row.claim_status, "claim_status");
    if (claimStatus !== "released") {
      throw invalidResult(
        "Business operating-period release returned an invalid state.",
      );
    }
    return Object.freeze({
      claimKey: requiredText(row.claim_key, "claim_key"),
      claimStatus,
      replayed: requiredBoolean(row.replayed, "replayed"),
    });
  }
}

function mapPayrollRecovery(
  row: PayrollRecoveryRow,
): BusinessPayrollLiabilityRecoveryResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw invalidResult("Business payroll-liability recovery row is invalid.");
  }
  const payrollStatus = requiredText(row.payroll_status, "payroll_status");
  if (
    payrollStatus !== "completed" && payrollStatus !== "partially_paid" &&
    payrollStatus !== "unpaid"
  ) {
    throw invalidResult("Business operations payroll_status is invalid.");
  }
  return Object.freeze({
    recoveryRequestKey: requiredText(
      row.recovery_request_key,
      "recovery_request_key",
    ),
    payrollRunKey: requiredText(row.payroll_run_key, "payroll_run_key"),
    businessKey: requiredText(row.business_key, "business_key"),
    payrollStatus,
    recovered: requiredBoolean(row.recovered, "recovered"),
    liabilityRemaining: requiredBoolean(
      row.liability_remaining,
      "liability_remaining",
    ),
    replayed: requiredBoolean(row.replayed, "replayed"),
  });
}

function mapTaxRecovery(
  row: TaxRecoveryRow,
): BusinessTaxLiabilityRecoveryResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw invalidResult("Business tax-liability recovery row is invalid.");
  }
  const taxStatus = requiredText(row.tax_status, "tax_status");
  if (
    taxStatus !== "paid" && taxStatus !== "partially_paid" &&
    taxStatus !== "unpaid"
  ) {
    throw invalidResult("Business operations tax_status is invalid.");
  }
  const taxPaymentKey = row.tax_payment_key === null
    ? null
    : requiredText(row.tax_payment_key, "tax_payment_key");
  return Object.freeze({
    taxAssessmentKey: requiredText(
      row.tax_assessment_key,
      "tax_assessment_key",
    ),
    taxPaymentKey,
    businessKey: requiredText(row.business_key, "business_key"),
    taxStatus,
    recovered: requiredBoolean(row.recovered, "recovered"),
    liabilityRemaining: requiredBoolean(
      row.liability_remaining,
      "liability_remaining",
    ),
  });
}

function mapClaim(row: ClaimRow): BusinessOperatingPeriodClaim {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw invalidResult("Business operating-period claim row is invalid.");
  }
  return Object.freeze({
    claimKey: requiredText(row.claim_key, "claim_key"),
    businessKey: requiredText(row.business_key, "business_key"),
    payrollPeriodKey: requiredText(
      row.payroll_period_key,
      "payroll_period_key",
    ),
    periodNumber: requiredPositiveBigintText(
      row.period_number,
      "period_number",
    ),
    dueAt: requiredTimestamp(row.due_at, "due_at"),
    leaseToken: requiredUuid(row.lease_token, "lease_token"),
    leaseExpiresAt: requiredTimestamp(row.lease_expires_at, "lease_expires_at"),
  });
}

function onlyRow<T>(value: readonly T[] | null): T {
  if (!Array.isArray(value) || value.length !== 1) {
    throw invalidResult(
      "Business operations command returned an invalid row count.",
    );
  }
  const row = value[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw invalidResult("Business operations command returned an invalid row.");
  }
  return row;
}

function requiredText(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 160) {
    throw invalidResult(`Business operations ${field} is invalid.`);
  }
  return text;
}

function requiredPositiveBigintText(value: unknown, field: string): string {
  let text = "";
  if (typeof value === "string") text = value.trim();
  else if (typeof value === "number" && Number.isSafeInteger(value)) {
    text = String(value);
  }
  if (!/^[1-9][0-9]{0,18}$/u.test(text)) {
    throw invalidResult(`Business operations ${field} is invalid.`);
  }
  return text;
}

function requiredTimestamp(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 40 || !Number.isFinite(Date.parse(text))) {
    throw invalidResult(`Business operations ${field} is invalid.`);
  }
  return text;
}

function requiredUuid(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(text)
  ) {
    throw invalidResult(`Business operations ${field} is invalid.`);
  }
  return text;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw invalidResult(`Business operations ${field} is invalid.`);
  }
  return value;
}

function mapRpcError(
  error: RpcError,
  defaultCode: string,
): BusinessOperationsWorkerError {
  const evidence = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toUpperCase();
  for (const [databaseCode, mapped] of KNOWN_DATABASE_ERRORS) {
    if (evidence.includes(databaseCode)) {
      return new BusinessOperationsWorkerError(
        mapped.code,
        "Business operating-period command was rejected.",
        mapped.status,
        mapped.retryable,
      );
    }
  }
  const schemaMissing = error.code === "42883" || error.code === "PGRST202" ||
    evidence.includes("SCHEMA CACHE") || evidence.includes("DOES NOT EXIST");
  return new BusinessOperationsWorkerError(
    schemaMissing ? "business_operations_schema_not_applied" : defaultCode,
    schemaMissing
      ? "Business operations schema is not available."
      : "Business operating-period command failed.",
    503,
    true,
  );
}

function invalidResult(message: string): BusinessOperationsWorkerError {
  return new BusinessOperationsWorkerError(
    "business_operations_repository_result_invalid",
    message,
    500,
    false,
  );
}
