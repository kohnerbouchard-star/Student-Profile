#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  foundation: "backend/supabase/migrations/20260824120000_store_offer_withdrawal_foundation_v2.sql",
  request: "backend/supabase/migrations/20260824120010_store_offer_withdrawal_request_command_v2.sql",
  processor: "backend/supabase/migrations/20260824120020_store_offer_withdrawal_processor_v2.sql",
  assertions: "backend/supabase/migrations/20260824120030_store_offer_withdrawal_assertions_v2.sql",
  contracts: "backend/src/domains/store/contracts/storeWithdrawalContracts.ts",
  repository: "backend/src/domains/store/infrastructure/supabaseStoreWithdrawalRepository.ts",
  index: "backend/src/domains/store/index.ts",
  scope: "docs/roadmaps/business-phase9-store-withdrawal-safety-scope-v1.md",
  workflow: ".github/workflows/business-store-withdrawal-safety-v2.yml",
};

const source = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing Phase 9A ${label}: ${relativePath}`);
    }
    return [label, fs.readFileSync(absolutePath, "utf8")];
  }),
);

function requireTokens(text, label, tokens) {
  for (const token of tokens) {
    if (!text.includes(token)) {
      throw new Error(`${label} is missing required token: ${token}`);
    }
  }
}

function forbidTokens(text, label, tokens) {
  for (const token of tokens) {
    if (text.includes(token)) {
      throw new Error(`${label} contains excluded token: ${token}`);
    }
  }
}

requireTokens(source.foundation, "Withdrawal request authority", [
  "create table public.store_offer_withdrawal_requests",
  "default ('swr_' || encode(gen_random_bytes(16), 'hex'))",
  "mode in ('full','reduce')",
  "status in ('pending','completed')",
  "effective_at >= requested_at + interval '5 minutes'",
  "store_offer_withdrawals_pending_offer_unique",
  "store_offer_withdrawals_idempotency_unique",
  "store_offer_withdrawals_due_idx",
  "withdrawal_request_id uuid null",
  "withdrawal_requested_at timestamptz null",
  "withdrawal_effective_at timestamptz null",
  "withdrawal_resume_status text null",
  "withdrawal_pending",
  "store_seller_offers_current_withdrawal_check",
  "store_seller_offers_current_withdrawal_unique",
]);
requireTokens(source.foundation, "Withdrawal request guard", [
  "guard_store_offer_withdrawal_request_v2",
  "new.requested_at := statement_timestamp()",
  "new.effective_at := new.requested_at + interval '5 minutes'",
  "new.next_attempt_at := new.effective_at",
  "STORE_WITHDRAWAL_REQUEST_IDENTITY_IMMUTABLE",
  "STORE_WITHDRAWAL_REQUEST_COMPLETED_TERMINAL",
  "pending->pending",
  "pending->completed",
  "STORE_WITHDRAWAL_REQUEST_VERSION_INVALID",
]);
requireTokens(source.foundation, "Offer withdrawal lifecycle guard", [
  "STORE_SELLER_OFFER_WITHDRAWAL_SCOPE_INVALID",
  "draft->withdrawal_pending",
  "active->withdrawal_pending",
  "paused->withdrawal_pending",
  "withdrawal_pending->draft",
  "withdrawal_pending->active",
  "withdrawal_pending->paused",
  "STORE_SELLER_OFFER_WITHDRAWAL_PENDING_MUTATION_FORBIDDEN",
  "STORE_SELLER_OFFER_WITHDRAWAL_NOT_COMPLETED",
  "STORE_SELLER_OFFER_WITHDRAWAL_COMPLETION_STATUS_INVALID",
]);
requireTokens(source.foundation, "Withdrawal privilege boundary", [
  "force row level security",
  "revoke all on table public.store_offer_withdrawal_requests",
  "from public, anon, authenticated",
  "grant select, insert, update on table public.store_offer_withdrawal_requests",
  "to service_role",
]);

requireTokens(source.request, "Service-only withdrawal request", [
  "request_business_store_offer_withdrawal_v2",
  "STORE_WITHDRAWAL_REQUEST_INVALID",
  "STORE_WITHDRAWAL_IDEMPOTENCY_CONFLICT",
  "STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT",
  "STORE_WITHDRAWAL_REDUCTION_EXCEEDS_AVAILABLE",
  "pg_advisory_xact_lock",
  "quantity_owned - v_holding.quantity_reserved",
  "status = 'withdrawal_pending'",
  "withdrawal_request_id = v_request.id",
  "withdrawal_effective_at = v_request.effective_at",
  "version = offer_row.version + 1",
  "'replayed', true",
  "'replayed', false",
  "to service_role",
]);
const replayIndex = source.request.indexOf(
  "from public.store_offer_withdrawal_requests as request_row",
);
const requestVersionIndex = source.request.indexOf(
  "if v_offer.version <> p_expected_offer_version then",
);
if (
  replayIndex < 0 ||
  requestVersionIndex < 0 ||
  replayIndex > requestVersionIndex
) {
  throw new Error(
    "Withdrawal idempotent replay must resolve before current offer-version rejection.",
  );
}

requireTokens(source.processor, "Bounded due withdrawal processor", [
  "process_due_store_offer_withdrawals_v2",
  "p_limit integer default 25",
  "p_limit > 100",
  "clock_timestamp()",
  "order by request_row.effective_at, request_row.public_key",
  "for update skip locked",
  "quantity_reserved > 0",
  "'inventory_reserved'",
  "v_now + interval '1 minute'",
  "economy_private.ensure_business_inventory_account_v2",
  "'finished_goods'",
  "economy_private.post_inventory_transaction_v2",
  "'business_store'",
  "'withdraw_offer'",
  "'store_listing_source'",
  "'finished_goods_destination'",
  "v_listing_holding.average_unit_cost",
  "quantity = v_finished_holding_after.quantity_owned",
  "unit_cost = v_finished_holding_after.average_unit_cost",
  "status = 'completed'",
  "withdrawal_request_id = null",
  "when v_request.mode = 'full' then 'paused'",
  "to service_role",
]);
const timingIndex = source.processor.indexOf(
  "v_request.effective_at > v_now",
);
const reservationIndex = source.processor.indexOf(
  "v_listing_holding.quantity_reserved > 0",
);
const postingIndex = source.processor.indexOf(
  "economy_private.post_inventory_transaction_v2(",
);
if (
  timingIndex < 0 ||
  reservationIndex < 0 ||
  postingIndex < 0 ||
  timingIndex > reservationIndex ||
  reservationIndex > postingIndex
) {
  throw new Error(
    "Server-time and unresolved-reservation checks must precede physical return.",
  );
}
const projectionIndex = source.processor.indexOf(
  "from public.business_inventory as inventory_row",
);
const finishedHoldingIndex = source.processor.indexOf(
  "and holding_row.inventory_account_id = v_finished_account.id",
  projectionIndex,
);
if (
  projectionIndex < 0 ||
  finishedHoldingIndex < 0 ||
  projectionIndex > finishedHoldingIndex
) {
  throw new Error(
    "Retained Finished Goods projection must lock before canonical Finished Goods holding.",
  );
}

const migrations = [
  source.foundation,
  source.request,
  source.processor,
  source.assertions,
].join("\n").toLowerCase();
forbidTokens(migrations, "Phase 9A settlement exclusions", [
  "credit_business_cash",
  "cost_of_goods_sold",
  "buyer_inventory_account",
  "create_store_purchase_quote",
  "settle_store_offer_purchase",
  "grant execute on function public.request_business_store_offer_withdrawal_v2(\n  uuid, text, text, text, integer, bigint, text\n) to authenticated",
  "grant execute on function public.process_due_store_offer_withdrawals_v2(integer)\n  to authenticated",
]);
forbidTokens(migrations, "Phase 9A canonical-authority reuse", [
  "create table public.inventory_holdings",
  "create table public.inventory_transactions",
  "create table public.business_inventory",
  "create table public.store_seller_offers",
  "create table public.store_items",
]);

requireTokens(source.assertions, "Phase 9A schema assertions", [
  "STORE_WITHDRAWAL_SCHEMA_MISSING",
  "STORE_WITHDRAWAL_COLUMN_MISSING",
  "STORE_WITHDRAWAL_CONSTRAINT_MISSING",
  "STORE_WITHDRAWAL_INDEX_MISSING",
  "STORE_WITHDRAWAL_REQUEST_GUARD_MISSING",
  "STORE_WITHDRAWAL_FUNCTION_PRIVILEGE_BOUNDARY_INVALID",
  "STORE_WITHDRAWAL_TABLE_PRIVILEGE_BOUNDARY_INVALID",
  "STORE_WITHDRAWAL_RLS_NOT_FORCED",
  "STORE_WITHDRAWAL_REQUEST_FUNCTION_INCOMPLETE",
  "STORE_WITHDRAWAL_PROCESSOR_INCOMPLETE",
  "STORE_WITHDRAWAL_OFFER_GUARD_INCOMPLETE",
  "STORE_WITHDRAWAL_AGGREGATION_ELIGIBILITY_INVALID",
  "STORE_WITHDRAWAL_PARALLEL_QUANTITY_FORBIDDEN",
  "STORE_WITHDRAWAL_CURRENT_STATE_INVALID",
  "STORE_WITHDRAWAL_GAME_SCOPE_INVALID",
]);

requireTokens(source.contracts, "Typed withdrawal contracts", [
  "StoreWithdrawalMode",
  "RequestBusinessStoreOfferWithdrawalCommand",
  "StoreWithdrawalRequestResult",
  "ProcessDueStoreWithdrawalsResult",
  "StoreWithdrawalRepository",
  "normalizeStoreWithdrawalRequestCommand",
  "parseStoreWithdrawalRequestResult",
  "parseProcessDueStoreWithdrawalsResult",
  "effectiveAt must be at least five minutes after requestedAt",
  "inventory_reserved",
]);
requireTokens(source.repository, "Typed withdrawal repository", [
  "SupabaseStoreWithdrawalRepository",
  "request_business_store_offer_withdrawal_v2",
  "process_due_store_offer_withdrawals_v2",
  "p_expected_offer_version",
  "p_idempotency_key",
  "store_withdrawal_idempotency_conflict",
  "store_withdrawal_version_conflict",
  "store_withdrawal_projection_mismatch",
]);
requireTokens(source.index, "Store-domain withdrawal exports", [
  "storeWithdrawalContracts.ts",
  "supabaseStoreWithdrawalRepository.ts",
]);

const acceptedScopeStatuses = [
  "**Status:** IN PROGRESS — checkpoint 9A scope locked; implementation not certified",
  "**Status:** COMPLETE — checkpoint 9A certified",
];
if (!acceptedScopeStatuses.some((status) => source.scope.includes(status))) {
  throw new Error(
    "Phase 9A scope has neither the locked implementation status nor the certified status.",
  );
}
requireTokens(source.scope, "Phase 9A scope boundary", [
  "remain pending for at least five minutes",
  "quantity_reserved = 0",
  "Purchase-first/withdrawal-first settlement integration remains a later checkpoint",
  "does **not** authorize",
  "Do not widen checkpoint 9A into buyer settlement or Player routes/UI",
]);

requireTokens(source.workflow, "Dedicated Phase 9A workflow", [
  "Business Store Withdrawal Safety V2",
  "business-phase9-store-withdrawal-safety-contract.mjs",
  "business-phase9-store-withdrawal-safety-simulation.mjs",
  "business-phase9-store-withdrawal-safety-types.mjs",
  "business-phase8-store-listing-inventory-contract.mjs",
  "business-phase7-store-seller-offers-contract.mjs",
  "validate-supabase-migrations.mjs",
  "build-architecture-inventory.mjs",
  "test:player-store-public",
  "test:player-inventory",
  "npm run typecheck:all",
  "npm run browser",
]);

console.log("Business Phase 9A Store withdrawal safety contract: PASS");
