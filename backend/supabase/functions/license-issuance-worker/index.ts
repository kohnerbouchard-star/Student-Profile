import {
  processClaimedLicenseJob,
  type ClaimedLicenseJob,
  type LicenseIssuanceCommands,
  type WorkerRuntime,
} from "../../../src/domains/licensing/application/processClaimedLicenseJob.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  deriveLicenseCode,
  hashIssuedPurchaseCode,
} from "../_shared/licenseCode.ts";

const SCHEDULER_NAME =
  "econovaria-license-issuance-scheduler-v1";
const SCHEDULER_HEADER =
  "x-econovaria-scheduler-token";
const CLAIM_BATCH_SIZE = 10;
const CLAIM_LEASE_SECONDS = 90;
const PROCESSING_CONCURRENCY = 5;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SCHEDULER_TOKEN_PATTERN = /^[0-9a-f]{64}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

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
        "x-client-info": "econovaria-license-issuance-worker-v2",
      },
    },
  });

  if (!(await schedulerRequestIsAuthorized(client, request))) {
    return unauthorized();
  }

  const runtime = readWorkerRuntime();
  if (!runtime) {
    return json(503, {
      ok: false,
      error: {
        code: "license_worker_materialization_config_missing",
        message: "License materialization configuration is incomplete.",
      },
    }, { "Retry-After": "60" });
  }

  const claim = await client.rpc(
    "claim_license_materialization_jobs_v2",
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
        message: "Could not claim license materialization work.",
      },
    });
  }

  const jobs = claim.data
    .map(normalizeClaimedJob)
    .filter((job): job is ClaimedLicenseJob => job !== null);

  // Bind the existing RPC transport once; Licensing decides when each command runs.
  const issuanceCommands: LicenseIssuanceCommands = {
    materialize: (input) => client.rpc("materialize_license_and_enqueue_email_v2", input),
    retry: (input) => client.rpc("retry_license_issuance_job_v1", input),
  };

  let issued = 0;
  let retryScheduled = 0;
  let deadLettered = 0;

  for (
    let offset = 0;
    offset < jobs.length;
    offset += PROCESSING_CONCURRENCY
  ) {
    const outcomes = await Promise.all(
      jobs
        .slice(offset, offset + PROCESSING_CONCURRENCY)
        .map((job) => processClaimedLicenseJob(issuanceCommands, runtime, job, {
          deriveLicenseCode,
          hashIssuedPurchaseCode,
        })),
    );
    for (const outcome of outcomes) {
      if (outcome.issued) issued += 1;
      else if (outcome.deadLettered) deadLettered += 1;
      else retryScheduled += 1;
    }
  }

  return json(200, {
    ok: true,
    claimed: jobs.length,
    issued,
    retryScheduled,
    deadLettered,
  });
}

async function schedulerRequestIsAuthorized(
  client: any,
  request: Request,
): Promise<boolean> {
  const schedulerToken = String(
    request.headers.get(SCHEDULER_HEADER) || "",
  ).trim();
  if (!SCHEDULER_TOKEN_PATTERN.test(schedulerToken)) {
    return false;
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
  return !authorization.error && authorization.data === true;
}

function readWorkerRuntime(): WorkerRuntime | null {
  const runtime: WorkerRuntime = {
    licenseCodeDerivationSecret: environmentValue(
      "ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET",
    ),
    purchaseCodeHmacSecret: environmentValue(
      "ECONOVARIA_PURCHASE_CODE_HMAC_SECRET",
    ),
  };

  if (
    runtime.licenseCodeDerivationSecret.length < 32 ||
    runtime.purchaseCodeHmacSecret.length < 32 ||
    runtime.licenseCodeDerivationSecret === runtime.purchaseCodeHmacSecret
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
