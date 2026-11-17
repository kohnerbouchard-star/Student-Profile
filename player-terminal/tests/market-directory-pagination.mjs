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
    click:()=>listeners.get('click')?.({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}}) };
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
 const f=fixture(), buy={quantity:{name:'quantity',value:'7',type:'number'}}, sell={quantity:{name:'quantity',value:'3',type:'number'}};
 function form(kind,fields){const elements=Object.values(fields);elements.namedItem=name=>fields[name];return {dataset:{playerMarketOrderForm:kind},elements,dispatchEvent(){}};}
 const forms=[form('buy-quote',buy),form('sell-review',sell)];
 f.mount.querySelectorAll=()=>forms;
 const query=f.mount.querySelector;
 f.mount.querySelector=selector=>selector.includes('buy-quote')?forms[0]:selector.includes('sell-review')?forms[1]:query(selector);
 f.store.subscribe(()=>{buy.quantity.value='1';sell.quantity.value='1';});
 f.click();await tick();f.resolve(f.page);await tick();
 assert.equal(buy.quantity.value,'7');assert.equal(sell.quantity.value,'3');f.flow.destroy();
});
