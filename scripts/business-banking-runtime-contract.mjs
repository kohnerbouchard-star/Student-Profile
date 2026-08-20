import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  core: "backend/supabase/migrations/20260721120000_add_business_banking_credit_runtime_v1.sql",
  operating: "backend/supabase/migrations/20260721121000_complete_business_operating_controls_v1.sql",
  hardening: "backend/supabase/migrations/20260721122000_harden_business_banking_invariants_v1.sql",
  fixes: "backend/supabase/migrations/20260721122100_fix_business_banking_rpc_signatures_v1.sql",
  operability: "backend/supabase/migrations/20260806093000_provision_player_banking_and_credit_v1.sql",
  repaymentAccounts: "backend/supabase/migrations/20260812113000_bind_loan_repayment_accounts_v1.sql",
  mixedHandler: "backend/src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts",
  mixedRepository: "backend/src/domains/business-banking/infrastructure/supabasePlayerBusinessBankingRepository.ts",
  mixedRoutes: "backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts",
  businessHandler: "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
  businessRepository: "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
  businessRoutes: "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
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
  playerLoansPage: "player-terminal/src/pages/loans-page.js",
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
  source.repaymentAccounts,
];
const sql = migrations.join("\n");

for (const migration of migrations) {
  assert.match(migration.trim(), /^--[\s\S]*\nbegin;/iu);
  assert.match(migration.trim(), /commit;$/iu);
}

for (const table of [
  "business_entities", "business_products", "business_inventory",
  "business_employees", "business_production_runs", "business_sales",
  "banking_transfer_requests", "savings_interest_runs", "loan_products",
  "credit_profiles", "loan_applications", "player_loans", "loan_payments",
]) {
  assert.match(source.core, new RegExp(`['"]${table}['"]`, "iu"), `missing RLS loop membership ${table}`);
}
for (const statement of [
  "alter table public.%I enable row level security",
  "alter table public.%I force row level security",
  "revoke all on table public.%I from public, anon, authenticated",
]) assert.match(source.core, new RegExp(escapeRegExp(statement), "iu"));

for (const operation of [
  "player_transfer_sent", "player_transfer_received", "account_transfer_out",
  "account_transfer_in", "savings_interest", "capitalization_out",
  "capitalization_in", "production_cost", "sales_revenue", "wage_expense",
  "tax_expense", "input_purchase", "loan_disbursement", "loan_payment",
  "business_banking_correction",
]) assert.match(sql, new RegExp(`['"]${operation}['"]`, "u"), `missing ledger operation ${operation}`);

assert.ok((sql.match(/record_player_ledger_entry/gu) ?? []).length >= 20);
assert.ok((sql.match(/for update/giu) ?? []).length >= 10, "insufficient row-lock coverage for concurrent mutations");
assert.match(sql, /from public\.account_balances[\s\S]{0,600}for update/iu);
assert.doesNotMatch(sql, /create table public\.(?:business_balances|savings_balances|loan_balances)/iu);
assert.match(sql, /IDEMPOTENCY_KEY_CONFLICT/u);
assert.match(sql, /CIRCULAR_TRANSFER_BLOCKED/u);
assert.match(sql, /TRANSFER_VELOCITY_BLOCKED/u);
assert.match(sql, /PLAYER_TRANSFER_SCOPE_MISMATCH/u);
assert.match(sql, /AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED/u);
assert.match(sql, /economic-behavior-v1/u);

for (const prohibited of [
  "race", "ethnicity", "gender", "religion", "disability",
  "national origin", "sexual orientation",
]) assert.doesNotMatch(sql.toLowerCase(), new RegExp(`\\b${escapeRegExp(prohibited)}\\b`, "u"));

// Phase 1 boundary: mixed Business/Banking remains a routing facade, while
// Business validation and mutation authority live in domains/business.
assert.match(source.mixedHandler, /handlePlayerBusinessRequest/u);
assert.match(source.mixedHandler, /isPlayerBusinessRoute/u);
assert.match(source.mixedHandler, /return handleBankingRequest/u);
assert.match(source.mixedRoutes, /readPlayerBusinessRoutePath/u);
assert.match(source.mixedRoutes, /DELEGATED_BUSINESS_ROUTE_CONTRACT/u);
for (const directBusinessRpc of [
  "create_or_acquire_player_business_v1",
  "submit_business_product_v1",
  "purchase_business_input_v1",
  "run_business_production_v1",
  "set_business_product_price_v1",
  "hire_business_employee_v1",
  "terminate_business_employee_v1",
  "transition_business_status_v1",
]) assert.doesNotMatch(source.mixedHandler, new RegExp(directBusinessRpc, "u"));

assert.match(source.businessHandler, /assertBusinessCreationAllowed\?\./u);
assert.match(source.businessHandler, /p_idempotency_key:\s*idempotencyKey/u);
assert.match(source.businessHandler, /PlayerBusinessRequestScope/u);
assert.match(source.businessHandler, /dependencies\.resolveScope/u);
assert.doesNotMatch(source.businessHandler, /p_currency_code:\s*body\./u);
assert.match(source.businessRoutes, /readPlayerBusinessRoutePath/u);
assert.match(source.businessRoutes, /resource:\s*"stockroom"/u);

assert.match(source.businessRepository, /assertBusinessCreationAllowed/u);
assert.match(source.businessRepository, /business\.create_or_acquire/u);
assert.match(source.businessRepository, /\.eq\("metadata->>idempotency_key", input\.idempotencyKey\)/u);
assert.doesNotMatch(source.businessRepository, /record\(row\.metadata\)\.idempotency_key/u);
assert.match(source.businessRepository, /business_ownership_ambiguous/u);
assert.match(source.businessRepository, /business_already_owned/u);
assert.doesNotMatch(source.businessRepository, /\.neq\("status", "closed"\)/u);

