#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const recoveryName = "20260823110400_business_manufacturing_recovery_v2.sql";
const assertionName = "20260823110410_business_manufacturing_recovery_schema_assertions_v2.sql";
const recoveryPath = path.join(root, "backend/supabase/migrations", recoveryName);
const assertionPath = path.join(root, "backend/supabase/migrations", assertionName);
const scopePath = path.join(
  root,
  "docs/roadmaps/business-phase6-timed-manufacturing-scope-v1.md",
);

for (const file of [recoveryPath, assertionPath, scopePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required Phase 6D file: ${file}`);
}

const sql = fs.readFileSync(recoveryPath, "utf8");
const lower = sql.toLowerCase();
const assertions = fs.readFileSync(assertionPath, "utf8");
const scope = fs.readFileSync(scopePath, "utf8");

function requireTokens(source, label, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`${label} missing: ${token}`);
  }
}

function forbidTokens(source, label, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) throw new Error(`${label} contains forbidden token: ${token}`);
  }
}

requireTokens(sql, "Terminal evidence schema", [
  "terminal_idempotency_key text null",
  "terminal_request_hash text null",
  "terminal_reason_code text null",
  "terminal_actor_type text null",
  "business_manufacturing_jobs_terminal_evidence_check",
  "status in ('cancelled','failed')",
]);

requireTokens(sql, "Canonical release helper", [
  "release_business_manufacturing_resources_v2",
  "v_job.status not in ('queued','in_progress')",
  "order by item.public_key, material.recipe_line_key",
  "for update of material",
  "quantity_owned - v_wip_holding.quantity_reserved",
  "'eventType', 'TRANSFERRED_OUT'",
  "'eventType', 'TRANSFERRED_IN'",
  "'location', 'work_in_progress'",
  "'location', 'warehouse'",
  "'manufacturing_resources_released'",
  "'manufacturing-release:' || v_job.public_key",
  "BUSINESS_MANUFACTURING_RESOURCE_RELEASE_POST_FAILED",
]);

requireTokens(sql, "Exact-once hold release", [
  "status = 'released'",
  "released_at = v_now",
  "BUSINESS_MANUFACTURING_MATERIAL_RELEASE_CONFLICT",
  "BUSINESS_MANUFACTURING_LABOR_RELEASE_CONFLICT",
  "BUSINESS_MANUFACTURING_EQUIPMENT_RELEASE_CONFLICT",
  "materialLinesReleased",
  "laborReservationsReleased",
  "equipmentReservationsReleased",
]);

requireTokens(sql, "Player cancellation", [
  "cancel_business_manufacturing_job_v2",
  "from public.resolve_player_business_v2",
  "BUSINESS_MANUFACTURING_CANCEL_REQUEST_INVALID",
  "BUSINESS_MANUFACTURING_CANCEL_STATE_INVALID",
  "BUSINESS_MANUFACTURING_TERMINAL_IDEMPOTENCY_CONFLICT",
  "'player_cancelled'",
  "terminal_idempotency_key = btrim(p_idempotency_key)",
  "terminal_actor_type = 'player'",
  "business.manufacturing.cancelled",
  "completion_lease_token = null",
  "resource_state = 'released'",
]);

requireTokens(sql, "System failure recovery", [
  "fail_business_manufacturing_job_v2",
  "BUSINESS_MANUFACTURING_COMPLETION_LEASE_ACTIVE",
  "BUSINESS_MANUFACTURING_ATTEMPTS_NOT_EXHAUSTED",
  "terminal_idempotency_key = btrim(p_idempotency_key)",
  "terminal_actor_type = 'system'",
  "business.manufacturing.failed",
]);

requireTokens(sql, "Exhausted-attempt processor", [
  "fail_exhausted_business_manufacturing_jobs_v2",
  "completion_attempt_count >= job_row.completion_max_attempts",
  "completion_lease_expires_at <= v_now",
  "order by job_row.completes_at, job_row.public_key",
  "for update skip locked",
  "'completion_attempts_exhausted'",
  "'system:exhausted:' || v_job.public_key",
]);

requireTokens(assertions, "Inactive-safe release guard", [
  "old.status = 'staged' and new.status = 'released'",
  "return new;",
  "BUSINESS_MANUFACTURING_MATERIAL_IDENTITY_IMMUTABLE",
  "BUSINESS_MANUFACTURING_MATERIAL_TERMINAL",
]);

requireTokens(assertions, "Database Replay assertions", [
  "job.terminal_idempotency_key",
  "job.completion_attempt_count",
  "material.warehouse_account_id",
  "reservation.released_at",
  "release_business_manufacturing_resources_v2",
  "cancel_business_manufacturing_job_v2",
  "fail_business_manufacturing_job_v2",
  "fail_exhausted_business_manufacturing_jobs_v2",
]);

for (const functionName of [
  "cancel_business_manufacturing_job_v2",
  "fail_business_manufacturing_job_v2",
]) {
  const start = sql.indexOf(`create or replace function public.${functionName}`);
  const language = sql.indexOf("language plpgsql", start);
  if (start < 0 || language <= start) {
    throw new Error(`Unable to isolate ${functionName} signature.`);
  }
  const signature = sql.slice(start, language).toLowerCase();
  const returnsStart = signature.indexOf("returns table");
  if (returnsStart < 0) throw new Error(`${functionName} omits returns table.`);
  const returns = signature.slice(returnsStart);
  forbidTokens(returns, `${functionName} public return signature`, [
    " uuid",
    "game_session_id",
    "business_id",
    "job_id",
    "inventory_account_id",
    "employee_id",
    "installation_id",
    "lease_token",
    "request_hash",
    "terminal_request_hash",
  ]);
}

forbidTokens(lower, "Phase 6D bounded exclusions", [
  "create table public.business_store_offers",
  "create table if not exists public.business_store_offers",
  "cron.schedule",
  "client_completed_at",
  "browser_completed_at",
  "payroll_debit",
  "durability_percent",
  "repair_cost",
  "create table public.inventory_accounts",
  "create table public.inventory_holdings",
]);

requireTokens(scope, "Phase 6 scope state", [
  "cancellation/failure",
  "release",
  "Player cutover",
]);

console.log("Business Phase 6D exact-once recovery contract: PASS");
