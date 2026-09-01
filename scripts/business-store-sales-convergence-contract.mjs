#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPaths = Object.freeze({
  periods:
    "backend/supabase/migrations/20260831232642_business_operating_period_clock_lease_v1.sql",
  close:
    "backend/supabase/migrations/20260831232656_business_store_period_tax_close_v1.sql",
  retirement:
    "backend/supabase/migrations/20260831232707_business_legacy_sales_retirement_v1.sql",
  assertions:
    "backend/supabase/migrations/20260831232719_business_store_sales_convergence_assertions_v1.sql",
});

const purgeFingerprint = Object.freeze({
  registrySha256:
    "68695d3995661af72de99b01fffe0ed301071f1131e6a8e6b92f03febfedb960",
  registryTableCount: 202,
  fkGraphSha256:
    "779750e69db0f918d3c54dc47765ac12a04d635bcc32760d529d571fd4041ec0",
  fkGraphEdgeCount: 448,
  deleteOrderSha256:
    "ef50615cdc9e9191b149f45746d639d196aa0cd1eb1d308dfd2fd80ea43a7fa4",
  deleteOrderTableCount: 201,
  finalizeCursor: 202,
});

const phase11PurgeTables = Object.freeze([
  "business_operating_period_policies",
  "business_operating_period_claims",
  "business_gross_receipts_tax_assessments",
  "business_operating_period_store_receipts",
  "business_gross_receipts_tax_payments",
  "business_operating_period_close_receipts",
]);

const [periods, close, retirement, assertions] = await Promise.all(
  Object.values(migrationPaths).map((path) => readFile(path, "utf8")),
);
const [
  adminIndex,
  retirementDispatch,
  purgeWorker,
  purgeRuntimeBinding,
  purgeRuntimeBindingTest,
  workflow,
  edgeConvergenceWorkflow,
  authorityManifestSource,
  databaseHarness,
] = await Promise.all([
  readFile("backend/supabase/functions/admin-api/index.ts", "utf8"),
  readFile(
    "backend/supabase/functions/admin-api/businessSettlementRetirementDispatch.ts",
    "utf8",
  ),
  readFile("backend/supabase/functions/game-data-purger/index.ts", "utf8"),
  readFile(
    "backend/supabase/functions/game-data-purger/runtimeBinding.ts",
    "utf8",
  ),
  readFile(
    "backend/supabase/functions/game-data-purger/runtimeBinding.test.ts",
    "utf8",
  ),
  readFile(".github/workflows/business-store-sales-convergence-v2.yml", "utf8"),
  readFile(".github/workflows/edge-function-inventory-converge.yml", "utf8"),
  readFile(
    "docs/operations/contracts/player-cross-cutting/pr-680.json",
    "utf8",
  ),
  readFile("scripts/business-store-sales-convergence-database.mjs", "utf8"),
]);
const authorityManifest = JSON.parse(authorityManifestSource);
const normalizedPurgeWorker = purgeWorker.replace(/\s+/gu, " ");
const [operationsWorkerService, operationsWorkerRepository, operationsWorkerHttp] =
  await Promise.all([
    readFile(
      "backend/src/domains/business/services/businessOperationsWorker.ts",
      "utf8",
    ),
    readFile(
      "backend/src/domains/business/infrastructure/supabaseBusinessOperationsRepository.ts",
      "utf8",
    ),
    readFile(
      "backend/src/domains/business/api/businessOperationsWorkerHttpHandler.ts",
      "utf8",
    ),
  ]);

assert.deepEqual(
  Object.values(migrationPaths).map((path) => path.match(/\/(\d{14})_/u)?.[1]),
  ["20260831232642", "20260831232656", "20260831232707", "20260831232719"],
  "Phase 11 migration identities must remain the four CLI-generated forward versions",
);

