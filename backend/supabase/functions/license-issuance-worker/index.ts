import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  deriveLicenseCode,
  hashIssuedPurchaseCode,
} from "./licenseCode.ts";

const SCHEDULER_NAME =
  "econovaria-license-issuance-scheduler-v1";
const SCHEDULER_HEADER =
  "x-econovaria-scheduler-token";
const RESEND_EMAIL_ENDPOINT =
  "https://api.resend.com/emails";
const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const CLAIM_BATCH_SIZE = 10;
const CLAIM_LEASE_SECONDS = 90;
const DELIVERY_CONCURRENCY = 5;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SCHEDULER_TOKEN_PATTERN = /^[0-9a-f]{64}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

interface ClaimedLicenseJob {
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

interface WorkerRuntime {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly licenseCodeDerivationSecret: string;
  readonly purchaseCodeHmacSecret: string;
  readonly resendApiKey: string;
  readonly emailFrom: string;
  readonly supportEmail: string;
}

interface JobOutcome {
  readonly delivered: boolean;
  readonly deadLettered: boolean;
}

Deno.serve(handleLicenseIssuanceWorkerRequest);

export async function handleLicenseIssuanceWorkerRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST." },
    }, { Allow: "POST" });
  }

  const supabaseUrl = environmentValue("SUPABASE_URL");
  const serviceRoleKey = environmentValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, {
      ok: false,
      error: {
        code: "license_worker_base_config_missing",
        message: "Required worker database configuration is missing.",
      },
    });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        "x-client-info": "econovaria-license-issuance-worker-v1",
      },
    },
  });

  const schedulerToken = String(
    request.headers.get(SCHEDULER_HEADER) || "",
  ).trim();
  if (!SCHEDULER_TOKEN_PATTERN.test(schedulerToken)) {
    return unauthorized();
  }

  const schedulerTokenHash = await sha256Hex(
    schedulerToken.toLowerCase(),
  );
  const authorization = await client.rpc(
    "verify_runtime_scheduler_token_v1",
    {
      p_scheduler_name: SCHEDULER_NAME,
      p_token_sha256: schedulerTokenHash,
    },
  );
  if (authorization.error || authorization.data !== true) {
    return unauthorized();
  }

  const runtime = readWorkerRuntime(supabaseUrl, serviceRoleKey);
  if (!runtime) {
    return json(503, {
      ok: false,
      error: {
        code: "license_worker_delivery_config_missing",
        message: "License delivery configuration is incomplete.",
      },
    }, { "Retry-After": "60" });
  }

  const claim = await client.rpc(
    "claim_license_issuance_jobs_v1",
    {
      p_batch_size: CLAIM_BATCH_SIZE,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    },
  );
  if (claim.error || !Array.isArray(claim.data)) {
    console.error("license_issuance_claim_failed");
    return json(500, {
      ok: false,
      error: {
        code: "license_queue_claim_failed",
        message: "Could not claim license issuance work.",
      },
    });
  }

  const jobs = claim.data
    .map(normalizeClaimedJob)
    .filter((job): job is ClaimedLicenseJob => job !== null);

  let delivered = 0;
  let retryScheduled = 0;
  let deadLettered = 0;

  for (
    let offset = 0;
    offset < jobs.length;
    offset += DELIVERY_CONCURRENCY
  ) {
    const outcomes = await Promise.all(
      jobs
        .slice(offset, offset + DELIVERY_CONCURRENCY)
        .map((job) => processClaimedJob(client, runtime, job)),
    );
    for (const outcome of outcomes) {
      if (outcome.delivered) delivered += 1;
      else if (outcome.deadLettered) deadLettered += 1;
      else retryScheduled += 1;
    }
  }

  return json(200, {
    ok: true,
    claimed: jobs.length,
    delivered,
    retryScheduled,
    deadLettered,
  });
}

