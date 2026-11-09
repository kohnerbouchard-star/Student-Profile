// Licensing owns issuance/retry decisions; the worker binds atomic commands and shared crypto.
const EMAIL_TEMPLATE_VERSION = "license-issued-v1";

export interface ClaimedLicenseJob {
  readonly job_id: string;
  readonly payment_event_id: string;
  readonly provider: string;
  readonly provider_payment_id: string;
  readonly recipient_email: string;
  readonly product_sku: string;
  readonly license_duration_days: number;
  readonly purchase_code_expires_after_days: number | null;
  readonly purchase_code_id: string | null;
  readonly code_generation_nonce: number;
  readonly attempt_count: number;
  readonly lease_token: string;
}

export interface WorkerRuntime {
  readonly licenseCodeDerivationSecret: string;
  readonly purchaseCodeHmacSecret: string;
}

interface JobOutcome {
  readonly issued: boolean;
  readonly deadLettered: boolean;
}

export interface LicenseIssuanceCrypto {
  deriveLicenseCode(input: { secret: string; jobId: string; nonce: number }): Promise<string>;
  hashIssuedPurchaseCode(secret: string, code: string): Promise<string>;
}

// These are the two existing atomic operations, not an unrestricted database client.
export interface LicenseIssuanceCommands {
  materialize(input: {
    p_job_id: string; p_lease_token: string; p_code_hash: string;
    p_code_hash_version: "hmac-sha256-v2"; p_code_generation_nonce: number;
    p_template_version: string;
  }): PromiseLike<{ data?: unknown; error?: unknown }>;
  retry(input: {
    p_job_id: string; p_lease_token: string; p_error_code: string;
    p_error_detail: string; p_retry_after_seconds: number; p_terminal: boolean;
  }): PromiseLike<{ data?: unknown; error?: unknown }>;
}

export async function processClaimedLicenseJob(
  commands: LicenseIssuanceCommands,
  runtime: WorkerRuntime,
  job: ClaimedLicenseJob,
  crypto: LicenseIssuanceCrypto,
): Promise<JobOutcome> {
  try {
    await materializeLicenseCode(commands, runtime, job, crypto);
    return { issued: true, deadLettered: false };
  } catch (error) {
    const failure = normalizeJobFailure(error, job.attempt_count);
    console.warn("license_issuance_job_failed", {
      jobId: job.job_id,
      code: failure.code,
      retryable: failure.retryable,
      attemptCount: job.attempt_count,
    });

    const retry = await commands.retry(
      {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_error_code: failure.code,
        p_error_detail: failure.safeDetail,
        p_retry_after_seconds: failure.retryAfterSeconds,
        p_terminal: !failure.retryable,
      },
    );

    if (retry.error) {
      console.error("license_issuance_retry_record_failed", {
        jobId: job.job_id,
      });
      return { issued: false, deadLettered: false };
    }

    const status = String(
      (retry.data as Record<string, unknown> | null)?.jobStatus || "",
    );
    return {
      issued: false,
      deadLettered: status === "dead_letter",
    };
  }
}

async function materializeLicenseCode(
  commands: LicenseIssuanceCommands,
  runtime: WorkerRuntime,
  job: ClaimedLicenseJob,
  crypto: LicenseIssuanceCrypto,
): Promise<void> {
  let nonce = job.code_generation_nonce;

  for (let collisionAttempt = 0; collisionAttempt < 5; collisionAttempt += 1) {
    const licenseCode = await crypto.deriveLicenseCode({
      secret: runtime.licenseCodeDerivationSecret,
      jobId: job.job_id,
      nonce,
    });
    const codeHash = await crypto.hashIssuedPurchaseCode(
      runtime.purchaseCodeHmacSecret,
      licenseCode,
    );

    const materialization = await commands.materialize(
      {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_code_hash: codeHash,
        p_code_hash_version: "hmac-sha256-v2",
        p_code_generation_nonce: nonce,
        p_template_version: EMAIL_TEMPLATE_VERSION,
      },
    );
    if (materialization.error) {
      throw new JobFailure(
        "license_code_and_outbox_materialization_failed",
        "The license code and its email-outbox job could not be committed atomically.",
        true,
      );
    }

    const payload = materialization.data as Record<string, unknown> | null;
    const outcome = String(payload?.outcome || "");
    if (outcome === "created" || outcome === "replayed") {
      return;
    }
    if (outcome !== "collision") {
      throw new JobFailure(
        "license_code_materialization_invalid_response",
        "The license materialization response was invalid.",
        true,
      );
    }

    const nextNonce = Number(payload?.nextCodeGenerationNonce);
    if (
      !Number.isSafeInteger(nextNonce) ||
      nextNonce <= nonce ||
      nextNonce > 100
    ) {
      throw new JobFailure(
        "license_code_collision_state_invalid",
        "The license collision state was invalid.",
        true,
      );
    }
    nonce = nextNonce;
  }

  throw new JobFailure(
    "license_code_collision_limit",
    "License-code collision retry limit reached.",
    true,
  );
}

class JobFailure extends Error {
  readonly code: string;
  readonly safeDetail: string;
  readonly retryable: boolean;

  constructor(
    code: string,
    safeDetail: string,
    retryable: boolean,
  ) {
    super(safeDetail);
    this.name = "JobFailure";
    this.code = code;
    this.safeDetail = safeDetail;
    this.retryable = retryable;
  }
}

function normalizeJobFailure(
  error: unknown,
  attemptCount: number,
): {
  readonly code: string;
  readonly safeDetail: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number;
} {
  const failure = error instanceof JobFailure
    ? error
    : new JobFailure(
      "license_issuance_unexpected_failure",
      "License materialization failed unexpectedly.",
      true,
    );
  const exponentialDelay = Math.min(
    3600,
    15 * 2 ** Math.max(0, Math.min(attemptCount - 1, 8)),
  );
  const deterministicJitter = Math.min(
    30,
    Math.max(0, attemptCount * 3),
  );

  return {
    code: failure.code,
    safeDetail: redactLicenseCodes(failure.safeDetail),
    retryable: failure.retryable,
    retryAfterSeconds: Math.max(
      1,
      Math.min(86400, exponentialDelay + deterministicJitter),
    ),
  };
}

function redactLicenseCodes(value: string): string {
  return String(value || "").replace(
    /[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}/gu,
    "[redacted-license-code]",
  );
}
