import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  clock: "backend/supabase/migrations/20260822140000_business_payroll_clock_v2.sql",
  payroll: "backend/supabase/migrations/20260822140100_business_payroll_settlement_v2.sql",
  cycle: "backend/supabase/migrations/20260822140200_business_cycle_payroll_cutover_v2.sql",
  retirement:
    "backend/supabase/migrations/20260831232707_business_legacy_sales_retirement_v1.sql",
};
const [clock, payroll, cycle, retirement] = await Promise.all(
  Object.values(files).map((path) => readFile(path, "utf8")),
);

assert.match(clock, /create table public\.business_payroll_clocks/u);
assert.match(clock, /unique \(game_session_id, business_id\)/u);
assert.match(clock, /current_period_number bigint not null default 1/u);
assert.match(clock, /return 'payroll:' \|\| v_clock\.current_period_number::text/u);
assert.match(clock, /unit_labor_cost = 0/u);
assert.match(clock, /unit_labor_cost = 0\n  \)/u);
assert.doesNotMatch(clock, /grant .* to (?:anon|authenticated)/iu);

assert.match(
  payroll,
  /create or replace function public\.settle_business_payroll_current_period_v2\(/u,
);
assert.match(
  payroll,
  /v_period_key := 'payroll:' \|\| v_clock\.current_period_number::text/u,
);
assert.doesNotMatch(
  payroll,
  /p_payroll_period_key/u,
  "The caller must not author the payroll period.",
);
assert.match(payroll, /employee\.status = 'active'/u);
assert.match(payroll, /order by employee\.public_key\n  for update/u);
assert.match(payroll, /'completed'/u);
assert.match(payroll, /'partially_paid'/u);
assert.match(payroll, /'unpaid'/u);
assert.match(payroll, /'INSUFFICIENT_BUSINESS_FUNDS'/u);
assert.match(payroll, /from public\.record_business_ledger_entry_v2\(/u);
assert.match(payroll, /'payroll_employee_credit'/u);
assert.match(payroll, /current_period_number = current_period_number \+ 1/u);
assert.match(
  payroll,
  /create or replace function public\.recover_business_payroll_run_v2\(/u,
);
assert.match(payroll, /'payroll_recovery_credit'/u);
assert.match(payroll, /'payroll_recovery_settlement'/u);
assert.match(payroll, /wage_paid = wage_paid \+ v_pay/u);
assert.match(payroll, /wage_unpaid = wage_unpaid - v_pay/u);
assert.match(payroll, /create table public\.business_payroll_recovery_requests/u);
assert.match(payroll, /IDEMPOTENCY_KEY_CONFLICT/u);
assert.doesNotMatch(payroll, /business_production_runs/u);
assert.doesNotMatch(payroll, /business_labor_reservations/u);
assert.doesNotMatch(payroll, /grant .* to (?:anon|authenticated)/iu);

assert.match(cycle, /create table public\.business_cycle_settlement_receipts/u);
assert.match(cycle, /unique \(game_session_id, business_id, settlement_key\)/u);
assert.match(cycle, /create or replace function public\.settle_business_cycle_v1\(/u);
assert.match(cycle, /settle_business_payroll_current_period_v2\(/u);
assert.match(cycle, /v_wages := coalesce\(v_payroll\.gross_wages_due, 0\)/u);
assert.match(cycle, /'cycle-payroll:' \|\| encode\(/u);
assert.match(cycle, /IDEMPOTENCY_KEY_CONFLICT/u);
assert.doesNotMatch(cycle, /'wage_expense',/u);
assert.doesNotMatch(cycle, /production_labor/u);

assert.match(
  retirement,
  /create or replace function public\.settle_business_payroll_current_period_v2\(/u,
);
assert.match(retirement, /BUSINESS_PAYROLL_SETTLEMENT_WORKER_REQUIRED/u);
assert.match(
  retirement,
  /create or replace function public\.recover_business_payroll_run_v2\(/u,
);
assert.match(retirement, /BUSINESS_PAYROLL_RECOVERY_WORKER_REQUIRED/u);
assert.match(
  retirement,
  /create or replace function public\.settle_business_cycle_v1\([\s\S]+?BUSINESS_CYCLE_SETTLEMENT_RETIRED/u,
);
const retiredCycle = retirement.match(
  /create or replace function public\.settle_business_cycle_v1\([\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(retiredCycle, "The exact legacy cycle signature must be forward-retired.");
assert.doesNotMatch(
  retiredCycle,
  /settle_business_payroll_current_period_v2\(/u,
  "The forward-retired cycle command must not advance payroll.",
);
assert.doesNotMatch(
  retiredCycle,
  /record_business_ledger_entry_v2\(/u,
  "Retired payroll commands must not retain a direct ledger path.",
);

for (const [name, source] of Object.entries({ clock, payroll, cycle, retirement })) {
  assert.match(source, /force row level security/u, `${name} evidence must force RLS`);
  assert.match(
    source,
    /revoke all on table[\s\S]{0,180}from public, anon, authenticated/u,
    `${name} evidence must be browser-inaccessible`,
  );
}

console.log("Business Phase 4C-A payroll settlement authority contract passed.");
