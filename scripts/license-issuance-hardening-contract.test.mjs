import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SNAPSHOT_MIGRATION = new URL(
  "../backend/supabase/migrations/20260813100000_harden_license_fulfillment_snapshots_v1.sql",
  import.meta.url,
);
const STAGING_WORKFLOW = new URL(
  "../.github/workflows/license-issuance-queue-staging.yml",
  import.meta.url,
);
const HARDENING_DOC = new URL(
  "../docs/architecture/license-issuance-hardening-v1.md",
  import.meta.url,
);

const ACTION_REFERENCE = /^\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/gmu;
const FULL_SHA_REFERENCE = /^[^@\s]+@[0-9a-f]{40}$/u;

test("paid license terms are snapshotted before asynchronous processing", async () => {
  const source = await readFile(SNAPSHOT_MIGRATION, "utf8");
  assert.ok(source.startsWith("begin;\n"));
  assert.ok(source.trimEnd().endsWith("commit;"));

  for (const required of [
    "product_sku_snapshot",
    "license_duration_days_snapshot",
    "purchase_code_expires_after_days_snapshot",
    "max_redemptions_snapshot",
    "v_product.product_sku",
    "v_product.license_duration_days",
    "v_product.purchase_code_expires_after_days",
    "v_product.max_redemptions",
    "payment.product_sku_snapshot",
    "payment.license_duration_days_snapshot",
    "payment.purchase_code_expires_after_days_snapshot",
    "v_payment.max_redemptions_snapshot",
    "v_payment.license_duration_days_snapshot",
  ]) {
    assert.ok(source.includes(required), required);
  }

  const claimStart = source.indexOf(
    "create or replace function public.claim_license_issuance_jobs_v1",
  );
  const materializeStart = source.indexOf(
    "create or replace function public.materialize_issued_purchase_code_v1",
  );
  const completeStart = source.indexOf(
    "create or replace function public.complete_license_issuance_job_v1",
  );
  assert.ok(claimStart >= 0);
  assert.ok(materializeStart > claimStart);
  assert.ok(completeStart > materializeStart);

  const claimSource = source.slice(claimStart, materializeStart);
  const materializeSource = source.slice(materializeStart, completeStart);
  assert.doesNotMatch(claimSource, /join\s+private\.license_products/iu);
  assert.doesNotMatch(materializeSource, /private\.license_products/iu);
});

test("queue state and delivery completion have database invariants", async () => {
  const source = await readFile(SNAPSHOT_MIGRATION, "utf8");

  assert.match(
    source,
    /license_issuance_jobs_status_lease_state_check[\s\S]+status\s*=\s*'processing'[\s\S]+lease_token\s+is\s+not\s+null[\s\S]+status\s*<>\s*'processing'[\s\S]+lease_token\s+is\s+null/iu,
  );
  assert.match(
    source,
    /status\s*=\s*'delivered'[\s\S]+email_provider_message_id\s*<>\s*v_message_id[\s\S]+LICENSE_DELIVERY_MESSAGE_ID_REPLAY_MISMATCH/u,
  );
  assert.match(source, /v_message_id\s*~\s*'\[\[:cntrl:\]\]'/u);
  assert.match(source, /LICENSE_CODE_COLLISION_LIMIT/u);
  assert.match(source, /for update of candidate_job skip locked/iu);
});

test("derivation-secret rotation is blocked while deterministic replay is needed", async () => {
  const source = await readFile(SNAPSHOT_MIGRATION, "utf8");

  for (const required of [
    "read_license_issuance_secret_rotation_guard_v1",
    "safeToRotateDerivationSecret",
    "secretRotationBlockedJobCount",
    "purchase_code_id is not null",
    "delivered_at is null",
    "drain_or_reconcile_materialized_undelivered_jobs",
    "to service_role",
  ]) {
    assert.ok(source.includes(required), required);
  }
});

test("staging deployment is manual, confirmed, pinned, and production-free", async () => {
  const workflow = await readFile(STAGING_WORKFLOW, "utf8");

  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /deploy_staging:/u);
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' &&[\s\S]+inputs\.deploy_staging == true/u,
  );
  assert.match(
    workflow,
    /DEPLOY LICENSE ISSUANCE TO STAGING/u,
  );
  assert.match(workflow, /STAGING_PROJECT_REF/u);
  assert.match(workflow, /PRODUCTION_PROJECT_REF/u);
  assert.match(workflow, /disable_license_issuance_scheduler_v1/u);
  const pushBlock = workflow.match(
    /\n  push:\n([\s\S]*?)\n  workflow_dispatch:/u,
  )?.[1] || "";
  assert.ok(pushBlock);
  assert.doesNotMatch(pushBlock, /feat\/license-issuance-queue-v1/iu);
  assert.doesNotMatch(pushBlock, /fix\/license-issuance-queue-hardening-v1/iu);
  assert.doesNotMatch(
    workflow,
    /environment:\s+production[\s\S]+supabase functions deploy/iu,
  );

  const actionReferences = [
    ...workflow.matchAll(ACTION_REFERENCE),
  ].map((match) => match[1]);
  assert.ok(actionReferences.length >= 4);
  for (const reference of actionReferences) {
    assert.match(reference, FULL_SHA_REFERENCE, reference);
  }
});

test("promotion documentation keeps provider-native verification and production hold explicit", async () => {
  const source = await readFile(HARDENING_DOC, "utf8");
  for (const required of [
    "Immutable fulfillment snapshots",
    "native webhook signature",
    "one PostgreSQL transaction",
    "80 bits",
    "plaintext code must never appear",
    "safeToRotateDerivationSecret",
    "No production deployment job exists",
    "refund and chargeback policy",
    "replay, concurrency, crash-recovery, and sustained-load tests",
    "source-ready and intentionally dormant",
  ]) {
    assert.ok(source.includes(required), required);
  }
});
