import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
const migration=suffix=>{const names=readdirSync('backend/supabase/migrations').filter(n=>n.endsWith(`_${suffix}.sql`));assert.equal(names.length,1,suffix);return readFileSync(`backend/supabase/migrations/${names[0]}`,'utf8');};
const business=migration('business_financial_market_ports_v1');
const market=migration('business_market_listing_consumer_v1');
const settlement=migration('business_market_common_share_settlement_v1');
const registry=migration('business_financial_market_purge_registry_v1');
for(const sql of [business,market,settlement,registry]){assert.match(sql,/\bbegin;/u);assert.match(sql,/commit;\s*$/u);assert.doesNotMatch(sql,/disable\s+trigger|session_replication_role|grant\s+all|bypassrls/iu);}
assert.doesNotMatch(business,/(?:insert\s+into|update|delete\s+from)\s+public\.(?:game_session_stock_assets|stock_|account_balances|ledger_entries|inventory_)/iu);
for(const sql of [market,settlement])assert.doesNotMatch(sql,/(?:insert\s+into|update|delete\s+from)\s+public\.(?:business_|account_balances|ledger_entries|inventory_)/iu);
for(const token of ['market_custody_shares','BUSINESS_COMMON_CUSTODY_RECEIPT_MISMATCH','business.financials.closed.v1','business.market.status.changed.v1','read_business_market_events_v1','read_business_market_listing_v1','read_business_market_position_v1','lock_business_market_position_v1','transfer_business_market_shares_v1','assert_business_ownership_invariants_v2'])assert.ok(business.includes(token),token);
for(const token of ['consumed.event_key is null','limit p_limit','for update','pg_advisory_xact_lock','force row level security','STOCK_BUSINESS_QUANTITY_AUTHORITY_REQUIRED','STOCK_BUSINESS_ORDER_COMMAND_REQUIRED','is_game_data_purge_delete_authorized_v1','read_player_stock_positions_v1',"'{}'::jsonb",'fair_value_anchor'])assert.ok(market.includes(token),token);
assert.doesNotMatch(market,/last_consumed_at|watermark|update\s+public\.game_session_stock_assets\s+set\s+current_price/iu);
for(const token of ['private.create_stock_buy_quote_at_v1','private.settle_stock_buy_quote_at_v1','private.settle_stock_sell_at_v1','STOCK_BUSINESS_WHOLE_SHARES_REQUIRED','STOCK_BUSINESS_SHARES_UNAVAILABLE','after_funding','after_holding','after_order','after_trade','after_evidence'])assert.ok(settlement.includes(token),token);
assert.match(registry,/GAME_PURGE_CURSOR_RECONCILIATION_REQUIRED/u);
const workflow=readFileSync('.github/workflows/business-financial-market.yml','utf8');
for(const token of ['for PASS in 1 2','supabase db reset','supabase db advisors','--fail-on error','github.event.pull_request.head.sha','player-business-market.spec.mjs','player-business-ipo.spec.mjs'])assert.ok(workflow.includes(token),token);
const database=readFileSync('scripts/business-financial-market-database.mjs','utf8');
for(const token of ['createPrimaryIpoFixture','closeIpoOperatingHistory','pollForDatabaseWait','after_funding','after_holding','after_order','after_trade','after_evidence','verifyPrimaryIpoPurge','otherBefore'])assert.ok(database.includes(token),token);
const runner=readFileSync('backend/src/domains/stocks/infrastructure/supabaseStockMarketRunnerRepository.ts','utf8');assert.ok(runner.indexOf('"consume_business_market_events_v1"')<runner.indexOf('const tickIndex ='));
console.log('Phase 14D source: separate Business/Market/Banking authorities, whole-share custody, immutable event consumption, retained settlement and exact-source acceptance are present.');

const purge=migration('business_financial_market_purge_convergence_v1');
const previous=migration('business_primary_ipo_purge_convergence_v1');
const normalize=body=>body
  .replaceAll("7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3","ab44a67a1247fd706636c3aeb627f352344ca08bde6b6c7159f686a873612a48")
  .replaceAll("fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329","343f1966b3750e7a639fb82059bab1049edd44591e27d59cd08017c19be46198")
  .replaceAll("19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897","f2fe1c6ad5d11bf7c73e1bd761153e6e6cfa726d9b26f780b62e42eb603667b6")
  .replace(/\b(206|207|456)\b/gu,value=>({206:"205",207:"206",456:"455"})[value]);
for(const name of ['execute_game_data_purge_db_batch_v2','finalize_game_data_purge_v1']) {
  const expression=new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,'u');
  assert.equal(normalize(purge.match(expression)?.[0]||''),previous.match(expression)?.[0],name);
}
console.log('Phase 14D purge changes only replay-observed fingerprints and cursor bounds; complete authorization and zero-row proof are preserved.');
