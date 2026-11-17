import { test, expect } from '@playwright/test';
async function setup(page) {
  await page.route('**/directory-fixture', route => route.fulfill({contentType:'text/html',body:'<!doctype html><div id="playerTerminal"></div>'}));
  await page.goto('/directory-fixture#market');
  await page.evaluate(async()=>{
    const [{createPlayerTerminal},{installMarketDirectoryFlow},{installLocalControlsFlow},{PlayerApi},{previewData}]=await Promise.all([
      import('/src/app.js'),import('/src/features/market/market-directory-flow.js'),import('/src/features/local-controls/local-controls-flow.js'),import('/src/api/player-api.js'),import('/src/data/preview-data.js')]);
    const data=structuredClone(previewData);data.market.assets=data.market.assets.slice(0,2);
    data.market.pagination={offset:0,limit:2,returned:2,hasMore:true,nextOffset:2};
    PlayerApi.prototype.bootstrap=async function(){return this.freshness.track(structuredClone(data),this.freshness.capture([]));};
    PlayerApi.prototype.loadRoute=async function(){return this.freshness.track({data:structuredClone(data),errors:{}},this.freshness.capture(['market']));};
    const mount=document.getElementById('playerTerminal');
    const terminal=createPlayerTerminal({mount,config:{usePreviewData:true,environment:'development'}});
    await new Promise(r=>setTimeout(r,0));
    let release,calls=0;
    const config={usePreviewData:false,authenticated:true,csrfToken:'a'.repeat(43),gameSessionId:'fixture-game',requestTimeoutMs:5000,apiCall:async context=>{
      if(context.endpointKey!=='market'||context.payload.offset!==2)throw new Error('Unexpected request');calls++;
      await new Promise(r=>release=r);
      return {...data.market,assets:[{...data.market.assets[0],id:'additional',symbol:'ADDL',name:'Additional instrument'}],pagination:{offset:2,limit:2,returned:1,hasMore:false,nextOffset:null}};
    }};
    const controls=installLocalControlsFlow({mount,terminal});
    const flow=installMarketDirectoryFlow({mount,terminal,config});
    globalThis.probe={terminal,flow,controls,release:()=>release(),calls:()=>calls};
  });
}
test('load more retains search and shows newly loaded matching assets',async({page})=>{
  await setup(page);
  await page.locator('[data-player-local-action="market-search"]').click();
  await page.locator('[data-player-market-search]').fill('Additional');
  await expect(page.locator('[data-player-market-search-empty]')).toBeVisible();
  await page.locator('form[data-player-market-order-form="buy-quote"] input[name="quantity"]').fill('7');
  await page.getByRole('button',{name:'Load more instruments'}).click();
  await expect(page.getByRole('button',{name:'Loading instruments'})).toBeDisabled();
  await page.evaluate(()=>probe.release());
  await expect(page.locator('[data-player-market-search]')).toHaveValue('Additional');
  await expect(page.locator('[data-player-market-select="additional"]')).toBeVisible();
  await expect(page.locator('[data-player-market-directory-status]')).toContainText('3 instruments loaded');
  await expect(page.locator('[data-player-market-directory-status]')).toBeFocused();
  await expect(page.locator('form[data-player-market-order-form="buy-quote"] input[name="quantity"]')).toHaveValue('7');
  expect(await page.evaluate(()=>probe.calls())).toBe(1);
});
test('leave and return prevents old page from modifying new route data',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Load more instruments'}).click();
  await page.evaluate(()=>probe.terminal.navigate('portfolio'));
  await expect(page).toHaveURL(/#portfolio$/);
  await page.evaluate(()=>probe.terminal.navigate('market'));
  await expect(page.getByRole('button',{name:'Load more instruments'})).toBeEnabled();
  await page.evaluate(()=>probe.release());
  await expect(page.locator('[data-player-market-directory-status]')).toContainText('2 instruments loaded');
  await expect(page.locator('[data-player-market-select="additional"]')).toHaveCount(0);
});
