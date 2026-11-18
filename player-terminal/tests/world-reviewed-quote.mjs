import assert from "node:assert/strict";
import { test } from "node:test";
import { installWorldRuntimeFlow } from "../src/features/world/world-runtime-flow.js";
import { getWorldRouteViewState } from "../src/features/world/world-route-view-state.js";
import { reviewTravelQuote } from "../src/features/world/travel-quote-review.js";
import { renderWorldPage } from "../src/pages/world-page.js";
import { PreviewTransport } from "../src/api/preview-transport.js";
const tick = () => new Promise(setImmediate);
const quote = () => ({ publicQuoteId: "trq_" + "1".repeat(32), fromLocationId: "loc_start", toLocationId: "loc_finish", currencyCode: "ELD", totalCostMinor: 0, totalDurationMinutes: 12, routeStateRevision: 7, status: "created", expiresAt: new Date(Date.now()+120000).toISOString(), legs: [{ publicRouteId: "rte_test", fromLocationId: "loc_start", toLocationId: "loc_finish", mode: "land", costMinor: 0, durationMinutes: 12, routeRevision: 3 }] });
async function model() {
  const runtime = await new PreviewTransport({simulateWrites:true}).request({endpointKey:"worldRuntime",method:"GET"});
  runtime.travel = { state: {status:"available",currentLocationId:"loc_start"}, activeJourney:null };
  runtime.world = {revision:7,locations:[{publicLocationId:"loc_start",availability:"normal"},{publicLocationId:"loc_finish",availability:"normal"}],routes:[{publicRouteId:"rte_test",status:"open",revision:3}]};
  return runtime;
}
class Element extends EventTarget {
  dataset = {}; textContent = ""; disabled = false;
  setAttribute() {} removeAttribute() {} contains(node) { return node?.owner === this; }
  querySelector() { return null; } querySelectorAll() { return []; }
}
async function fixture(t) {
  const runtime = await model();
  const keys = ["HTMLElement","FormData","addEventListener","removeEventListener","setInterval","clearInterval","setTimeout"];
  const saved = keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]), events = new EventTarget();
  const realTimeout = globalThis.setTimeout;
  Object.assign(globalThis,{HTMLElement:Element,FormData:class { constructor(form){this.form=form;} get(key){return this.form.values[key]??null;} },addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),setInterval:()=>0,clearInterval:()=>{},setTimeout:(fn,ms,...args)=>{const timer=realTimeout(fn,ms,...args);timer.unref?.();return timer;}});
  const mount = new Element(), calls = [], holds = [], readHolds = [];
  const capabilities = {routes:{world:true},actions:{travelQuote:true,travelExecute:true}};
  let state = {status:"ready",route:"world",data:{worldRuntime:runtime,capabilities}}, subscriber;
  const config = { authenticated:true,csrfToken:"A".repeat(43),gameSessionId:"fixture-one",requestTimeoutMs:5000,writeCooldownMs:0,capabilities,allowedImageHosts:[],apiCall:async context=>{
    calls.push(context);
    if (context.method === "GET") return readHolds.length ? await readHolds.shift() : runtime;
    const hold = holds.shift(); if(hold) return await hold;
    return context.endpointKey === "travelQuote" ? {quote:quote()} : {journey:{publicJourneyId:"trj_"+"2".repeat(32),status:"in_transit"}};
  }};
  const terminal = {getState:()=>state,subscribe(fn){subscriber=fn;return()=>{subscriber=null;};},requestRender(){mount.html=renderWorldPage(runtime,{...getWorldRouteViewState(),capabilities});},async refresh(){}};
  const flow = installWorldRuntimeFlow({mount,terminal,config});
  t.after(()=>{flow.destroy();for(const [key,value] of saved) value?Object.defineProperty(globalThis,key,value):delete globalThis[key];});
  function submit(operation,values={}) {
    const form = new Element(); form.owner=mount; form.dataset.worldForm=operation; form.values=values; form.checkValidity=()=>true; form.closest=()=>form;
    form.querySelectorAll=()=>operation === "travelQuote"?[{value:"land"}]:[];
    const event = new Event("submit",{cancelable:true});Object.defineProperty(event,"target",{value:form});mount.dispatchEvent(event);return form;
  }
  async function until(predicate) {for(let i=0;i<100;i++){if(predicate())return;await tick();}assert.fail("World installer did not settle");}
  return {flow,mount,config,runtime,calls,holds,readHolds,submit,until,capabilities,setRoute(route){state={...state,route};subscriber?.(state);},changeSession(){config.csrfToken="B".repeat(43);config.gameSessionId="fixture-two";subscriber?.(state);}};
}

