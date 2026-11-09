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