for (const [name, value] of [
  ["EXPECTED_REGISTRY_SHA256", `"${purgeFingerprint.registrySha256}"`],
  ["EXPECTED_REGISTRY_TABLES", purgeFingerprint.registryTableCount],
  ["EXPECTED_FK_GRAPH_SHA256", `"${purgeFingerprint.fkGraphSha256}"`],
  ["EXPECTED_FK_GRAPH_EDGES", purgeFingerprint.fkGraphEdgeCount],
  ["EXPECTED_DELETE_ORDER_SHA256", `"${purgeFingerprint.deleteOrderSha256}"`],
  ["EXPECTED_DELETE_ORDER_TABLES", purgeFingerprint.deleteOrderTableCount],
  ["DB_FINALIZE_CURSOR", purgeFingerprint.finalizeCursor],
]) {
  assert.ok(
    normalizedPurgeWorker.includes(`const ${name} = ${value};`),
    `game-data-purger must bind the prospective Phase 11 ${name} fingerprint`,
  );
}

const purgeWorkerPaths = Object.freeze([
  "backend/supabase/functions/game-data-purger/index.ts",
  "backend/supabase/functions/game-data-purger/runtimeBinding.test.ts",
  "backend/supabase/functions/game-data-purger/runtimeBinding.ts",
]);
assert.equal(
  [...workflow.matchAll(
    /^\s+- backend\/supabase\/functions\/game-data-purger\/\*\*$/gmu,
  )].length,
  2,
  "both pull_request and branch-push triggers must cover the reconciled purger",
);
for (const manifestSection of ["allowedPaths", "requiredFiles"]) {
  for (const purgeWorkerPath of purgeWorkerPaths) {
    assert.ok(
      authorityManifest[manifestSection]?.includes(purgeWorkerPath),
      `PR #680 ${manifestSection} must bind ${purgeWorkerPath}`,
    );
  }
}

const edgeConvergenceEvents = edgeConvergenceWorkflow.slice(
  edgeConvergenceWorkflow.indexOf("\non:\n") + 1,
  edgeConvergenceWorkflow.indexOf("\npermissions:"),
);
assert.deepEqual(
  [...edgeConvergenceEvents.matchAll(/^  ([a-z_]+):/gmu)].map((match) =>
    match[1]
  ),
  ["push"],
  "Edge inventory convergence may retain only its main-push release event",
);
assert.match(
  edgeConvergenceEvents,
  /^on:\n  push:\n    branches:\n      - main\n    paths:/u,
  "Edge inventory convergence must remain a main-push-only release workflow",
);
assert.doesNotMatch(
  edgeConvergenceEvents,
  /(?:pull_request(?:_target)?|workflow_dispatch|workflow_run|repository_dispatch|schedule|cron):/u,
  "Phase 11 may not add a PR writer, manual deploy trigger, or scheduler to Edge convergence",
);
const edgeStagingJobStart = edgeConvergenceWorkflow.indexOf("\n  staging:\n");
const edgeProductionJobStart = edgeConvergenceWorkflow.indexOf("\n  production:\n");
assert.ok(
  edgeStagingJobStart >= 0 && edgeProductionJobStart > edgeStagingJobStart,
  "Edge convergence must retain ordered staging and production jobs",
);
const edgeEnvironmentJobs = Object.freeze({
  staging: edgeConvergenceWorkflow.slice(
    edgeStagingJobStart,
    edgeProductionJobStart,
  ),
  production: edgeConvergenceWorkflow.slice(edgeProductionJobStart),
});
for (const [environment, source] of Object.entries(edgeEnvironmentJobs)) {
  assert.equal(
    [...source.matchAll(/^\s+business-operations-worker$/gmu)].length,
    1,
    `${environment} Edge deployment must include the Business operations worker exactly once`,
  );
  assert.equal(
    [...source.matchAll(/^\s+'POST business-operations-worker' \\$/gmu)].length,
    1,
    `${environment} Edge security smoke must probe the Business operations worker exactly once`,
  );
}
assert.equal(
  [...edgeConvergenceWorkflow.matchAll(/business-operations-worker/gu)].length,
  4,
  "Edge convergence may reference the Business operations worker only in both deploy and smoke lists",
);

for (const [name, source] of Object.entries({ periods, close, retirement, assertions })) {
  assert.match(source, /set local lock_timeout = '5s'/u, `${name} must bound lock waits`);
  assert.match(source, /set local statement_timeout = '[0-9]+s'/u, `${name} must bound statements`);
  assert.doesNotMatch(source, /grant\s+(?:all|insert|update|delete)[^;]*\b(?:anon|authenticated)\b/iu);
}

