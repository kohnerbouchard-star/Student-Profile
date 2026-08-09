import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  core: "backend/supabase/migrations/20260721120000_add_business_banking_credit_runtime_v1.sql",
  operating: "backend/supabase/migrations/20260721121000_complete_business_operating_controls_v1.sql",
  hardening: "backend/supabase/migrations/20260721122000_harden_business_banking_invariants_v1.sql",
  fixes: "backend/supabase/migrations/20260721122100_fix_business_banking_rpc_signatures_v1.sql",
  operability: "backend/supabase/migrations/20260806093000_provision_player_banking_and_credit_v1.sql",
  handler: "backend/src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts",
  repository: "backend/src/domains/business-banking/infrastructure/supabasePlayerBusinessBankingRepository.ts",
  routes: "backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts",
  capabilities: "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
  playerScope: "backend/src/domains/players/api/playerRequestScope.ts",
  dispatcher: "backend/supabase/functions/classroom-api/index.ts",
  admin: "backend/supabase/functions/admin-api/businessBankingOperations.ts",
  adminDispatcher: "backend/supabase/functions/admin-api/index.ts",
  adminLifecycle: "backend/supabase/functions/admin-api/gameLifecycleOperations.ts",
  playerAdapter: "player-terminal/src/api/business-banking-backend-routes.js",
  playerEndpoints: "player-terminal/src/api/endpoints.js",
  playerCapabilities: "player-terminal/src/api/capabilities.js",
  playerResourcePlan: "player-terminal/src/api/resource-plan.js",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));
const migrations = [
  source.core,
  source.operating,
  source.hardening,
  source.fixes,
  source.operability,
];
const sql = migrations.join("\n");

for (const migration of migrations) {
  assert.match(migration.trim(), /^--[\s\S]*\nbegin;/iu);
  assert.match(migration.trim(), /commit;$/iu);
}

const loopSecuredTables = [
  "business_entities", "business_products", "business_inventory",
  "business_employees", "business_production_runs", "business_sales",
  "banking_transfer_requests", "savings_interest_runs", "loan_products",
  "credit_profiles", "loan_applications", "player_loans", "loan_payments",
];
for (const table of loopSecuredTables) {
  assert.match(source.core, new RegExp(`['"]${table}['"]`, "iu"), `missing RLS loop membership ${table}`);
}
for (const statement of [
  "alter table public.%I enable row level security",
  "alter table public.%I force row level security",
  "revoke all on table public.%I from public, anon, authenticated",
]) {
  assert.match(source.core, new RegExp(escapeRegExp(statement), "iu"));
}
for (const statement of [
  "alter table public.business_compliance_records enable row level security",
  "alter table public.business_compliance_records force row level security",
  "revoke all on table public.business_compliance_records from public,anon,authenticated",
]) {
  assert.match(source.operating, new RegExp(escapeRegExp(statement), "iu"));
}

for (const operation of [
  "player_transfer_sent", "player_transfer_received", "account_transfer_out",
  "account_transfer_in", "savings_interest", "capitalization_out",
  "capitalization_in", "production_cost", "sales_revenue", "wage_expense",
  "tax_expense", "input_purchase", "loan_disbursement", "loan_payment",
  "business_banking_correction",
]) {
  assert.match(sql, new RegExp(`['"]${operation}['"]`, "u"), `missing ledger operation ${operation}`);
}
assert.ok((sql.match(/record_player_ledger_entry/gu) ?? []).length >= 20);
assert.ok((sql.match(/for update/giu) ?? []).length >= 10, "insufficient row-lock coverage for concurrent mutations");
assert.match(sql, /from public\.account_balances[\s\S]{0,600}for update/iu);
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
  "race", "ethnicity", "gender", "religion", "disability",
  "national origin", "sexual orientation",
]) {
  assert.doesNotMatch(sql.toLowerCase(), new RegExp(`\\b${escapeRegExp(prohibited)}\\b`, "u"));
}