test("actual World installer creates, reviews and executes only the owned quote with unchanged payload", async t=>{
 const f=await fixture(t);f.submit("travelQuote",{toLocationId:"loc_finish"});await f.until(()=>f.flow.getState().quote);
 const q=f.flow.getState().quote, html=renderWorldPage(f.runtime,{quote:q,capabilities:f.capabilities});
 assert.match(html,/<small>AUTHORITATIVE QUOTE<\/small>/);
 assert.match(html,/Expires/);assert.match(html,/route revision 3/);assert.match(html,/Quoted cost/);assert.match(html,/0\.00/);
 f.submit("travelExecute",{quoteId:"trq_"+"3".repeat(32)});await tick();assert.equal(f.calls.filter(c=>c.endpointKey==="travelExecute").length,0);
 f.submit("travelExecute",{quoteId:q.publicQuoteId});await f.until(()=>f.calls.some(c=>c.endpointKey==="travelExecute"));
 assert.deepEqual(f.calls.find(c=>c.endpointKey==="travelExecute").payload,{quoteId:q.publicQuoteId});
 await f.until(()=>f.flow.getState().quote===null);
});

test("expiry and changed loaded routes require a new quote without execute",async t=>{
 const f=await fixture(t);const q=quote();q.expiresAt=new Date(Date.now()-1).toISOString();f.holds.push(Promise.resolve({quote:q}));f.submit("travelQuote",{toLocationId:"loc_finish"});await f.until(()=>f.flow.getState().quote);
 f.submit("travelExecute",{quoteId:q.publicQuoteId});await tick();assert.match(f.flow.getState().message,/expired/);assert.equal(f.calls.length,1);
 const html=renderWorldPage(f.runtime,{quote:q,capabilities:f.capabilities});assert.match(html,/disabled>Confirm travel/);assert.match(html,/Get a new travel quote/);
 assert.equal(reviewTravelQuote(quote(),{...f.runtime,world:{...f.runtime.world,routes:[{publicRouteId:"rte_test",status:"closed",revision:3}]}}).usable,false);
 for(const bad of [{...quote(),totalCostMinor:null},{...quote(),expiresAt:"missing"},{...quote(),currencyCode:""},{...quote(),status:"consumed"}])assert.equal(reviewTravelQuote(bad,f.runtime).usable,false);
});

for(const retirement of ["away-back","session","destroy"])test(`actual World installer retires late quote display after ${retirement}`,async t=>{
 const f=await fixture(t);let resolve;f.holds.push(new Promise(r=>{resolve=r;}));f.submit("travelQuote",{toLocationId:"loc_finish"});await f.until(()=>f.calls.length===1);
 if(retirement==="away-back"){f.setRoute("dashboard");f.setRoute("world");}else if(retirement==="session")f.changeSession();else f.flow.destroy();
 resolve({quote:quote()});for(let i=0;i<8;i++)await tick();assert.equal(f.flow.getState().quote,null);assert.doesNotMatch(f.flow.getState().message,/quote created/);
});

