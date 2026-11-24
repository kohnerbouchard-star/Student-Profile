import { test, expect } from "@playwright/test";

async function openWorldFixture(page) {
  // Isolated real installer/renderer fixture, not the complete application bootstrap.
  // Deliberately inert, static fixture: never sanitize or embed application HTML.
  // Keep the production stylesheet cascade, but omit every bootstrap script.
  const shell = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>World quote review fixture</title>
  <link rel="stylesheet" href="./css/player-terminal-recovery-base.css" />
  <link rel="stylesheet" href="./css/player-terminal-recovery-core.css" />
  <link rel="stylesheet" href="./css/player-terminal-recovery-ux.css" />
  <link rel="stylesheet" href="./css/player-terminal-recovery-polish.css" />
  <link rel="stylesheet" href="./css/player-terminal-recovery-normalization.css" />
  <link rel="stylesheet" href="./css/player-terminal-tokens.css" />
  <link rel="stylesheet" href="./css/player-terminal-foundation.css" />
  <link rel="stylesheet" href="./css/player-terminal-recovery-shell-compat.css" />
  <link rel="stylesheet" href="./css/routes/player-terminal-shared-layout.css" />
  <link rel="stylesheet" href="./css/routes/player-terminal-shared-cards.css" />
  <link rel="stylesheet" href="./css/routes/player-terminal-shared-lists.css" />
  <link rel="stylesheet" href="./css/routes/player-terminal-shared-states.css" />
  <link rel="stylesheet" href="./css/routes/player-terminal-shared-details.css" />
  <link rel="stylesheet" href="./css/routes/player-terminal-shared-responsive.css" />
  <link rel="stylesheet" href="./css/routes/player-terminal-shared-overlays.css" />
  <link rel="stylesheet" href="./css/player-terminal-recovery-route-compat.css" />
  <link rel="stylesheet" href="./css/routes/player-terminal-dashboard.css" />
  <link rel="stylesheet" href="./css/player-terminal-skeletons.css" />
  <link rel="stylesheet" href="./css/player-terminal-skeleton-geometry.css" />
  <link rel="stylesheet" href="./css/player-terminal-recovery.css" />
  <link rel="stylesheet" href="./css/player-story-cutscene.css" />
  <link rel="stylesheet" href="./css/player-world-runtime.css" />
  <link rel="stylesheet" href="./css/player-terminal-interior-v2.css" />
  <link rel="stylesheet" href="./css/player-terminal-finance-v2.css" />
  <link rel="stylesheet" href="./css/player-terminal-communications-v2.css" />
  <link rel="stylesheet" href="./css/player-terminal-economy-items-v2.css" />
  <link rel="stylesheet" href="./css/player-terminal-operations-v2.css" />
  <link rel="stylesheet" href="./css/player-terminal-business-v2.css" />
  <link rel="stylesheet" href="./css/player-terminal-world-v2.css" />
  <link rel="stylesheet" href="./css/business-phase12-touch-targets.css" />
</head><body></body></html>`;
  await page.route("http://127.0.0.1:4173/", route => route.fulfill({ contentType: "text/html", body: shell }));
  await page.goto("/");
  await expect(page.locator("script")).toHaveCount(0);
}

test("native World installer quote review and unchanged confirmation", async ({ page }) => {
  await openWorldFixture(page);
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
  const destination = page.getByRole("combobox", {name:"Destination",exact:true});
  await expect(destination).toBeEnabled();
  await destination.selectOption("loc_finish");
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

test("native World residency reconciles a lost write by read without resubmitting", async ({ page }) => {
  await openWorldFixture(page);
  await page.evaluate(async () => {
    const { installWorldRuntimeFlow } = await import("/src/features/world/world-runtime-flow.js");
    const { renderPlayerRoute } = await import("/src/core/route-renderer.js");
    const { PreviewTransport } = await import("/src/api/preview-transport.js");
    const model = await new PreviewTransport({ simulateWrites: true }).request({ endpointKey: "worldRuntime", method: "GET" });
    model.residency = {
      currentCountryId: "eldoran", currencyCode: "ELD", eligibleCountryIds: ["valerion", "meridian"],
      pendingCountryId: null, revision: 3,
    };
    const session = { playerId: "fixture-player", playerSessionId: "fixture-session", gameSessionId: "fixture-game" };
    const capabilities = { routes: { world: true }, actions: { residencyRequest: true } };
    const state = {
      status: "ready", route: "world",
      data: { worldRuntime: model, session, capabilities, resourceStatus: { worldRuntime: { state: "ready" } } },
    };
    const mount = document.createElement("main");
    document.body.replaceChildren(mount);
    window.residencyFixtureCalls = [];
    let reads = 0;
    const config = {
      authenticated: true, csrfToken: "C".repeat(43), gameSessionId: session.gameSessionId,
      requestTimeoutMs: 5000, writeCooldownMs: 0, capabilities, allowedImageHosts: [],
      async apiCall({ endpointKey, method, payload }) {
        const call = { endpointKey, method };
        if (payload != null) call.payload = payload;
        window.residencyFixtureCalls.push(call);
        if (endpointKey === "residencyRequest" && method === "POST") {
          throw Object.assign(new Error("Synthetic residency response lost"), { code: "NETWORK_ERROR", status: 0 });
        }
        if (endpointKey === "worldRuntime" && method === "GET") {
          reads += 1;
          if (reads === 1) return model;
          if (reads === 2) return { ...model, residency: { ...model.residency, revision: 4, pendingCountryId: "valerion" } };
        }
        throw new Error(`Unexpected fixture request: ${method} ${endpointKey}`);
      },
    };
    const render = () => {
      mount.innerHTML = renderPlayerRoute({ route: "world", data: state.data, ui: {}, config });
    };
    window.residencyFixture = installWorldRuntimeFlow({
      mount, config, terminal: { getState: () => state, subscribe: () => () => {}, requestRender: render, refresh: async () => {} },
    });
    render();
  });
  try {
    const residency = page.getByRole("region", { name: "Eldoran", exact: true });
    const destination = residency.getByRole("combobox", { name: "Eligible destination" });
    const submit = residency.getByRole("button", { name: "Request residency review", exact: true });
    const reconcile = residency.getByRole("button", { name: "Refresh residency", exact: true });
    const uncertainty = residency.getByText(/Residency request outcome unconfirmed/);
    const revision = residency.locator('input[name="expectedRevision"]');
    const calls = () => page.evaluate(() => window.residencyFixtureCalls);
    const post = { endpointKey: "residencyRequest", method: "POST", payload: { countryId: "valerion", expectedRevision: 3 } };
    const get = { endpointKey: "worldRuntime", method: "GET" };

    await expect(submit).toBeEnabled();
    await expect(revision).toHaveValue("3");
    await destination.selectOption("valerion");
    await submit.click();
    await expect(uncertainty).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(destination).toBeDisabled();
    expect(await calls()).toEqual([post]);

    await reconcile.click();
    await expect(page.locator(".player-world-page-status")).toHaveText("World runtime refreshed.");
    await expect(uncertainty).toBeVisible();
    await expect(revision).toHaveValue("3");
    await expect(submit).toBeDisabled();
    await expect(destination).toBeDisabled();
    expect(await calls()).toEqual([post, get]);

    await reconcile.click();
    await expect(residency.getByText("Pending: Valerion", { exact: true })).toBeVisible();
    await expect(revision).toHaveValue("4");
    await expect(uncertainty).toHaveCount(0);
    await expect(reconcile).toHaveCount(0);
    await expect(residency.getByText(/request was confirmed|committed for review/i)).toHaveCount(0);
    await expect(submit).toBeDisabled();
    await expect(destination).toBeDisabled();
    expect(await calls()).toEqual([post, get, get]);
  } finally {
    await page.evaluate(() => window.residencyFixture.destroy());
  }
});
