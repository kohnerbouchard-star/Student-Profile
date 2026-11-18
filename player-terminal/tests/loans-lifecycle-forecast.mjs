import assert from "node:assert/strict";
import test from "node:test";
import { loansFixture } from "./loans-lifecycle-fixture.mjs";
import { normalizeApiResponse } from "../src/api/response-normalizer.js";
import { renderLoansPage } from "../src/pages/loans-page.js";
const normalize = (loans = loansFixture()) => normalizeApiResponse("loans", { ok: true, data: loans });
const render = (loans = loansFixture()) => renderLoansPage({ loans: normalize(loans), business: {} }, {});
test("optional read models preserve exact values, windows and safe public identities", () => {
  const fixture = loansFixture(); const result = normalize(fixture);
  const { liabilityKind: _serverScope, ...displayedHistory } = fixture.lifecycle;
  assert.deepEqual(result.lifecycle, displayedHistory); assert.deepEqual(result.repaymentForecast, fixture.repaymentForecast);
  fixture.lifecycle.facilities.items[0].staffNotes = "private";
  assert.ok(!JSON.stringify(normalize(fixture).lifecycle).includes("private"));
});
test("history exposes application statuses, default debt and payment allocations separately by currency", () => {
  const html = render();
  for (const text of ["pending review", "approved", "declined", "cancelled", "defaulted", "paid", "posted", "reversed", "LUM 99.99", "Principal NRC 0.80", "Interest NRC 0.20", "Default does not erase this debt", "Application currency not recorded", "metadata only", "Interest last recorded"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/data-endpoint="loanRepay"/g) || []).length, 1);
});
test("forecast replaces legacy full-term schedule and prefills current installment remainder", () => {
  const html = render(); assert.doesNotMatch(html, /Wrong full term|NRC 999/);
  assert.match(html, /NRC 2\.01/); assert.match(html, /value="2.00" required/);
  assert.match(html, /Excludes unrecorded and future interest/); assert.match(html, /not a payoff quote/);
});
test("missing or malformed optional reads retain repayment controls without fabricated history", () => {
  for (const value of [undefined, null, { version: 2 }, { version: 1, state: "unavailable" }]) {
    const html = render({ ...loansFixture(), lifecycle: value, repaymentForecast: value });
    assert.match(html, /Loan history unavailable/); assert.match(html, /Forecast unavailable/); assert.match(html, /data-endpoint="loanRepay"/);
  }
});
test("incomplete coverage hides total debt, and unknown application currency is never guessed", () => {
  const fixture = loansFixture(); fixture.lifecycle.recordedDebt.complete = false;
  fixture.lifecycle.facilities.complete = false; fixture.lifecycle.facilities.hasMore = true;
  const html = render(fixture); assert.match(html, /Total debt unavailable/); assert.match(html, /More entries exist/);
  assert.doesNotMatch(html, /Requested amount: NRC/);
});
test("malformed money, duplicate keys, unsupported statuses and excessive records fail closed", () => {
  const variants = [
    (f) => { f.lifecycle.facilities.items[0].recordedOutstanding = 4.01; },
    (f) => { f.lifecycle.payments.items.push(f.lifecycle.payments.items[0]); },
    (f) => { f.lifecycle.applications.items[0].status = "arbitrary"; },
    (f) => { f.lifecycle.facilities.items = Array(101).fill(f.lifecycle.facilities.items[0]); },
    (f) => { f.lifecycle.applications.items[0].currencyCode = "NRC"; },
    (f) => { f.lifecycle.facilities.items[0].id = "11111111-1111-4111-8111-111111111111"; },
  ];
  for (const mutate of variants) { const f = loansFixture(); mutate(f); assert.equal(normalize(f).lifecycle.state, "unavailable"); }
});
test("forecast rejects inconsistent amounts, duplicate facilities and impossible schedules", () => {
  const variants = [
    (f) => { f.repaymentForecast.facilities[0].installments[0].amount = "8.00"; },
    (f) => { f.repaymentForecast.facilities.push(f.repaymentForecast.facilities[0]); },
    (f) => { f.repaymentForecast.facilities[0].installments[1].due = f.repaymentForecast.facilities[0].installments[0].due; },
    (f) => { f.repaymentForecast.excludesUnrecordedInterest = false; },
  ];
  for (const mutate of variants) { const f = loansFixture(); mutate(f); assert.equal(normalize(f).repaymentForecast, null); }
});
test("zero outstanding paid rows and empty histories are distinct from unavailable", () => {
  const f = loansFixture(); for (const name of ["applications", "facilities", "payments"]) f.lifecycle[name].items = [];
  f.lifecycle.recordedDebt.groups = []; f.repaymentForecast.facilities = []; f.activeLoans = [];
  const html = render(f); assert.match(html, /No recorded debt/); assert.match(html, /No recorded entries/); assert.match(html, /No active repayment forecast/);
});
test("display escapes external product text and public IDs never become default repayment actions", () => {
  const f = loansFixture(); f.lifecycle.facilities.items[1].currentProduct.name = '<img src=x onerror="bad()">';
  const html = render(f); assert.doesNotMatch(html, /<img src=x/); assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, new RegExp(`data-loan-id="${f.lifecycle.facilities.items[1].id}"`));
});

