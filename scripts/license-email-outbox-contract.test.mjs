import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const OUTBOX_MIGRATIONS = [
  new URL(
    "../backend/supabase/migrations/20260813103000_add_license_email_outbox_schema_v1.sql",
    import.meta.url,
  ),
  new URL(
    "../backend/supabase/migrations/20260813103100_add_atomic_license_materialization_outbox_v2.sql",
    import.meta.url,
  ),
  new URL(
    "../backend/supabase/migrations/20260813103200_add_durable_license_email_worker_queue_v1.sql",
    import.meta.url,
  ),
  new URL(
    "../backend/supabase/migrations/20260813103300_add_license_delivery_operations_v1.sql",
    import.meta.url,
  ),
];

async function readOutboxMigrations() {
  return (await Promise.all(
    OUTBOX_MIGRATIONS.map((url) => readFile(url, "utf8")),
  )).join("\n");
}
const ISSUANCE_WORKER = new URL(
  "../backend/supabase/functions/license-issuance-worker/index.ts",
  import.meta.url,
);
const EMAIL_WORKER = new URL(
  "../backend/supabase/functions/license-email-worker/index.ts",
  import.meta.url,
);
const SHARED_CODE = new URL(
  "../backend/supabase/functions/_shared/licenseCode.ts",
  import.meta.url,
);
const OUTBOX_DOC = new URL(
  "../docs/architecture/license-email-outbox-v1.md",
  import.meta.url,
);

test("purchase-code materialization and email enqueue commit atomically", async () => {
  const source = await readOutboxMigrations();
  for (const migrationUrl of OUTBOX_MIGRATIONS) {
    const migration = await readFile(migrationUrl, "utf8");
    assert.ok(migration.startsWith("begin;\n"));
    assert.ok(migration.trimEnd().endsWith("commit;"));
  }

  for (const required of [
    "create table private.license_email_outbox",
    "issuance_job_id uuid not null unique",
    "purchase_code_id uuid not null unique",
    "idempotency_key text not null unique",
    "claim_license_materialization_jobs_v2",
    "materialize_license_and_enqueue_email_v2",
    "claim_license_email_jobs_v1",
    "complete_license_email_delivery_v1",
    "retry_license_email_job_v1",
    "read_license_fulfillment_reconciliation_v1",
    "read_license_issuance_secret_rotation_guard_v1",
    "for update of candidate_job skip locked",
    "to service_role",
  ]) {
    assert.ok(source.toLowerCase().includes(required.toLowerCase()), required);
  }

  const materializeStart = source.indexOf(
    "create or replace function public.materialize_license_and_enqueue_email_v2",
  );
  const claimEmailStart = source.indexOf(
    "create or replace function public.claim_license_email_jobs_v1",
  );
  assert.ok(materializeStart >= 0);
  assert.ok(claimEmailStart > materializeStart);
  const materialize = source.slice(materializeStart, claimEmailStart);
  assert.match(
    materialize,
    /insert into public\.purchase_codes[\s\S]+insert into private\.license_email_outbox[\s\S]+update private\.license_issuance_jobs[\s\S]+else 'issued'/u,
  );
  assert.match(materialize, /LICENSE_EMAIL_OUTBOX_REPLAY_MISMATCH/u);
});

test("rolling migration disables claims and refuses active leases", async () => {
  const source = await readOutboxMigrations();
  assert.match(source, /select public\.disable_license_issuance_scheduler_v1\(\)/u);
  assert.match(source, /LICENSE_OUTBOX_MIGRATION_ACTIVE_LEASES/u);
  assert.match(
    source,
    /status = 'processing'[\s\S]+lease_expires_at > clock_timestamp\(\)/u,
  );
  assert.match(
    source,
    /create or replace function public\.complete_license_issuance_job_v1[\s\S]+insert into private\.license_email_outbox[\s\S]+status = 'delivered'/u,
  );
});

