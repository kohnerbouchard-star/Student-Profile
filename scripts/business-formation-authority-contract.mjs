import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationPath = path.join(
  root,
  "backend/supabase/migrations/20260819062000_business_authority_foundation_v2.sql",
);
const compatibilityMigrationPath = path.join(
  root,
  "backend/supabase/migrations/20260819064120_business_legacy_creation_tax_compat_v2.sql",
);
const legacyCreationMigrationPath = path.join(
  root,
  "backend/supabase/migrations/20260721122200_fix_business_connected_banking_v1.sql",
);
const source = fs.readFileSync(migrationPath, "utf8");
const compatibilitySource = fs.readFileSync(compatibilityMigrationPath, "utf8");
const legacyCreationSource = fs.readFileSync(legacyCreationMigrationPath, "utf8");

const checks = [
  ["LLC formation is supported", /'llc'/u],
  ["C corporation formation is supported", /'c_corporation'/u],
  ["S corporation is not modeled as a legal entity", !/entity_type[^\n]*'s_corporation'/u.test(source)],
  ["formation proposals are authoritative", /create table if not exists public\.business_formation_proposals/u],
  ["proposed owners are authoritative", /create table if not exists public\.business_formation_owners/u],
  ["ownership positions are authoritative", /create table if not exists public\.business_ownership_positions/u],
  ["ownership transactions are immutable", /BUSINESS_OWNERSHIP_TRANSACTION_IMMUTABLE/u],
  ["corporate share structure is explicit", /create table if not exists public\.business_corporate_share_structures/u],
  ["share invariant reconciles outstanding shares", /outstanding_shares = issued_shares - treasury_shares/u],
  ["activity events are immutable", /BUSINESS_ACTIVITY_EVENT_IMMUTABLE/u],
  ["initial ownership must total exactly 100 percent", /BUSINESS_INITIAL_OWNERSHIP_MUST_TOTAL_100_PERCENT/u],
  ["sole proprietor must own 100 percent", /SOLE_PROPRIETOR_MUST_OWN_100_PERCENT/u],
  ["partnership requires multiple owners", /PARTNERSHIP_REQUIRES_MULTIPLE_OWNERS/u],
  ["tax classification is separate from entity", /business_default_tax_classification_v2/u],
  ["single-member LLC defaults to disregarded classification", /when 'llc' then case when p_owner_count = 1 then 'disregarded' else 'partnership' end/u],
  ["formation fee is game configurable", /business_market_window -> 'entityFormationFees'/u],
  ["owner recipients resolve server-side from Player identifiers", /player_identifier_normalized = v_identifier/u],
  ["browser never submits internal owner UUIDs to formation RPC", /p_owners jsonb/u],
  ["service role is the only table authority", /grant select, insert, update on table public\.business_formation_proposals to service_role/u],
  ["legacy businesses are backfilled into positions", /legacy-backfill:/u],
  ["ownership percentages are not stored as client-authored equity_percent", !/equity_percent/u.test(source)],
  ["legacy creation still predates the V2 tax column", !/tax_classification/u.test(legacyCreationSource)],
  ["legacy tax compatibility is enforced at the Business entity write boundary", /before insert on public\.business_entities/u.test(compatibilitySource)],
  ["legacy tax compatibility runs only when classification is omitted", /when \(new\.tax_classification is null\)/u.test(compatibilitySource)],
  ["legacy corporation maps to C-corporation tax classification", /when 'corporation' then 'c_corporation'/u.test(compatibilitySource)],
  ["legacy cooperative maps to legacy cooperative tax classification", /when 'cooperative' then 'cooperative_legacy'/u.test(compatibilitySource)],
  ["compatibility guard does not guess LLC tax treatment", !/when 'llc'/u.test(compatibilitySource)],
  ["compatibility trigger function is not browser-invokable", /revoke all on function public\.fill_legacy_business_tax_classification_v2\(\) from public, anon, authenticated/u.test(compatibilitySource)],
];

let failures = 0;
for (const [name, matcher] of checks) {
  const ok = matcher instanceof RegExp ? matcher.test(source) : Boolean(matcher);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failures += 1;
}

if (failures > 0) {
  console.error(`Business formation authority contract failed: ${failures} check(s).`);
  process.exit(1);
}

console.log(`Business formation authority contract passed: ${checks.length}/${checks.length}.`);