test("older responses retain exact reported schedule amounts without calling them a balance forecast", () => {
  const f = loansFixture(); delete f.repaymentForecast;
  f.schedule = [{ due: "2026-10-05T00:00:00.000001Z", amount: "0.01", currencyCode: "LUM" }, { due: "<img src=x>", amount: "99999999999999.99", currencyCode: "NRC" }];
  const html = render(f);
  for (const text of ["Forecast unavailable", "Unverified service schedule", "LUM 0.01", "NRC 99,999,999,999,999.99", "do not account for payments already made", "not the remaining debt"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<img src=x>/); assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /value="3" required/);
  f.repaymentForecast = loansFixture().repaymentForecast;
  assert.doesNotMatch(render(f), /Unverified service schedule|LUM 0.01|99,999,999,999,999.99/);
});

test("repayment discloses the facility account and currency without assuming home Checking", () => {
  for (const [type, label] of [["checking", "Checking account"], ["savings", "Savings account"], ["business", "Business operating account"]]) {
    const f = loansFixture(); f.activeLoans[0].repaymentAccountType = type;
    assert.ok(render(f).includes(`facility-bound ${label} in NRC`));
  }
  for (const type of [undefined, null, "__proto__", "constructor", "private-account-id", "<img src=x>"]) {
    const f = loansFixture(); f.activeLoans[0].repaymentAccountType = type;
    const html = render(f);
    assert.match(html, /Repayment account unavailable/);
    assert.match(html, /data-endpoint="loanRepay"/);
    assert.doesNotMatch(html, /private-account-id|<img src=x>/);
  }
});

test("payment receipts are grouped by facility without combining debts or hiding reversals", () => {
  const f = loansFixture();
  f.lifecycle.facilities.items[1].currentProduct = { ...f.lifecycle.facilities.items[1].currentProduct, name: "Equipment loan" };
  f.lifecycle.payments.items.push({ ...f.lifecycle.payments.items[0], id: `pay_${"f".repeat(32)}`, loanId: f.lifecycle.facilities.items[1].id, currencyCode: "LUM" });
  const html = render(f);
  const groups = [...html.matchAll(/<details[^>]+data-player-loan-payment-history="([^"]+)"[\s\S]*?<\/details>/g)];
  assert.equal(groups.length, 2);
  assert.equal(groups[0][1], f.lifecycle.facilities.items[0].id);
  assert.match(groups[0][0], /Payments for Working capital/);
  assert.match(groups[0][0], /2 recorded receipts/);
  assert.match(groups[0][0], /Reversed payment; not counted/);
  assert.doesNotMatch(groups[0][0], /Equipment loan|LUM/);
  assert.match(groups[1][0], /Payments for Equipment loan/);
  assert.match(groups[1][0], /1 recorded receipt/);
  assert.match(groups[1][0], /Principal LUM 0.80/);
  assert.doesNotMatch(groups[1][0], /Principal NRC/);
});
test("orphan receipts and incomplete windows never fabricate a facility or complete payment total", () => {
  const f = loansFixture(); f.lifecycle.facilities.items = [];
  f.lifecycle.payments.complete = false; f.lifecycle.payments.hasMore = true;
  const html = render(f);
  assert.match(html, /Payments for credit facility/);
  assert.match(html, /Facility details are outside the available history/);
  assert.match(html, /More entries exist; this is not a complete history/);
  assert.match(html, /not a payoff quote or a total of all payments/);
  assert.match(html, /Principal NRC 0.80/);
});
test("receipt group names are escaped and empty payment history has no fabricated disclosure", () => {
  const f = loansFixture(); f.lifecycle.facilities.items[0].currentProduct.name = '<img src=x onerror="bad()">';
  assert.doesNotMatch(render(f), /<img src=x/);
  assert.match(render(f), /Payments for &lt;img/);
  f.lifecycle.payments.items = [];
  assert.doesNotMatch(render(f), /data-player-loan-payment-history=/);
});
