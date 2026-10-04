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
  businessMutationExecutor: "backend/src/domains/business/api/playerBusinessMutationExecutor.ts",
  businessRequestValidation: "backend/src/domains/business/api/playerBusinessRequestValidation.ts",
  businessRepository: "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
  businessErrors: "backend/src/domains/business/infrastructure/playerBusinessDatabaseErrors.ts",
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

assert.match(source.businessHandler, /PlayerBusinessRequestScope/u);
assert.match(source.businessHandler, /dependencies\.resolveScope/u);
assert.match(source.businessHandler, /executePlayerBusinessMutation/u);
assert.match(source.businessHandler, /validateBusinessRequestMethodAndFields/u);
assert.doesNotMatch(source.businessHandler, /assertBusinessCreationAllowed\?\.|p_currency_code:\s*body\./u);
assert.match(source.businessMutationExecutor, /assertBusinessCreationAllowed\?\./u);
assert.match(source.businessMutationExecutor, /p_idempotency_key:\s*idempotencyKey/u);
assert.doesNotMatch(source.businessMutationExecutor, /p_currency_code:\s*body\./u);
assert.match(source.businessRequestValidation, /validateBusinessRequestEnvelope/u);
assert.match(source.businessRequestValidation, /validateBusinessRequestMethodAndFields/u);
assert.match(source.businessRoutes, /readPlayerBusinessRoutePath/u);
assert.match(source.businessRoutes, /resource:\s*"stockroom"/u);

assert.match(source.businessRepository, /assertBusinessCreationAllowed/u);
assert.match(source.businessRepository, /business\.create_or_acquire/u);
assert.match(source.businessRepository, /\.eq\("metadata->>idempotency_key", input\.idempotencyKey\)/u);
assert.doesNotMatch(source.businessRepository, /record\(row\.metadata\)\.idempotency_key/u);
assert.match(source.businessRepository, /resolve_player_business_v2/u);
assert.match(source.businessRepository, /throw mapPlayerBusinessDatabaseError\(response.error.message\)/u);
assert.match(source.businessErrors, /BUSINESS_OWNERSHIP_AMBIGUOUS:\s*\[\s*409/u);
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
  "businessCreate", "businessProductCreate",
  "businessInputPurchase",
  "businessProduction", "businessPrice", "businessCandidateHire", "businessTerminate",
  "businessStatus", "playerTransfer", "savingsTransfer", "loansRead",
  "loanApply", "loanRepay",
]) assert.equal(
  source.mixedRoutes.includes(`kind: "${routeKind}"`) || source.businessRoutes.includes(`kind: "${routeKind}"`),
  true,
  `missing route kind ${routeKind}`,
);

assert.match(source.businessHandler, /business_input_purchase_retired/u);
assert.doesNotMatch(source.businessMutationExecutor, /case "businessInputPurchase"|purchase_business_input_v1/u);