assert.match(periods, /create table public\.business_operating_period_policies/u);
assert.match(periods, /period_duration_seconds[^;]+604800/su);
assert.match(periods, /gross_receipts_tax_rate/u);
const ensurePolicyFunction = periods.match(
  /create or replace function private\.ensure_business_operating_period_policy_v1\([\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(ensurePolicyFunction, "the lazy operating-period policy initializer must exist");
assert.match(
  ensurePolicyFunction,
  /select game_row\.created_at\s+into v_effective_at/u,
  "concurrent lazy policy initialization must share the immutable game boundary",
);
assert.match(
  ensurePolicyFunction,
  /300,\s+v_effective_at,/u,
  "the lazy v1 policy must persist the canonical game-created-at boundary",
);
assert.doesNotMatch(
  ensurePolicyFunction,
  /300,\s+p_opened_at,/u,
  "caller timing may not become lazy policy authority",
);
assert.match(periods, /alter table public\.business_payroll_clocks[\s\S]+next_due_at/u);
assert.match(periods, /next_due_at[\s\S]+period_started_at/u);
assert.match(periods, /create table public\.business_operating_period_claims/u);
assert.match(periods, /for update(?: of [a-z_]+)? skip locked/iu);
assert.match(periods, /create or replace function public\.claim_due_business_operating_periods_v1\(/u);
assert.match(periods, /create or replace function public\.release_business_operating_period_lease_v1\(/u);
const claimFunction = periods.match(
  /create or replace function public\.claim_due_business_operating_periods_v1\([\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(claimFunction, "the bounded due-work claim function must exist");
assert.doesNotMatch(
  claimFunction,
  /p_(?:now|game|business|due|rate|amount|outcome)/u,
  "the due-work claim may not accept caller-authored time, scope, or economics",
);
assert.match(
  claimFunction,
  /order by\s+business_row\.created_at,\s+business_row\.game_session_id,\s+business_row\.id\s+limit p_batch_limit\s+loop/u,
  "lazy clock provisioning must be deterministic and use the worker batch cap",
);
assert.ok(
  [...claimFunction.matchAll(/limit p_batch_limit/gu)].length >= 2,
  "both lazy clock provisioning and due claims must use the worker batch cap",
);
assert.ok(
  [...claimFunction.matchAll(/game_row\.status = 'active'/gu)].length >= 4,
  "lazy provisioning and due claiming must filter and lock-recheck active games",
);
assert.ok(
  [...claimFunction.matchAll(/game_row\.lifecycle_state = 'active'/gu)].length >= 4,
  "lazy provisioning and due claiming must require an active lifecycle",
);
assert.ok(
  [...claimFunction.matchAll(/from public\.game_sessions as game_row[\s\S]+?for share;/gu)]
    .length >= 2,
  "both worker write paths must retain an active-game transaction lock",
);

assert.match(close, /business_sales_authority_version/u);
assert.match(close, /set default 1/u);
assert.match(close, /create table public\.business_gross_receipts_tax_assessments/u);
assert.match(close, /create table public\.business_operating_period_store_receipts/u);
assert.match(close, /create table public\.business_gross_receipts_tax_payments/u);
assert.match(close, /create table public\.business_operating_period_close_receipts/u);
assert.match(close, /private\.active_bank_account_hold_amount_v1\(/u);
assert.match(close, /private\.post_bank_transaction_v1\(/u);
assert.match(close, /create or replace function public\.close_claimed_business_operating_period_v1\(/u);
assert.match(close, /business_operating_period_store_receipts/u);
assert.match(close, /business_gross_receipts_tax_assessments/u);
assert.doesNotMatch(close, /p_(?:now|tax_rate|inflation|exchange|interest|difficulty|demand|quantity|price)/u);

const closeFunction = close.match(
  /create or replace function public\.close_claimed_business_operating_period_v1\([\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(closeFunction, "the lease-bound close function must exist");
assert.doesNotMatch(closeFunction, /public\.business_sales\b/u);
assert.doesNotMatch(closeFunction, /public\.business_inventory\b/u);
assert.doesNotMatch(
  closeFunction,
  /(?:revenue_total|expense_total|profit_total|valuation|demand_index)\s*=/u,
);
assert.match(closeFunction, /BUSINESS_OPERATING_PERIOD_GAME_INACTIVE/u);
assert.match(closeFunction, /game_row\.status = 'active'/u);
assert.match(closeFunction, /game_row\.lifecycle_state = 'active'/u);
const closeClaimLockPosition = closeFunction.indexOf("select claim_row.*");
const closeGameLockPosition = closeFunction.indexOf(
  "from public.game_sessions as game_row",
);
const closeInactiveGatePosition = closeFunction.indexOf(
  "if not v_game_active then",
);
const closeBankingPosition = closeFunction.indexOf("pg_advisory_xact_lock");
assert.ok(
  closeClaimLockPosition >= 0 && closeGameLockPosition > closeClaimLockPosition,
  "period close must lock/recheck the game only after locking the claim",
);
assert.ok(
  closeFunction.slice(closeGameLockPosition, closeInactiveGatePosition)
    .includes("for share;"),
  "period close must retain the game row lock for the transaction",
);
assert.ok(
  closeInactiveGatePosition >= 0 &&
    closeBankingPosition > closeInactiveGatePosition,
  "inactive games must fail before Banking, payroll, tax, or period effects",
);

const multicurrencyProbeStart = databaseHarness.indexOf(
  "function proveMulticurrencyFundedStorePeriodClose()",
);
const multicurrencyProbeEnd = databaseHarness.indexOf(
  "\nfunction proveLazyClockBatchBound(",
  multicurrencyProbeStart,
);
assert.ok(
  multicurrencyProbeStart >= 0 && multicurrencyProbeEnd > multicurrencyProbeStart,
  "the rollback-only Store funding/period-close currency probe must exist",
);
const multicurrencyProbe = databaseHarness.slice(
  multicurrencyProbeStart,
  multicurrencyProbeEnd,
);
for (const requiredEvidence of [
  "create_business_store_offer_funding_quote_v1",
  "settle_business_store_offer_funding_v2",
  "claim_due_business_operating_periods_v1",
  "close_claimed_business_operating_period_v1",
  "purchase_funding_quote_lines",
  "purchase_funding_recipient_credit",
  "rounding_disclosure",
  "funding_context_hash",
  "business_operating_period_store_receipts",
  "business_gross_receipts_tax_assessments",
  "gross_receipts_by_currency",
  "tax_by_currency",
  "STORE_SELLER_OFFER_BUSINESS_CURRENCY_MISMATCH",
]) {
  assert.ok(
    multicurrencyProbe.includes(requiredEvidence),
    `the currency probe must retain ${requiredEvidence} evidence`,
  );
}
assert.match(multicurrencyProbe, /sourceAccountKey: nrcAccountKey/u);
assert.match(multicurrencyProbe, /sourceAccountKey: yrcAccountKey/u);
assert.match(multicurrencyProbe, /line_row\.spread_rate = 0\.01/u);
assert.match(multicurrencyProbe, /\bbegin;/u);
assert.match(multicurrencyProbe, /\brollback;/u);
assert.doesNotMatch(
  multicurrencyProbe,
  /\bcommit\s*;/u,
  "the currency convergence probe must leave no committed fixture effects",
);
assert.ok(
  databaseHarness.lastIndexOf(
    "proveMulticurrencyFundedStorePeriodClose()",
  ) > multicurrencyProbeStart,
  "the permanent database harness must invoke the currency convergence probe",
);

assert.match(
  retirement,
  /create or replace function public\.settle_business_cycle_v1\([\s\S]+?BUSINESS_CYCLE_SETTLEMENT_RETIRED/u,
);
assert.match(retirement, /BUSINESS_PAYROLL_SETTLEMENT_WORKER_REQUIRED/u);
assert.match(retirement, /BUSINESS_PAYROLL_RECOVERY_WORKER_REQUIRED/u);
assert.match(
  retirement,
  /create or replace function public\.recover_due_business_payroll_liabilities_v1\(\s*p_batch_limit integer default 25/u,
);
const recoveryFunction = retirement.match(
  /create or replace function private\.recover_business_payroll_liability_worker_v1\([\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(recoveryFunction, "the worker-only payroll liability recovery must exist");
assert.match(recoveryFunction, /private\.ensure_active_business_checking_account_v1\(/u);
assert.match(recoveryFunction, /private\.active_bank_account_hold_amount_v1\(/u);
assert.match(recoveryFunction, /private\.post_bank_transaction_v1\(/u);
assert.match(recoveryFunction, /business_payroll_recovery_requests/u);
assert.match(recoveryFunction, /BUSINESS_PAYROLL_RECOVERY_EVIDENCE_CONFLICT/u);
assert.doesNotMatch(recoveryFunction, /record_(?:business|player)_ledger_entry/u);
assert.match(retirement, /BUSINESS_OUTSTANDING_PAYROLL_LIABILITY/u);
assert.match(retirement, /BUSINESS_OUTSTANDING_TAX_LIABILITY/u);
assert.match(
  retirement,
  /revoke all on function public\.recover_due_business_payroll_liabilities_v1\([\s\S]+?from public, anon, authenticated;[\s\S]+?grant execute[\s\S]+?to service_role;/u,
);
const operationsWorkerStart = operationsWorkerService.indexOf(
  "export async function runBusinessOperationsWorker",
);
const operationsWorkerEnd = operationsWorkerService.indexOf(
  "function assertRecoveryResults",
  operationsWorkerStart,
);
const operationsWorkerRun = operationsWorkerStart >= 0 &&
    operationsWorkerEnd > operationsWorkerStart
  ? operationsWorkerService.slice(operationsWorkerStart, operationsWorkerEnd)
  : "";
assert.ok(operationsWorkerRun, "the Business operations worker service must exist");
const recoveryPosition = operationsWorkerRun.indexOf(
  "recoverPayrollLiabilities",
);
const claimPosition = operationsWorkerRun.indexOf(
  "claimDueOperatingPeriods",
  recoveryPosition,
);
assert.ok(
  recoveryPosition >= 0 && claimPosition > recoveryPosition,
  "the internal worker must recover older payroll liabilities before claiming new periods",
);
assert.match(
  operationsWorkerRepository,
  /"recover_due_business_payroll_liabilities_v1",\s*\{ p_batch_limit: input\.batchLimit \}/u,
);
for (const count of [
  "recoveryScannedCount",
  "recoveredCount",
  "recoveryReplayedCount",
  "recoveryDeferredCount",
]) {
  assert.match(operationsWorkerHttp, new RegExp(`\\b${count}\\b`, "u"));
}
assert.match(retirement, /BUSINESS_SALES_AUTHORITY_RETIRED/u);
assert.match(retirement, /BUSINESS_DIRECT_ACQUISITION_RETIRED/u);
assert.match(retirement, /BUSINESS_CACHED_FINANCIAL_AUTHORITY_RETIRED/u);
assert.match(retirement, /aa_neutralize_new_business_cached_financials_v1/u);
assert.match(retirement, /aa_guard_business_cached_financial_update_v1/u);
const formationAuditGuard = retirement.match(
  /create or replace function private\.guard_business_formation_audit_immutable_v1\(\)[\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(
  formationAuditGuard,
  "formation and status replay evidence must have an action-specific immutable guard",
);
assert.match(formationAuditGuard, /old\.action = 'business\.create_or_acquire'/u);
assert.match(formationAuditGuard, /new\.action = 'business\.create_or_acquire'/u);
assert.match(formationAuditGuard, /BUSINESS_FORMATION_AUDIT_IMMUTABLE/u);
assert.match(formationAuditGuard, /old\.action = 'business\.status\.transition'/u);
assert.match(formationAuditGuard, /new\.action = 'business\.status\.transition'/u);
assert.match(formationAuditGuard, /BUSINESS_STATUS_TRANSITION_AUDIT_IMMUTABLE/u);
assert.match(formationAuditGuard, /raise exception/u);
assert.match(
  retirement,
  /create trigger guard_business_formation_audit_immutable_v1\s+before update or delete on public\.audit_log/u,
);
assert.match(
  retirement,
  /enable always trigger guard_business_formation_audit_immutable_v1/u,
);
assert.match(
  assertions,
  /Append the request-bound escape only to blocking BEFORE DELETE guards/u,
  "the action-specific replay guard must remain compatible with M4 purge patching",
);
const retainedDirectFormation = retirement.match(
  /create or replace function public\.create_or_acquire_player_business_v1\([\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(retainedDirectFormation, "the direct Business handoff must be forward-replaced");
assert.match(retainedDirectFormation, /BUSINESS_DIRECT_ACQUISITION_RETIRED/u);
assert.match(retainedDirectFormation, /0::numeric/u);
assert.match(retainedDirectFormation, /request_fingerprint/u);
assert.match(retainedDirectFormation, /result_business_key/u);
assert.match(retainedDirectFormation, /IDEMPOTENCY_KEY_CONFLICT/u);
assert.match(retainedDirectFormation, /BUSINESS_ALREADY_OWNED/u);
const formationFingerprint = retainedDirectFormation.slice(
  retainedDirectFormation.indexOf("v_request_fingerprint := encode("),
  retainedDirectFormation.indexOf("from public.players as player_row"),
);
for (const field of [
  "legalName",
  "entityType",
  "industryCode",
  "countryCode",
  "currencyCode",
  "capitalization",
  "acquisition",
]) {
  assert.match(
    formationFingerprint,
    new RegExp(`'${field}'`, "u"),
    `formation fingerprint must bind ${field}`,
  );
}
for (const field of [
  "idempotency_key",
  "request_fingerprint",
  "business_key",
  "acquisition",
  "capital_contribution",
  "result_business_key",
  "result_status",
  "result_owner_player_id",
  "result_capitalization",
  "result_valuation",
]) {
  assert.match(
    retainedDirectFormation,
    new RegExp(`jsonb_typeof\\(v_replay\\.metadata -> '${field}'\\)`, "u"),
    `formation replay must type-check ${field}`,
  );
}
assert.match(retainedDirectFormation, /v_replay\.actor_type is distinct from 'player'/u);
assert.match(retainedDirectFormation, /v_replay\.target_type is distinct from 'business'/u);
assert.match(retainedDirectFormation, /result_business\.id = v_replay\.target_id/u);
assert.match(
  retainedDirectFormation,
  /result_business\.public_key =\s+v_replay\.metadata ->> 'result_business_key'/u,
);
assert.match(
  retainedDirectFormation,
  /v_replay\.metadata -> 'result_owner_player_id'\s+is distinct from to_jsonb\(p_player_id::text\)/u,
);
assert.match(
  retainedDirectFormation,
  /\(v_replay\.metadata ->> 'result_valuation'\)::numeric/u,
  "formation replay must return the immutable stored valuation result",
);
assert.ok(
  retainedDirectFormation.indexOf("from public.players as player_row") <
    retainedDirectFormation.indexOf("from public.audit_log as audit_row"),
  "retained formation must lock the Player before resolving replay evidence",
);
assert.ok(
  retainedDirectFormation.indexOf("from public.audit_log as audit_row") <
    retainedDirectFormation.indexOf("from public.business_entities as business_row"),
  "retained formation must resolve replay before enforcing singleton ownership",
);
assert.doesNotMatch(retainedDirectFormation, /\.valuation\b|valuation\s*=/u);
assert.match(
  retirement,
  /create or replace function public\.business_position_fair_value_v2\([\s\S]+?BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE/u,
);
assert.match(
  retirement,
  /create or replace function public\.create_business_ownership_transfer_offer_v2\([\s\S]+?BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE/u,
);
assert.doesNotMatch(
  retirement.match(
    /create or replace function public\.business_position_fair_value_v2\([\s\S]+?\$function\$;/u,
  )?.[0] ?? "",
  /business_entities|\.valuation\b/u,
);
const guardedStatusFunction = retirement.match(
  /create or replace function public\.transition_business_status_v1\([\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(guardedStatusFunction, "the retained Business status command must be guarded");
assert.match(
  guardedStatusFunction,
  /perform public\.ensure_business_payroll_clock_v2\(/u,
);
assert.match(guardedStatusFunction, /BUSINESS_OPERATING_PERIOD_CLOSE_REQUIRED/u);
assert.match(guardedStatusFunction, /BUSINESS_OPERATING_PERIOD_CLOSE_PENDING/u);
assert.match(guardedStatusFunction, /public\.business_employees/u);
assert.match(guardedStatusFunction, /public\.store_offer_purchase_receipts/u);
assert.match(guardedStatusFunction, /public\.business_operating_period_store_receipts/u);
assert.match(guardedStatusFunction, /v_now := clock_timestamp\(\);/u);
assert.match(guardedStatusFunction, /request_fingerprint/u);
assert.match(guardedStatusFunction, /result_failure_count/u);
assert.match(guardedStatusFunction, /result_closed_at/u);
assert.match(guardedStatusFunction, /IDEMPOTENCY_KEY_CONFLICT/u);
assert.ok(
  guardedStatusFunction.indexOf("for update;") <
    guardedStatusFunction.indexOf("v_now := clock_timestamp();"),
  "Business closure must refresh server time after acquiring its canonical locks",
);
assert.ok(
  guardedStatusFunction.indexOf("v_now := clock_timestamp();") <
    guardedStatusFunction.indexOf("BUSINESS_OPERATING_PERIOD_CLOSE_PENDING"),
  "Business closure must refresh server time before checking obligations",
);
assert.match(
  retirement,
  /revoke all on table public\.business_sales[\s\S]{0,100}service_role/u,
);
assert.match(
  retirement,
  /revoke all on table public\.business_cycle_settlement_receipts[\s\S]{0,100}service_role/u,
);

assert.match(
  retirementDispatch,
  /status:\s*410[\s\S]+code:\s*"business_cycle_settlement_retired"/u,
);
assert.doesNotMatch(
  retirementDispatch,
  /request\.(?:clone|json|text)\s*\(/u,
  "the retired Admin route must not consume or parse its request body",
);
const adminRuntime = adminIndex.slice(adminIndex.indexOf("Deno.serve"));
const securityPosition = adminRuntime.indexOf("await guardAdminRequest(");
const retirementPosition = adminRuntime.indexOf(
  "preDispatchRetiredBusinessSettlement({",
);
const globalBodyPosition = adminRuntime.indexOf("await handleGlobalRoute(");
const lifecyclePosition = adminRuntime.indexOf(
  "await handleGameLifecycleOperation(",
);
assert.ok(securityPosition >= 0, "Admin dispatch must retain its security guard");
assert.ok(
  retirementPosition > securityPosition,
  "retirement dispatch must remain after Admin authentication and authorization",
);
assert.ok(
  globalBodyPosition > retirementPosition,
  "retirement dispatch must remain before generic Admin body parsing",
);
assert.ok(
  lifecyclePosition > retirementPosition,
  "retirement dispatch must remain before game lifecycle mutation gating",
);
assert.match(
  adminRuntime.slice(retirementPosition, globalBodyPosition),
  /resolveOwnedGame:\s*\(gameId\)\s*=>\s*ensureOwnedGame\(securedContext, gameId\)/u,
  "retirement dispatch must preserve exact owned-game authorization",
);

for (const table of phase11PurgeTables) {
  assert.match(assertions, new RegExp(`'${table}'`, "u"));
}
assert.match(assertions, /game_data_purge_table_registry/u);
assert.match(assertions, /create table if not exists private\.game_data_purge_delete_order_v1/u);
assert.match(assertions, /create or replace function public\.get_game_data_purge_fk_graph_digest_v1/u);
assert.match(assertions, /create or replace function public\.get_game_data_purge_delete_order_digest_v1/u);
assert.match(assertions, /create or replace function public\.get_game_data_purge_preflight_v1/u);
assert.match(assertions, /'environmentName', v_control\.environment_name/u);
assert.match(assertions, /'r2BucketName', v_control\.r2_bucket_name/u);
const purgeClaimFunction = assertions.match(
  /create or replace function public\.claim_confirmed_game_data_purge_v1\(\)[\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(purgeClaimFunction, "the configured purge claim must be forward-replaced");
assert.match(purgeClaimFunction, /v_control\.environment_name is null/u);
assert.match(purgeClaimFunction, /v_control\.r2_bucket_name is null/u);
assert.match(purgeClaimFunction, /GAME_PURGE_R2_BINDING_MISMATCH/u);
const purgeR2ProgressFunction = assertions.match(
  /create or replace function public\.record_game_data_purge_r2_progress_v1\([\s\S]+?\$function\$;/u,
)?.[0] ?? "";
assert.ok(purgeR2ProgressFunction, "R2 progress must be bound to configured authority");
assert.match(purgeR2ProgressFunction, /for update/u);
assert.match(purgeR2ProgressFunction, /v_control\.environment_name \|\| '\/game_session='/u);
assert.match(purgeR2ProgressFunction, /GAME_PURGE_R2_BINDING_MISMATCH/u);
assert.match(assertions, /create or replace function public\.execute_game_data_purge_db_batch_v2/u);
assert.match(assertions, /create or replace function public\.finalize_game_data_purge_v1/u);
assert.match(assertions, /private\.is_game_data_purge_delete_authorized_v1/u);
assert.match(assertions, /app\.game_data_purge_delete_token/u);
assert.match(assertions, /extensions\.gen_random_bytes\(32\)/u);
assert.match(assertions, /db_delete_token_hash/u);
assert.match(
  assertions,
  /db_delete_target_schema in \('public', 'private'\)/u,
);
assert.match(
  assertions,
  /store_offer_withdrawal_requests_offer_id_fkey[\s\S]*on delete cascade/u,
);
assert.match(
  assertions,
  /create or replace function private\.guard_store_seller_offer_purge_delete_v1/u,
);
assert.match(
  assertions,
  /enable always trigger guard_store_seller_offer_purge_delete_v1/u,
);
assert.match(assertions, /STORE_SELLER_OFFER_DELETE_RETIRED/u);
assert.match(
  assertions,
  /order by dependency_depth asc, table_schema, table_name/u,
);
assert.match(assertions, /GAME_PURGE_FK_ORDER_INVALID/u);
assert.match(assertions, /set status = 'r2_deleted'/u);
assert.match(assertions, /db_delete_cursor <> 202/u);
assert.match(assertions, /GAME_PURGE_DATABASE_ROWS_REMAIN/u);
assert.ok(
  [...assertions.matchAll(/GAME_PURGE_R2_BINDING_MISMATCH/gu)].length >= 4,
  "claim, R2 progress, database batches, and finalization must bind one R2 namespace",
);
assert.ok(
  [...assertions.matchAll(
    /GAME_PURGE_LEGACY_PROGRESS_AUTHORITY_RETIRED/gu,
  )].length >= 3,
  "both legacy progress RPC bodies and their install assertion must be retired",
);
for (const value of Object.values(purgeFingerprint)) {
  assert.ok(
    assertions.includes(String(value)),
    `the database executor must bind exact purge authority ${value}`,
  );
}
assert.match(assertions, /BUSINESS_STORE_CONVERGENCE_PURGE_REGISTRY_INCOMPLETE/u);
assert.match(assertions, /BUSINESS_STATUS_PERIOD_CLOSURE_GUARD_INVALID/u);

const preflightGuard = purgeWorker.match(
  /function assertPreflight\([\s\S]+?\n\}/u,
)?.[0] ?? "";
assert.match(preflightGuard, /assertPurgeRuntimeBinding\(preflight, runtimeBinding\)/u);
assert.match(purgeRuntimeBinding, /preflight\.environmentConfigured !== true/u);
assert.match(purgeRuntimeBinding, /preflight\.environmentName/u);
assert.match(purgeRuntimeBinding, /preflight\.r2BucketName/u);
assert.match(purgeRuntimeBinding, /preflight_environment_mismatch/u);
assert.match(purgeRuntimeBinding, /preflight_r2_bucket_mismatch/u);
assert.match(purgeRuntimeBindingTest, /eecvbssdvarfcykcfrny/u);
assert.match(purgeRuntimeBindingTest, /cgiukdjwicykrmtkhudh/u);
const purgeR2StageSource = purgeWorker.match(
  /async function purgeR2Stage\([\s\S]+?\n\}/u,
)?.[0] ?? "";
assert.ok(purgeR2StageSource, "the R2 purge stage must remain composed");
assert.match(purgeR2StageSource, /runtimeBinding\.environmentName/u);
assert.ok(
  [...purgeR2StageSource.matchAll(/Bucket: runtimeBinding\.r2BucketName/gu)]
    .length >= 3,
  "R2 list, delete, and verification must share the preflight-bound bucket",
);
assert.doesNotMatch(purgeR2StageSource, /env\("R2_BUCKET"\)/u);
assert.ok(
  purgeWorker.indexOf("assertPreflight(preflight, gameSessionId, runtimeBinding)") <
    purgeWorker.indexOf("await purgeR2Stage("),
  "runtime environment and bucket must be checked before any R2 stage call",
);

console.log("Business Store sales convergence source contract passed.");