async function processClaimedJob(
  client: any,
  runtime: WorkerRuntime,
  job: ClaimedLicenseJob,
): Promise<JobOutcome> {
  try {
    const materialized = await materializeLicenseCode(
      client,
      runtime,
      job,
    );
    const providerMessageId = await sendLicenseEmail(
      runtime,
      job,
      materialized.licenseCode,
    );

    const completion = await client.rpc(
      "complete_license_issuance_job_v1",
      {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_email_provider_message_id: providerMessageId,
      },
    );
    if (completion.error) {
      throw new JobFailure(
        "license_delivery_completion_failed",
        "The email provider accepted the message, but completion could not be recorded.",
        true,
      );
    }

    return { delivered: true, deadLettered: false };
  } catch (error) {
    const failure = normalizeJobFailure(error, job.attempt_count);
    console.warn("license_issuance_job_failed", {
      jobId: job.job_id,
      code: failure.code,
      retryable: failure.retryable,
      attemptCount: job.attempt_count,
    });

    const retry = await client.rpc(
      "retry_license_issuance_job_v1",
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
      return { delivered: false, deadLettered: false };
    }

    const status = String(
      (retry.data as Record<string, unknown> | null)?.jobStatus || "",
    );
    return {
      delivered: false,
      deadLettered: status === "dead_letter",
    };
  }
}

