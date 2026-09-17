import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ADMIN_V2_FIXTURE_ADMIN_ID as ADMIN, ADMIN_V2_FIXTURE_GAME_ID as GAME, ADMIN_V2_FIXTURE_PERMISSIONS as PERMISSIONS, createAdminV2FixtureSession, startAdminV2FixtureServer } from "./admin-v2-browser-fixture-server.mjs";
import { BUSINESS_SUPERVISION_FIELDS as FIELDS, BUSINESS_SUPERVISION_LABELS as LABELS } from "../admin/v2/src/routes/business/BusinessSupervisionModel.js";
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = process.env.ADMIN_V2_EVIDENCE_DIR || "/tmp/admin-business-supervision-evidence";
const KEY = "biz_" + "a".repeat(32);
const PRIVATE = "30000000-0000-4000-8000-000000000003";
mkdirSync(OUT,{recursive:true});
const business = { public_key:KEY, legal_name:"한강 Robotic Manufacturing Cooperative — "+ "Long name ".repeat(8), entity_type:"llc", country_code:"TST", currency_code:"ECO", status:"active", capitalization:"1000", reputation_score:80, failure_count:0, operational_readiness:"unknown", owner_player_id:PRIVATE };
function payload(empty=false) {
  return { business, supervision: { schemaVersion:1, readOnly:true, businessKey:KEY, generatedAt:"2026-09-17T22:00:00Z", healthFlags:["unpaid-tax-evidence"],
    sections:Object.fromEntries(Object.entries(FIELDS).map(([name,fields])=>[name, {
      status:empty?"empty":"ready", truncated:name==="activity",
      rows:empty?[]:[{...Object.fromEntries(fields.map(key=>[key,key==="status"?"active":key.includes("amount")?"9007199254740993.123456789123456789":key.includes("currency")||key==="currencyCode"?"ECO":key.includes("name")||key.includes("Name")?"精密 "+ "Evidence ".repeat(12):"1"])),
        player_id:PRIVATE, metadata:{secret:"POISON"}, held_amount:PRIVATE,
      }],
    }])),
  } };
}
const fixture = await startAdminV2FixtureServer({repositoryRoot:ROOT});
const browser = await chromium.launch({headless:true,...(process.env.PHASE13_CHROMIUM_PATH ? {executablePath:process.env.PHASE13_CHROMIUM_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}: {})});
const checks=[];
async function runtime(viewport,scenario) {
  const context=await browser.newContext({viewport,reducedMotion:"reduce",colorScheme:"dark"});
  await context.addCookies([{name:"admin-v2-scenario",value:"ready",url:fixture.origin},{name:"admin-v2-run",value:randomUUID(),url:fixture.origin}]);
  const session=createAdminV2FixtureSession("ready");
  if(scenario==="permission") session.permissions=PERMISSIONS.filter(p=>p!=="business.manage");
  await context.addInitScript(({session})=>{
    sessionStorage.setItem("econovaria.admin.auth.v1",JSON.stringify(session));
    localStorage.setItem("econovaria.device.v1","a0000000-0000-4000-8000-00000000000a");
  },{session});
  const page=await context.newPage();
  const errors=[]; const requests=[]; let detailAttempts=0; let listAttempts=0;
  let releaseDetail; const detailGate=new Promise(resolve=>{releaseDetail=resolve;});
  page.on("pageerror",error=>errors.push(error.message));
  await page.route(/\/(?:api\/admin|functions\/v1\/web-session-api\/proxy)\//,async route=>{
    const request=route.request(); const url=new URL(request.url());
    if(scenario==="permission"&&url.pathname.endsWith("/session/bootstrap")) {
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{
        admin:{id:ADMIN,displayName:"Administrator",role:"game_admin"},
        activeGame:{id:GAME,name:"Phase 13",status:"active"},games:[{id:GAME,name:"Phase 13",status:"active"}],
        permissions:session.permissions,roles:["game_admin"],adminRole:"game_admin",
      },error:null})}); return;
    }
    if(!url.pathname.includes("/businesses")) return route.continue();
    requests.push({method:request.method(),path:url.pathname});
    assert.equal(request.method(),"GET");
    assert.ok(url.pathname.includes("/games/"+GAME+"/businesses"));
    const detail=url.pathname.endsWith("/"+KEY);
    if(detail) detailAttempts++; else listAttempts++;
    if(detail&&scenario==="loading") await detailGate;
    if((scenario==="failed"&&!detail&&listAttempts===1)||(scenario==="retry"&&detail&&detailAttempts===1)||(scenario==="stale"&&!detail&&listAttempts>1)){
      await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({code:"UPSTREAM_UNAVAILABLE",message:"SELECT service_role POISON "+PRIVATE})});return;
    }
    await route.fulfill({status:200,contentType:"application/json",headers:{"cache-control":"no-store"},body:JSON.stringify({
      data:detail?payload(scenario==="emptySections"):{businesses:scenario==="empty"?[]:[business]},
    })});
  });
  await page.goto(fixture.origin+"/admin/v2.html?game="+GAME+"#business",{waitUntil:"domcontentloaded"});
  return {context,page,errors,requests,releaseDetail};
}
async function overflow(page) {
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true,"page overflow");
}
async function privacy(page) {
  const text=await page.locator(".admin-business-route, .admin-drawer").evaluateAll(nodes=>nodes.map(n=>n.outerHTML).join("\n"));
  assert.doesNotMatch(text,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|POISON|service_role|owner_player_id|player_id/i);
}
try {
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    for(const scenario of ["ready","empty","emptySections","failed","retry","stale","loading","permission"]) {
      const {context,page,errors,requests,releaseDetail}=await runtime(viewport,scenario);
      try {
        if(scenario==="permission") {
          await page.getByText("Your administrator session does not include the permission required for this destination.").waitFor();
          assert.equal(requests.length,0);
        } else if(scenario==="empty") {
          await page.getByText("No businesses yet",{exact:true}).waitFor();
        } else {
          if(scenario==="failed") {
            await page.getByRole("button",{name:"Retry Business",exact:true}).click();
          }
          const opener=page.getByRole("button",{name:"Details",exact:true}).first();
          await opener.waitFor();
          if(scenario==="stale") {
            await page.getByRole("button",{name:"Refresh",exact:true}).click();
            await page.locator('.admin-business-route[data-admin-v2-state="stale"]').waitFor();
          }
          await opener.click();
          const dialog=page.getByRole("dialog");
          await dialog.waitFor();
          if(scenario==="loading") {
            await page.getByLabel("Loading authoritative Business detail").waitFor();
            await page.keyboard.press("Escape");
            releaseDetail();
            await page.waitForTimeout(100);
            assert.equal(await page.getByRole("dialog").count(),0,"late detail reopened drawer");
          } else {
            if(scenario==="retry") await page.getByRole("button",{name:"Retry detail",exact:true}).click();
            const selector=dialog.getByLabel("Supervision section",{exact:true});
            await selector.waitFor();
            if(scenario==="emptySections") await dialog.getByText("No recorded evidence",{exact:true}).waitFor();
            if(scenario==="ready") {
              for(const [name,title] of Object.entries(LABELS)) {
                await selector.selectOption(name);
                await dialog.getByRole("heading",{name:title,exact:true}).waitFor();
                await privacy(page);
                await overflow(page);
              }
              await selector.selectOption("checking");
              assert.ok((await dialog.innerText()).includes("9007199254740993.123456789123456789"));
              await page.screenshot({path:path.join(OUT,"business-"+viewport.width+".png"),fullPage:true});
              await selector.focus();
              for(let tab=0;tab<12;tab++) {
                await page.keyboard.press("Tab");
                assert.equal(await dialog.evaluate(node=>node.contains(document.activeElement)),true,"focus escaped drawer");
              }
              assert.equal(await page.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches),true);
            }
            await page.keyboard.press("Escape");
            assert.equal(await page.getByRole("dialog").count(),0,"read-only selector should not trigger unsaved warning");
            assert.equal(await opener.evaluate(node=>node===document.activeElement),true,"opener focus not restored");
          }
        }
        await overflow(page); await privacy(page);
        assert.deepEqual(errors,[]);
        assert.ok(requests.every(r=>r.method==="GET"));
        checks.push({viewport:viewport.width,scenario,status:"pass"});
      } finally {releaseDetail();await context.close();}
    }
  }
} finally {
  writeFileSync(path.join(OUT,"results.json"),JSON.stringify({checks},null,2)+"\n");
  await browser.close(); await fixture.close();
}
console.log(JSON.stringify({status:"pass",checks},null,2));