for (const forbiddenClientScope of [
  "gameSessionId", "playerUuid", "senderPlayerId", "recipientPlayerId", "ownerPlayerId",
]) {
  assert.match(source.handler, new RegExp(`['"]${forbiddenClientScope}['"]`, "u"));
}
assert.match(source.handler, /resolvePlayerRequestScope/u);
assert.match(source.handler, /resolve_player_economic_context_v1/u);
assert.doesNotMatch(source.handler, /p_currency_code:\s*body\./u);
assert.match(source.handler, /assertBusinessCreationAllowed\?\./u);
assert.match(source.handler, /p_idempotency_key:\s*idempotencyKey/u);
assert.match(
  source.handler,
  /if \(account === "checking" \|\| account === "cash"\) return "checking";/u,
);
assert.doesNotMatch(
  source.handler,
  /if \(account === "checking" \|\| account === "cash"\) return "cash";/u,
);

for (const scopeGuard of [
  /rejectClientSuppliedPlayerIdentity/u,
  /rejectClientSuppliedBodyIdentity/u,
  /requireMatchingPlayerGameSession/u,
  /gameSession\.status !== "active"/u,
  /player\.status !== "active"/u,
]) {
  assert.match(source.playerScope, scopeGuard);
}
assert.match(source.playerScope, /invalid_player_session_scope/u);

for (const routeKind of [
  "businessCreate", "businessProductCreate", "businessInputPurchase",
  "businessProduction", "businessPrice", "businessHire", "businessTerminate",
  "businessStatus", "playerTransfer", "savingsTransfer", "loansRead",
  "loanApply", "loanRepay",
]) {
  assert.equal(source.routes.includes(`kind: "${routeKind}"`), true, `missing route kind ${routeKind}`);
}

for (const routeCapability of ["business", "loans"]) {
  assert.match(source.capabilities, new RegExp(`['"]${routeCapability}['"]`, "u"));
}

for (const actionCapability of [
  "bankTransfer", "savingsTransfer", "businessCreate",
  "businessEmployeeTerminate", "businessHire", "businessInputPurchase",
  "businessPrice", "businessProductCreate", "businessProduction",
  "businessStatus", "loanApply", "loanRepay",
]) {
  assert.match(source.capabilities, new RegExp(`['"]${actionCapability}['"]`, "u"));
  assert.match(source.playerCapabilities, new RegExp(`['"]${actionCapability}['"]`, "u"));
}

for (const endpoint of [
  "businessCreate", "businessProductCreate", "businessInputPurchase",
  "businessProduction", "businessPrice", "businessHire", "businessTerminate",
  "businessStatus", "bankTransfer", "savingsTransfer", "loanApply", "loanRepay",
]) {
  assert.match(source.playerEndpoints, new RegExp(`\\b${endpoint}:`, "u"));
  assert.match(source.playerAdapter, new RegExp(`\\b${endpoint}:`, "u"));
  assert.match(source.playerResourcePlan, new RegExp(`\\b${endpoint}:`, "u"));
}

assert.match(source.dispatcher, /handlePlayerBusinessBankingRequest/u);
assert.match(source.dispatcher, /dispatchRateLimitedReviewedPlayerRequest/u);
assert.match(source.admin, /review_player_loan_application_v1/u);
assert.match(source.admin, /admin_business_banking_correction_v1/u);
assert.match(source.adminDispatcher, /handleBusinessBankingAdminOperation/u);
assert.match(source.adminDispatcher, /const businessBankingOperation = await handleBusinessBankingAdminOperation/u);
assert.match(source.adminLifecycle, /game_mutations_paused/u);
assert.match(source.adminLifecycle, /game_lifecycle_terminal/u);
const adminGuardPosition = source.adminDispatcher.indexOf("const mutationGuard = guardGameScopedMutation");
const adminBusinessPosition = source.adminDispatcher.indexOf("const businessBankingOperation = await handleBusinessBankingAdminOperation");
assert.ok(adminGuardPosition >= 0 && adminBusinessPosition > adminGuardPosition, "Admin lifecycle guard must run before Business/Banking operations");
assert.match(source.playerCapabilities, /businessTerminate:\s*"businessEmployeeTerminate"/u);
assert.match(source.playerAdapter, /recipientPlayerIdentifier/u);
assert.doesNotMatch(source.playerAdapter, /recipientPlayerUuid/u);

