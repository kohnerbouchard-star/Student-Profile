import { test } from "node:test";
import assert from "node:assert/strict";
import { installNotificationInboxFlow } from "../src/features/notifications/notification-inbox-flow.js";
import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";

const id = (n, prefix = "ndl") => `${prefix}_${n.toString(16).padStart(32, "0")}`;
const controls = { more: "[data-player-notification-load-more]", mark: "[data-player-notification-mark-read]", refresh: "[data-player-notification-refresh]" };
const tick = () => new Promise(setImmediate);
const later = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const failure = () => Object.assign(new Error("Offline"), { code: "NETWORK_ERROR", status: 0 });
function page(start, end, cursor, total = 60) {
  const items = Array.from({length:end-start+1},(_,i)=>({deliveryId:id(start+i),notificationId:id(start+i,"ntf"),title:`Alert ${start+i}`,status:"unread"}));
  return { items, summary:{unreadCount:total}, page:{returned:items.length,hasMore:Boolean(cursor),nextCursor:cursor} };
}
const receipt = (deliveryIds) => ({ok:true,requestedCount:deliveryIds.length,newlyReadCount:deliveryIds.length-1,alreadyReadCount:1,
  processedAt:"2026-10-01T10:00:00Z",deliveries:deliveryIds.map(deliveryId=>({deliveryId,notificationId:deliveryId.replace("ndl_","ntf_"),seenAt:"2026-10-01T10:00:00Z"}))});

