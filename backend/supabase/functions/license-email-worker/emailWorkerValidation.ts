import {
  type ClaimedEmailJob,
  UUID_PATTERN,
  EMAIL_PATTERN,
  SUPPORTED_TEMPLATE_VERSION,
  IDEMPOTENCY_KEY_PATTERN,
} from "./emailWorkerContracts.ts";


export function normalizeClaimedJob(
  raw: Record<string, unknown>,
): ClaimedEmailJob | null {
  const emailJobId = String(raw?.email_job_id || "")
    .trim().toLowerCase();
  const issuanceJobId = String(raw?.issuance_job_id || "")
    .trim().toLowerCase();
  const paymentEventId = String(raw?.payment_event_id || "")
    .trim().toLowerCase();
  const purchaseCodeId = String(raw?.purchase_code_id || "")
    .trim().toLowerCase();
  const leaseToken = String(raw?.lease_token || "")
    .trim().toLowerCase();
  const recipientEmail = String(raw?.recipient_email || "")
    .trim().toLowerCase();
  const templateVersion = String(raw?.template_version || "")
    .trim().toLowerCase();
  const idempotencyKey = String(raw?.idempotency_key || "").trim();
  const expectedCodeHash = String(raw?.expected_code_hash || "")
    .trim().toLowerCase();
  const expectedCodeHashVersion = String(
    raw?.expected_code_hash_version || "",
  ).trim().toLowerCase();
  const durationDays = Number(raw?.license_duration_days);
  const expirationDays = raw?.purchase_code_expires_after_days === null ||
      raw?.purchase_code_expires_after_days === undefined
    ? null
    : Number(raw.purchase_code_expires_after_days);
  const nonce = Number(raw?.code_generation_nonce);
  const attemptCount = Number(raw?.attempt_count);

  if (
    !UUID_PATTERN.test(emailJobId) ||
    !UUID_PATTERN.test(issuanceJobId) ||
    !UUID_PATTERN.test(paymentEventId) ||
    !UUID_PATTERN.test(purchaseCodeId) ||
    !UUID_PATTERN.test(leaseToken) ||
    !EMAIL_PATTERN.test(recipientEmail) ||
    templateVersion !== SUPPORTED_TEMPLATE_VERSION ||
    !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey) ||
    idempotencyKey !==
      `license-issuance/${issuanceJobId}/delivery-v1` ||
    !/^[0-9a-f]{64}$/u.test(expectedCodeHash) ||
    expectedCodeHashVersion !== "hmac-sha256-v2" ||
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
    email_job_id: emailJobId,
    issuance_job_id: issuanceJobId,
    payment_event_id: paymentEventId,
    purchase_code_id: purchaseCodeId,
    recipient_email: recipientEmail,
    product_sku: String(raw?.product_sku || "").trim(),
    license_duration_days: durationDays,
    purchase_code_expires_after_days: expirationDays,
    code_generation_nonce: nonce,
    attempt_count: attemptCount,
    lease_token: leaseToken,
    template_version: templateVersion,
    idempotency_key: idempotencyKey,
    expected_code_hash: expectedCodeHash,
    expected_code_hash_version: "hmac-sha256-v2",
  };
}


export class JobFailure extends Error {
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


export function normalizeJobFailure(
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
      "license_email_unexpected_failure",
      "License email delivery failed unexpectedly.",
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


export async function readBoundedJson(
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


export function parseRetryAfter(value: string | null): number | undefined {
  const normalized = String(value || "").trim();
  const seconds = Number(normalized);
  if (
    Number.isSafeInteger(seconds) &&
    seconds >= 1 &&
    seconds <= 86400
  ) {
    return seconds;
  }

  const date = Date.parse(normalized);
  if (Number.isFinite(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    if (delta >= 1 && delta <= 86400) return delta;
  }
  return undefined;
}


export function constantTimeEqualHex(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  let difference = leftBytes.byteLength ^ rightBytes.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}


export function safeTag(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "_")
    .slice(0, 256) || "unknown";
}


export function redactLicenseCodes(value: string): string {
  return String(value || "").replace(
    /[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}/gu,
    "[redacted-license-code]",
  );
}


export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}


export function unauthorized(): Response {
  return json(401, {
    ok: false,
    error: {
      code: "invalid_scheduler_token",
      message: "Scheduler authentication failed.",
    },
  });
}


export function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}


export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}


export function json(
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
