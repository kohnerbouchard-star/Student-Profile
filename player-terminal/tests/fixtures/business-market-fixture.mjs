import { previewData } from '../../src/data/preview-data.js';
import { mergeTerminalRead } from '../../src/api/read-model.js';
import { attachPortfolioHoldings } from '../../src/api/portfolio-market-holdings.js';
export const TICKER='B111111111111111';
export const ACCOUNT='bac_'+'d'.repeat(32);
export function listedBusiness() {
  return {assetId:TICKER,ticker:TICKER,companyName:'Northreach Fabrication',sector:'manufacturing',countryCode:'NORTHREACH',listingCurrencyCode:'NRC',
    currentPrice:2.5,previousClose:2.5,changePct:0,openPrice:2.5,dayHigh:2.5,dayLow:2.5,volume:0,marketCap:25050,
    currentVolatility:.02,longRunVolatility:.02,description:'Common shares in Northreach Fabrication',isWatchlisted:false,
    commonEquity:{businessKey:'biz_'+'a'.repeat(32),ipoKey:'bgp_'+'b'.repeat(32),shareClass:'common',wholeSharesOnly:true,marketPolicy:'business_listing_v1',
      financials:{status:'complete',statementKey:'bopr_'+'c'.repeat(32),periodNumber:'1',capturedAt:'2026-09-18T00:00:00Z',currencyCode:'NRC',equity:'1000.123456789123456789',revenue:'15',netIncome:'10'}}};
}
export function businessMarketData() {
  let data=structuredClone(previewData);
  data=mergeTerminalRead(data,'market',{assets:[listedBusiness()],tickIndex:1});
  data.market.status='OPEN';data.market.nextClose='17:00';
  data.portfolio=attachPortfolioHoldings(data.portfolio,{holdings:[{ticker:TICKER,companyName:'Northreach Fabrication',countryCode:'NORTHREACH',sector:'manufacturing',currencyCode:'NRC',quantity:20,averageCost:2.5,currentPrice:2.5,marketValue:50,costBasis:50,unrealizedPnl:0,realizedPnl:0}]});
  data.bankingFx={balances:[{accountKey:ACCOUNT,accountKind:'checking',currencyCode:'NRC',availableAmount:'100'}]};
  data.businessIpos=null;data.business={configured:false};
  data.resourceStatus={bankingFx:{state:'ready'},banking:{state:'ready'},market:{state:'ready'},portfolio:{state:'ready'},news:{state:'ready'},businessIpos:{state:'unavailable'}};
  data.capabilities={routes:{market:true,portfolio:true},endpointKeys:{marketOrder:true,marketAsset:true,portfolio:true},actions:{marketOrder:true}};
  return data;
}
export function tradeResponse(action,quantity=1) {
  const common={ticker:TICKER,listingCurrencyCode:'NRC',quantity,priceTickIndex:1,grossValue:quantity*2.5};
  const funding={lines:[{source_account_key:ACCOUNT,source_currency_code:'NRC',target_currency_code:'NRC',source_debit:String(quantity*2.5),target_contribution:String(quantity*2.5),customer_rate:'1',requires_fx:false}]};
  if(action==='create_buy_quote')return{ok:true,action,quote:{...common,quoteKey:'sbq_'+'e'.repeat(32),quotedPrice:2.5,expiresAt:new Date(Date.now()+300000).toISOString(),funding}};
  return {ok:true,action,settlement:{...common,executionPrice:2.5,holdingQuantityAfter:action==='settle_sell'?20-quantity:20+quantity,averageCostAfter:2.5,filledAt:new Date().toISOString(),alreadyCompleted:false,
    ...(action==='settle_sell'?{destinationAccountKey:ACCOUNT,settlementTransactionKey:'btx_'+'f'.repeat(32)}:{quoteKey:'sbq_'+'e'.repeat(32),funding})}};
}
