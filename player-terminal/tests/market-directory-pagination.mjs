import assert from "node:assert/strict";
import { test, after } from "node:test";
import { nextMarketPage, appendMarketPage } from "../src/features/market/market-directory-model.js";
import { installMarketDirectoryFlow } from "../src/features/market/market-directory-flow.js";
import { createStore } from "../src/core/store.js";
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";
import { previewData } from "../src/data/preview-data.js";
import { renderMarketPage } from "../src/pages/market-page.js";
class Element {
  constructor() { this.childNodes = []; this.attributes = new Map(); this.classList = { add() {}, remove() {} }; }
  setAttribute(k,v) { this.attributes.set(k,v); }
  getAttribute(k) { return this.attributes.get(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  replaceChildren(...children) { this.childNodes = children; }
  append(...children) { this.childNodes.push(...children); }
  focus() { this.focused = true; }
}
class Button extends Element { disabled = false; }
const old = { HTMLButtonElement: globalThis.HTMLButtonElement, document: globalThis.document };
globalThis.HTMLButtonElement = Button;
globalThis.document = { createElement: () => new Element() };
after(() => Object.assign(globalThis, old));
const tick = () => new Promise(setImmediate);
function fixture() {
  let resolve, reject;
  const response = new Promise((yes,no) => { resolve=yes; reject=no; });
  const data = structuredClone(previewData);
  data.capabilities = { routes: { market: true }, endpointKeys: { market: true } };
  data.market.assets = data.market.assets.slice(0,2);
  data.market.pagination = { offset: 0, limit: 2, returned: 2, hasMore: true, nextOffset: 2 };
  const store = createStore({ status:"ready", route:"market", data, ui:{} });
  const freshness = createResourceFreshnessCoordinator();
  const calls=[], toasts=[], invalid=[];
  const config = { usePreviewData:false, authenticated:true, gameSessionId:"fixture-game", csrfToken:"S".repeat(43), requestTimeoutMs:5000,
    onSessionInvalid:d=>invalid.push(d), apiCall:context=>{ calls.push(context); return response; } };
  const button = new Button(), status = new Element(), listeners = new Map();
  const mount = { addEventListener:(name,fn)=>listeners.set(name,fn), removeEventListener:name=>listeners.delete(name),
    querySelector:selector=>selector==='[data-player-market-directory-status]'?status:null };
  const terminal = { getState:store.getState, subscribe:store.subscribe, freshness, showToast:(...a)=>toasts.push(a) };
  const flow = installMarketDirectoryFlow({mount,terminal,config});
  const page = { ...data.market, assets:[data.market.assets[1],{...data.market.assets[0],id:"additional",symbol:"ADDL"}], pagination:{offset:2,limit:2,returned:2,hasMore:false,nextOffset:null} };
  return {mount,store,freshness,config,calls,toasts,invalid,flow,button,status,page,resolve,reject,
    click:()=>{document.activeElement=button;listeners.get('click')?.({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});} };
}
test('page validation fails closed and deduplicates without losing detail',()=>{
 const current={assets:[{id:'a',sector:'A',history:[10]}],selectedAssetId:'a',pagination:{offset:0,limit:2,hasMore:true,nextOffset:2}};
 assert.deepEqual(nextMarketPage(current),{offset:2,limit:2});
 for(const patch of [{nextOffset:0},{nextOffset:'2'},{limit:101},{hasMore:false}]) assert.equal(nextMarketPage({...current,pagination:{...current.pagination,...patch}}),null);
 const result=appendMarketPage(current,{assets:[{id:'a',sector:'A',history:[]},{id:'b',sector:'B'}],pagination:{offset:2,limit:2,hasMore:false}}, {offset:2,limit:2});
 assert.equal(result.assets.length,2); assert.strictEqual(result.assets[0],current.assets[0]); assert.equal(result.selectedAssetId,'a'); assert.deepEqual(result.sectors,['All','A','B']);
 assert.throws(()=>appendMarketPage(current,{assets:[],pagination:{offset:3,limit:2}},{offset:2,limit:2}));
});
test('real API loads next page once, publishes immutable union, and exposes loaded-only search',async()=>{
 const f=fixture(), before=f.store.getState(); f.click(); f.click(); await tick();
 assert.equal(f.calls.length,1); assert.deepEqual(f.calls[0].payload,{offset:2,limit:2});
 f.resolve(f.page); await tick();
 assert.equal(f.store.getState().data.market.assets.length,3); assert.equal(before.data.market.assets.length,2);
 assert.equal(f.status.focused,true); assert.equal(f.button.disabled,false);
 const html=renderMarketPage(f.store.getState().data,{}); assert.match(html,/3 instruments loaded/); assert.doesNotMatch(html,/data-player-market-load-more/); f.flow.destroy();
});
for(const retirement of ['route-return','refresh','loading','session','modal','destroy']) for(const failure of [false,true]) test(`${retirement} rejects late ${failure?'error':'page'}`,async()=>{
 const f=fixture(); f.click(); await tick();
 if(retirement==='route-return'){f.store.setState({route:'news'});f.store.setState({route:'market'});}
 if(retirement==='refresh') f.store.setState(s=>({...s,data:{...s.data,market:{...s.data.market,assets:[{...s.data.market.assets[0],price:999}]}}}));
 if(retirement==='loading') {f.store.setState({routeLoading:{market:true}});f.store.setState({routeLoading:{}});}
 if(retirement==='modal') {f.store.setState({modal:{type:'receipt'}});f.store.setState({modal:null});}
 if(retirement==='session') f.freshness.reset();
 if(retirement==='destroy') f.flow.destroy();
 const accepted=f.store.getState();
 if(failure) f.reject(Object.assign(new Error('expired'),{status:401})); else f.resolve(f.page);
 await tick(); assert.strictEqual(f.store.getState(),accepted); assert.deepEqual(f.toasts,[]); assert.deepEqual(f.invalid,[]); f.flow.destroy();
});
test('failure preserves list, restores control and reports safe retry',async()=>{
 const f=fixture(), before=f.store.getState(); f.click(); await tick(); f.reject(Object.assign(new Error('private backend detail'),{status:400}));await tick();
 assert.strictEqual(f.store.getState(),before);assert.equal(f.button.disabled,false);assert.match(f.toasts[0][0],/try again/);assert.doesNotMatch(f.toasts[0][0],/private/); f.flow.destroy();
});
test('missing advertised read capability never dispatches',async()=>{
 const f=fixture();f.store.setState(s=>({...s,data:{...s.data,capabilities:{routes:{market:true},endpointKeys:{}}}}));
 f.click();await tick();assert.equal(f.calls.length,0);f.flow.destroy();
});
test('current invalid-session response reaches the safe-exit callback',async()=>{
 const f=fixture();f.click();await tick();f.reject(Object.assign(new Error('expired'),{status:401}));await tick();
 assert.equal(f.invalid.length,1);assert.equal(f.invalid[0].status,401);assert.deepEqual(f.toasts,[]);f.flow.destroy();
});

test('pagination preserves distinct buy and sell draft fields after render',async()=>{
 const f=fixture(), buy={quantity:{name:'quantity',value:'7',type:'number',focus(){this.focused=true;}}}, sell={quantity:{name:'quantity',value:'3',type:'number'}};
 function form(kind,fields){const elements=Object.values(fields);elements.namedItem=name=>fields[name];return {dataset:{playerMarketOrderForm:kind},elements,dispatchEvent(){}};}
 const forms=[form('buy-quote',buy),form('sell-review',sell)];
 f.mount.querySelectorAll=()=>forms;
 const query=f.mount.querySelector;
 f.mount.querySelector=selector=>selector.includes('buy-quote')?forms[0]:selector.includes('sell-review')?forms[1]:query(selector);
 f.store.subscribe(()=>{buy.quantity.value='1';sell.quantity.value='1';});
 f.click();await tick();document.activeElement=buy.quantity;f.resolve(f.page);await tick();
 assert.equal(buy.quantity.value,'7');assert.equal(sell.quantity.value,'3');assert.equal(buy.quantity.focused,true);assert.notEqual(f.status.focused,true);f.flow.destroy();
});

test('real authenticated adapter retains earlier pages for authoritative order detail',async()=>{
 const {createStudentProfileApiCall}=await import('../src/integrations/student-profile-api-call.js');
 const requests=[];
 const asset=(ticker,price)=>({assetId:ticker,ticker,companyName:ticker,currentPrice:price,previousClose:price,sector:'Tech'});
 const adapter=createStudentProfileApiCall({request:async request=>{
   requests.push(request);
   if(request.endpointKey==='marketAsset')return {ok:true,asset:asset(request.path.includes('AAA')?'AAA':'BBB',9),history:[{price:8},{price:9}],tickIndex:2};
   const offset=new URL(request.path,'https://fixture.invalid').searchParams.get('offset');
   return {ok:true,assets:[asset(offset==='1'?'BBB':'AAA',1)],pagination:{offset:Number(offset),limit:1,returned:1,hasMore:offset==='0',nextOffset:offset==='0'?1:null},tickIndex:1};
 }});
 const context=(endpointKey,payload={},params={})=>({endpointKey,payload,params,method:'GET',path:'/unused',requestId:'market-fixture',
   session:{authenticated:true,csrfToken:'C'.repeat(43),gameSessionId:'fixture-game'},config:{deviceId:'00000000-0000-4000-8000-000000000001'}});
 const first=await adapter(context('market',{offset:0,limit:1}));
 const second=await adapter(context('market',{offset:1,limit:1}));
 assert.deepEqual(first.assets.map(a=>a.id),['AAA']);assert.deepEqual(second.assets.map(a=>a.id),['BBB']);
 for(const ticker of ['AAA','BBB']){
   const detail=await adapter(context('marketAsset',{}, {assetId:ticker}));
   assert.equal(detail.assets.find(a=>a.id===ticker).price,9);
   assert.deepEqual(detail.assets.find(a=>a.id===ticker).history,[8,9]);assert.equal(detail.tickIndex,2);
 }
 const refreshed=await adapter(context('market',{offset:0,limit:1}));assert.deepEqual(refreshed.assets.map(a=>a.id),['AAA']);
 assert.ok(requests.every(r=>r.method==='GET'));assert.ok(requests.every(r=>!r.path.includes('gameSessionId')));
});

test('PlayerApi receives page and detail beyond 1000 accumulated instruments without truncation',async()=>{
 const {createStudentProfileApiCall}=await import('../src/integrations/student-profile-api-call.js');
 const {PlayerApi}=await import('../src/api/player-api.js');
 const asset=i=>({assetId:`A${i}`,ticker:`A${i}`,companyName:`Asset ${i}`,currentPrice:1,sector:'Tech'});
 const adapter=createStudentProfileApiCall({request:async request=>{
   if(request.endpointKey==='marketAsset')return {ok:true,asset:{...asset(1000),currentPrice:9},history:[{price:9}],tickIndex:3};
   const offset=Number(new URL(request.path,'https://fixture.invalid').searchParams.get('offset'));
   return {ok:true,assets:Array.from({length:offset===1000?1:100},(_,i)=>asset(offset+i)),pagination:{offset,limit:100,returned:offset===1000?1:100,hasMore:offset<1000,nextOffset:offset<1000?offset+100:null},tickIndex:1};
 }});
 const api=new PlayerApi({usePreviewData:false,apiCall:adapter,authenticated:true,csrfToken:'C'.repeat(43),gameSessionId:'fixture-game',deviceId:'00000000-0000-4000-8000-000000000001'});
 for(let offset=0;offset<=1000;offset+=100){
   const page=await api.request('market',{payload:{offset,limit:100},force:true});
   assert.equal(page.assets[0].id,`A${offset}`);assert.equal(page.assets.length,offset===1000?1:100);
 }
 const detail=await api.request('marketAsset',{params:{assetId:'A1000'},force:true});
 assert.equal(detail.assets.length,1);assert.equal(detail.assets[0].id,'A1000');assert.equal(detail.assets[0].price,9);
});

for(const retirement of ['abort','session','newer-page']) test(`real adapter rejects ${retirement} directory result before snapshot mutation`,async()=>{
 const {createStudentProfileApiCall}=await import('../src/integrations/student-profile-api-call.js');
 let release;const hold=new Promise(r=>release=r);let count=0;
 const row=id=>({assetId:id,ticker:id,companyName:id,currentPrice:1});
 const adapter=createStudentProfileApiCall({request:async request=>{
   if(request.endpointKey==='marketAsset')return {ok:true,asset:{...row('OLD'),currentPrice:9},tickIndex:2};
   const call=count++;if(call===0)await hold;
   return {assets:[row(call===0?'OLD':'NEW')],pagination:{offset:0,limit:100,hasMore:false},tickIndex:1};
 }});
 const controller=new AbortController();
 const context=(endpointKey='market',session='one')=>({endpointKey,method:'GET',params:{assetId:'OLD'},payload:{offset:0},signal:controller.signal,session:{authenticated:true,gameSessionId:session},config:{deviceId:'00000000-0000-4000-8000-000000000001'}});
 const pending=adapter(context());const rejected=assert.rejects(pending,e=>e.code==='REQUEST_SUPERSEDED');
 if(retirement==='abort')controller.abort();
 if(retirement==='session')await adapter({...context('market','two'),signal:null});
 if(retirement==='newer-page')await adapter({...context(),signal:null});
 release();await rejected;
 const detail=await adapter({...context('marketAsset',retirement==='session'?'two':'one'),signal:null});
 assert.equal(detail.assets.length,0,'retired OLD row must not enter the shared directory');
});


function summaryForComposite(composite) {
  const data = structuredClone(previewData);
  data.market.assets = data.market.assets.filter(asset => asset.id !== "cel-index");
  if (composite) data.market.assets.push({ ...data.market.assets[0], id: "cel-index", ...composite });
  data.market.pagination = { offset: 0, limit: 2, hasMore: true, nextOffset: 2 };
  const html = renderMarketPage(data, {});
  return html.split('class="player-terminal-market-summary">')[1].split('class="player-terminal-market-layout">')[0];
}

test("market summary scopes volume to loaded instruments", () => {
  const summary = summaryForComposite(null);
  assert.match(summary, /LOADED VOLUME/);
  assert.match(summary, /Across loaded instruments/);
  assert.doesNotMatch(summary, /MARKET VOLUME|Across listed assets/);
});

test("missing composite is unavailable, not an invented zero", () => {
  const summary = summaryForComposite(null).split("</article>")[0];
  assert.match(summary, /<strong>Unavailable<\/strong>/);
  assert.match(summary, /Change unavailable/);
  assert.doesNotMatch(summary, /0\.00|is-good|is-bad/);
});

test("genuine zero composite price and change remain visible", () => {
  const summary = summaryForComposite({ price: 0, change: 0 }).split("</article>")[0];
  assert.match(summary, /<strong>0<\/strong>/);
  assert.match(summary, /0\.00%/);
  assert.doesNotMatch(summary, /unavailable/i);
});

for (const invalid of [undefined, null, NaN, Infinity, "0"]) {
  test(`composite nonnumeric or nonfinite fields are unavailable: ${String(invalid)}`, () => {
    const missingPrice = summaryForComposite({ price: invalid, change: 1 }).split("</article>")[0];
    assert.match(missingPrice, /<strong>Unavailable<\/strong>/);
    assert.match(missingPrice, /1\.00%/);
    const missingChange = summaryForComposite({ price: 123, change: invalid }).split("</article>")[0];
    assert.match(missingChange, /<strong>123<\/strong>/);
    assert.match(missingChange, /Change unavailable/);
  });
}
