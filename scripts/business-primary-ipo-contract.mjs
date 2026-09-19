import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
const migration = suffix => { const matches = readdirSync("backend/supabase/migrations").filter(name => name.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1); return readFileSync(`backend/supabase/migrations/${matches[0]}`, "utf8"); };
const commands = migration("business_primary_ipo_commands_v1"); const foundation = migration("business_primary_ipo_operator_authority_v1");
for (const sql of [commands, foundation]) { assert.match(sql, /\bbegin;/u); assert.match(sql, /commit;\s*$/u); assert.doesNotMatch(sql, /disable\s+trigger|session_replication_role|grant\s+all|bypassrls/iu); }
assert.doesNotMatch(commands, /(?:insert\s+into|update|delete\s+from)\s+public\.(?:stock_|account_balances|ledger_entries|inventory_)/iu);
for (const gate of ["s.status<>'complete'", "store_receipt_count>0", "cur.currency_kind='national'", "BUSINESS_IPO_ALLOCATION_UNAVAILABLE", "BUSINESS_GOVERNANCE_TERMS_IMMUTABLE", "BUSINESS_IPO_STATE_INVALID", "for update", "pg_advisory_xact_lock", "record_player_ledger_entry", "record_business_ledger_entry_v2", "business_ownership_transactions", "business_management_mandates", "assert_business_ownership_invariants_v2", "limit 101", "limit 100"]) assert.ok(commands.includes(gate), gate);
for (const gate of ["enable row level security", "force row level security", "is_game_data_purge_delete_authorized_v1", "BUSINESS_IPO_COMMAND_REQUIRED", "business_controller_matches_request_v1", "ipo_primary_subscription_out", "ipo_primary_subscription"]) assert.ok(foundation.includes(gate), gate);
// Forward copies keep prior economic logic; only operator checks, read-only
// management projection and generic IPO bypass denial are changed.
const workflow = readFileSync(".github/workflows/business-primary-ipo.yml", "utf8");
for (const gate of ["for PASS in 1 2", "supabase db reset", "supabase db advisors", "--fail-on error", "github.event.pull_request.head.sha", "player-business-ipo.spec.mjs", "player-business-workspace.spec.mjs"]) assert.ok(workflow.includes(gate), gate);
const database = readFileSync("scripts/business-primary-ipo-database.mjs", "utf8");
for (const gate of ["createPrimaryIpoFixture", "closeIpoOperatingHistory", "pollForDatabaseWait", "BUSINESS_IPO_ALLOCATION_UNAVAILABLE", "BUSINESS_GOVERNANCE_TERMS_IMMUTABLE", "BUSINESS_IPO_IDEMPOTENCY_CONFLICT", "read_owned_business_governance_v2", "otherBefore"]) assert.ok(database.includes(gate), gate);
console.log("Phase 14C source authority: canonical Banking/common equity, fixed approved terms, operator separation and retained verification pass.");

const purge = migration("business_primary_ipo_purge_convergence_v1");
const priorPurge = migration("business_reporting_purge_convergence_v1");
const normalizePurge = body => body
  .replaceAll("ab44a67a1247fd706636c3aeb627f352344ca08bde6b6c7159f686a873612a48", "d3a0e132271485f7c5edf434021a56a1c1ec3768cb003041d227b4775ceecafe")
  .replaceAll("343f1966b3750e7a639fb82059bab1049edd44591e27d59cd08017c19be46198", "cb08e151c693cd018fec0fb7fe2a1d700cc34b0f5704c1b4a7bf1c560f2aa6af")
  .replaceAll("f2fe1c6ad5d11bf7c73e1bd761153e6e6cfa726d9b26f780b62e42eb603667b6", "b04f1ca4956a17a89e9afe29255c467bcb1b071978da35aaef76e85e19c2dbf5")
  .replace(/\b(205|206|455)\b/gu, value => ({205:"204",206:"205",455:"452"})[value]);
for (const name of ["execute_game_data_purge_db_batch_v2", "finalize_game_data_purge_v1"]) {
  const expression = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, "u");
  assert.equal(normalizePurge(purge.match(expression)?.[0] || ""), priorPurge.match(expression)?.[0], name);
}
console.log("Phase 14C purge advances only observed fingerprints and cursor bounds; full request authorization is retained.");
