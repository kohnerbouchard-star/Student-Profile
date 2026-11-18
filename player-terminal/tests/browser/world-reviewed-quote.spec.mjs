import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("native World installer quote review and unchanged confirmation", async ({ page }) => {
  // Isolated real installer/renderer fixture, not the complete application bootstrap.
  const shell = (await readFile(new URL("../../index.html", import.meta.url), "utf8")).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  await page.route("http://127.0.0.1:4173/", route => route.fulfill({ contentType: "text/html", body: shell }));
  await page.goto("/");
  await page.evaluate(async () => {
    const { installWorldRuntimeFlow } = await import("/src/features/world/world-runtime-flow.js");
    const { renderWorldPage } = await import("/src/pages/world-page.js");
    const { getWorldRouteViewState } = await import("/src/features/world/world-route-view-state.js");
    const { PreviewTransport } = await import("/src/api/preview-transport.js");
    const model = await new PreviewTransport({simulateWrites:true}).request({endpointKey:"worldRuntime",method:"GET"});
    model.travel={state:{status:"available",currentLocationId:"loc_start"},activeJourney:null};
    model.world={revision:7,locations:[{publicLocationId:"loc_start",availability:"normal"},{publicLocationId:"loc_finish",availability:"normal"}],routes:[{publicRouteId:"rte_test",status:"open",revision:3}]};
    const capabilities={routes:{world:true},actions:{travelQuote:true,travelExecute:true}};
    const mount=document.createElement("main");document.body.replaceChildren(mount);
    const state={status:"ready",route:"world",data:{worldRuntime:model,capabilities}};
    window.quoteFixtureCalls=[];
    const config={authenticated:true,csrfToken:"C".repeat(43),gameSessionId:"fixture-game",requestTimeoutMs:5000,writeCooldownMs:0,capabilities,allowedImageHosts:[],apiCall:async context=>{
      window.quoteFixtureCalls.push({key:context.endpointKey,payload:context.payload});
      if(context.method==="GET")return model;
      if(context.endpointKey==="travelQuote")return {quote:{publicQuoteId:"trq_"+"1".repeat(32),fromLocationId:"loc_start",toLocationId:"loc_finish",currencyCode:"ELD",totalCostMinor:125,totalDurationMinutes:12,routeStateRevision:7,status:"created",expiresAt:new Date(Date.now()+120000).toISOString(),legs:[{publicRouteId:"rte_test",fromLocationId:"loc_start",toLocationId:"loc_finish",mode:"land",costMinor:125,durationMinutes:12,routeRevision:3}]}};
      return {journey:{publicJourneyId:"trj_"+"2".repeat(32),status:"in_transit"}};
    }};
    const render=()=>{mount.innerHTML=renderWorldPage(model,{...getWorldRouteViewState(),capabilities});};
    window.quoteFixture=installWorldRuntimeFlow({mount,config,terminal:{getState:()=>state,subscribe:()=>()=>{},requestRender:render,refresh:async()=>{}}});render();
  });
  await page.getByLabel("Destination",{exact:true}).selectOption("loc_finish");
  await page.locator('[data-world-form="travelQuote"] button[type="submit"]').click();
  const quote=page.locator('[data-world-form="travelExecute"]');
  await expect(quote).toContainText("Expires");await expect(quote).toContainText("route revision 3");
  await expect(quote.getByRole("button",{name:"Confirm travel"})).toBeEnabled();
  await page.setViewportSize({width:320,height:800});
  expect(await quote.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBeTruthy();
  await quote.getByRole("button",{name:"Confirm travel"}).focus();await page.keyboard.press("Enter");
  await expect.poll(()=>page.evaluate(()=>window.quoteFixtureCalls.filter(c=>c.key==="travelExecute").length)).toBe(1);
  expect(await page.evaluate(()=>window.quoteFixtureCalls.find(c=>c.key==="travelExecute").payload)).toEqual({quoteId:"trq_"+"1".repeat(32)});
  await page.evaluate(()=>window.quoteFixture.destroy());
});
