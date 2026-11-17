import {
  deriveLicenseCode,
  hashIssuedPurchaseCode,
} from "../_shared/licenseCode.ts";
import {
  type WorkerRuntime,
  type ClaimedEmailJob,
  type JobOutcome,
  DELIVERY_TIMEOUT_MS,
  RESEND_EMAIL_ENDPOINT,
  MAX_PROVIDER_RESPONSE_BYTES,
} from "./emailWorkerContracts.ts";
import {
  constantTimeEqualHex,
  JobFailure,
  normalizeJobFailure,
  safeTag,
  readBoundedJson,
  parseRetryAfter,
} from "./emailWorkerValidation.ts";
import {
  renderLicenseEmail,
} from "./emailTemplate.ts";


export async function processClaimedJob(
  client: any,
  runtime: WorkerRuntime,
  job: ClaimedEmailJob,
): Promise<JobOutcome> {
  try {
    const licenseCode = await deriveLicenseCode({
      secret: runtime.licenseCodeDerivationSecret,
      jobId: job.issuance_job_id,
      nonce: job.code_generation_nonce,
    });
    const regeneratedHash = await hashIssuedPurchaseCode(
      runtime.purchaseCodeHmacSecret,
      licenseCode,
    );
    if (
      job.expected_code_hash_version !== "hmac-sha256-v2" ||
      !constantTimeEqualHex(regeneratedHash, job.expected_code_hash)
    ) {
      throw new JobFailure(
        "license_email_code_verifier_mismatch",
        "The regenerated license code did not match the stored verifier. Delivery was stopped for secret reconciliation.",
        false,
      );
    }

    const providerMessageId = await sendLicenseEmail(
      runtime,
      job,
      licenseCode,
    );

    const completion = await client.rpc(
      "complete_license_email_delivery_v1",
      {
        p_email_job_id: job.email_job_id,
        p_lease_token: job.lease_token,
        p_email_provider_message_id: providerMessageId,
      },
    );
    if (completion.error) {
      throw new JobFailure(
        "license_email_completion_failed",
        "The email provider accepted the message, but completion could not be recorded.",
        true,
      );
    }

    return { delivered: true, deadLettered: false };
  } catch (error) {
    const failure = normalizeJobFailure(error, job.attempt_count);
    console.warn("license_email_job_failed", {
      emailJobId: job.email_job_id,
      issuanceJobId: job.issuance_job_id,
      code: failure.code,
      retryable: failure.retryable,
      attemptCount: job.attempt_count,
    });

    const retry = await client.rpc(
      "retry_license_email_job_v1",
      {
        p_email_job_id: job.email_job_id,
        p_lease_token: job.lease_token,
        p_error_code: failure.code,
        p_error_detail: failure.safeDetail,
        p_retry_after_seconds: failure.retryAfterSeconds,
        p_terminal: !failure.retryable,
      },
    );

    if (retry.error) {
      console.error("license_email_retry_record_failed", {
        emailJobId: job.email_job_id,
      });
      return { delivered: false, deadLettered: false };
    }

    const status = String(
      (retry.data as Record<string, unknown> | null)?.emailStatus || "",
    );
    return {
      delivered: false,
      deadLettered: status === "dead_letter",
    };
  }
}


export async function sendLicenseEmail(
  runtime: WorkerRuntime,
  job: ClaimedEmailJob,
  licenseCode: string,
): Promise<string> {
  const rendered = renderLicenseEmail(runtime, job, licenseCode);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DELIVERY_TIMEOUT_MS,
  );

  try {
    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": job.idempotency_key,
        "User-Agent": "Econovaria-Licensing/1.0",
      },
      body: JSON.stringify({
        from: runtime.emailFrom,
        to: [job.recipient_email],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: [
          { name: "purpose", value: "license_issuance" },
          { name: "product_sku", value: safeTag(job.product_sku) },
          { name: "template_version", value: safeTag(job.template_version) },
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
      const providerCode = String(
        payload?.name || payload?.code || payload?.error || "",
      ).trim().toLowerCase();
      const retryAfter = parseRetryAfter(
        response.headers.get("retry-after"),
      );
      const concurrentIdempotentRequest =
        response.status === 409 &&
        providerCode === "concurrent_idempotent_requests";
      const invalidIdempotentRequest =
        response.status === 409 &&
        providerCode === "invalid_idempotent_request";
      const retryable =
        concurrentIdempotentRequest ||
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;

      throw new JobFailure(
        invalidIdempotentRequest
          ? "email_provider_idempotency_payload_conflict"
          : response.status === 429
          ? "email_provider_rate_limited"
          : `email_provider_http_${response.status}`,
        invalidIdempotentRequest
          ? "The email provider rejected reuse of the stable idempotency key with a different payload."
          : `The email provider returned HTTP ${response.status}.`,
        retryable,
        retryAfter,
      );
    }

    const providerMessageId = String(payload?.id || "").trim();
    if (
      providerMessageId.length < 1 ||
      providerMessageId.length > 255 ||
      /[\u0000-\u001f\u007f]/u.test(providerMessageId)
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