for (const outcome of ["committed","failed"]) test(`retired travel execute ${outcome} cannot repaint or refresh the returned route`,async t=>{
 const f=await fixture(t);f.submit("travelQuote",{toLocationId:"loc_finish"});await f.until(()=>f.flow.getState().quote);const q=f.flow.getState().quote;
 let resolve,reject;f.holds.push(new Promise((yes,no)=>{resolve=yes;reject=no;}));f.submit("travelExecute",{quoteId:q.publicQuoteId});await f.until(()=>f.calls.length===2);
 f.setRoute("dashboard");f.setRoute("world");
 if(outcome==="committed")resolve({journey:{publicJourneyId:"trj_"+"2".repeat(32),status:"in_transit"}});else reject(Object.assign(new Error("Response lost"),{code:"NETWORK_ERROR",status:0}));
 for(let i=0;i<8;i++)await tick();assert.equal(f.flow.getState().quote,null);assert.equal(f.calls.filter(c=>c.method==="GET").length,0);assert.equal(f.flow.getState().message,"");
 if(outcome==="committed"){
   assert.match(f.mount.html,/Departure committed. Refresh World/);
   f.submit("travelQuote",{toLocationId:"loc_finish"});await tick();assert.equal(f.calls.length,2);
   await f.flow.refresh();assert.equal(f.flow.getState().departureStatus,null);assert.equal(f.calls.filter(c=>c.method==="GET").length,1);
 } else {assert.match(f.mount.html,/Departure outcome unconfirmed/);assert.match(f.mount.html,/Recover departure result/);assert.doesNotMatch(f.mount.html,/disabled>Recover departure result/);}
 if(outcome==="failed"){
   // Canonical PlayerApi, not the display owner, retains the uncertain command key.
   const original=f.calls[1];assert.equal(f.flow.getState().departureStatus,"uncertain");
   f.submit("travelQuote",{toLocationId:"loc_finish"});await tick();assert.equal(f.calls.length,2);
   f.submit("travelExecute",{quoteId:q.publicQuoteId});await f.until(()=>f.calls.filter(c=>c.endpointKey==="travelExecute").length===2);
   const retry=f.calls.filter(c=>c.endpointKey==="travelExecute")[1];assert.equal(retry.idempotencyKey,original.idempotencyKey);assert.deepEqual(retry.payload,original.payload);
 }
});

test("ordinary World renders preserve the reviewed quote while changed session retires it",async t=>{
 const f=await fixture(t);f.submit("travelQuote",{toLocationId:"loc_finish"});await f.until(()=>f.flow.getState().quote);
 const original=f.flow.getState().quote;f.setRoute("world");await tick();assert.equal(f.flow.getState().quote,original);
 f.changeSession();await tick();assert.equal(f.flow.getState().quote,null);
});


test("quote review rejects malformed calendars, discontinuous legs and closed intermediate stops",async()=>{
 const runtime=await model(), q=quote();
 for(const expiry of ["2027-02-30T00:00:00Z","2027-13-01T00:00:00Z","not-a-date"])assert.equal(reviewTravelQuote({...q,expiresAt:expiry},runtime).usable,false);
 assert.equal(reviewTravelQuote({...q,legs:[{...q.legs[0],fromLocationId:"loc_elsewhere"}]},runtime).usable,false);
 assert.equal(reviewTravelQuote(q,{...runtime,world:{locations:{},routes:[]}}).usable,false);
 const chain={...q,legs:[{...q.legs[0],toLocationId:"loc_mid"},{...q.legs[0],publicRouteId:"rte_second",fromLocationId:"loc_mid"}]};
 const connected={...runtime,world:{...runtime.world,locations:[...runtime.world.locations,{publicLocationId:"loc_mid",availability:"closed"}],routes:[...runtime.world.routes,{publicRouteId:"rte_second",status:"open",revision:3}]}};
 assert.equal(reviewTravelQuote(chain,connected).usable,false);
 connected.world.locations.at(-1).availability="normal";assert.equal(reviewTravelQuote(chain,connected).usable,true);
});


for(const second of ["success","conflict"])test(`uncertain departure survives expiry and ${second} recovery without a new identity`,async t=>{
 const f=await fixture(t);const q=quote();q.expiresAt=new Date(Date.now()+60000).toISOString();f.holds.push(Promise.resolve({quote:q}));f.submit("travelQuote",{toLocationId:"loc_finish"});await f.until(()=>f.flow.getState().quote);
 const lost=Object.assign(new Error("timeout"),{code:"REQUEST_TIMEOUT",status:0});
 f.holds.push(Promise.reject(lost));f.submit("travelExecute",{quoteId:q.publicQuoteId});await f.until(()=>f.flow.getState().departureStatus==="uncertain");
 // Device clock passes expiry and loaded origin changes after the original command.
 const originalNow=Date.now;Date.now=()=>originalNow()+120000;t.after(()=>{Date.now=originalNow;});f.runtime.travel.state.currentLocationId="loc_finish";
 if(second==="conflict")f.holds.push(Promise.reject(Object.assign(new Error("conflict"),{status:409,code:"CONFLICT"})));
 f.submit("travelExecute",{quoteId:q.publicQuoteId});await f.until(()=>f.calls.filter(c=>c.endpointKey==="travelExecute").length===2);await tick();
 const writes=f.calls.filter(c=>c.endpointKey==="travelExecute");assert.equal(writes[0].idempotencyKey,writes[1].idempotencyKey);assert.deepEqual(writes[0].payload,writes[1].payload);
 if(second==="success")await f.until(()=>f.flow.getState().departureStatus===null);
 else {await f.until(()=>f.flow.getState().departureStatus==="blocked");f.submit("travelExecute",{quoteId:q.publicQuoteId});f.submit("travelQuote",{toLocationId:"loc_finish"});await tick();assert.equal(f.calls.filter(c=>c.endpointKey==="travelExecute").length,2);assert.equal(f.calls.filter(c=>c.endpointKey==="travelQuote").length,1);}
});


