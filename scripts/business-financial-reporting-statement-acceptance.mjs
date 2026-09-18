import assert from "node:assert/strict";
import { runSql, runJson, expectSqlError, sqlLiteral as q } from "./business-phase10-atomic-settlement-database-support.mjs";

export function prepareContributedInventory(game) {
  // Replace disposable unreceipted seed stock with a real owner contribution.
  // Position observers remain enabled throughout: the initial seed and its
  // removal cancel; only the canonical contribution adds closing capital.
  runSql(`do $fixture$
  declare v_player uuid; v_warehouse uuid; v_listing uuid; v_item text;
  begin
    select inventory_account_id into v_listing from public.store_seller_offers where id=${q(game.offerId)};
    update public.inventory_holdings set quantity_owned=0,average_unit_cost=0
      where inventory_account_id=v_listing and game_item_id=${q(game.gameItemId)};
    v_player:=economy_private.ensure_player_inventory_account_v2(${q(game.id)},${q(game.ownerId)});
    insert into public.inventory_holdings(game_session_id,inventory_account_id,game_item_id,
      player_id,quantity_owned,quantity_reserved,average_unit_cost,cost_currency_code,version)
    values(${q(game.id)},v_player,${q(game.gameItemId)},${q(game.ownerId)},10,0,2.5,'ECO',1)
    on conflict on constraint inventory_holdings_account_item_unique do update
      set quantity_owned=10,average_unit_cost=2.5,cost_currency_code='ECO';
    select canonical_key into v_item from public.game_items where id=${q(game.gameItemId)};
    perform * from public.contribute_player_inventory_to_business_v2(
      ${q(game.id)},${q(game.ownerId)},${q(game.businessKey)},v_item,10,'phase14-owner-inventory');
    v_warehouse:=economy_private.ensure_business_inventory_account_v2(${q(game.id)},${q(game.businessId)},'warehouse');
    perform economy_private.post_inventory_transaction_v2(${q(game.id)},'transfer','business',
      'store_offer_stock',${q(game.offerId)},'phase14-list-contributed-inventory','{}'::jsonb,
      jsonb_build_array(
        jsonb_build_object('inventoryAccountId',v_warehouse,'gameItemId',${q(game.gameItemId)},
          'quantityDelta',-10,'reservationDelta',0,'unitCost',2.5,'currencyCode','ECO'),
        jsonb_build_object('inventoryAccountId',v_listing,'gameItemId',${q(game.gameItemId)},
          'quantityDelta',10,'reservationDelta',0,'unitCost',2.5,'currencyCode','ECO')));
  end; $fixture$;`);
}

export function verifyFinancialStatements(one, two, receiptKey) {
  const read = (game, player = game.ownerId) => runJson(`begin read only; set local role service_role;
    select public.read_owned_business_financial_statements_v1(${q(game.id)},${q(player)})::text; commit;`);
  const reports = read(one);
  assert.equal(reports.statements.length, 1);
  const statement = reports.statements[0];
  assert.equal(statement.closeReceiptKey, receiptKey);
  assert.equal(statement.status, "complete");
  const currency = statement.currencies.find((row) => row.currencyCode === "ECO");
  const equal = (actual, expected) => assert.match(actual, new RegExp(`^${expected.replaceAll(".", "\\.")}(?:0*)$`));
  equal(currency.incomeStatement.netIncome, "8.8");
  equal(currency.balanceSheet.cash, "35.");
  equal(currency.balanceSheet.inventory, "20.");
  equal(currency.balanceSheet.taxPayable, "1.2");
  equal(currency.balanceSheet.totalEquity, "53.8");
  equal(currency.balanceSheet.noncashContributions, "25.");
  equal(currency.cashFlowStatement.operating, "15.");
  equal(currency.cashFlowStatement.financing, "20.");
  equal(currency.reconciliation.equityDifference, "0.");
  equal(currency.reconciliation.cashDifference, "0.");
  assert.equal(currency.reconciliation.unclassifiedCashEntries, 0);
  assert.doesNotMatch(JSON.stringify(reports), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|source_id|metadata|idempotency/i);
  assert.deepEqual(read(one), reports, "reads preserve the immutable snapshot after tax cash payment");
  expectSqlError(`update public.business_financial_statements set status='unreconciled'
    where business_id=${q(one.businessId)};`, /BUSINESS_OPERATING_PERIOD_EVIDENCE_IMMUTABLE/);
  for (const role of ["anon", "authenticated"]) {
    expectSqlError(`begin; set local role ${role}; select public.read_owned_business_financial_statements_v1(
      ${q(one.id)},${q(one.ownerId)}); rollback;`, /permission denied/i);
  }
  expectSqlError(`begin; set local role service_role; select public.read_owned_business_financial_statements_v1(
    ${q(one.id)},${q(two.ownerId)}); rollback;`, /BUSINESS_NOT_FOUND/);
  expectSqlError(`begin; set local role service_role; select * from economy_private.business_positions_at_v1(
    ${q(one.id)},${q(one.businessId)},clock_timestamp()); rollback;`, /permission denied/i);
  const other = read(two);
  assert.equal(other.statements.length, 50);
  assert.equal(other.truncated, true);
  assert.ok(other.statements.slice(1).every((row) => row.status === "complete"), "empty observed periods reconcile");
  assert.equal(other.statements[0].status, "unreconciled", "unreceipted fixture assets cannot masquerade as earnings");
  console.log("Phase 14A statements: capital, real Store sale, COGS, accrued tax, delayed cash, reconciliation, immutable history, privacy and role/game isolation pass.");
}
