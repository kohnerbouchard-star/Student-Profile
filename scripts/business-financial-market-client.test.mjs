import assert from 'node:assert/strict';
import test from 'node:test';
import {businessShareListing,assertBusinessShareQuantity,renderBusinessShareFacts} from '../player-terminal/src/features/market/business-share-view.js';
import {businessMarketData,listedBusiness} from '../player-terminal/tests/fixtures/business-market-fixture.mjs';
import {renderPortfolioPage} from '../player-terminal/src/pages/portfolio-page.js';
import {renderMarketPage} from '../player-terminal/src/pages/market-page.js';
import {attachPortfolioHoldings} from '../player-terminal/src/api/portfolio-market-holdings.js';
import {observeFinancialMarketReentryQuote} from './business-financial-market-fx-diagnostic.mjs';
test('common shares preserve exact financial text and cannot inherit invented P/E or dividends',()=>{
  const data=businessMarketData(),asset=data.market.assets[0];
  assert.equal(asset.commonEquity.financials.equity,'1000.123456789123456789');assert.equal(asset.pe,0);assert.equal(asset.yield,0);
  assert.match(renderBusinessShareFacts(asset),/1000\.123456789123456789/);
  assert.equal(businessShareListing({...listedBusiness().commonEquity,businessKey:'00000000-0000-4000-8000-000000000001'}),undefined);
  assert.throws(()=>assertBusinessShareQuantity(asset,0.5),/whole shares/);assert.doesNotThrow(()=>assertBusinessShareQuantity(asset,1));
  assert.doesNotThrow(()=>assertBusinessShareQuantity({},0.5));
  assert.match(renderMarketPage(data,{}),/name="quantity" type="number" min="1" step="1"/);
});
test('Portfolio uses issued holdings even when embedded Market ownership is zero and separates currencies',()=>{
  const data=businessMarketData();assert.equal(data.market.assets[0].owned,0);
  data.portfolio=attachPortfolioHoldings(data.portfolio,{holdings:[...data.portfolio.holdings,{ticker:'ECOASSET',quantity:2,averageCost:3,currentPrice:4,marketValue:8,currencyCode:'ECO',unrealizedPnl:2}]});
  const html=renderPortfolioPage(data);assert.match(html,/NRC 50/);assert.match(html,/ECO 8/);assert.doesNotMatch(html,/NET WORTH|ECO 58/);
  assert.match(html,/Northreach Fabrication/);assert.doesNotMatch(html,/>0<small>avg/);
  data.portfolio=attachPortfolioHoldings(data.portfolio,{holdings:[]});assert.match(renderPortfolioPage(data),/No active positions/);
});
test('stale positions retain an explicit notice and unavailable Banking disables orders',()=>{
  const data=businessMarketData();data.resourceStatus.portfolio={state:'unavailable'};assert.match(renderPortfolioPage(data),/last loaded amounts/);
  data.resourceStatus.bankingFx={state:'unavailable'};const html=renderMarketPage(data,{});assert.match(html,/type="submit" disabled/);
});

