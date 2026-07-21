import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  core: "backend/supabase/migrations/20260721120000_add_business_banking_credit_runtime_v1.sql",
  operating: "backend/supabase/migrations/20260721121000_complete_business_operating_controls_v1.sql",
  hardening: "backend/supabase/migrations/20260721122000_harden_business_banking_invariants_v1.sql",
  fixes: "backend/supabase/migrations/20260721122100_fix_business_banking_rpc_signatures_v1.sql",
  handler: "backend/src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts",
  routes: "backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts",
  capabilities: "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
  dispatcher: "backend/supabase/functions/classroom-api/index.ts",
  admin: "backend/supabase/functions/admin-api/businessBankingOperations.ts",
  playerAdapter: "player-terminal/src/api/business-banking-backend-routes.js",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));
const sql = [source.core, source.operating, source.hardening, source.fixes].join("\n");

for (const migration of [source.core, source.operating, source.hardening, source.fixes]) {
  assert.match(migration.trim(), /^--[\s\S]*\nbegin;/iu);
  assert.match(migration.trim(), /commit;$/iu);
}

for (const table of [
  "business_entities",
  "business_products",
  "business_inventory",
  "business_employees",
  "business_production_runs",
  "business_sales",
  "business_compliance_records",
  "banking_transfer_requests",
  "savings_interest_runs",
  "loan_products",
  "credit_profiles",
  "loan_applications",
  "player_loans",
  "loan_payments",
]) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "iu"));
  assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, "iu"));
  assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, ?anon, ?authenticated`, "iu"));
}

for (const operation of [
  "player_transfer_sent",
  "player_transfer_received",
  "account_transfer_out",
  "account_transfer_in",
  "savings_interest",
  "capitalization_out",
  "capitalization_in",
  "production_cost",
  "sales_revenue",
  "wage_expense",
  "tax_expense",
  "input_purchase",
  "loan_disbursement",
  "loan_payment",
  "business_banking_correction",
]) {
  assert.match(sql, new RegExp(`['\"]${operation}['\"]`, "u"), `missing ledger operation ${operation}`);
}
assert.ok((sql.match(/record_player_ledger_entry/gu) ?? []).length >= 20);
assert.doesNotMatch(sql, /create table public\.(?:business_balances|savings_balances|loan_balances)/iu);
assert.match(sql, /business_account_type_v1/iu);
assert.match(sql, /idempotency_key/iu);
assert.match(sql, /IDEMPOTENCY_KEY_CONFLICT/u);
assert.match(sql, /CIRCULAR_TRANSFER_BLOCKED/u);
assert.match(sql, /TRANSFER_VELOCITY_BLOCKED/u);
assert.match(sql, /PLAYER_TRANSFER_SCOPE_MISMATCH/u);
assert.match(sql, /AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED/u);
assert.match(sql, /economic-behavior-v1/u);

for (const prohibited of [
  "race",
  "ethnicity",
  "gender",
  "religion",
  "disability",
  "national origin",
  "sexual orientation",
]) {
  assert.doesNotMatch(sql.toLowerCase(), new RegExp(prohibited, "u"));
}

for (const forbiddenClientScope of [
  "gameSessionId",
  "playerUuid",
  "senderPlayerId",
  "recipientPlayerId",
  "ownerPlayerId",
]) {
  assert.match(source.handler, new RegExp(`['\"]${forbiddenClientScope}['\"]`, "u"));
}
assert.match(source.handler, /resolvePlayerRequestScope/u);
assert.match(source.handler, /resolve_player_economic_context_v1/u);
assert.doesNotMatch(source.handler, /p_currency_code:\s*body\./u);
assert.match(source.routes, /banking\/savings/u);
assert.match(source.routes, /business\/production-runs/u);
assert.match(source.routes, /banking\/loans/u);

for (const capability of [
  "business",
  "loans",
  "bankTransfer",
  "savingsTransfer",
  "businessCreate",
  "businessProduction",
  "loanApply",
  "loanRepay",
]) {
  assert.match(source.capabilities, new RegExp(`['\"]${capability}['\"]`, "u"));
}
assert.match(source.dispatcher, /handlePlayerBusinessBankingRequest/u);
assert.match(source.dispatcher, /dispatchRateLimitedReviewedPlayerRequest/u);
assert.match(source.admin, /review_player_loan_application_v1/u);
assert.match(source.admin, /admin_business_banking_correction_v1/u);
assert.match(source.playerAdapter, /recipientPlayerIdentifier/u);
assert.doesNotMatch(source.playerAdapter, /recipientPlayerUuid/u);

console.log("Business, Banking, Loans, and Credit runtime contract passed.");
