#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const retainedMigrations = [
  "backend/supabase/migrations/20260819062000_business_authority_foundation_v2.sql",
  "backend/supabase/migrations/20260819062100_business_party_banking_and_activation_v2.sql",
  "backend/supabase/migrations/20260819063000_business_governance_equity_v2.sql",
];

const deferredMigrations = [
  "backend/supabase/migrations/20260819063100_business_governance_settlements_v2.sql",
  "backend/supabase/migrations/20260819063110_fix_business_governance_locking_v2.sql",
  "backend/supabase/migrations/20260819064000_business_recipes_and_research_v2.sql",
  "backend/supabase/migrations/20260819064100_business_wholesale_procurement_v2.sql",
  "backend/supabase/migrations/20260819064200_business_equipment_and_production_v2.sql",
  "backend/supabase/migrations/20260819064210_fix_business_production_reservation_v2.sql",
  "backend/supabase/migrations/20260819065000_business_workforce_market_v2.sql",
  "backend/supabase/migrations/20260819066000_business_demand_sales_reputation_v2.sql",
  "backend/supabase/migrations/20260819067000_business_tax_valuation_distress_v2.sql",
  "backend/supabase/migrations/20260819067010_business_finance_hardening_v2.sql",
  "backend/supabase/migrations/20260819067500_business_liquidation_settlement_v2.sql",
  "backend/supabase/migrations/20260819068000_business_economy_runtime_v2.sql",
  "backend/supabase/migrations/20260819069000_business_workspace_read_model_v2.sql",
];

const source = retainedMigrations
  .map((file) => {
    const path = resolve(ROOT, file);
    assert.ok(existsSync(path), `Missing retained Business foundation migration: ${file}`);
    return `\n-- ${file}\n${readFileSync(path, "utf8")}`;
  })
  .join("\n");

for (const file of deferredMigrations) {
  assert.equal(
    existsSync(resolve(ROOT, file)),
    false,
    `Deferred speculative Business layer must not remain active during Phase 0 convergence: ${file}`,
  );
}

function has(pattern, message) {
  assert.match(source, pattern, message);
}

function lacks(pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

// Formation and legal entity authority.
has(/business_formation_proposals/, "Formation proposals must remain authoritative.");
has(/business_formation_owners/, "Formation owner approvals must remain authoritative.");
has(/sole_proprietorship/, "Sole proprietorship must remain supported.");
has(/partnership/, "Partnership must remain supported.");
has(/\bllc\b/, "LLC must remain supported.");
has(/c_corporation/, "C corporation must remain supported.");
has(/BUSINESS_INITIAL_OWNERSHIP_MUST_TOTAL_100_PERCENT/, "Initial ownership must total exactly 100 percent.");
has(/BUSINESS_PROPOSER_MUST_BE_OWNER/, "Formation proposer must be an owner.");
has(/BUSINESS_FORMATION_OWNER_NOT_FOUND|BUSINESS_PROPOSED_OWNER_NOT_FOUND/, "Proposed owners must resolve server-side.");

// Stable ownership and corporation share authority.
has(/business_ownership_positions/, "Authoritative ownership positions are required.");
has(/business_ownership_transactions/, "Immutable ownership history is required.");
has(/BUSINESS_OWNERSHIP_TRANSACTION_IMMUTABLE/, "Ownership transactions must be immutable.");
has(/business_corporate_share_structures/, "C corporations need explicit share structure.");
has(/outstanding_shares\s*=\s*issued_shares\s*-\s*treasury_shares/, "Outstanding-share reconciliation is required.");
has(/business_activity_events/, "Durable Business activity history is required.");
has(/BUSINESS_ACTIVITY_EVENT_IMMUTABLE/, "Business activity history must be immutable.");

// First-class Business money identity while preserving the existing ledger.
has(/alter table public\.ledger_entries[\s\S]*add column if not exists business_id uuid/i, "Ledger entries need first-class Business identity.");
has(/alter table public\.account_balances[\s\S]*add column if not exists business_id uuid/i, "Business cash projection needs first-class Business identity.");
has(/record_business_ledger_entry_v2/, "Business money must settle through the canonical ledger adapter.");
has(/ensure_business_bank_account_v2/, "Business bank account projection must be explicit.");
lacks(/create table[^;]*business_ledger/i, "Business may not create a parallel cash ledger.");

// Generic governance and ownership-transfer foundation only; deeper settlements are rebuilt later.
has(/business_governance_proposals/, "Generic governance proposal authority is retained.");
has(/business_governance_voter_snapshots/, "Governance needs immutable voter snapshots.");
has(/business_governance_votes/, "Governance votes must be explicit.");
has(/business_ownership_transfer_offers/, "Ownership transfer offers are retained as a bounded foundation.");
has(/accept_business_ownership_transfer_offer_v2/, "Ownership transfer settlement remains atomic on the retained foundation.");

// Phase 0 intentionally does not own the productive economy yet.
lacks(/business_recipe_definitions/, "Phase 0 must not introduce a second recipe authority.");
lacks(/business_production_jobs_v2/, "Timed manufacturing is deferred to its planned phase.");
lacks(/business_talent_candidates_v2/, "Workforce simulation is deferred to its planned phase.");
lacks(/business_market_product_profiles_v2/, "Business may not own a parallel automatic sales market during Phase 0.");
lacks(/business_tax_policies_v2/, "Tax engine is deferred until the operational loop is stable.");
lacks(/business_liquidation_claims_v2/, "Liquidation settlement is deferred until its dependencies are authoritative.");

console.log(`Business Phase 0 foundation authority contract passed across ${retainedMigrations.length} retained migrations; ${deferredMigrations.length} speculative migrations are intentionally deferred for phase-by-phase rebuild.`);