async function materializeLicenseCode(
  client: any,
  runtime: WorkerRuntime,
  job: ClaimedLicenseJob,
): Promise<{ readonly licenseCode: string }> {
  let nonce = job.code_generation_nonce;

  for (let collisionAttempt = 0; collisionAttempt < 5; collisionAttempt += 1) {
    const licenseCode = await deriveLicenseCode({
      secret: runtime.licenseCodeDerivationSecret,
      jobId: job.job_id,
      nonce,
    });
    const codeHash = await hashIssuedPurchaseCode(
      runtime.purchaseCodeHmacSecret,
      licenseCode,
    );

    const materialization = await client.rpc(
      "materialize_issued_purchase_code_v1",
      {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_code_hash: codeHash,
        p_code_hash_version: "hmac-sha256-v2",
        p_code_generation_nonce: nonce,
      },
    );
    if (materialization.error) {
      throw new JobFailure(
        "license_code_materialization_failed",
        "The license code could not be materialized.",
        true,
      );
    }

    const payload = materialization.data as Record<string, unknown> | null;
    const outcome = String(payload?.outcome || "");
    if (outcome === "created" || outcome === "replayed") {
      return { licenseCode };
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

async function sendLicenseEmail(
  runtime: WorkerRuntime,
  job: ClaimedLicenseJob,
  licenseCode: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DELIVERY_TIMEOUT_MS,
  );

  const expirationCopy =
    job.purchase_code_expires_after_days === null
      ? "The code remains available until it is redeemed or revoked."
      : `Redeem this code within ${job.purchase_code_expires_after_days} days.`;
  const supportCopy = runtime.supportEmail
    ? `Questions: ${runtime.supportEmail}`
    : "Contact Econovaria support if you did not make this purchase.";
  const subject = "Your Econovaria license code";
  const text = [
    "Your Econovaria payment was confirmed.",
    "",
    `License code: ${licenseCode}`,
    "",
    `License term after activation: ${job.license_duration_days} days.`,
    expirationCopy,
    "This code may be redeemed once. Keep it private.",
    "",
    supportCopy,
  ].join("\n");
  const html = licenseEmailHtml({
    licenseCode,
    licenseDurationDays: job.license_duration_days,
    expirationCopy,
    supportCopy,
  });

  try {
    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key":
          `license-issuance/${job.job_id}/delivery-v1`,
        "User-Agent": "Econovaria-Licensing/1.0",
      },
      body: JSON.stringify({
        from: runtime.emailFrom,
        to: [job.recipient_email],
        subject,
        html,
        text,
        tags: [
          { name: "purpose", value: "license_issuance" },
          { name: "product_sku", value: safeTag(job.product_sku) },
        ],
      }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    const payload = await readBoundedJson(
      response,
      MAX_PROVIDER_RESPONSE_BYTES,
    );
    if (!response.ok) {
      const retryAfter = parseRetryAfter(
        response.headers.get("retry-after"),
      );
      throw new JobFailure(
        response.status === 429
          ? "email_provider_rate_limited"
          : `email_provider_http_${response.status}`,
        `The email provider returned HTTP ${response.status}.`,
        response.status === 408 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500,
        retryAfter,
      );
    }

    const providerMessageId = String(payload?.id || "").trim();
    if (
      providerMessageId.length < 1 ||
      providerMessageId.length > 255
    ) {
      throw new JobFailure(
        "email_provider_message_id_missing",
        "The email provider did not return a valid message identifier.",
        true,
      );
    }

    return providerMessageId;
  } catch (error) {
    if (error instanceof JobFailure) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new JobFailure(
        "email_provider_timeout",
        "The email provider request timed out.",
        true,
      );
    }
    throw new JobFailure(
      "email_provider_unreachable",
      "The email provider could not be reached.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function readWorkerRuntime(
  supabaseUrl: string,
  serviceRoleKey: string,
): WorkerRuntime | null {
  const runtime: WorkerRuntime = {
    supabaseUrl,
    serviceRoleKey,
    licenseCodeDerivationSecret: environmentValue(
      "ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET",
    ),
    purchaseCodeHmacSecret: environmentValue(
      "ECONOVARIA_PURCHASE_CODE_HMAC_SECRET",
    ),
    resendApiKey: environmentValue("RESEND_API_KEY"),
    emailFrom: environmentValue("ECONOVARIA_LICENSE_EMAIL_FROM") ||
      environmentValue("ECONOVARIA_AUTH_EMAIL_FROM"),
    supportEmail: environmentValue("ECONOVARIA_LICENSE_SUPPORT_EMAIL"),
  };

  if (
    runtime.licenseCodeDerivationSecret.length < 32 ||
    runtime.purchaseCodeHmacSecret.length < 32 ||
    !runtime.resendApiKey ||
    !runtime.emailFrom ||
    (
      runtime.supportEmail &&
      !EMAIL_PATTERN.test(runtime.supportEmail)
    )
  ) {
    return null;
  }
  return runtime;
}

function normalizeClaimedJob(
  raw: Record<string, unknown>,
): ClaimedLicenseJob | null {
  const jobId = String(raw?.job_id || "").trim().toLowerCase();
  const paymentEventId = String(
    raw?.payment_event_id || "",
  ).trim().toLowerCase();
  const leaseToken = String(
    raw?.lease_token || "",
  ).trim().toLowerCase();
  const recipientEmail = String(
    raw?.recipient_email || "",
  ).trim().toLowerCase();
  const durationDays = Number(raw?.license_duration_days);
  const expirationDays = raw?.purchase_code_expires_after_days === null ||
      raw?.purchase_code_expires_after_days === undefined
    ? null
    : Number(raw.purchase_code_expires_after_days);
  const nonce = Number(raw?.code_generation_nonce);
  const attemptCount = Number(raw?.attempt_count);

  if (
    !UUID_PATTERN.test(jobId) ||
    !UUID_PATTERN.test(paymentEventId) ||
    !UUID_PATTERN.test(leaseToken) ||
    !EMAIL_PATTERN.test(recipientEmail) ||
    !Number.isSafeInteger(durationDays) ||
    durationDays < 1 ||
    durationDays > 3650 ||
    (
      expirationDays !== null &&
      (
        !Number.isSafeInteger(expirationDays) ||
        expirationDays < 1 ||
        expirationDays > 3650
      )
    ) ||
    !Number.isSafeInteger(nonce) ||
    nonce < 0 ||
    nonce > 100 ||
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 1 ||
    attemptCount > 50
  ) {
    return null;
  }

  return {
    job_id: jobId,
    payment_event_id: paymentEventId,
    provider: String(raw?.provider || "").trim(),
    provider_payment_id: String(
      raw?.provider_payment_id || "",
    ).trim(),
    recipient_email: recipientEmail,
    product_sku: String(raw?.product_sku || "").trim(),
    license_duration_days: durationDays,
    purchase_code_expires_after_days: expirationDays,
    purchase_code_id: raw?.purchase_code_id
      ? String(raw.purchase_code_id).trim().toLowerCase()
      : null,
    code_generation_nonce: nonce,
    attempt_count: attemptCount,
    lease_token: leaseToken,
  };
}

class JobFailure extends Error {
  readonly code: string;
  readonly safeDetail: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(
    code: string,
    safeDetail: string,
    retryable: boolean,
    retryAfterSeconds?: number,
  ) {
    super(safeDetail);
    this.name = "JobFailure";
    this.code = code;
    this.safeDetail = safeDetail;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
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
      "License issuance failed unexpectedly.",
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
      Math.min(
        86400,
        failure.retryAfterSeconds ??
          exponentialDelay + deterministicJitter,
      ),
    ),
  };
}

function licenseEmailHtml(input: {
  readonly licenseCode: string;
  readonly licenseDurationDays: number;
  readonly expirationCopy: string;
  readonly supportCopy: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Econovaria license</title></head>
<body style="margin:0;background:#020617;color:#e2e8f0;font-family:Arial,sans-serif;padding:24px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0f172a;border:1px solid #334155;border-radius:16px;padding:32px">
      <tr><td>
        <p style="margin:0 0 12px;color:#fb923c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Payment confirmed</p>
        <h1 style="margin:0 0 16px;color:#f8fafc;font-size:28px">Your Econovaria license</h1>
        <p style="margin:0 0 20px;line-height:1.6">Use the code below to activate one Econovaria game license.</p>
        <p style="margin:0 0 24px;padding:18px;border:1px solid #475569;border-radius:12px;background:#020617;color:#f8fafc;font-family:monospace;font-size:24px;font-weight:800;letter-spacing:.12em;text-align:center">${escapeHtml(input.licenseCode)}</p>
        <p style="margin:0 0 8px;line-height:1.6">License term after activation: ${input.licenseDurationDays} days.</p>
        <p style="margin:0 0 8px;line-height:1.6">${escapeHtml(input.expirationCopy)}</p>
        <p style="margin:0 0 8px;line-height:1.6">This code may be redeemed once. Keep it private.</p>
        <p style="margin:20px 0 0;color:#94a3b8;font-size:13px;line-height:1.5">${escapeHtml(input.supportCopy)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

async function readBoundedJson(
  response: Response,
  maxBytes: number,
): Promise<Record<string, unknown> | null> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) return null;
  if (bytes.byteLength > maxBytes) {
    throw new JobFailure(
      "email_provider_response_too_large",
      "The email provider response exceeded the allowed size.",
      true,
    );
  }

  try {
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  const seconds = Number(String(value || "").trim());
  if (
    Number.isSafeInteger(seconds) &&
    seconds >= 1 &&
    seconds <= 86400
  ) {
    return seconds;
  }
  return undefined;
}

function safeTag(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "_")
    .slice(0, 256) || "unknown";
}

function redactLicenseCodes(value: string): string {
  return String(value || "").replace(
    /[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}/gu,
    "[redacted-license-code]",
  );
}

function unauthorized(): Response {
  return json(401, {
    ok: false,
    error: {
      code: "invalid_scheduler_token",
      message: "Scheduler authentication failed.",
    },
  });
}

function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function json(
  status: number,
  body: unknown,
  extraHeaders: HeadersInit = {},
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...Object.fromEntries(new Headers(extraHeaders)),
  });
  return new Response(JSON.stringify(body), { status, headers });
}