test("email outbox has strict lease, delivery, and idempotency invariants", async () => {
  const source = await readOutboxMigrations();

  assert.match(
    source,
    /license_email_outbox_status_lease_state_check[\s\S]+status = 'processing'[\s\S]+lease_token is not null[\s\S]+status <> 'processing'[\s\S]+lease_token is null/u,
  );
  assert.match(
    source,
    /idempotency_key =\s*'license-issuance\/' \|\| issuance_job_id::text \|\| '\/delivery-v1'/u,
  );
  assert.match(source, /interval '23 hours'/u);
  assert.match(source, /email_idempotency_window_expired/u);
  assert.match(source, /LICENSE_EMAIL_MESSAGE_ID_REPLAY_MISMATCH/u);
  assert.match(source, /email_provider_message_id !~ '\[\[:cntrl:\]\]'/u);
  assert.match(source, /candidate_payment\.status = 'accepted'/u);
});

test("plaintext code is regenerated, verifier-checked, and never persisted", async () => {
  const migration = await readOutboxMigrations();
  const issuance = await readFile(ISSUANCE_WORKER, "utf8");
  const email = await readFile(EMAIL_WORKER, "utf8");
  const shared = await readFile(SHARED_CODE, "utf8");

  assert.doesNotMatch(
    migration,
    /\b(?:plaintext_code|plain_code|raw_code|display_code|license_code)\s+(?:text|json|jsonb|bytea)\b/iu,
  );
  assert.match(issuance, /hashIssuedPurchaseCode/u);
  assert.match(issuance, /materialize_license_and_enqueue_email_v2/u);
  assert.match(email, /deriveLicenseCode/u);
  assert.match(email, /hashIssuedPurchaseCode/u);
  assert.match(email, /constantTimeEqualHex/u);
  assert.match(email, /license_email_code_verifier_mismatch/u);
  assert.match(migration, /expected_code_hash/u);
  assert.match(shared, /econovaria-license-code-v1/u);
});

test("secret rotation remains blocked through every undelivered email state", async () => {
  const source = await readOutboxMigrations();
  const start = source.indexOf(
    "create or replace function public.read_license_issuance_secret_rotation_guard_v1",
  );
  const end = source.indexOf(
    "create or replace function public.configure_license_email_scheduler_v1",
  );
  assert.ok(start >= 0);
  assert.ok(end > start);
  const guard = source.slice(start, end);

  for (const required of [
    "safeToRotateDerivationSecret",
    "secretRotationBlockedJobCount",
    "pending",
    "processing",
    "retry",
    "dead_letter",
    "drain_or_reconcile_materialized_undelivered_jobs",
  ]) {
    assert.ok(guard.includes(required), required);
  }
});

test("reconciliation reports every cross-phase invariant without mutating data", async () => {
  const source = await readOutboxMigrations();
  const start = source.indexOf(
    "create or replace function public.read_license_fulfillment_reconciliation_v1",
  );
  const end = source.indexOf(
    "create or replace function public.read_license_issuance_secret_rotation_guard_v1",
  );
  assert.ok(start >= 0);
  assert.ok(end > start);
  const reconciliation = source.slice(start, end);

  for (const required of [
    "acceptedPaymentsMissingIssuanceJobs",
    "materializedIssuanceMissingEmailOutbox",
    "emailOutboxMissingPurchaseCode",
    "deliveredIssuanceMissingDeliveredEmail",
    "deliveredEmailMissingDeliveredIssuance",
    "activeEmailForNonacceptedPayment",
    "healthy",
  ]) {
    assert.ok(reconciliation.includes(required), required);
  }
  assert.doesNotMatch(reconciliation, /\b(insert|update|delete)\b/iu);
});

test("documentation defines crash boundaries and operational holds", async () => {
  const source = await readFile(OUTBOX_DOC, "utf8");
  for (const required of [
    "transactional email outbox",
    "issuance worker crashes",
    "email worker crashes",
    "24-hour",
    "read_license_fulfillment_reconciliation_v1",
    "scheduler remains disabled",
    "No production deployment",
    "refund and chargeback",
  ]) {
    assert.ok(source.includes(required), required);
  }
});
