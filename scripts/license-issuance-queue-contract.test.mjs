import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { processClaimedLicenseJob } from "../backend/src/domains/licensing/application/processClaimedLicenseJob.ts";

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
const IDEMPOTENCY_WINDOW_MIGRATION = new URL(
  "../backend/supabase/migrations/20260813091500_harden_license_email_idempotency_window_v1.sql",
  import.meta.url,
);
const SCHEDULER_SAFETY_MIGRATION = new URL(
  "../backend/supabase/migrations/20260813093000_add_license_issuance_scheduler_safety_switch_v1.sql",
  import.meta.url,
);
const WEBHOOK = new URL(
  "../backend/supabase/functions/license-payment-webhook/index.ts",
  import.meta.url,
);
const ISSUANCE_WORKER = new URL(
  "../backend/supabase/functions/license-issuance-worker/index.ts",
  import.meta.url,
);
const EMAIL_WORKER = new URL(
  "../backend/supabase/functions/license-email-worker/index.ts",
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
  assert.match(source, /max_redemptions\s*=\s*1/u);
  assert.match(
    source,
    /revoke all on table private\.license_issuance_jobs[\s\S]+service_role/u,
  );
});

test("automatic email retries stop before provider idempotency can expire", async () => {
  const source = await readFile(IDEMPOTENCY_WINDOW_MIGRATION, "utf8");
  assert.ok(source.startsWith("begin;\n"));
  assert.ok(source.trimEnd().endsWith("commit;"));

  for (const required of [
    "first_delivery_attempt_at",
    "interval '23 hours'",
    "email_idempotency_window_expired",
    "operator reconciliation is required",
    "status = 'dead_letter'",
    "for update skip locked",
    "coalesce(",
    "claim_license_issuance_jobs_v1",
    "to service_role",
  ]) {
    assert.ok(source.toLowerCase().includes(required.toLowerCase()), required);
  }

  assert.match(
    source,
    /first_delivery_attempt_at\s*=\s*coalesce\([\s\S]+v_now/u,
  );
  assert.doesNotMatch(
    source,
    /first_delivery_attempt_at[\s\S]+interval\s+'(?:24|25|48) hours'/u,
  );
});

test("scheduler has a service-role kill switch", async () => {
  const source = await readFile(SCHEDULER_SAFETY_MIGRATION, "utf8");
  assert.ok(source.startsWith("begin;\n"));
  assert.ok(source.trimEnd().endsWith("commit;"));

  for (const required of [
    "disable_license_issuance_scheduler_v1",
    "econovaria-license-issuance-scheduler-v1",
    "cron.unschedule",
    "security definer",
    "revoke all",
    "to service_role",
  ]) {
    assert.ok(source.toLowerCase().includes(required.toLowerCase()), required);
  }

  assert.match(source, /where jobname\s*=\s*v_scheduler_name/u);
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

  assert.match(source, /Math\.abs\([\s\S]+SIGNATURE_WINDOW_SECONDS/u);
  assert.doesNotMatch(source, /licenseDurationDays/u);
  assert.doesNotMatch(source, /purchaseCodeExpiresAfterDays/u);
  assert.doesNotMatch(source, /console\.(?:log|debug)\(/u);
});

test("issuance worker materializes one code and commits one email-outbox job", async () => {
  const worker = await readFile(ISSUANCE_WORKER, "utf8");
  const application = await readFile(new URL("../backend/src/domains/licensing/application/processClaimedLicenseJob.ts", import.meta.url), "utf8");
  const source = worker + application;
  assert.match(worker, /processClaimedLicenseJob\(issuanceCommands, runtime, job, \{\s*deriveLicenseCode,\s*hashIssuedPurchaseCode,/u);
  assert.match(worker, /materialize: \(input\) => client\.rpc\("materialize_license_and_enqueue_email_v2", input\)/u);
  assert.match(worker, /retry: \(input\) => client\.rpc\("retry_license_issuance_job_v1", input\)/u);
  assert.doesNotMatch(application, /Deno\.|createClient|fetch\(|\.rpc\(/u);

  for (const required of [
    "ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET",
    "ECONOVARIA_PURCHASE_CODE_HMAC_SECRET",
    "claim_license_materialization_jobs_v2",
    "materialize_license_and_enqueue_email_v2",
    "retry_license_issuance_job_v1",
    "PROCESSING_CONCURRENCY",
    "redactLicenseCodes",
  ]) {
    assert.ok(source.includes(required), required);
  }

  assert.doesNotMatch(source, /RESEND_API_KEY/u);
  assert.doesNotMatch(source, /Idempotency-Key/u);
  assert.doesNotMatch(source, /api\.resend\.com/u);
  assert.doesNotMatch(
    source,
    /console\.(?:log|debug)\([^)]*licenseCode/u,
  );
});

test("email worker regenerates the code and sends through a stable idempotency key", async () => {
  const source = await readFile(EMAIL_WORKER, "utf8");

  for (const required of [
    "ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET",
    "ECONOVARIA_PURCHASE_CODE_HMAC_SECRET",
    "RESEND_API_KEY",
    "claim_license_email_jobs_v1",
    "complete_license_email_delivery_v1",
    "retry_license_email_job_v1",
    "Idempotency-Key",
    "job.idempotency_key",
    "concurrent_idempotent_requests",
    "invalid_idempotent_request",
    "license_email_code_verifier_mismatch",
    "constantTimeEqualHex",
    "DELIVERY_CONCURRENCY",
    "redactLicenseCodes",
  ]) {
    assert.ok(source.includes(required), required);
  }

  assert.match(
    source,
    /deriveLicenseCode\([\s\S]+jobId:\s*job\.issuance_job_id[\s\S]+nonce:\s*job\.code_generation_nonce/u,
  );
  assert.match(
    source,
    /hashIssuedPurchaseCode\([\s\S]+job\.expected_code_hash/u,
  );
  assert.doesNotMatch(
    source,
    /console\.(?:log|debug)\([^)]*licenseCode/u,
  );
});

test("deployment inventory keeps payment fulfillment isolated and dormant in staging", async () => {
  const manifest = JSON.parse(await readFile(EDGE_MANIFEST, "utf8"));
  const temporary = new Map(
    manifest.temporaryStagingFunctions.map((entry) => [
      entry.slug,
      entry.verifyJwt,
    ]),
  );
  assert.equal(temporary.get("license-payment-webhook"), false);
  assert.equal(temporary.get("license-issuance-worker"), false);
  assert.equal(temporary.get("license-email-worker"), false);

  const workflow = await readFile(STAGING_WORKFLOW, "utf8");
  assert.match(workflow, /environment:\s+staging/u);
  assert.match(workflow, /--no-verify-jwt/u);
  assert.match(
    workflow,
    /20260813103[0-3]00_[a-z0-9_]+\.sql/u,
  );
  assert.match(workflow, /disable_license_issuance_scheduler_v1/u);
  assert.match(workflow, /disable_license_email_scheduler_v1/u);
  assert.match(workflow, /enable_scheduler:/u);
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && inputs\.enable_scheduler == true/u,
  );
  assert.match(workflow, /configure_license_issuance_scheduler_v1/u);
  assert.match(workflow, /configure_license_email_scheduler_v1/u);
  assert.match(workflow, /license-email-worker/u);
  assert.match(workflow, /production-hold:/u);
  assert.doesNotMatch(
    workflow,
    /environment:\s+production[\s\S]+supabase functions deploy/u,
  );
});

// These are application policy checks; SQL atomicity is qualified by the disposable worker harness.
const claimedJob = { job_id: "00000000-0000-4000-8000-000000000045", lease_token: "00000000-0000-4000-8000-000000000046",
  code_generation_nonce: 0, attempt_count: 1 };
const runtime = { licenseCodeDerivationSecret: "synthetic-derive", purchaseCodeHmacSecret: "synthetic-hmac" };
async function exerciseIssuance(replies, options = {}) {
  const calls = [], cryptoCalls = [], logs = [];
  const originalWarn = console.warn, originalError = console.error;
  console.warn = (...args) => logs.push(args); console.error = (...args) => logs.push(args);
  try {
    const call = async (name, args) => {
      calls.push({ name, args });
      if (name === "retry_license_issuance_job_v1") return options.retryError
        ? { error: { message: "synthetic detail" } } : { data: { jobStatus: options.deadLetter ? "dead_letter" : "retry" } };
      return replies[Math.min(calls.length - 1, replies.length - 1)];
    };
    const result = await processClaimedLicenseJob({
      materialize: args => call("materialize_license_and_enqueue_email_v2", args),
      retry: args => call("retry_license_issuance_job_v1", args),
    }, runtime, { ...claimedJob, attempt_count: options.attempt || 1 }, {
      async deriveLicenseCode(input) {
        cryptoCalls.push(["derive", input]);
        if (options.cryptoError) throw new Error("sensitive synthetic detail must not reach logs");
        return `synthetic-code-${input.nonce}`;
      },
      async hashIssuedPurchaseCode(secret, code) { cryptoCalls.push(["hash", secret, code]); return "a".repeat(64); },
    });
    return { result, calls, cryptoCalls, logs };
  } finally { console.warn = originalWarn; console.error = originalError; }
}
for (const outcome of ["created", "replayed"]) {
  test(`Licensing ${outcome} preserves claim identity and one atomic command`, async () => {
    const r = await exerciseIssuance([{ data: { outcome } }]);
    assert.deepEqual(r.result, { issued: true, deadLettered: false }); assert.deepEqual(r.logs, []);
    assert.deepEqual(r.calls, [{ name: "materialize_license_and_enqueue_email_v2", args: {
      p_job_id: claimedJob.job_id, p_lease_token: claimedJob.lease_token, p_code_hash: "a".repeat(64),
      p_code_hash_version: "hmac-sha256-v2", p_code_generation_nonce: 0, p_template_version: "license-issued-v1",
    } }]);
    assert.deepEqual(r.cryptoCalls, [["derive", { secret: runtime.licenseCodeDerivationSecret, jobId: claimedJob.job_id, nonce: 0 }],
      ["hash", runtime.purchaseCodeHmacSecret, "synthetic-code-0"]]);
  });
}
test("Licensing collision advances only the returned nonce with a five-attempt bound", async () => {
  const r = await exerciseIssuance([{ data: { outcome: "collision", nextCodeGenerationNonce: 7 } }, { data: { outcome: "created" } }]);
  assert.equal(r.result.issued, true); assert.deepEqual(r.calls.map(c => c.args.p_code_generation_nonce), [0, 7]);
  const exhausted = await exerciseIssuance(Array.from({ length: 5 }, (_, i) => ({ data: { outcome: "collision", nextCodeGenerationNonce: i + 1 } })));
  assert.equal(exhausted.calls.length, 6); assert.equal(exhausted.calls.at(-1).args.p_error_code, "license_code_collision_limit");
});
test("Licensing invalid collision and response states never report issuance", async () => {
  for (const nonce of [0, -1, 0.5, 101, undefined]) {
    const r = await exerciseIssuance([{ data: { outcome: "collision", nextCodeGenerationNonce: nonce } }]);
    assert.equal(r.result.issued, false); assert.equal(r.calls.length, 2);
    assert.equal(r.calls.at(-1).args.p_error_code, "license_code_collision_state_invalid");
  }
  const r = await exerciseIssuance([{ data: { outcome: "unexpected" } }]);
  assert.equal(r.calls.at(-1).args.p_error_code, "license_code_materialization_invalid_response");
});
test("Licensing persistence failure retains exact retry delay, lease and safe error", async () => {
  for (const [attempt, delay] of [[1, 18], [2, 36], [8, 1944], [50, 3630]]) {
    const r = await exerciseIssuance([{ error: { message: "private provider detail" } }], { attempt });
    assert.deepEqual(r.result, { issued: false, deadLettered: false });
    const retry = r.calls.at(-1); assert.equal(retry.name, "retry_license_issuance_job_v1");
    assert.deepEqual(retry.args, { p_job_id: claimedJob.job_id, p_lease_token: claimedJob.lease_token,
      p_error_code: "license_code_and_outbox_materialization_failed",
      p_error_detail: "The license code and its email-outbox job could not be committed atomically.",
      p_retry_after_seconds: delay, p_terminal: false });
    assert.doesNotMatch(JSON.stringify(r.logs), /private provider detail/);
  }
});
test("Licensing records only confirmed dead letters and redacts unknown crypto failures", async () => {
  const dead = await exerciseIssuance([{ error: {} }], { deadLetter: true }); assert.equal(dead.result.deadLettered, true);
  const failedRetry = await exerciseIssuance([{ error: {} }], { retryError: true });
  assert.deepEqual(failedRetry.result, { issued: false, deadLettered: false });
  assert.equal(failedRetry.logs.at(-1)[0], "license_issuance_retry_record_failed");
  const crypto = await exerciseIssuance([], { cryptoError: true });
  assert.equal(crypto.calls.length, 1); assert.equal(crypto.calls[0].args.p_error_code, "license_issuance_unexpected_failure");
  assert.doesNotMatch(JSON.stringify(crypto), /sensitive synthetic detail/);
});
