#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const migrations = [
  "backend/supabase/migrations/20260819062000_business_authority_foundation_v2.sql",
  "backend/supabase/migrations/20260819062100_business_party_banking_and_activation_v2.sql",
  "backend/supabase/migrations/20260819063000_business_governance_equity_v2.sql",
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

const source = migrations
  .map((file) => `\n-- ${file}\n${readFileSync(resolve(ROOT, file), "utf8")}`)
  .join("\n");

function has(pattern, message) {
  assert.match(source, pattern, message);
}

function lacks(pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

// Legal entity + ownership authority.
has(/sole_proprietorship/, "Sole proprietorship must be modeled.");
has(/partnership/, "Partnership must be modeled.");
has(/\bllc\b/, "LLC must be modeled.");
has(/c_corporation/, "C corporation must be modeled.");
has(/business_ownership_positions/, "Authoritative ownership positions are required.");
has(/business_corporate_share_structures/, "Corporations require an authoritative share structure.");
has(/10000/, "Ownership/governance uses exact basis-point invariants.");
has(/unanim/i, "Initial multi-owner formation must retain unanimous approval semantics.");

// Governance and settlement boundaries.
has(/7500/, "Acquisition/dissolution must retain the 75% governance threshold.");
has(/0\.70/, "Acquisition must reject offers below 70% of authoritative valuation.");
has(/1\.30/, "Acquisition must reject offers above 130% of authoritative valuation.");
has(/BUSINESS_DISTRIBUTION_SOLVENCY_CHECK_FAILED/, "Owner distributions require a solvency check.");
has(/CORPORATION_AUTHORIZED_SHARES_INSUFFICIENT/, "Corporation issuance must respect authorized shares.");
has(/for update[\s\S]{0,1200}sum\(/i, "Ownership settlement must lock rows before deriving aggregate state.");

// Existing canonical items only.
has(/BUSINESS_RECIPE_PLAYER_AUTHORED_ITEM_PROHIBITED/, "Recipe outputs must reject Player-authored items.");
has(/BUSINESS_WHOLESALE_PLAYER_AUTHORED_ITEM_PROHIBITED/, "Wholesale must reject Player-authored items.");
has(/BUSINESS_MARKET_PLAYER_AUTHORED_ITEM_PROHIBITED/, "Demand profiles must reject Player-authored items.");
lacks(/insert\s+into\s+public\.game_items[\s\S]{0,300}production/i, "Production may not create item definitions.");

// Server-timed productive economy.
has(/completion_at\s+timestamptz/i, "R&D/production require server timestamps.");
has(/complete_due_business_research_v2/, "R&D requires a due-job completion worker.");
has(/complete_due_business_production_v2/, "Production requires a due-job completion worker.");
has(/for update[^;]*skip locked/is, "Shared workers must use SKIP LOCKED.");
has(/business_recipe_unlocks/, "Research unlocks recipes on the Business, not the Player.");
has(/production_reserve/, "Production must reserve canonical BOM inputs.");
has(/production_consume/, "Production must consume reserved inputs.");
has(/production_complete/, "Production must post finished canonical inventory only on completion.");

// Workforce is simulation-authored.
has(/business_talent_candidates_v2/, "Workforce must come from a canonical talent market.");
has(/business_candidate_market_wage_v2/, "Wages must be calculated by the simulation.");
has(/laborMarketMultiplier/, "Wages must respond to configured labor-market conditions.");
has(/retention_warning_since/, "Turnover must be preceded by an explainable retention warning.");
has(/persistent_under_market_pay_or_missed_payroll/, "Turnover must be consequence-based, not random.");

// Procurement and supply.
has(/current_quantity/, "Wholesale supplier stock must be finite.");
has(/replenishment_quantity/, "Wholesale supplier stock must replenish.");
has(/BUSINESS_WHOLESALE_STOCKOUT/, "Wholesale stockouts must be enforced.");
has(/business_wholesale_quote_v2/, "Wholesale prices must be server-calculated.");
has(/deliver_at/, "Procurement lead time must survive browser refresh/logout.");

// Demand/sales: inventory first, money second.
has(/business_price_response_v2/, "Demand must respond to price.");
has(/substitution_group/, "Competing/substitutable items must share demand pressure.");
has(/business_sales_workforce_multiplier_v2/, "Sales labor must affect realized demand.");
has(/business_reputation_score_v2/, "Reputation must affect the operating economy.");
has(/post_inventory_transaction_v2[\s\S]{0,3000}record_business_ledger_entry_v2/is,
  "Sales must consume canonical Inventory before crediting Business revenue.");
has(/least\(v_demand,\s*v_available\)/i, "Sales cannot exceed demand or finished availability.");

// Tax + valuation authority.
has(/business_tax_policies_v2/, "Tax rates must come from game/country policy.");
has(/country_code/, "Business tax policy must be country scoped.");
has(/tax_classification/, "Tax classification must be separate from legal entity.");
has(/business_valuation_snapshots_v2/, "Valuation must be calculated and explainable.");
has(/business_corporate_share_value_v2/, "Corporate share value must derive from valuation and outstanding shares.");
has(/earningsMultiple/, "Valuation must expose a bounded educational earnings driver.");
has(/reasons/, "Valuation must preserve explanatory reasons.");

// Failure and creditor priority.
has(/cash_warning/, "Cash warning state must exist.");
has(/distressed/, "Distressed state must exist.");
has(/insolvent/, "Insolvent state must exist.");
has(/forced/, "Sustained insolvency must support forced liquidation.");
has(/business_liquidation_claims_v2/, "Liquidation must maintain creditor claims.");
has(/priority_rank/, "Liquidation claims require explicit priority.");
has(/liquidation_residual/, "Only residual value may flow to owners.");
has(/entity_type not in \('sole_proprietorship', 'partnership'\)/,
  "Limited-liability entities must not reach into owner personal funds.");

// Scale/runtime.
has(/run_business_economy_tick_v2/, "Business must use one bounded shared economy runtime.");
has(/greatest\(10, coalesce\(p_limit, 250\)\)/, "Business runtime must be batch-bounded.");
lacks(/cron\.schedule[\s\S]{0,200}business_id/i, "Business must not create per-Business cron jobs.");

// Browser contract: workspace is server-derived and public-key based.
has(/get_player_business_workspace_v2/, "Player Business requires a bounded server read model.");
has(/player_identifier/, "Workspace exposes public identifiers rather than ownership UUIDs.");
has(/financialHealthState/, "Workspace must expose actionable financial health.");
has(/valuationDetail/, "Workspace must expose explainable valuation.");

console.log(`Business economy authority contract passed across ${migrations.length} migrations.`);
