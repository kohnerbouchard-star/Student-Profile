import assert from "node:assert/strict";
import { test } from "node:test";
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";
import { convergeCommittedStorePurchase } from "../src/features/store/store-purchase-convergence.js";

function fixture() {
  const freshness = createResourceFreshnessCoordinator();
  freshness.setSession("original");
  const ticket = freshness.capture(), calls = [];
  const context = {
    current: { purchaseMode: "system_offer", invalidatedResources: ["dashboard", "store", "inventory", "banking", "bankingFx"] },
    api: { setSession() { calls.push("session"); } }, config: {},
    terminal: { async refreshResources(keys) { calls.push(keys); return { data: {}, errors: {} }; } },
    requestGeneration: ticket, requestIsCurrent: (ticket) => freshness.isCurrent(ticket), signal: null,
  };
  return { freshness, calls, context };
}

test("a retired committed-purchase owner cannot start reads in another session", async () => {
  const f = fixture(); f.freshness.setSession("next");
  assert.equal(await convergeCommittedStorePurchase(f.context), null);
  assert.deepEqual(f.calls, []);
});

test("committed convergence refreshes the complete authoritative fan-out exactly once", async () => {
  const f = fixture();
  assert.deepEqual(await convergeCommittedStorePurchase(f.context), []);
  assert.deepEqual(f.calls, ["session", f.context.current.invalidatedResources]);
});

test("failed post-commit reads return a pending warning without another settlement", async () => {
  const f = fixture();
  f.context.terminal.refreshResources = async (keys) => { f.calls.push(keys); throw new Error("offline"); };
  const warnings = await convergeCommittedStorePurchase(f.context);
  assert.equal(warnings.length, 1); assert.match(warnings[0], /purchase completed/);
  assert.deepEqual(f.calls, ["session", f.context.current.invalidatedResources]);
});

test("session retirement during a pending aggregate refresh suppresses its obsolete warning", async () => {
  const f = fixture(); let release;
  f.context.terminal.refreshResources = () => new Promise((resolve) => { release = resolve; });
  const operation = convergeCommittedStorePurchase(f.context);
  f.freshness.setSession("next"); release({ errors: { store: { status: 401 } } });
  assert.equal(await operation, null);
});

test("an obsolete immutable-receipt 401 cannot become a current-session error", async () => {
  const f = fixture(); let reject;
  f.context.current = { ...f.context.current, purchaseMode: "business_offer", receipt: { receiptKey: `spr_${"1".repeat(32)}` } };
  f.context.api.request = () => new Promise((resolve, no) => { reject = no; });
  const operation = convergeCommittedStorePurchase(f.context);
  f.freshness.setSession("next"); reject({ status: 401 });
  assert.equal(await operation, null);
  assert.deepEqual(f.calls, ["session"]);
});

test("a competing publisher superseding committed refresh gets one bounded terminal retry", async () => {
  const f = fixture(); let attempts = 0;
  f.context.terminal.refreshResources = async (keys) => {
    f.calls.push(keys);
    if (++attempts === 1) throw { code: "REQUEST_SUPERSEDED" };
    return { data: {}, errors: {} };
  };
  assert.deepEqual(await convergeCommittedStorePurchase(f.context), []);
  assert.equal(attempts, 2);
});

test("repeated supersession stays pending rather than starting an unbounded read loop", async () => {
  const f = fixture(); let attempts = 0;
  f.context.terminal.refreshResources = async () => { attempts++; throw { code: "REQUEST_SUPERSEDED" }; };
  const warnings = await convergeCommittedStorePurchase(f.context);
  assert.equal(warnings.length, 1); assert.equal(attempts, 2);
});
