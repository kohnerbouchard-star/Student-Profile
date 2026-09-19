import assert from 'node:assert/strict';
import { runSql, runJson, sqlLiteral as q, FIXTURE } from './business-phase10-atomic-settlement-database-support.mjs';
import { service, jsonService } from './business-primary-ipo-fixture.mjs';
export { runSql, runJson, q, service, jsonService };
export const json = sql => runJson(`select (${sql})::text;`);
export function marketFixture(game) {
  runSql(`update public.country_profiles set status='disabled' where id=${q(FIXTURE.countryId)} and country_code='TST';
    insert into public.game_settings(game_session_id,stock_market_window) values(${q(game.id)},'{"timezone":"UTC"}'::jsonb)
      on conflict(game_session_id) do update set stock_market_window=excluded.stock_market_window;
    insert into public.country_economic_snapshots(game_session_id,country_profile_id,snapshot_sequence,effective_at,
      snapshot_label,difficulty_policy_profile_id,difficulty_preset,metadata,created_at)
    select ${q(game.id)},c.id,0,statement_timestamp()-interval '2 minutes','Phase 14D Market acceptance',d.id,d.preset_key,
      '{"source":"business-financial-market-database"}'::jsonb,statement_timestamp()-interval '3 minutes'
    from public.country_profiles c join public.difficulty_policy_profiles d on d.preset_key='standard' where c.status='active';
    select public.initialize_fx_authority_for_game_v1(${q(game.id)},clock_timestamp()-interval '1 minute',true);
    select * from public.initialize_stock_market_assets_for_game(${q(game.id)},'missing_only');
    select public.initialize_stock_market_liquidity_accounts_v1(${q(game.id)});`);
  for (const [i,player] of [game.ownerId,game.buyerOneId,game.buyerTwoId].entries()) {
    service(`public.create_player_session_v2(${q(game.id)},${q(player)},repeat(${q(String(i+1))},64),clock_timestamp()+interval '12 hours')`);
  }
  const openAt = json(`select to_jsonb(at) from generate_series('2026-08-28T08:00Z'::timestamptz,
    '2026-08-28T16:59Z'::timestamptz,interval '1 minute') at where public.is_stock_market_open_at(${q(game.id)},at) order by at limit 1`);
  assert.ok(openAt);
  const account = player => json(`select jsonb_build_object('id',a.id,'key',a.public_key) from public.bank_accounts a
    join public.economic_parties p on p.game_session_id=a.game_session_id and p.id=a.party_id
    where a.game_session_id=${q(game.id)} and p.player_id=${q(player)} and p.party_kind='player'
      and a.account_kind='checking' and a.currency_code='NRC' and a.status='active'`);
  const asset = business => json(`select jsonb_build_object('id',a.id,'ticker',a.ticker,'price',a.current_price::text,
    'active',a.is_active,'financials',a.business_financials,'tick',(select max(tick_index) from public.stock_price_ticks
      where game_session_id=a.game_session_id and stock_asset_id=a.id)) from public.game_session_stock_assets a
    where a.game_session_id=${q(game.id)} and ${business ? `a.business_public_key=${q(game.businessKey)}` : "a.business_public_key is null and a.listing_currency_code='NRC'"} order by a.ticker limit 1`);
  const quoteSql = (player,a,quantity,key) => {
    const gross = json(`select to_jsonb(round(${q(a.price)}::numeric*${quantity},(select decimal_places from public.currencies where code='NRC')))`);
    return `private.create_stock_buy_quote_at_v1(${q(game.id)},${q(player)},${q(a.ticker)},${quantity},${q(a.price)}::numeric,
      ${a.tick},${q(JSON.stringify([{sourceAccountKey:account(player).key,targetAmount:String(gross)}]))}::jsonb,${q(key)},${q(openAt)}::timestamptz)`;
  };
  const buySql = (player,key,idempotency) => `private.settle_stock_buy_quote_at_v1(${q(game.id)},${q(player)},${q(key)},${q(idempotency)},${q(openAt)}::timestamptz)`;
  const sellSql = (player,a,quantity,key) => `private.settle_stock_sell_at_v1(${q(game.id)},${q(player)},${q(a.ticker)},${quantity},
    ${q(a.price)}::numeric,${a.tick},${q(account(player).key)},${q(key)},${q(openAt)}::timestamptz)`;
  return {openAt,account,asset,quoteSql,buySql,sellSql};
}
export function positions(game,player) {
  return runJson(`begin read only;set local role service_role;select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb)::text
    from public.read_player_stock_positions_v1(${q(game.id)},${q(player)}) p;commit;`);
}
export function marketState(game) {
  return json(`select jsonb_build_object(
    'cap',(select to_jsonb(s) from public.business_corporate_share_structures s where game_session_id=${q(game.id)} and business_id=${q(game.businessId)}),
    'positions',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.business_ownership_positions p where game_session_id=${q(game.id)}),
    'holdings',(select coalesce(jsonb_agg(to_jsonb(h) order by id),'[]'::jsonb) from public.stock_holdings h where game_session_id=${q(game.id)}),
    'balances',(select jsonb_agg(jsonb_build_array(bank_account_id,balance) order by bank_account_id) from public.account_balances where game_session_id=${q(game.id)}),
    'businessReceipts',(select count(*) from public.business_ownership_transactions where game_session_id=${q(game.id)}),
    'orders',(select count(*) from public.stock_orders where game_session_id=${q(game.id)}),
    'trades',(select count(*) from public.stock_trades where game_session_id=${q(game.id)}),
    'bankTransactions',(select count(*) from public.bank_transactions where game_session_id=${q(game.id)}),
    'fundingReceipts',(select count(*) from public.purchase_funding_receipts where game_session_id=${q(game.id)}))`);
}