// Banking/Loans keep their own scope and monetary authority in the mixed domain.
assert.match(source.mixedHandler, /resolvePlayerRequestScope/u);
assert.match(source.mixedHandler, /resolve_player_economic_context_v1/u);
assert.doesNotMatch(source.mixedHandler, /p_currency_code:\s*body\./u);
assert.match(source.mixedHandler, /if \(account === "checking" \|\| account === "cash"\) return "checking";/u);
assert.doesNotMatch(source.mixedHandler, /if \(account === "checking" \|\| account === "cash"\) return "cash";/u);
assert.match(source.mixedRepository, /resolve_player_economic_context_v1/u);
assert.match(source.mixedRepository, /\.eq\("currency_code", localCurrency\)/u);
assert.match(source.mixedRepository, /frequencyCycles \* 7 \* 86_400_000/u);
assert.match(source.mixedRepository, /LOAN_CURRENCY_MISMATCH/u);
assert.match(source.mixedRepository, /ACCOUNT_CURRENCY_MISMATCH/u);

for (const scopeGuard of [
  /rejectClientSuppliedPlayerIdentity/u,
  /rejectClientSuppliedBodyIdentity/u,
  /requireMatchingPlayerGameSession/u,
  /gameSession\.status !== "active"/u,
  /player\.status !== "active"/u,
]) assert.match(source.playerScope, scopeGuard);
assert.match(source.playerScope, /invalid_player_session_scope/u);

for (const routeKind of [
  "businessCreate", "businessProductCreate", "businessInputPurchase",
  "businessProduction", "businessPrice", "businessHire", "businessTerminate",
  "businessStatus", "playerTransfer", "savingsTransfer", "loansRead",
  "loanApply", "loanRepay",
]) assert.equal(
  source.mixedRoutes.includes(`kind: "${routeKind}"`) || source.businessRoutes.includes(`kind: "${routeKind}"`),
  true,
  `missing route kind ${routeKind}`,
);

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
]) assert.match(source.operability, new RegExp(`create or replace function public\\.${functionName}`, "iu"));
for (const triggerName of [
  "ensure_player_banking_after_country_assignment",
  "ensure_player_banking_after_residency",
]) assert.match(source.operability, new RegExp(`create trigger ${triggerName}`, "iu"));
for (const template of ["starter-credit-v1", "growth-credit-v1", "working-capital-v1"]) {
  assert.match(source.operability, new RegExp(template, "u"));
}
assert.match(source.operability, /'checking', 0, v_currency, null/u);
assert.match(source.operability, /'savings', 0, v_currency, null/u);
assert.doesNotMatch(source.operability, /create trigger ensure_game_banking_after_insert/iu);
const savingsTransferSql = source.operability.slice(
  source.operability.indexOf("create or replace function public.execute_player_account_transfer_v1"),
  source.operability.indexOf("create or replace function public.apply_player_loan_v1"),
);
assertBefore(savingsTransferSql, "for update;", "select transfer_row.*", "Savings-transfer replay checks must be serialized by the Player row lock.");
assert.doesNotMatch(source.operability, /record_player_ledger_entry\([\s\S]{0,300},\s*0\s*,/iu);
assert.match(source.operability, /v_product\.currency_code <> v_context\.currency_code/u);
assert.match(source.operability, /entry_row\.source_domain not in \('banking', 'loans'\)/u);
assert.match(source.operability, /calculate_loan_installment_payment_v1\([\s\S]{0,300}v_product\.payment_frequency_cycles/iu);
assert.match(source.operability, /add column if not exists applied_due_at timestamptz null/u);
assert.match(source.operability, /payment_row\.applied_due_at = v_loan\.next_due_at/u);
assert.match(source.operability, /v_due_satisfied := v_period_paid \+ 0\.005 >= v_loan\.scheduled_payment/u);
assert.doesNotMatch(source.operability, /origination_fee_rate\)\s*\/\s*v_product\.term_cycles/iu);

assert.match(source.repaymentAccounts, /add column if not exists repayment_account_type text/iu);
assert.match(source.repaymentAccounts, /LOAN_REPAYMENT_ACCOUNT_INVALID/u);
assert.match(source.repaymentAccounts, /LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE/u);
const repaymentSql = source.repaymentAccounts.slice(
  source.repaymentAccounts.indexOf("create or replace function public.repay_player_loan_v1"),
  source.repaymentAccounts.indexOf("revoke all on function public.repay_player_loan_v1"),
);
assert.match(repaymentSql, /balance_row\.account_type = v_account/u);
assert.match(repaymentSql, /record_player_ledger_entry\([\s\S]{0,300}v_account/iu);
assert.doesNotMatch(repaymentSql, /else 'checking'/iu);
assert.match(source.playerLoansPage, /<select name="repaymentSource" required>/u);
assert.match(source.playerLoansPage, /label: "Checking account"/u);
assert.match(source.playerLoansPage, /label: "Savings account"/u);
assert.match(source.playerLoansPage, /label: "Business operating account"/u);
assert.doesNotMatch(source.playerLoansPage, /<textarea name="repaymentSource"/u);

console.log("Business, Banking, Loans, and Credit runtime contract passed.");

function assertBefore(sourceText, first, second, message) {
  const firstPosition = sourceText.indexOf(first);
  const secondPosition = sourceText.indexOf(second);
  assert.ok(firstPosition >= 0 && secondPosition > firstPosition, message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
