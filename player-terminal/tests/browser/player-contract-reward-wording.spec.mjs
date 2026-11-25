import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const styles = [...readFileSync(new URL('../../index.html', import.meta.url), 'utf8').matchAll(/<link rel="stylesheet" href="\.([^\"]+)"\s*\/>/g)].map(match => `<link rel="stylesheet" href="${match[1]}">`).join('');
test('mounted Contracts distinguishes existing reward evidence without claiming a payout', async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/contract-reward-route', route => route.fulfill({ contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<div id="fixture"></div>` }));
  await page.goto('/contract-reward-route#contracts');
  await page.evaluate(async()=>{
    const {createPlayerTerminal}=await import('/src/app.js');
    const {buildPlayerTerminalConfig}=await import('/src/config/player-terminal.config.js');
    const {normalizePlayerContracts}=await import('/src/features/contracts/contract-read-model.js');
    const {previewData}=await import('/src/data/preview-data.js');
    const time='2026-11-22T00:00:00Z',cash={checking:{amount:'50.00',currencyCode:'ECO'}};
    const cases=[['pending',cash,null],['empty',{},null],['processed',cash,time],['unknown',{xp:5},null]];
    const models=structuredClone(previewData);
    models.contracts=normalizePlayerContracts({contracts:cases.map(([key,rewardPayload])=>({contractKey:key,title:`Reward ${key}`,status:'active',rewardPayload})),progress:cases.map(([contractKey,,rewardIssuedAt])=>({contractKey,status:'completed',submittedAt:time,completedAt:time,rewardIssuedAt,evidencePayload:{note:'Recorded explanation'},resultPayload:{feedback:'Recorded feedback'}}))});
    const writes=[];
    const config=buildPlayerTerminalConfig({usePreviewData:false,authenticated:true,csrfToken:'R'.repeat(43),gameSessionId:'reward-fixture',capabilities:{routes:{contracts:true},actions:{contractAccept:true,contractSubmit:true}},apiCall:async context=>{if(context.method==='GET')return structuredClone(models[context.endpointKey]);writes.push(context.endpointKey);return {ok:true}}});
    globalThis.rewardRoute={terminal:createPlayerTerminal({mount:document.querySelector('#fixture'),config}),writes};
  });
  await expect(page.locator('.player-terminal-contract-detail')).toBeVisible();
  for(const [key,copy] of [['pending','Awaiting confirmation'],['empty','No reward is currently configured'],['processed','Reward processing recorded. This does not confirm a payout.'],['unknown','Reward status is not available']]){
    await page.locator(`[data-player-contract-select="${key}"]`).click();
    const detail=page.locator('.player-terminal-contract-detail');
    await expect(detail).toContainText(copy);
    await expect(detail).toContainText('Recorded explanation');
    await expect(detail).toContainText('Recorded feedback');
    await expect(detail).not.toContainText('reward has been issued');
    await expect(detail.locator('dt')).not.toContainText(['Cash reward']);
    await expect(page.locator('[data-player-contract-accept], form[data-endpoint="contractSubmit"]')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({path:test.info().outputPath('contract-reward-states.png'),fullPage:true});
  expect(await page.evaluate(()=>rewardRoute.writes)).toEqual([]);expect(errors).toEqual([]);
});