class Element extends EventTarget {
  attrs = new Map();
  getAttribute(key) { return this.attrs.get(key) || null; }
  setAttribute(key,val) { this.attrs.set(key,val); }
  removeAttribute() {}
  focus() { document.activeElement=this; }
}
function fixture(t, { endpointKeys = {notifications:true,notificationsRead:true}, actions = {notificationsRead:true} } = {}) {
  const saved = new Map(["HTMLElement","document","setInterval","clearInterval","addEventListener","removeEventListener","dispatchEvent"].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const events=new EventTarget();let poll, listener;
  for (const [key,value] of Object.entries({HTMLElement:Element,document:{visibilityState:"visible",activeElement:null},
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),setInterval:(fn)=>{poll=fn;return 1;},clearInterval:()=>{}})) {
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  }
  const mount=new Element(), bell=new Element(), badge={textContent:""};bell.querySelector=()=>badge;
  const makeHost=()=> {
    const host=new Element();let html="", elements=new Map();
    Object.defineProperty(host,"innerHTML",{get:()=>html,set:(next)=>{
      if (host.contains(document.activeElement)) document.activeElement=null;
      html=next;elements=new Map();
      for(const selector of Object.values(controls)){
        const button=html.match(new RegExp(`<button[^>]*${selector.slice(1,-1)}[^>]*>`))?.[0];
        if(!button)continue;
        const element=new Element();element.disabled=/\sdisabled[\s>]/u.test(button);
        element.closest=(value)=>value.split(",").map(v=>v.trim()).includes(selector)?element:null;
        elements.set(selector,element);
      }
    }});
    host.contains=(element)=>[...elements.values()].includes(element);
    host.querySelector=(selector)=>elements.get(selector)||null;return host;
  };
  let host=makeHost();
  mount.querySelector=(sel)=>sel.startsWith("[data-player-notification-drawer")?host:bell;
  const calls=[], reads=[], writes=[];
  let state={status:"ready",route:"dashboard",ui:{notificationsOpen:false},data:{session:{gameSessionId:"g1",playerId:"p1",playerSessionId:"s1"},capabilities:{actions,endpointKeys}}};
  const config={authenticated:true,csrfToken:"A".repeat(43),gameSessionId:"g1",requestTimeoutMs:5000,writeCooldownMs:0,
    apiCall:async context=>{
      calls.push(context);
      const backend=resolvePlayerBackendRequest({...context,session:{}}); // exact installed payload/cursor validation
      if(context.method==="GET")return await reads.shift()?.(backend.payload);
      return await (writes.shift() || (()=>receipt(backend.payload.deliveryIds)))(backend.payload);
    }
  };
  const terminal={getState:()=>state,subscribeShellRender:(fn)=>{listener=fn;return()=>{listener=null;};}};
  const controller=installNotificationInboxFlow({mount,terminal,config});
  t.after(()=>{controller.destroy();for (const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
  function click(control) {
    const selector=controls[control]||'[data-player-local-action="toggle-notifications"]';
    const target=host.querySelector(selector)||new Element();target.closest=(s)=>s===selector?target:null;
    const evt=new Event("click",{cancelable:true});Object.defineProperty(evt,"target",{value:target});mount.dispatchEvent(evt);
  }
  function show(open) {
    click("toggle");
    state={...state,ui:{notificationsOpen:open}};
    bell.setAttribute("aria-expanded",String(open));listener?.();
  }
  const until=async predicate=>{for(let i=0;i<60;i++){if(predicate())return;await tick();}assert.fail("Inbox installer did not settle");};
  return {calls,reads,writes,click,show,poll,until,bell,badge,controller,get host(){return host;},
    rebuild(){host=makeHost();listener?.();},
    invalidate(){events.dispatchEvent(new Event("econovaria:player-session-invalid"));},
    rotateConfig(){config.gameSessionId="g2";config.csrfToken="B".repeat(43);},
    ready(){events.dispatchEvent(new Event("econovaria:player-session-ready"));},
    changeCapabilities(capabilities){state={...state,data:{...state.data,capabilities}};listener?.();},
    changePlayer(){state={...state,data:{...state.data,session:{...state.data.session,playerId:"p2",playerSessionId:"s2"}}};host=makeHost();listener?.();},
  };
}

test("a paged drawer preserves its deduplicated rows across unattended polls and visible refresh failure", async t=>{
  const f=fixture(t);
  f.reads.push(()=>page(1,20,"cursor-a"));f.show(true);
  await f.until(()=>f.host.innerHTML.includes("20 loaded"));
  f.reads.push(()=>page(20,39,"cursor-b"));f.click("more");
  await f.until(()=>f.host.innerHTML.includes("39 loaded"));
  f.reads.push(()=>page(100,101,null));f.poll();await tick();
  assert.equal(f.calls.filter(c=>c.method==="GET").length,2);
  assert.match(f.host.innerHTML,/Alert 39/);
  f.reads.shift();f.reads.push(()=>{throw failure();});f.click("refresh");
  await f.until(()=>/temporarily unavailable/.test(f.host.innerHTML));
  assert.match(f.host.innerHTML,/Alert 39/);
  f.reads.push(()=>page(100,101,null,2));f.click("refresh");
  await f.until(()=>f.host.innerHTML.includes("Alert 101"));
  assert.doesNotMatch(f.host.innerHTML,/Alert 39|temporarily unavailable/);
});

test("one explicit batch marks at most 50 with exact receipt, leaves remainder and last-checked unread",async t=>{
  const f=fixture(t);
  f.reads.push(()=>page(1,20,"cursor-a"));f.show(true);
  await f.until(()=>f.host.innerHTML.includes("20 loaded"));
  for(const [start,end,cursor] of [[21,40,"cursor-b"],[41,60,"cursor-c"]]){
    f.reads.push(()=>page(start,end,cursor));f.click("more");
    await f.until(()=>f.host.innerHTML.includes(`${end} loaded`));
  }
  assert.match(f.host.innerHTML,/Mark first 50 loaded alerts read/);
  f.click("mark");await f.until(()=>/10 loaded/.test(f.host.innerHTML));
  const posts=f.calls.filter(c=>c.method==="POST");
  assert.equal(posts.length,1);assert.deepEqual(posts[0].payload.deliveryIds,Array.from({length:50},(_,i)=>id(i+1)));
  assert.match(f.host.innerHTML,/60 Unread \(last checked\)/);
  assert.match(f.host.innerHTML,/Alert 60|Load more/);
  assert.doesNotMatch(f.host.innerHTML,/data-player-notification-id="ndl_00000000000000000000000000000001"/);
});

test("ambiguous read action preserves rows, exposes failure, and requires a GET before replacement",async t=>{
  const f=fixture(t);
  f.reads.push(()=>page(1,2,null,2));f.show(true);
  await f.until(()=>f.host.innerHTML.includes("2 loaded"));
  f.writes.push(()=>{throw failure();});f.click("mark");
  await f.until(()=>/not confirmed/.test(f.host.innerHTML));
  assert.match(f.host.innerHTML,/Alert 2/);
  f.click("mark");await tick();assert.equal(f.calls.filter(c=>c.method==="POST").length,1);
  f.reads.push(()=>page(2,2,null,1));f.click("refresh");
  await f.until(()=>f.host.innerHTML.includes("1 loaded"));
  assert.doesNotMatch(f.host.innerHTML,/not confirmed/);
});

test("a stale read is retired on drawer dismissal and a prior player's command cannot publish",async t=>{
  const f=fixture(t), old=later();
  f.reads.push(()=>old.promise);f.show(true);
  await f.until(()=>f.calls.length===1);f.show(false);
  f.reads.push(()=>page(1,1,null,1));f.show(true);
  await f.until(()=>f.host.innerHTML.includes("Alert 1"));
  old.resolve(page(99,99,null,9));await tick();
  assert.doesNotMatch(f.host.innerHTML,/Alert 99/);
  const prior=later();f.writes.push(()=>prior.promise);f.click("mark");
  await f.until(()=>f.calls.some(c=>c.method==="POST"));
  f.reads.push(()=>page(10,10,null,1));f.changePlayer();
  await f.until(()=>f.host.innerHTML.includes("Alert 10"));
  prior.resolve(receipt([id(1)]));await tick();
  assert.match(f.host.innerHTML,/Alert 10/);
  assert.doesNotMatch(f.host.innerHTML,/Alert 1<|marked read|last checked/);
});


test("server GET manifest is its own capability, and revocation hides cached rows and prevents mark", async t=>{
  const f=fixture(t,{endpointKeys:{notificationsRead:true}});
  f.show(true);await tick();
  assert.equal(f.calls.length,0);
  assert.match(f.host.innerHTML,/unavailable for this session/);
  f.reads.push(()=>page(1,1,null,1));
  f.changeCapabilities({endpointKeys:{notifications:true},actions:{}});
  await f.until(()=>f.host.innerHTML.includes("Alert 1"));
  f.click("mark");await tick();assert.equal(f.calls.length,1);
  f.changeCapabilities({endpointKeys:undefined,actions:{notificationsRead:true}});
  f.click("mark");await tick();assert.equal(f.calls.length,1);
  assert.doesNotMatch(f.host.innerHTML,/Alert 1/);
  assert.match(f.host.innerHTML,/Unavailable|unavailable/);
});

test("409 and a partial success receipt leave all requested rows visible until explicit GET",async t=>{
  const f=fixture(t);
  f.reads.push(()=>page(1,2,null,2));f.show(true);await f.until(()=>f.host.innerHTML.includes("2 loaded"));
  f.writes.push(()=>{throw Object.assign(new Error("Conflict"),{status:409,code:"player_notification_read_conflict"});});
  f.click("mark");await f.until(()=>/not confirmed/.test(f.host.innerHTML));
  f.click("mark");f.poll();await tick();
  assert.equal(f.calls.filter(c=>c.method==="POST").length,1);
  assert.equal(f.calls.filter(c=>c.method==="GET").length,1);
  f.reads.push(()=>page(1,2,null,2));f.click("refresh");await f.until(()=>!/not confirmed/.test(f.host.innerHTML));
  f.writes.push(()=>({...receipt([id(1),id(2)]),deliveries:receipt([id(1)]).deliveries}));
  f.click("mark");await f.until(()=>/not confirmed/.test(f.host.innerHTML));
  assert.match(f.host.innerHTML,/Alert 1/);
  assert.match(f.host.innerHTML,/Alert 2/);
});

test("drawer handles renewed shell, keeps local focus, and invalidation retires without stale reopening",async t=>{
  const f=fixture(t);
  f.reads.push(()=>page(1,1,"cursor-a",3));f.show(true);
  await f.until(()=>f.host.innerHTML.includes("Alert 1"));
  f.host.querySelector(controls.more).focus();
  f.reads.push(()=>page(2,2,null,3));f.click("more");
  await f.until(()=>f.host.innerHTML.includes("Alert 2"));
  assert.equal(document.activeElement,f.host);
  f.host.querySelector(controls.mark).focus();
  const pending=later();f.writes.push(()=>pending.promise);f.click("mark");
  await f.until(()=>/Marking read/.test(f.host.innerHTML));
  assert.equal(document.activeElement,f.host.querySelector(controls.mark));
  f.rebuild();assert.match(f.host.innerHTML,/Alert 2/);
  f.invalidate();assert.doesNotMatch(f.host.innerHTML,/Alert 2/);
  pending.resolve(receipt([id(1),id(2)]));f.poll();await tick();
  assert.doesNotMatch(f.host.innerHTML,/confirmed|Alert/);
  assert.equal(f.calls.filter(c=>c.method==="GET").length,2);
});


test("invalid and cyclic continuations never replace the current paging boundary",async t=>{
  const f=fixture(t);
  f.reads.push(()=>page(1,1,"cursor-a",10));f.show(true);await f.until(()=>/Alert 1/.test(f.host.innerHTML));
  f.reads.push(()=>page(2,2,"cursor-a",10));f.click("more");
  await f.until(()=>/could not be loaded safely/.test(f.host.innerHTML));
  assert.doesNotMatch(f.host.innerHTML,/Alert 2/);
  f.reads.push(()=>page(2,2,"cursor-b",10));f.click("more");
  await f.until(()=>/Alert 2/.test(f.host.innerHTML));
  for (const candidate of ["cursor-a", " leading-space", "x".repeat(257)]) {
    f.reads.push(()=>page(3,3,candidate,10));f.click("more");
    await f.until(()=>/could not be loaded safely/.test(f.host.innerHTML));
    assert.doesNotMatch(f.host.innerHTML,/Alert 3/);
    assert.equal(f.calls.at(-1).payload.cursor,"cursor-b");
  }
});

test("a revoked mark grant invalidates an in-flight receipt; a 401 pauses until session ready",async t=>{
  const f=fixture(t);
  f.reads.push(()=>page(1,1,null,1));f.show(true);await f.until(()=>/Alert 1/.test(f.host.innerHTML));
  const result=later();f.writes.push(()=>result.promise);f.click("mark");await f.until(()=>f.calls.some(c=>c.method==="POST"));
  f.changeCapabilities({endpointKeys:{notifications:true},actions:{}});
  result.resolve(receipt([id(1)]));await tick();
  assert.match(f.host.innerHTML,/Alert 1/);assert.match(f.host.innerHTML,/not confirmed/);
  f.reads.push(()=>{throw Object.assign(new Error("Expired"),{status:401,code:"SESSION_INVALID"});});
  f.click("refresh");await f.until(()=>f.host.innerHTML==="");
  f.rotateConfig();
  f.poll();await tick();assert.equal(f.calls.filter(c=>c.method==="GET").length,2);
  f.reads.push(()=>page(3,3,null,1));f.ready();
  await f.until(()=>/Alert 3/.test(f.host.innerHTML));
});


test("malformed delivery and within-page duplicates never become selectable alerts", async t=>{
  const f=fixture(t);
  const unknown=page(1,1,"cursor-a");unknown.items[0].status="unknown";
  f.reads.push(()=>unknown);f.show(true);await f.until(()=>/could not be loaded safely/.test(f.host.innerHTML));
  f.click("mark");await tick();
  assert.equal(f.calls.filter(c=>c.method==="POST").length,0);
  assert.doesNotMatch(f.host.innerHTML,/Alert 1|Load more/);
  const duplicate=page(1,2,"cursor-a");duplicate.items[1].deliveryId=duplicate.items[0].deliveryId;
  f.reads.push(()=>duplicate);f.click("refresh");await f.until(()=>/could not be loaded safely/.test(f.host.innerHTML));
  assert.doesNotMatch(f.host.innerHTML,/Alert 1|Load more/);
});


test("a newer GET that lags a confirmed mark cannot resurrect those same-session rows",async t=>{
  const f=fixture(t);
  f.reads.push(()=>page(1,2,null,2));f.show(true);await f.until(()=>/2 loaded/.test(f.host.innerHTML));
  f.click("mark");await f.until(()=>/2 loaded alerts confirmed read/.test(f.host.innerHTML));
  f.reads.push(()=>page(1,3,null,3));f.poll();
  await f.until(()=>/Alert 3/.test(f.host.innerHTML));
  assert.doesNotMatch(f.host.innerHTML,/Alert 1|Alert 2/);
  assert.match(f.host.innerHTML,/3 Unread \(last checked\)/);
  assert.equal(f.calls.filter(c=>c.method==="POST").length,1);
});

test("a malformed successful recheck cannot unlock an uncertain 50-alert batch", async t => {
  const f = fixture(t);
  f.reads.push(() => page(1,20,"cursor-a"));
  f.show(true);
  await f.until(() => /20 loaded/.test(f.host.innerHTML));
  for (const [first,last,cursor] of [[21,40,"cursor-b"],[41,60,"cursor-c"]]) {
    f.reads.push(() => page(first,last,cursor));
    f.click("more");
    await f.until(() => f.host.innerHTML.includes(last + " loaded"));
  }
  const requested = Array.from({ length: 50 }, (_, i) => id(i + 1));
  f.writes.push(() => {
    const valid = receipt(requested);
    return { ...valid, deliveries: valid.deliveries.slice(1) };
  });
  f.click("mark");
  await f.until(() => /not confirmed/.test(f.host.innerHTML));
  const malformed = page(51,51,null,1);
  malformed.page.returned = true;
  malformed.summary.unreadCount = false;
  f.reads.push(() => malformed);
  f.click("refresh");
  await f.until(() => /could not be loaded safely/.test(f.host.innerHTML));
  assert.match(f.host.innerHTML, /not confirmed/);
  assert.match(f.host.innerHTML, /60 loaded/);
  f.click("mark");
  f.poll();
  await tick();
  assert.equal(f.calls.filter(c => c.method === "GET").length, 4);
  assert.deepEqual(f.calls.filter(c => c.method === "POST").map(c => c.payload.deliveryIds), [requested]);

  f.reads.push(() => page(51,60,null,10));
  f.click("refresh");
  await f.until(() => /10 loaded/.test(f.host.innerHTML));
  assert.doesNotMatch(f.host.innerHTML, /not confirmed|could not be loaded safely|last checked/);
  assert.match(f.host.innerHTML, /10 Unread/);
  assert.equal(f.calls.filter(c => c.method === "GET").length, 5);
  assert.equal(f.calls.filter(c => c.method === "POST").length, 1);
});