const diagnosticGameId='20000000-0000-0000-0000-000000000001';
const clockObservation=()=>({
  databaseClockUtc:'2026-11-01T07:59:59.999999Z',gameTimezoneIsUtc:true,
  runtimePresent:true,cutoverStatus:'ready',nextDueAtUtc:'2026-11-01T08:00:00.000000Z',
  deadlineExpired:false,currentFixingPresent:true,currentFixingDigest:'a'.repeat(64),
  fixingKind:'bootstrap',fixingLocalDate:'2026-11-01',
  fixingEffectiveAtUtc:'2026-11-01T07:58:00.000000Z',fixingCalculatedAtUtc:'2026-11-01T07:59:00.000000Z',
});
const receipt=line=>JSON.parse(line.slice('FINANCIAL_MARKET_FX_CLOCK '.length));
test('FX observation preserves one successful quote and uses bounded game-scoped read-only SQL',()=>{
  const lines=[],calls=[],expected={quote_key:'synthetic'};let quotes=0;
  const result=observeFinancialMarketReentryQuote(()=>{quotes++;return expected;},{
    gameId:diagnosticGameId,emit:line=>lines.push(line),runSql:(sql,options)=>{
      calls.push({sql,options});return {status:0,output:JSON.stringify(clockObservation())};
    },
  });
  assert.equal(result,expected);assert.equal(quotes,1);assert.equal(calls.length,1);
  assert.deepEqual(calls[0].options,{allowError:true,timeoutMs:2000});
  assert.match(calls[0].sql,/^begin read only;/u);
  assert.match(calls[0].sql,/set local statement_timeout = '1s';/u);
  assert.match(calls[0].sql,/set local lock_timeout = '500ms';/u);
  assert.ok(calls[0].sql.includes(`runtime.game_session_id = '${diagnosticGameId}'::uuid`));
  assert.doesNotMatch(calls[0].sql,/\b(insert|update|delete|claim_due_fx_games_v1|apply_fx_fixing_v1)\b/iu);
  assert.match(calls[0].sql,/rollback;$/u);
  assert.deepEqual(receipt(lines[0]),{schemaVersion:1,stage:'before_reentry_quote',available:true,observation:clockObservation()});
});
test('FX observation rethrows the identical quote error and retains ordered before/after samples without retry',()=>{
  const lines=[],order=[],original=new Error('FX_RATE_VERSION_STALE');let reads=0,quotes=0;
  assert.throws(()=>observeFinancialMarketReentryQuote(()=>{quotes++;order.push('quote');throw original;},{
    gameId:diagnosticGameId,emit:line=>lines.push(line),runSql:()=>{
      order.push('read');const data=clockObservation();
      if(reads++){data.databaseClockUtc='2026-11-01T08:00:00.310000Z';data.deadlineExpired=true;}
      return {status:0,output:JSON.stringify(data)};
    },
  }),error=>error===original);
  assert.equal(quotes,1);assert.deepEqual(order,['read','quote','read']);
  assert.deepEqual(lines.map(line=>receipt(line).stage),['before_reentry_quote','after_reentry_quote_failure']);
  assert.equal(receipt(lines[1]).observation.deadlineExpired,true);
});
test('FX receipt emits only validated metadata, never extra identifiers, keys or free text',()=>{
  const lines=[],secret='DO_NOT_EMIT_PRIVATE_FIXTURE_TEXT';
  const raw={...clockObservation(),playerId:secret,gameId:secret,headers:secret,error:secret};
  observeFinancialMarketReentryQuote(()=>true,{gameId:diagnosticGameId,emit:line=>lines.push(line),
    runSql:()=>({status:0,output:JSON.stringify(raw)})});
  assert.doesNotMatch(lines.join(''),/DO_NOT_EMIT|playerId|gameId|headers|error/u);
  assert.deepEqual(receipt(lines[0]).observation,clockObservation());
  for(const field of ['databaseClockUtc','cutoverStatus','currentFixingDigest','fixingKind']){
    const rejected=[];observeFinancialMarketReentryQuote(()=>true,{gameId:diagnosticGameId,emit:line=>rejected.push(line),
      runSql:()=>({status:0,output:JSON.stringify({...clockObservation(),[field]:secret})})});
    assert.deepEqual(receipt(rejected[0]),{schemaVersion:1,stage:'before_reentry_quote',available:false});
  }
});
test('unavailable, malformed and oversized metadata cannot mask quote success or expose diagnostics',()=>{
  for(const runSql of [
    ()=>({status:1,output:'SECRET',error:'SECRET'}),
    ()=>({status:0,output:'SECRET'}),
    ()=>({status:0,output:' '.repeat(2049)}),
    ()=>({status:0,output:'null'}),
    ()=>{throw new Error('SECRET');},
  ]){
    const lines=[];assert.equal(observeFinancialMarketReentryQuote(()=>17,{
      gameId:diagnosticGameId,runSql,emit:line=>lines.push(line),
    }),17);
    assert.deepEqual(receipt(lines[0]),{schemaVersion:1,stage:'before_reentry_quote',available:false});
    assert.ok(Buffer.byteLength(lines[0])<=2048);assert.doesNotMatch(lines[0],/SECRET/u);
  }
});
test('invalid diagnostic scope and broken logging neither execute extra SQL nor replace quote errors',()=>{
  let reads=0,quotes=0;const original=new Error('original quote failure');
  assert.throws(()=>observeFinancialMarketReentryQuote(()=>{quotes++;throw original;},{
    gameId:"';update private.fx_runtime_state;--",runSql:()=>{reads++;},emit:()=>{throw new Error('logger');},
  }),error=>error===original);
  assert.equal(reads,0);assert.equal(quotes,1);
});