for (const routeCapability of ["business", "loans"]) {
  assert.match(source.capabilities, new RegExp(`['"]${routeCapability}['"]`, "u"));
}
for (const actionCapability of [
  "bankTransfer", "savingsTransfer", "businessCreate",
  "businessEmployeeTerminate", "businessCandidateHire",
  "businessPrice", "businessProductCreate", "businessProduction",
  "businessStatus", "loanApply", "loanRepay",
]) {
  assert.match(source.capabilities, new RegExp(`['"]${actionCapability}['"]`, "u"));
  assert.match(source.playerCapabilities, new RegExp(`['"]${actionCapability}['"]`, "u"));
}
for (const endpoint of [
  "businessCreate", "businessProductCreate",
  "businessProduction", "businessPrice", "businessCandidateHire", "businessTerminate",
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

const phase4bWorkforceHiringSource = await readFile(
  "backend/src/domains/business/api/playerBusinessWorkforce.ts",
  "utf8",
);
assert.match(
  phase4bWorkforceHiringSource,
  /hire_business_workforce_candidate_v2/u,
  "Candidate-only workforce hiring must remain wired to the Phase 4B RPC.",
);

// REF025a: SQL SOURCE characterization only; these assertions do not execute Postgres.
function loanRoutine(text, name) {
  const start = text.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing characterized routine ${name}`);
  const body = /\bas\s+(\$[a-z_]*\$)/iu.exec(text.slice(start));
  assert.ok(body, `missing routine body ${name}`);
  const end = text.indexOf(body[1] + ";", start + body.index + body[0].length);
  assert.ok(end > start, `missing routine terminator ${name}`);
  return text.slice(start, end);
}
// Reconstruct only the three declared Aug26 source rewrites; no SQL execution.
const bankIdentity = await readFile("backend/supabase/migrations/20260826100000_business_bank_identity_runtime_v1.sql", "utf8");
assert.match(bankIdentity, /v_match_count <> v_expected_count/u);
assert.match(bankIdentity, /v_definition := replace\(v_definition, v_old_predicate, v_new_predicate\)/u);
assert.match(bankIdentity, /execute v_definition;/u);
function effectiveLoanRoutine(name) {
  const historical = loanRoutine(source.repaymentAccounts, name);
  const tuple = new RegExp(`'${name}'::text,\\s*'((?:''|[^'])*)'::text,\\s*'((?:''|[^'])*)'::text,\\s*1::integer`, "u").exec(bankIdentity);
  assert.ok(tuple, `missing exact one-occurrence identity rewrite ${name}`);
  const [, before, after] = tuple.map((part) => part.replaceAll("''", "'"));
  assert.equal(historical.split(before).length - 1, 1, "historical Aug12 rewrite input occurs once");
  const effective = historical.replace(before, after);
  assert.ok(!effective.includes(before), "obsolete balance predicate removed");
  return effective;
}
for (const name of ["normalize_loan_application_repayment_account_v1", "bind_player_loan_repayment_account_v1"]) {
  const binding = effectiveLoanRoutine(name);
  assert.match(binding, /business_row\.game_session_id = new\.game_session_id/u);
  assert.match(binding, /business_row\.owner_player_id = new\.player_id/u);
  assert.match(binding, /LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE/u);
  const businessId = name.startsWith('normalize_') ? 'v_business.id' : 'new.business_id';
  assert.ok(binding.includes(`v_product.borrower_type = 'business' and balance_row.business_id = ${businessId}`));
  assert.match(binding, /v_product\.borrower_type <> 'business' and balance_row\.player_id is not distinct from new\.player_id/u);
}
const applyLoan = loanRoutine(source.operability, "apply_player_loan_v1");
const reviewLoan = loanRoutine(source.core, "review_player_loan_application_v1");
const repayLoan = effectiveLoanRoutine("repay_player_loan_v1");
const serviceLoan = loanRoutine(source.core, "service_player_loan_status_v1");
const recoverLoan = loanRoutine(source.fixes, "restructure_player_loan_v1");
assertBefore(applyLoan, "for update;", "select application_row.*", "Player lock precedes application receipt lookup");
assertBefore(applyLoan, "LOAN_CURRENCY_MISMATCH", "select application_row.*", "Currency denial precedes application replay");
assertBefore(applyLoan, "AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED", "select application_row.*", "Legacy owner denial precedes application replay");
assert.match(applyLoan, /business_row\.owner_player_id = p_player_id/u);
assert.match(applyLoan, /application_row\.game_session_id = p_game_session_id[\s\S]*application_row\.player_id = p_player_id/u);
assert.match(applyLoan, /v_application\.request_hash <> v_hash/u);
assert.match(applyLoan, /'checking',\s*public\.business_account_type_v1\(v_business\.public_key\)/u);
assert.match(applyLoan, /interval '84 days'/u);
assertBefore(reviewLoan, "for update;", "v_application.status in ('approved','declined')", "Application lock precedes terminal-state replay");
assert.match(reviewLoan, /owner_player_id=v_application\.player_id/u);
assertBefore(reviewLoan, "insert into public.player_loans", "record_player_ledger_entry", "Approval obligation precedes ledger posting inside the same SQL routine");
assertBefore(reviewLoan, "record_player_ledger_entry", "set status='approved'", "Approval follows disbursement");
assert.doesNotMatch(reviewLoan, /request_hash|IDEMPOTENCY_KEY_CONFLICT/u);
assertBefore(repayLoan, "for update;", "LOAN_NOT_PAYABLE", "Loan lock precedes payable-state denial");
assertBefore(repayLoan, "LOAN_NOT_PAYABLE", "select payment_row.*", "Known legacy limitation: paid-loan retry is denied before receipt lookup");
assert.match(repayLoan, /loan_row\.game_session_id = p_game_session_id\s+and loan_row\.player_id = p_player_id/u);
assert.match(repayLoan, /business_row\.owner_player_id = p_player_id/u);
assert.match(repayLoan, /v_account is distinct from v_expected_business_account/u);
assert.match(repayLoan, /v_loan\.business_id is not null and balance_row\.business_id = v_loan\.business_id/u);
assert.match(repayLoan, /v_loan\.business_id is null and balance_row\.player_id is not distinct from p_player_id/u);
assert.match(repayLoan, /balance_row\.game_session_id = p_game_session_id[\s\S]*balance_row\.account_type = v_account[\s\S]*balance_row\.currency_code = v_loan\.currency_code\s+for update/u);
assert.match(repayLoan, /v_payment\.request_hash <> v_hash/u);
assertBefore(repayLoan, "INSUFFICIENT_FUNDS", "record_player_ledger_entry", "Insufficient balance fails before ledger debit");
assertBefore(repayLoan, "record_player_ledger_entry", "insert into public.loan_payments", "Payment receipt follows ledger debit in the same routine");
assert.match(repayLoan, /v_interest_paid := least\(v_pay, v_loan\.accrued_interest\)/u);
assert.match(repayLoan, /v_period_paid \+ 0\.005 >= v_loan\.scheduled_payment/u);
assert.match(serviceLoan, /game_session_id=p_game_session_id and status in \('active','delinquent','restructured'\) order by id for update/u);
assert.match(serviceLoan, /v_loan\.principal_balance\*v_loan\.annual_rate\*v_days\/365,2/u);
assert.match(serviceLoan, /default_after_days[\s\S]*status='defaulted'[\s\S]*delinquency_grace_days[\s\S]*status='delinquent'/u);
assert.match(serviceLoan, /recalculate_player_credit_v1\(p_game_session_id,v_loan\.player_id\)/u);
assertBefore(recoverLoan, "STAFF_GAME_ACCESS_DENIED", "for update;", "Staff game authority precedes recovery loan locking");
assertBefore(recoverLoan, "metadata ->> 'idempotency_key'", "LOAN_NOT_RESTRUCTURABLE", "Existing recovery replays by audit key before state validation");
assert.match(recoverLoan, /'active', 'delinquent', 'defaulted'/u);
assert.doesNotMatch(recoverLoan, /request_hash|IDEMPOTENCY_KEY_CONFLICT|set principal_balance/u);
console.log("REF025a loan binding, servicing and replay SQL source characterization passed (not database execution).");

const liability = await readFile("backend/supabase/migrations/20261004145731_add_loan_liability_contract_v1.sql", "utf8");
for (const table of ["loan_applications", "player_loans"]) {
  assert.ok(liability.includes(`${table}_business_liability_disabled_v1`));
  assert.ok(liability.includes(`${table}_operator_scope_fk_v1`));
  assert.ok(liability.includes(`${table}_borrower_scope_fk_v1`));
}
assert.equal((liability.match(/check \(liability_kind = 'legacy_v1'\)/g) || []).length, 2);
assert.doesNotMatch(liability, /create (?:or replace )?function|drop constraint|grant |disable row level/i);
console.log("REF025c1 inert liability schema source contract passed (not database proof).");

// c2-0 records existing provenance/classification, not an approved income policy.
const receiptSource = await readFile("backend/supabase/migrations/20260827094000_multicurrency_store_funding_settlement_v1.sql", "utf8");
const receiptStart = receiptSource.indexOf("create or replace function economy_private.validate_store_offer_purchase_receipt_v2()");
assert.ok(receiptStart >= 0);
const receiptValidator = receiptSource.slice(receiptStart, receiptSource.indexOf("\ncreate or replace function ", receiptStart + 1));
const receiptBranches = receiptValidator.split("\n  else\n");
assert.equal(receiptBranches.length, 2);
for (const marker of ["funding_row.game_session_id = new.game_session_id", "funding_row.target_account_id = new.target_bank_account_id",
  "funding_row.target_currency_code = new.currency_code", "funding_row.target_amount = new.total_price",
  "funding_row.source_action = 'business_offer_purchase_funding'", "party_row.business_id = new.business_id",
  "entry_row.bank_transaction_id = new.bank_transaction_id", "entry_row.line_metadata ->> 'lineRole' = 'purchase_funding_recipient_credit'"])
  assert.ok(receiptBranches[0].includes(marker), marker);
for (const marker of ["entry_row.id = new.business_credit_ledger_entry_id", "entry_row.business_id = new.business_id",
  "entry_row.game_session_id = new.game_session_id", "entry_row.currency_code = new.currency_code",
  "entry_row.amount = new.business_credit", "entry_row.source_action = 'business_offer_purchase_credit'", "entry_row.source_id = new.id"])
  assert.ok(receiptBranches[1].includes(marker), marker);
const cashClasses = await readFile("backend/supabase/migrations/20260918032648_business_financial_statements_v1.sql", "utf8");
assert.ok(cashClasses.includes("when l.source_domain='banking_fx' then 'exchange'"));
assert.ok(cashClasses.includes("when l.source_action in ('capital_contribution_in','capitalization_in','ipo_primary_subscription') then 'capital'"));
assert.ok(cashClasses.includes("when l.source_action='loan_disbursement' then 'financing'"));
assert.match(cashClasses, /'account_transfer_in','account_transfer_out'\)[\s\S]*?then 'operating'/u);
console.log("REF025c2-0 receipt provenance and cash classification SOURCE characterization passed; approved income policy awaits separate c2-2 implementation.");

// c2-1 SOURCE only: legacy bodies are spliced, gates and economic RPCs stay intact.
const loanBindings = await readFile(new URL("../backend/supabase/migrations/20261004221307_prepare_business_loan_bindings_v1.sql", import.meta.url), "utf8");
for (const token of ["BUSINESS_LOAN_IDENTITY_IMMUTABLE", "BUSINESS_LOAN_BINDING_SOURCE_DRIFT",
  "public.resolve_player_business_v2", "ep.business_id=b.id", "a.obligation_currency_code=new.currency_code",
  "a.initiating_operator_player_id=new.initiating_operator_player_id", "for share of b,p",
  "conname=tg_table_name||'_business_liability_disabled_v1'", "to_jsonb(new)->>'liability_kind'"]) {
  assert.ok(loanBindings.includes(token), `c2-1 missing binding invariant: ${token}`);
}
assert.doesNotMatch(loanBindings, /drop constraint|create table|foreign key|grant |record_player_ledger_entry/iu);
console.log("REF025c2-1 gated binding SOURCE contract passed (not database execution).");

const salesAssessment = await readFile(new URL("../backend/supabase/migrations/20261004235046_add_private_business_loan_sales_assessment_v1.sql", import.meta.url), "utf8");
assert.match(salesAssessment, /stable security invoker/u);
assert.match(salesAssessment, /sum\(r.gross_revenue\)/u);
assert.match(salesAssessment, /business_sales_authority_committed_at <= p_as_of/u);
assert.doesNotMatch(salesAssessment, /create table|add column|foreign key|grant |drop constraint|insert into|update public/iu);
console.log("REF025c2-2a private sales assessment SOURCE contract passed (not database execution).");
