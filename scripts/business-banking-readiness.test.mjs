import assert from "node:assert/strict";
import test from "node:test";
import { corePath, readSource, section, materializeBusinessSource, readinessHelpers, fixture } from "./lib/business-banking-readiness-fixture.mjs";

const core = await readSource(corePath);
const materialized = await materializeBusinessSource();
const commerce = await readSource("scripts/business-banking-player-commerce-browser-acceptance.core.mjs");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("Business copies the canonical Commerce readiness predicate without semantic changes", () => {
  assert.equal(section(core, "function readyCurrencyBalance(", "\n\n// Only allowlisted").trimEnd(),
    section(commerce, "function readyCurrencyBalance(", "\nasync function balanceForCurrency(").trimEnd());
});

test("both actual BFF materialization stages preserve the corrected read and storage guards", () => {
  assert.equal(readinessHelpers(materialized), readinessHelpers(core));
  for (const guard of [
    "if (Math.abs(balanceBeforeCredit - storageBefore.cashBalance) > 0.001)",
    "if (Math.abs(balanceAfterCredit - storageAfter.cashBalance) > 0.001)",
    "const fixtureCreditAmount = Math.max(1, Math.round((FIXTURE_TARGET_BALANCE - storageBefore.cashBalance) * 100) / 100);",
    "await creditPlayer(admin, fundingCurrencyCode, fixtureCreditAmount);",
  ]) assert.equal(materialized.split(guard).length - 1, 1);
  assert.ok(materialized.indexOf("const balanceBeforeCredit = await checkingBalance") < materialized.indexOf("await creditPlayer(admin,"));
  assert.match(materialized, /\/functions\/v1\/player-web-session-api\/login/);
  assert.match(materialized, /Business replay charged capitalization twice/);
  assert.doesNotMatch(readinessHelpers(materialized), /card\.count|waitForTimeout|creditPlayer|reload\(/);
});

for (const [name, source] of [["core", core], ["materialized", materialized]]) {
  test(`${name}: missing and bootstrap-zero frames cannot beat delayed authoritative 40`, async () => {
    const f = fixture(source);
    f.frames.push(
      () => { assert.equal(f.poll(), false); },
      () => { f.card("0"); assert.equal(f.poll(), false); },
      () => { f.ready(40); assert.equal(f.poll(), false); },
      () => { f.card("40"); },
    );
    assert.equal(await f.read({ optional: true }), 40);
    assert.equal(f.disposed(), 1);
    assert.deepEqual(f.requests, [["banking", ".player-terminal-banking-page"], { code: "LUM", timeout: 30_000 }]);
    assert.deepEqual(f.evidence, {});
  });

  for (const balance of [0, 40, 10000.125]) test(`${name}: authoritative visible ${balance} is valid`, async () => {
    const f = fixture(source); f.ready(balance);
    f.card(balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
    f.frames.push(() => {});
    assert.equal(await f.read(), Math.round(balance * 100) / 100);
    assert.equal(f.disposed(), 1);
  });

  test(`${name}: optional absence requires an authoritative absent row and absent card`, async () => {
    const f = fixture(source); f.ready(40); f.state.data.banking.balances[0].currencyCode = "NRC";
    f.frames.push(() => {});
    assert.equal(await f.read({ optional: true }), 0);
    await assert.rejects(f.read(), /did not become authoritative/);
    f.card("0"); assert.equal(f.poll(), false);
    assert.equal(f.disposed(), 2);
  });

  test(`${name}: checking fallback remains subject to readiness and matching rendered amount`, async () => {
    const f = fixture(source); f.ready(0); f.state.data.banking.balances = [];
    f.card("0"); assert.deepEqual(plain(f.poll()), { cardPresent: true, balance: 0 });
    f.state.data.banking.checking.balance = 40; assert.equal(f.poll(), false);
    f.card("40"); assert.equal(f.poll().balance, 40);
  });

  const rejected = {
    loading: (f) => { f.state.routeLoading.banking = true; },
    unread: (f) => { delete f.state.routeLoading.banking; },
    "resource-loading": (f) => { f.state.data.resourceStatus.banking.state = "loading"; },
    "resource-error": (f) => { f.state.data.resourceStatus.banking.state = "error"; },
    "resource-unavailable": (f) => { f.state.data.resourceStatus.banking.state = "unavailable"; },
    "route-error": (f) => { f.state.routeErrors.banking = "private-error"; },
    stale: (f) => { f.state.data.banking.stale = true; },
    "missing-balances": (f) => { delete f.state.data.banking.balances; },
    "missing-known-card": (f) => f.card(null),
    "hidden-card": (f) => f.card("40", { visible: false }),
    "hidden-style": (f) => f.visibility("hidden"),
    "bootstrap-zero-mismatch": (f) => f.card("0"),
    "invalid-number": (f) => { f.state.data.banking.balances[0].balance = NaN; },
    "missing-number": (f) => { delete f.state.data.banking.balances[0].balance; },
    "missing-currency": (f) => { delete f.state.data.banking.balances[0].currencyCode; },
  };
  for (const [label, mutate] of Object.entries(rejected)) test(`${name}: ${label} fails closed at the bounded deadline`, async () => {
    const f = fixture(source); f.ready(); f.card("40"); mutate(f); f.frames.push(() => {}, () => {});
    assert.equal(f.poll(), false);
    await assert.rejects(f.read({ optional: true }), /did not become authoritative within 30 seconds/);
    assert.equal(f.requests[1].timeout, 30_000);
    assert.ok(Object.values(f.evidence.bankingReadinessFailure).every((value) => typeof value === "boolean"));
    assert.equal(f.disposed(), 0);
  });
}

test("failure snapshot is a strict flag allowlist without private state or DOM content", async () => {
  const f = fixture(materialized); f.ready(); f.card("private-token-123");
  const secret = "11111111-1111-4111-8111-111111111111";
  f.state.data.session = { token: secret }; f.state.routeErrors.banking = secret;
  f.state.data.banking.privateLedger = secret; f.frames.push(() => {});
  await assert.rejects(f.read(), /did not become authoritative/);
  const snapshot = plain(f.evidence.bankingReadinessFailure);
  assert.deepEqual(Object.keys(snapshot), ["routeSettled", "routeError", "resourceReady", "stale", "balancesPresent", "cardPresent", "cardVisible"]);
  assert.ok(Object.values(snapshot).every((value) => typeof value === "boolean"));
  assert.doesNotMatch(JSON.stringify(snapshot), /11111111|token|private/);
});

test("snapshot failure cannot turn readiness failure into zero or a different error", async () => {
  const f = fixture(materialized); f.page.evaluate = async () => { throw new Error("private-token"); };
  await assert.rejects(f.read({ optional: true }), /did not become authoritative/);
  assert.deepEqual(plain(f.evidence.bankingReadinessFailure), { unavailable: true });
});

test("a stalled snapshot has its own bounded deadline", async () => {
  const f = fixture(materialized);
  f.page.evaluate = () => new Promise(() => {});
  let delay;
  f.sandbox.setTimeout = (callback, milliseconds) => { delay = milliseconds; callback(); return 1; };
  f.sandbox.clearTimeout = () => {};
  await assert.rejects(f.read(), /did not become authoritative/);
  assert.equal(delay, 1000);
  assert.deepEqual(plain(f.evidence.bankingReadinessFailure), { unavailable: true });
});
