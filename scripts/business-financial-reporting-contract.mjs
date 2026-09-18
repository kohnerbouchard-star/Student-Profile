import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const directory = new URL("backend/supabase/migrations/", root);
const files = readdirSync(directory).filter((name) => name.endsWith("_business_financial_reporting_v1.sql"));
assert.equal(files.length, 1, "reporting has one forward migration owner");
const sql = readFileSync(new URL(files[0], directory), "utf8");
const body = sql.replace(/--[^\n]*/gu, "");
assert.match(body, /^\s*begin;/iu);
assert.match(body, /commit;\s*$/iu);
assert.doesNotMatch(body, /\b(?:insert\s+into|update\s+|delete\s+from|truncate|create\s+table|alter\s+table|for\s+update)\b/iu);
assert.doesNotMatch(body, /ensure_business|current_business_payroll_period_key|account_balances|business_financial_snapshots|revenue_total|profit_total|valuation|market_assets/iu);
for (const required of [
  "public.resolve_player_business_v2(p_game_session_id, p_player_id)",
  "economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id)",
  "r.game_session_id = p_game_session_id", "r.business_id = p_business_id",
  "r.status = 'completed'", "limit 51", "limit 50", "order by r.period_number desc",
  "from public, anon, authenticated, service_role;",
  "'closed_period_operating_evidence'", "'coverage', 'partial'",
  "'income_statement', 'balance_sheet', 'cash_flow_statement'",
  "(p_receipt).period_number::text", "(p_receipt).gross_wages_due::text",
  "e.value ->> 'grossReceipts'", "e.value ->> 'costOfGoodsSold'", "e.value ->> 'taxUnpaid'",
]) assert.ok(body.includes(required), required);
assert.equal((body.match(/security definer/giu) ?? []).length, 1);
assert.equal((body.match(/security invoker/giu) ?? []).length, 2);
assert.equal((body.match(/set search_path = pg_catalog, pg_temp/giu) ?? []).length, 3);
assert.equal((body.match(/language (?:sql|plpgsql) stable/giu) ?? []).length, 3);
assert.equal((body.match(/grant execute/giu) ?? []).length, 1);
assert.match(body, /grant execute on function public\.read_owned_business_financial_reports_v1\(uuid,uuid\)\s+to service_role;/iu);
assert.doesNotMatch(body, /to_jsonb\s*\(|\.metadata|\.request_hash|\.idempotency_key|\.lease_token/iu);

const test = readFileSync(new URL("scripts/business-financial-reporting-database.mjs", root), "utf8");
for (const evidence of ["begin read only", "BUSINESS_NOT_FOUND", "permission denied", "9007199254740993.123456789123456789", "BUSINESS_OPERATING_PERIOD_EVIDENCE_IMMUTABLE", "bounded.truncated", "public.close_claimed_business_operating_period_v1"]) assert.ok(test.includes(evidence), evidence);
const workflow = readFileSync(new URL(".github/workflows/business-financial-reporting.yml", root), "utf8");
for (const gate of ["for PASS in 1 2", "supabase db reset", "business-financial-reporting-database.mjs", "supabase db advisors", "--fail-on error", "github.event.pull_request.head.sha"]) assert.ok(workflow.includes(gate), gate);
console.log(`Phase 14A1 source contract passes: ${fileURLToPath(new URL(files[0], directory))}`);
