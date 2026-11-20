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

const evidence = readFileSync(new URL("20260918032342_business_accounting_evidence_v1.sql", directory), "utf8");
const statements = readFileSync(new URL("20260918032648_business_financial_statements_v1.sql", directory), "utf8");
for (const table of ["business_accounting_coverage", "business_accounting_position_events", "business_financial_statements"]) {
  assert.ok(evidence.includes(`alter table public.${table} enable row level security`));
  assert.ok(evidence.includes(`alter table public.${table} force row level security`));
  assert.ok(evidence.includes(`('public','${table}')`));
}
assert.doesNotMatch(evidence + statements, /(?:insert into|update|delete from) public\.(?:ledger_entries|bank_accounts|bank_account_balances|inventory_holdings|player_loans)\b/iu);
for (const required of ["after insert on public.business_operating_period_close_receipts", "observed_at<p_cutoff",
  "source_action='owner_inventory_contribution'", "r.labor_cost_basis", "accrual_at_period_due",
  "source_action='store-procurement'", "l.reference_rate", "unclassified_count=0", "equity_difference=0",
  "incomplete_history", "unreconciled", "limit 51", "limit 50", "net_income::text", "currency_reallocation::text"])
  assert.ok(statements.includes(required), required);
assert.doesNotMatch(statements, /grant (?:insert|update|delete)|to_jsonb\s*\(/iu);
console.log("Phase 14A canonical position capture, accrual, currency evidence, fail-closed reconciliation and bounded reads: pass");

// New reporting tables alter the frozen purge schema contract. Verify that the
// forward correction changes only schema fingerprints/cursor counts in its writers.
const purge = readFileSync(new URL("20260918035524_business_reporting_purge_convergence_v1.sql", directory), "utf8");
const priorPurge = readFileSync(new URL("20260831232719_business_store_sales_convergence_assertions_v1.sql", directory), "utf8");
const normalizePurge = (body) => body
  .replaceAll("d3a0e132271485f7c5edf434021a56a1c1ec3768cb003041d227b4775ceecafe", "68695d3995661af72de99b01fffe0ed301071f1131e6a8e6b92f03febfedb960")
  .replaceAll("cb08e151c693cd018fec0fb7fe2a1d700cc34b0f5704c1b4a7bf1c560f2aa6af", "779750e69db0f918d3c54dc47765ac12a04d635bcc32760d529d571fd4041ec0")
  .replaceAll("b04f1ca4956a17a89e9afe29255c467bcb1b071978da35aaef76e85e19c2dbf5", "ef50615cdc9e9191b149f45746d639d196aa0cd1eb1d308dfd2fd80ea43a7fa4")
  .replace(/\b(204|205|452)\b/gu, (value) => ({ 204: "201", 205: "202", 452: "448" })[value]);
for (const name of ["execute_game_data_purge_db_batch_v2", "finalize_game_data_purge_v1"]) {
  const expression = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, "u");
  assert.equal(normalizePurge(purge.match(expression)?.[0] || ""), priorPurge.match(expression)?.[0], name);
}
assert.match(purge, /GAME_PURGE_CURSOR_RECONCILIATION_REQUIRED/u);
assert.equal((purge.match(/private\.is_game_data_purge_delete_authorized_v1\(/gu) || []).length, 2);
console.log("Phase 14A purge retains exact request-bound authority and both observer deletion guards: pass");
