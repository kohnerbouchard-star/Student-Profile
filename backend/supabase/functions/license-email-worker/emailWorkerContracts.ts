export const SCHEDULER_NAME = "econovaria-license-email-scheduler-v1";

export const SCHEDULER_HEADER = "x-econovaria-scheduler-token";

export const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

export const DELIVERY_TIMEOUT_MS = 10_000;

export const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;

export const CLAIM_BATCH_SIZE = 10;

export const CLAIM_LEASE_SECONDS = 90;

export const DELIVERY_CONCURRENCY = 5;

export const SUPPORTED_TEMPLATE_VERSION = "license-issued-v1";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const SCHEDULER_TOKEN_PATTERN = /^[0-9a-f]{64}$/iu;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const IDEMPOTENCY_KEY_PATTERN =
  /^license-issuance\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/delivery-v1$/iu;


export interface ClaimedEmailJob {
  readonly email_job_id: string;
  readonly issuance_job_id: string;
  readonly payment_event_id: string;
  readonly purchase_code_id: string;
  readonly recipient_email: string;
  readonly product_sku: string;
  readonly license_duration_days: number;
  readonly purchase_code_expires_after_days: number | null;
  readonly code_generation_nonce: number;
  readonly attempt_count: number;
  readonly lease_token: string;
  readonly template_version: string;
  readonly idempotency_key: string;
  readonly expected_code_hash: string;
  readonly expected_code_hash_version: "hmac-sha256-v2";
}


export interface WorkerRuntime {
  readonly licenseCodeDerivationSecret: string;
  readonly purchaseCodeHmacSecret: string;
  readonly resendApiKey: string;
  readonly emailFrom: string;
  readonly supportEmail: string;
}


export interface JobOutcome {
  readonly delivered: boolean;
  readonly deadLettered: boolean;
}


export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}
