import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const index=await readFile(new URL('../../index.html',import.meta.url),'utf8').catch(()=>readFile(new URL('../../../index.html',import.meta.url),'utf8'));
async function mount(page,options={}) {
  const links=(index.match(/<link[^>]+rel="stylesheet"[^>]*>/gu)||[]).join('\n').replaceAll('href="./','href="/');
  await page.route('**/business-market-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${links}</head><body><div id="playerTerminal" class="player-terminal"><main id="market-mount" class="player-terminal-main"></main></div></body></html>`}));
  await page.goto('/business-market-test');
  await page.evaluate(async options=>{
    const [{renderMarketPage},{renderPortfolioPage},{installMarketOrderFlow},fixture,{ApiRequestError},{resolvePlayerBackendRequest}]=await Promise.all([
      import('/src/pages/market-page.js'),import('/src/pages/portfolio-page.js'),import('/src/features/market/market-order-flow.js'),import('/tests/fixtures/business-market-fixture.mjs'),import('/src/api/errors.js'),import('/src/api/backend-routes.js')]);
    const state={route:options.portfolio?'portfolio':'market',data:fixture.businessMarketData()};const calls=[],toasts=[];let attempt=0;
    if(options.unavailable)state.data.resourceStatus.bankingFx={state:'unavailable'};
    if(options.stale)state.data.resourceStatus.portfolio={state:'unavailable'};
    const host=document.getElementById('market-mount');
    const render=()=>{host.innerHTML=state.route==='portfolio'?renderPortfolioPage(state.data):renderMarketPage(state.data,{});};
    const config={usePreviewData:false,authenticated:true,csrfToken:'a'.repeat(43),publishableKey:'sb_publishable_market_fixture',deviceId:'00000000-0000-4000-8000-000000000001',requestTimeoutMs:1000,writeCooldownMs:0,apiCall:async context=>{
      if(context.endpointKey==='marketAsset') return {ok:true,asset:fixture.listedBusiness(),tickIndex:1,history:[]};
      calls.push({key:context.idempotencyKey,request:resolvePlayerBackendRequest({...context,payload:{...context.payload,idempotencyKey:context.idempotencyKey}})});
      const action=context.payload.action;
      if(action!=='create_buy_quote' && options.uncertain && ++attempt===1)throw new ApiRequestError('Fixture response lost',{code:'REQUEST_TIMEOUT'});
      if(options.denied)throw new ApiRequestError('There are not enough common shares available on the Market.',{code:'insufficient_shares',status:409});
      return fixture.tradeResponse(action,context.payload.quantity||1);
    }};
    const terminal={getState:()=>state,requestRender:render,showToast:message=>toasts.push(message),navigate:route=>{state.route=route;render();},refreshResources:async()=>{
      if(options.refreshFailure)throw new Error('Fixture refresh failed');
      state.data.portfolio.holdings[0].quantity=21;state.data.portfolio.holdings[0].marketValue=52.5;render();return{errors:{}};
    }};
    render();const flow=installMarketOrderFlow({mount:host,terminal,config});globalThis.marketTest={state,calls,toasts,flow,render,terminal};
  },options);
}
test('listed common shares show exact closed financials, authoritative positions and whole-share tickets',async({page})=>{
  await mount(page);
  await expect(page.locator('[data-business-share-facts]')).toContainText('1000.123456789123456789');
  await expect(page.locator('[data-business-share-facts]')).toContainText('Closed period 1');
  await expect(page.locator('.player-terminal-position-strip')).toContainText('20 shares');
  await expect(page.locator('[data-player-form="market-buy"] [name="quantity"]')).toHaveAttribute('step','1');
  await expect(page.locator('[data-player-form="market-sell"] [name="quantity"]')).toHaveAttribute('step','1');
  await page.evaluate(()=>marketTest.terminal.navigate('portfolio'));
  await expect(page.locator('[data-page="portfolio"]')).toContainText('NRC 50');
  await expect(page.locator('[data-page="portfolio"]')).toContainText('20');
  await expect(page.locator('[data-page="portfolio"]')).not.toContainText('NET WORTH');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('common-share purchase reviews by keyboard and preserves uncertain retry and committed success',async({page})=>{
  await mount(page,{uncertain:true,refreshFailure:true});
  await page.getByRole('button',{name:'Create exact quote'}).focus();await page.keyboard.press('Enter');
  const dialog=page.locator('[data-player-market-order-dialog]');await expect(dialog).toContainText('NRC 2.5');
  await dialog.getByRole('button',{name:'Confirm settlement'}).click();await expect(dialog.locator('[role="alert"]')).toContainText('Fixture response lost');
  await dialog.getByRole('button',{name:'Confirm settlement'}).click();await expect(dialog).toContainText('FILLED · REFRESH PENDING');
  const calls=await page.evaluate(()=>marketTest.calls);expect(calls).toHaveLength(3);expect(calls[1].key).toBe(calls[2].key);
  expect(calls[1].request.payload.quoteKey).toMatch(/^sbq_/);expect(JSON.stringify(calls)).not.toMatch(/gameSessionId|playerId|stockAssetId/);
});
test('common-share sale returns Checking proceeds through the retained review',async({page})=>{
  await mount(page,{refreshFailure:true});await page.getByRole('button',{name:'Review sale'}).click();
  const dialog=page.locator('[data-player-market-order-dialog]');await expect(dialog).toContainText('NRC');
  await dialog.getByRole('button',{name:'Confirm immediate sale'}).click();await expect(dialog).toContainText('FILLED · REFRESH PENDING');
  expect((await page.evaluate(()=>marketTest.calls))[0].request.payload.destinationAccountKey).toMatch(/^bac_/);
  await expect(page.locator('body')).not.toContainText(/00000000-0000-4000/);
});
test('fractional or unavailable common-share tickets cannot settle and Portfolio labels stale positions',async({page})=>{
  await mount(page);await page.locator('[data-player-form="market-buy"] [name="quantity"]').fill('0.5');
  await page.locator('[data-player-form="market-buy"]').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await expect.poll(()=>page.evaluate(()=>marketTest.toasts.join(' '))).toContain('whole shares');
  expect(await page.evaluate(()=>marketTest.calls.length)).toBe(0);
  await mount(page,{unavailable:true});await expect(page.getByRole('button',{name:'Create exact quote'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Review sale'})).toBeDisabled();
  await mount(page,{portfolio:true,stale:true});await expect(page.locator('[data-page="portfolio"]')).toContainText('last loaded amounts');
});
