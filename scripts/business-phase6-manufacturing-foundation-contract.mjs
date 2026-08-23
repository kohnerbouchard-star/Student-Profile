#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationNames = [
  "20260823110000_business_manufacturing_job_foundation_v2.sql",
  "20260823110100_business_manufacturing_worker_and_read_v2.sql",
];
const migrationPaths = migrationNames.map((name) =>
  path.join(root, "backend/supabase/migrations", name)
);
const scopePath = path.join(
  root,
  "docs/roadmaps/business-phase6-timed-manufacturing-scope-v1.md",
);

for (const file of [...migrationPaths, scopePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required Phase 6A file: ${file}`);
}

const migrations = Object.fromEntries(
  migrationPaths.map((file) => [path.basename(file), fs.readFileSync(file, "utf8")]),
);
const sql = Object.values(migrations).join("\n");
const lower = sql.toLowerCase();
const foundation = migrations[migrationNames[0]];
const worker = migrations[migrationNames[1]];
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

requireTokens(foundation, "Manufacturing duration authority", [
  "derive_business_manufacturing_duration_seconds_v2",
  "physical_economy_recipe_definitions",
  "business_recipe_access",
  "game_session_physical_economy_packs",
  "game_session_recipe_availability",
  "event_duration_multiplier",
  "route_disruption_multiplier",
  "difficulty_preset",
  "BUSINESS_MANUFACTURING_DURATION_UNSUPPORTED",
]);

requireTokens(foundation, "Manufacturing job schema", [
  "create table public.business_manufacturing_jobs",
  "default ('mfg_' || encode(gen_random_bytes(16), 'hex'))",
  "references public.business_entities(game_session_id, id)",
  "references public.business_products(game_session_id, id)",
  "references public.physical_economy_recipe_definitions(id)",
  "references public.game_items(game_session_id, id)",
  "references public.players(game_session_id, id)",
  "status in ('queued','in_progress','completed','cancelled','failed')",
  "resource_state in ('reserved','consumed','released')",
  "completion_lease_token uuid null",
  "completion_lease_expires_at timestamptz null",
  "business_manufacturing_jobs_lifecycle_check",
  "business_manufacturing_jobs_idempotency_unique",
  "business_manufacturing_jobs_scope_id_unique",
]);

requireTokens(foundation, "Manufacturing authority guard", [
  "guard_business_manufacturing_job_v2",
  "business_ownership_positions",
  "product_row.product_kind = 'physical_good'",
  "business_recipe_access",
  "physical_economy_recipe_outputs",
  "BUSINESS_MANUFACTURING_OUTPUT_INVALID",
  "BUSINESS_MANUFACTURING_REQUEST_HASH_INVALID",
  "BUSINESS_MANUFACTURING_IDENTITY_IMMUTABLE",
  "BUSINESS_MANUFACTURING_TERMINAL",
  "new.duration_seconds := v_duration",
  "new.recipe_snapshot := jsonb_build_object",
  "'timingAuthority', 'server_v2'",
  "'resourceAuthority', 'canonical_reserved_v2'",
]);

requireTokens(foundation, "Append-only transition authority", [
  "create table public.business_manufacturing_job_transitions",
  "business_manufacturing_job_transitions_idempotency_unique",
  "guard_business_manufacturing_transition_v2",
  "BUSINESS_MANUFACTURING_TRANSITION_IMMUTABLE",
  "enable row level security",
  "force row level security",
  "revoke all on table public.business_manufacturing_jobs",
]);

requireTokens(worker, "Queue start authority", [
  "start_queued_business_manufacturing_jobs_v2",
  "game_row.lifecycle_state = 'active'",
  "order by job_row.queue_available_at, job_row.public_key",
  "for update skip locked",
  "status = 'in_progress'",
  "completes_at = v_now + make_interval(secs => v_job.duration_seconds)",
  "business.manufacturing.started",
]);

requireTokens(worker, "Due completion lease authority", [
  "claim_due_business_manufacturing_jobs_v2",
  "job_row.completes_at <= v_now",
  "job_row.completion_next_attempt_at <= v_now",
  "job_row.completion_attempt_count < job_row.completion_max_attempts",
  "job_row.completion_lease_expires_at <= v_now",
  "order by job_row.completes_at, job_row.public_key",
  "for update skip locked",
  "completion_lease_token = extensions.gen_random_uuid()",
  "release_business_manufacturing_completion_lease_v2",
  "BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID",
]);

requireTokens(worker, "Public manufacturing read", [
  "read_owned_business_manufacturing_jobs_v2",
  "from public.resolve_player_business_v2",
  "output_item.public_key",
  "output_item.canonical_key",
  "completion_blocked boolean",
  "limit 200",
  "Internal UUIDs, leases, request hashes, and reservation ownership remain private.",
]);

const readStart = worker.indexOf(
  "create or replace function public.read_owned_business_manufacturing_jobs_v2",
);
const readLanguage = worker.indexOf("language plpgsql", readStart);
if (readStart < 0 || readLanguage <= readStart) {
  throw new Error("Unable to isolate Phase 6A public manufacturing read signature.");
}
const readSignature = worker.slice(readStart, readLanguage).toLowerCase();
const returnsStart = readSignature.indexOf("returns table");
if (returnsStart < 0) throw new Error("Manufacturing read omits returns table.");
const readReturns = readSignature.slice(returnsStart);
forbidTokens(readReturns, "Public manufacturing read signature", [
  " uuid",
  "game_session_id",
  "business_id",
  "product_id",
  "recipe_definition_id",
  "output_game_item_id",
  "requested_by_player_id",
  "lease_token",
  "request_hash",
]);

forbidTokens(lower, "Phase 6A must reuse canonical authorities", [
  "create table public.game_items",
  "create table if not exists public.game_items",
  "create table public.inventory_accounts",
  "create table if not exists public.inventory_accounts",
  "create table public.inventory_holdings",
  "create table if not exists public.inventory_holdings",
  "create table public.physical_economy_recipe_definitions",
  "create table if not exists public.physical_economy_recipe_definitions",
  "create table public.business_employees",
  "create table if not exists public.business_employees",
  "create table public.equipment_instances",
  "create table if not exists public.equipment_instances",
]);

forbidTokens(lower, "Phase 6A live-cutover exclusions", [
  "create or replace function public.run_business_production_v1",
  "alter function public.run_business_production_v1",
  "post_inventory_transaction_v2",
  "create table public.business_store_offers",
  "create table if not exists public.business_store_offers",
  "cron.schedule",
  "client_completed_at",
  "browser_completed_at",
  "durability_percent",
  "repair_cost",
]);

requireTokens(scope, "Phase 6 scope lock", [
  "Status:** IN PROGRESS",
  "Phase 6A",
  "Phase 6B — atomic manufacturing start and resource hold is IMPLEMENTED",
  "Phase 6E — authenticated Player cutover is IMPLEMENTED",
  "server starts it",
  "FOR UPDATE SKIP LOCKED",
  "Store seller offers or Store-listing inventory",
]);

console.log("Business Phase 6A timed manufacturing foundation contract: PASS");
