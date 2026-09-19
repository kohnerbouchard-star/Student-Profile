import assert from 'node:assert/strict';
import test from 'node:test';
import {businessShareListing,assertBusinessShareQuantity,renderBusinessShareFacts} from '../player-terminal/src/features/market/business-share-view.js';
import {businessMarketData,listedBusiness} from '../player-terminal/tests/fixtures/business-market-fixture.mjs';
import {renderPortfolioPage} from '../player-terminal/src/pages/portfolio-page.js';
import {renderMarketPage} from '../player-terminal/src/pages/market-page.js';
import {attachPortfolioHoldings} from '../player-terminal/src/api/portfolio-market-holdings.js';
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
