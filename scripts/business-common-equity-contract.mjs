import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = "backend/supabase/migrations";
const names = readdirSync(root).filter((name) => /^\d{14}_business_common_equity_invariants_v1\.sql$/u.test(name));
assert.equal(names.length, 1, "one forward migration owns common-equity enforcement");
const source = readFileSync(join(root, names[0]), "utf8");
assert.doesNotMatch(source, /(?:insert\s+into|update|delete\s+from)\s+public\.(?:stock_|ledger_entries|account_balances|inventory_)/iu,
  "common-equity invariants do not own Market, money or Inventory writes");
assert.doesNotMatch(source, /(?:disable\s+trigger|session_replication_role|grant\s+all|bypassrls)/iu);
assert.match(source, /revoke insert,update,delete,truncate on public\.business_ownership_positions,/u);
assert.match(source, /where entity_type in \('corporation','c_corporation'\) order by game_session_id,id/u,
  "existing corporate state must be audited without fabricated receipt repair");
assert.equal((source.match(/when \(not private\.is_game_data_purge_delete_authorized_v1/g)||[]).length,2,
  "deferred delete checks retain the exact request-bound purge exception");
// The existing public assertion keeps every noncorporate rule. Only a call to
// the stronger common-share assertion is added before its legacy early return.
const prior = readFileSync(join(root,"20260819062100_business_party_banking_and_activation_v2.sql"),"utf8");
const extract = (s) => s.match(/create or replace function public\.assert_business_ownership_invariants_v2\([\s\S]+?\$function\$;/u)[0];
assert.equal(extract(source).replace("  perform economy_private.assert_business_common_equity_v1(p_game_session_id,p_business_id);\n\n", ""), extract(prior));
console.log("Phase 14B authority boundary: canonical cap table, preserved noncorporate rules, request-bound purge, command-only writes and drift audit pass.");
