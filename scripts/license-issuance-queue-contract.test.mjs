import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deriveLicenseCode,
  formatLicenseCodeEntropy,
  hashIssuedPurchaseCode,
  LICENSE_CODE_ALPHABET,
  LICENSE_CODE_PATTERN,
  normalizeIssuedLicenseCode,
} from "../backend/supabase/functions/license-issuance-worker/licenseCode.ts";

const MIGRATION = new URL(
  "../backend/supabase/migrations/20260813090000_add_durable_license_issuance_queue_v1.sql",
  import.meta.url,
);
const WEBHOOK = new URL(
  "../backend/supabase/functions/license-payment-webhook/index.ts",
  import.meta.url,
);
const WORKER = new URL(
  "../backend/supabase/functions/license-issuance-worker/index.ts",
  import.meta.url,
);
const EDGE_MANIFEST = new URL(
  "../backend/supabase/edge-function-manifest.json",
  import.meta.url,
);
const STAGING_WORKFLOW = new URL(
  "../.github/workflows/license-issuance-queue-staging.yml",
  import.meta.url,
);

test("license codes contain 80 bits in a 4-4-4-4 human-safe alphabet", () => {
  assert.equal(LICENSE_CODE_ALPHABET.length, 32);
  assert.equal(new Set(LICENSE_CODE_ALPHABET).size, 32);
  assert.doesNotMatch(LICENSE_CODE_ALPHABET, /[01IO]/u);

  const lowest = formatLicenseCodeEntropy(new Uint8Array(10));
  const highest = formatLicenseCodeEntropy(
    new Uint8Array(10).fill(255),
  );
  assert.equal(lowest, "2222-2222-2222-2222");
  assert.equal(highest, "ZZZZ-ZZZZ-ZZZZ-ZZZZ");
  assert.match(lowest, LICENSE_CODE_PATTERN);
  assert.match(highest, LICENSE_CODE_PATTERN);
});

test("deterministic derivation supports safe retries without storing plaintext", async () => {
  const secret = "d".repeat(64);
  const jobId = "11111111-1111-4111-8111-111111111111";
  const first = await deriveLicenseCode({ secret, jobId, nonce: 0 });
  const replay = await deriveLicenseCode({ secret, jobId, nonce: 0 });
  const collisionRetry = await deriveLicenseCode({
    secret,
    jobId,
    nonce: 1,
  });

  assert.equal(first, replay);
  assert.notEqual(first, collisionRetry);
  assert.match(first, LICENSE_CODE_PATTERN);
  assert.equal(
    normalizeIssuedLicenseCode(first.replaceAll("-", "")),
    first,
  );

  const verifier = await hashIssuedPurchaseCode(
    "h".repeat(64),
    first,
  );
  assert.match(verifier, /^[0-9a-f]{64}$/u);
});

test("database queue is durable, leased, parallel-safe, and idempotent", async () => {
  const source = await readFile(MIGRATION, "utf8");
  assert.ok(source.startsWith("begin;\n"));
  assert.ok(source.trimEnd().endsWith("commit;"));

  for (const required of [
    "create table private.license_products",
    "create table private.license_payment_events",
    "create table private.license_issuance_jobs",
    "license_payment_events_provider_event_unique",
    "license_payment_events_provider_payment_unique",
    "pg_advisory_xact_lock",
    "for update skip locked",
    "lease_token",
    "lease_expires_at",
    "attempt_count",
    "dead_letter",
    "enqueue_paid_license_v1",
    "claim_license_issuance_jobs_v1",
    "materialize_issued_purchase_code_v1",
    "complete_license_issuance_job_v1",
    "retry_license_issuance_job_v1",
    "configure_license_issuance_scheduler_v1",
    "verify_runtime_scheduler_token_v1",
    "to service_role",
  ]) {
    assert.ok(source.toLowerCase().includes(required.toLowerCase()), required);
  }

  assert.match(
    source,
    /insert into public\.purchase_codes[\s\S]+code_hash[\s\S]+code_hash_version[\s\S]+v_code_hash_version/u,
  );
  assert.match(
    source,
    /v_code_hash_version\s*<>\s*'hmac-sha256-v2'/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:plaintext_code|plain_code|license_code|raw_payload)\s+(?:text|json|jsonb|bytea)\b/iu,
  );
  assert.match(
    source,
    /max_redemptions\s*=\s*1/u,
  );
  assert.match(
    source,
    /revoke all on table private\.license_issuance_jobs[\s\S]+service_role/u,
  );
});

test("payment ingress authenticates the raw body and acknowledges only durable writes", async () => {
  const source = await readFile(WEBHOOK, "utf8");

  for (const required of [
    "x-econovaria-payment-timestamp",
    "x-econovaria-payment-signature",
    "ECONOVARIA_PAYMENT_WEBHOOK_SECRET",
    "constantTimeEqualHex",
    "hmacSha256Hex",
    "MAX_BODY_BYTES",
    "payment.succeeded",
    "enqueue_paid_license_v1",
    "payloadSha256",
    "return json(202",
  ]) {
    assert.ok(source.includes(required), required);
  }

  assert.match(
    source,
    /Math\.abs\([\s\S]+SIGNATURE_WINDOW_SECONDS/u,
  );
  assert.doesNotMatch(source, /licenseDurationDays/u);
  assert.doesNotMatch(source, /purchaseCodeExpiresAfterDays/u);
  assert.doesNotMatch(source, /console\.(?:log|debug)\(/u);
});

test("worker derives the same code on retry and uses idempotent email delivery", async () => {
  const source = await readFile(WORKER, "utf8");

  for (const required of [
    "ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET",
    "ECONOVARIA_PURCHASE_CODE_HMAC_SECRET",
    "claim_license_issuance_jobs_v1",
    "materialize_issued_purchase_code_v1",
    "complete_license_issuance_job_v1",
    "retry_license_issuance_job_v1",
    "Idempotency-Key",
    "license-issuance/${job.job_id}/delivery-v1",
    "DELIVERY_CONCURRENCY",
    "email_provider_rate_limited",
    "redactLicenseCodes",
  ]) {
    assert.ok(source.includes(required), required);
  }

  assert.doesNotMatch(
    source,
    /p_(?:plain|raw|display)_?(?:license_)?code/u,
  );
  assert.doesNotMatch(
    source,
    /console\.(?:log|debug)\([^)]*licenseCode/u,
  );
});


test("deployment inventory keeps payment issuance isolated to staging", async () => {
  const manifest = JSON.parse(await readFile(EDGE_MANIFEST, "utf8"));
  const temporary = new Map(
    manifest.temporaryStagingFunctions.map((entry) => [
      entry.slug,
      entry.verifyJwt,
    ]),
  );
  assert.equal(temporary.get("license-payment-webhook"), false);
  assert.equal(temporary.get("license-issuance-worker"), false);

  const workflow = await readFile(STAGING_WORKFLOW, "utf8");
  assert.match(workflow, /refs\/heads\/feat\/license-issuance-queue-v1/u);
  assert.match(workflow, /environment:\s+staging/u);
  assert.match(workflow, /--no-verify-jwt/u);
  assert.match(
    workflow,
    /configure_license_issuance_scheduler_v1/u,
  );
  assert.match(workflow, /production-hold:/u);
  assert.doesNotMatch(
    workflow,
    /environment:\s+production[\s\S]+supabase functions deploy/u,
  );
});