for (const functionName of [
  "calculate_loan_installment_payment_v1",
  "ensure_game_loan_products_for_currency_v1",
  "ensure_game_banking_catalog_v1",
  "ensure_player_banking_accounts_v1",
  "execute_player_account_transfer_v1",
  "apply_player_loan_v1",
  "repay_player_loan_v1",
]) {
  assert.match(source.operability, new RegExp(`create or replace function public\\.${functionName}`, "iu"));
}
for (const triggerName of [
  "ensure_player_banking_after_country_assignment",
  "ensure_player_banking_after_residency",
]) {
  assert.match(source.operability, new RegExp(`create trigger ${triggerName}`, "iu"));
}
for (const template of [
  "starter-credit-v1",
  "growth-credit-v1",
  "working-capital-v1",
]) {
  assert.match(source.operability, new RegExp(template, "u"));
}
assert.match(source.operability, /'checking', 0, v_currency, null/u);
assert.match(source.operability, /'savings', 0, v_currency, null/u);
assert.doesNotMatch(source.operability, /create trigger ensure_game_banking_after_insert/iu);
const savingsTransferSql = source.operability.slice(
  source.operability.indexOf("create or replace function public.execute_player_account_transfer_v1"),
  source.operability.indexOf("create or replace function public.apply_player_loan_v1"),
);
assertBefore(
  savingsTransferSql,
  "for update;",
  "select transfer_row.*",
  "Savings-transfer replay checks must be serialized by the Player row lock.",
);
assert.doesNotMatch(source.operability, /record_player_ledger_entry\([\s\S]{0,300},\s*0\s*,/iu);
assert.match(source.operability, /v_product\.currency_code <> v_context\.currency_code/u);
assert.match(source.operability, /entry_row\.source_domain not in \('banking', 'loans'\)/u);
assert.match(source.operability, /calculate_loan_installment_payment_v1\([\s\S]{0,300}v_product\.payment_frequency_cycles/iu);
assert.match(source.operability, /add column if not exists applied_due_at timestamptz null/u);
assert.match(source.operability, /applied_due_at\s*\) values \([\s\S]{0,400}v_loan\.next_due_at/iu);
assert.match(source.operability, /payment_row\.applied_due_at = v_loan\.next_due_at/u);
assert.match(source.operability, /v_due_satisfied := v_period_paid \+ 0\.005 >= v_loan\.scheduled_payment/u);
assert.match(source.operability, /when v_due_satisfied then v_loan\.next_due_at/u);
assert.doesNotMatch(source.operability, /origination_fee_rate\)\s*\/\s*v_product\.term_cycles/iu);
assert.match(source.operability, /revoke all on function public\.ensure_player_banking_accounts_v1/u);
assert.match(source.operability, /grant execute on function public\.ensure_player_banking_accounts_v1/u);

assert.match(source.repository, /assertBusinessCreationAllowed/u);
assert.match(source.repository, /business\.create_or_acquire/u);
assert.match(
  source.repository,
  /\.eq\("metadata->>idempotency_key", input\.idempotencyKey\)/u,
);
assert.doesNotMatch(source.repository, /record\(row\.metadata\)\.idempotency_key/u);
assert.match(source.repository, /business_ownership_ambiguous/u);
assert.match(source.repository, /business_already_owned/u);
assert.doesNotMatch(source.repository, /\.neq\("status", "closed"\)/u);
assert.match(source.repository, /resolve_player_economic_context_v1/u);
assert.match(source.repository, /\.eq\("currency_code", localCurrency\)/u);
assert.match(source.repository, /frequencyCycles \* 7 \* 86_400_000/u);
assert.match(source.repository, /LOAN_CURRENCY_MISMATCH/u);
assert.match(source.repository, /ACCOUNT_CURRENCY_MISMATCH/u);

console.log("Business, Banking, Loans, and Credit runtime contract passed.");

function assertBefore(sourceText, first, second, message) {
  const firstPosition = sourceText.indexOf(first);
  const secondPosition = sourceText.indexOf(second);
  assert.ok(
    firstPosition >= 0 && secondPosition > firstPosition,
    message,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