test("revoked execute capability preserves uncertainty without dispatch or false pending",async t=>{
 const f=await fixture(t);f.submit("travelQuote",{toLocationId:"loc_finish"});await f.until(()=>f.flow.getState().quote);const q=f.flow.getState().quote;
 f.holds.push(Promise.reject(Object.assign(new Error("timeout"),{code:"REQUEST_TIMEOUT",status:0})));f.submit("travelExecute",{quoteId:q.publicQuoteId});await f.until(()=>f.flow.getState().departureStatus==="uncertain");
 f.capabilities.actions.travelExecute=false;f.submit("travelExecute",{quoteId:q.publicQuoteId});await tick();
 assert.equal(f.calls.filter(c=>c.endpointKey==="travelExecute").length,1);assert.equal(f.flow.getState().departureStatus,"uncertain");assert.match(f.mount.html,/Departure outcome unconfirmed/);assert.doesNotMatch(f.mount.html,/Departure submission is pending/);assert.match(f.mount.html,/disabled>Recover departure result/);
});


test("a refresh begun before late commitment cannot clear the committed reconciliation hold",async t=>{
 const f=await fixture(t);f.submit("travelQuote",{toLocationId:"loc_finish"});await f.until(()=>f.flow.getState().quote);const q=f.flow.getState().quote;
 let finish;f.holds.push(new Promise(r=>{finish=r;}));f.submit("travelExecute",{quoteId:q.publicQuoteId});await f.until(()=>f.calls.length===2);
 f.setRoute("dashboard");f.setRoute("world");let releaseRead;f.readHolds.push(new Promise(r=>{releaseRead=r;}));const oldRefresh=f.flow.refresh();await f.until(()=>f.calls.some(c=>c.method==="GET"));
 finish({journey:{publicJourneyId:"trj_"+"2".repeat(32),status:"in_transit"}});await f.until(()=>f.flow.getState().departureStatus==="committed");releaseRead(f.runtime);await oldRefresh;
 assert.equal(f.flow.getState().departureStatus,"committed");assert.match(f.mount.html,/Departure committed. Refresh World/);
 await f.flow.refresh();assert.equal(f.flow.getState().departureStatus,null);
});

test("existing preview onboarding travel contract retains the authoritative quote landmark and usable confirmation",async()=>{
 const transport=new PreviewTransport({simulateWrites:true});
 const runtime=await transport.request({endpointKey:"worldRuntime",method:"GET"});
 const {quote:reviewed}=await transport.request({endpointKey:"travelQuote",method:"POST",payload:{toLocationId:"loc_valerion_capital_v1",allowedModes:["land"]}});
 assert.equal(reviewTravelQuote(reviewed,runtime).usable,true);
 const html=renderWorldPage(runtime,{quote:reviewed,capabilities:{actions:{travelExecute:true,travelQuote:true}}});
 assert.match(html,/<small>AUTHORITATIVE QUOTE<\/small>/);
 assert.match(html,/<h3>Review travel quote<\/h3>/);
 assert.doesNotMatch(html,/disabled>Confirm travel/);
 const {journey}=await transport.request({endpointKey:"travelExecute",method:"POST",payload:{quoteId:reviewed.publicQuoteId}});
 assert.equal(journey.status,"in_transit");
});
