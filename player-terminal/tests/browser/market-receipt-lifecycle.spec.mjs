import { test, expect } from '@playwright/test';
async function mount(page, deferPostRefresh = false) {
  await page.route('**/receipt-fixture', route => route.fulfill({contentType:'text/html',body:'<!doctype html><div id="playerTerminal"></div>'}));
  await page.goto('/receipt-fixture#market');
  await page.evaluate(async(deferPostRefresh)=>{
    const [{createPlayerTerminal},{installMarketOrderFlow},{PlayerApi},fixture]=await Promise.all([
      import('/src/app.js'),import('/src/features/market/market-order-flow.js'),import('/src/api/player-api.js'),import('/tests/fixtures/business-market-fixture.mjs')]);
    const data=fixture.businessMarketData(),events=[];let mutations=0,releaseLate,releasePost;
    PlayerApi.prototype.bootstrap=async function(){return this.freshness.track(structuredClone(data),this.freshness.capture([]));};
    PlayerApi.prototype.loadRoute=async function(){return this.freshness.track({data:{market:data.market,portfolio:data.portfolio,bankingFx:data.bankingFx},errors:{}},this.freshness.capture(['market']));};
    PlayerApi.prototype.refreshResources=async function(keys){
      const ticket=this.freshness.capture(keys);
      if(keys.includes('notifications')){events.push('late-read-start');await new Promise(r=>releaseLate=r);events.push('late-read-resolved');}
      else { events.push('post-settlement-refresh'); if(deferPostRefresh) await new Promise(r=>releasePost=r); }
      return this.freshness.track({data:{},errors:{}},ticket);
    };
    const mount=document.getElementById('playerTerminal');
    const terminal=createPlayerTerminal({mount,config:{usePreviewData:true,environment:'development',capabilities:data.capabilities}});
    await new Promise(r=>setTimeout(r,0));
    const config={usePreviewData:false,authenticated:true,csrfToken:'a'.repeat(43),publishableKey:'sb_publishable_market_fixture',deviceId:'00000000-0000-4000-8000-000000000001',requestTimeoutMs:1000,writeCooldownMs:0,apiCall:async context=>{
      if(context.endpointKey==='marketAsset')return {ok:true,asset:fixture.listedBusiness(),tickIndex:1,history:[]};
      assertAction(context.payload.action);mutations++;events.push('accepted-synthetic-settlement');return fixture.tradeResponse(context.payload.action,context.payload.quantity||1);
    }};
    function assertAction(action){if(action!=='settle_sell')throw new Error('Unexpected mutation '+action);}
    let subscriptions=0; const subscribe=terminal.subscribe; terminal.subscribe=(fn)=>{subscriptions++;const off=subscribe(fn);return()=>{subscriptions--;off();};};
    const flow=installMarketOrderFlow({mount,terminal,config});
    const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node.nodeType===1&&(node.matches?.('[data-player-market-order-dialog]')||node.querySelector?.('[data-player-market-order-dialog]')))events.push('dialog-node-removed');});observer.observe(mount,{childList:true});
    const pending=terminal.refreshResources(['notifications']);
    globalThis.probe={terminal,flow,events,observer,pending,release:()=>releaseLate?.(),releasePost:()=>releasePost?.(),count:()=>mutations,subscriptions:()=>subscriptions,recreate:()=>installMarketOrderFlow({mount,terminal,config})};
  }, deferPostRefresh);
  await page.locator('form[data-player-market-order-form="sell-review"] button[type="submit"]').click();
  await page.locator('[data-player-market-order-confirm]').click();
  if(!deferPostRefresh) await expect(page.locator('[data-player-market-order-dialog]').getByText('FILLED',{exact:true})).toBeVisible();
}
test('accepted receipt survives late and repeated real terminal renders with focus and one mutation', async({page})=>{
  await mount(page);
  const close=page.getByRole('button',{name:'Close receipt',exact:true});
  await close.focus();
  await page.evaluate(async()=>{probe.release();await probe.pending;});
  await expect(close).toBeFocused();
  for(let i=0;i<3;i++)await page.evaluate(()=>probe.terminal.refreshResources(['market']));
  await expect(close).toBeFocused();
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(1);
  expect(await page.locator('.player-terminal-app-root').evaluate(el=>el.inert)).toBe(true);
  expect(await page.evaluate(()=>probe.count())).toBe(1);
  await close.click();
  await expect(page.locator('form[data-player-market-order-form="sell-review"] button[type="submit"]')).toBeFocused();
  await page.evaluate(()=>probe.terminal.refreshResources(['market']));
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(0);
  expect(await page.locator('.player-terminal-app-root').evaluate(el=>el.inert)).toBe(false);
});
test('destroy/recreate unsubscribes and cannot resurrect the old receipt',async({page})=>{
  await mount(page);
  expect(await page.evaluate(()=>probe.subscriptions())).toBe(1);
  await page.evaluate(async()=>{probe.flow.destroy();probe.flow=probe.recreate();probe.release();await probe.pending;});
  expect(await page.evaluate(()=>probe.subscriptions())).toBe(1);
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(0);
  await page.evaluate(()=>probe.terminal.refreshResources(['market']));
  expect(await page.evaluate(()=>probe.count())).toBe(1);
  await page.evaluate(()=>probe.flow.destroy());
  expect(await page.evaluate(()=>probe.subscriptions())).toBe(0);
});
test('navigation retires the accepted receipt before a delayed refresh',async({page})=>{
  await mount(page);
  await page.evaluate(()=>probe.terminal.navigate('portfolio'));
  await expect(page).toHaveURL(/#portfolio$/);
  await page.evaluate(async()=>{probe.release();await probe.pending;});
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(0);
  expect(await page.evaluate(()=>probe.count())).toBe(1);
});
test('destroy during accepted settlement refresh cannot resurrect a receipt',async({page})=>{
  await mount(page,true);
  await page.waitForFunction(()=>probe.events.includes('post-settlement-refresh'));
  await page.evaluate(async()=>{probe.flow.destroy();probe.flow=probe.recreate();probe.releasePost();probe.release();await probe.pending;});
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(0);
  expect(await page.evaluate(()=>probe.count())).toBe(1);
  expect(await page.evaluate(()=>probe.subscriptions())).toBe(1);
});
test('away and back during settlement refresh permanently retires the pending receipt',async({page})=>{
  await mount(page,true);
  await page.waitForFunction(()=>probe.events.includes('post-settlement-refresh'));
  await page.evaluate(()=>probe.terminal.navigate('portfolio'));
  await page.waitForFunction(()=>probe.terminal.getState().route==='portfolio');
  await page.evaluate(()=>probe.terminal.navigate('market'));
  await page.waitForFunction(()=>probe.terminal.getState().route==='market');
  await page.evaluate(async()=>{probe.releasePost();probe.release();await probe.pending;});
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(0);
  expect(await page.evaluate(()=>probe.count())).toBe(1);
  await page.evaluate(()=>probe.terminal.requestRender());
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(0);
});
test('keyboard dismissal does not resurrect a receipt',async({page})=>{
  await mount(page);
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{probe.release();await probe.pending;});
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(0);
});
test('session exit retires a receipt',async({page})=>{
  await mount(page);
  await page.evaluate(async()=>{
    const {updateStoreFromSnapshot}=await import('/src/core/store.js');
    updateStoreFromSnapshot(probe.terminal.getState(),{status:'waiting'});
    probe.release();await probe.pending;
  });
  await expect(page.locator('[data-player-market-order-dialog]')).toHaveCount(0);
  expect(await page.evaluate(()=>probe.count())).toBe(1);
});
