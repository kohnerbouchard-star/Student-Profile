import assert from "node:assert/strict";
import test from "node:test";
import { loansFixture } from "./loans-lifecycle-fixture.mjs";
import { normalizeApiResponse } from "../src/api/response-normalizer.js";
import { renderLoansPage } from "../src/pages/loans-page.js";

const render = (loans) => renderLoansPage({ loans: normalizeApiResponse("loans", { ok: true, data: loans }), business: {} }, {});
const progress = (f) => render(f).match(/<div data-loan-principal-progress>[\s\S]*?<\/div><details/)?.[0] || render(f).split('data-loan-principal-progress')[1]?.split('<details')[0] || "";
const row = (f) => f.lifecycle.facilities.items[0];

test("principal progress uses exact facility amounts, not rounded legacy debt or receipt totals", () => {
  const f = loansFixture(); row(f).accruedInterest = "5.00"; row(f).recordedOutstanding = "9.01";
  f.activeLoans[0].balance = 999; f.activeLoans[0].originalAmount = 999; f.activeLoans[0].repaidPercent = 3;
  const html = progress(f);
  assert.match(html, /Principal repaid: NRC 95\.99 of NRC 100\.00/);
  assert.match(html, /aria-valuenow="95.9"/); assert.match(html, /aria-label="Principal repaid"/);
  assert.match(html, /Remaining principal NRC 4\.01/); assert.match(html, /Stored accrued interest NRC 5\.00/);
  assert.match(html, /Recorded outstanding NRC 9\.01/); assert.doesNotMatch(html, /999|width:3%/);
  assert.match(html, /not a payoff quote/); assert.match(html, /Unrecorded and future interest are excluded/);
});

test("cent precision survives values beyond safe integers and never rounds residual principal to 100%", () => {
  const f = loansFixture(); Object.assign(row(f), { originalPrincipal: "9999999999999999.99", principalBalance: "0.01", accruedInterest: "0.00", recordedOutstanding: "0.01" });
  const html = progress(f);
  assert.match(html, /NRC 9,999,999,999,999,999\.98 of NRC 9,999,999,999,999,999\.99/);
  assert.match(html, /aria-valuenow="99.9"/); assert.doesNotMatch(html, /width:100/);
});

test("zero and full principal progress remain separate from paying interest or server paid status", () => {
  const f = loansFixture(); row(f).principalBalance = "100.00";
  assert.match(progress(f), /aria-valuenow="0.0"/);
  row(f).principalBalance = "0.00"; row(f).accruedInterest = "2.00"; row(f).recordedOutstanding = "2.00";
  assert.match(progress(f), /aria-valuenow="100.0"/); assert.match(progress(f), /Stored accrued interest NRC 2\.00/);
  assert.doesNotMatch((render(f).split('data-loan-paid-milestones')[1] || "").split('</section>')[0], new RegExp(row(f).id));
});

test("missing, invalid or contradictory principal inputs never fabricate a percentage", () => {
  const variants = [
    (f) => { row(f).originalPrincipal = null; }, (f) => { row(f).principalBalance = null; },
    (f) => { row(f).originalPrincipal = "0.00"; }, (f) => { row(f).principalBalance = "101.00"; },
    (f) => { row(f).principalBalance = "-1.00"; }, (f) => { row(f).originalPrincipal = 100; },
    (f) => { f.lifecycle = undefined; }, (f) => { f.lifecycle.facilities.items.shift(); },
    (f) => { row(f).currencyCode = "LUM"; }, (f) => { f.activeLoans[0].currencyCode = null; },
  ];
  for (const mutate of variants) {
    const f = loansFixture(); mutate(f); const html = progress(f);
    assert.match(html, /Principal progress unavailable/); assert.doesNotMatch(html, /role="progressbar"|width:/);
    assert.match(render(f), /data-endpoint="loanRepay"/);
  }
});

test("unknown interest timestamp is explicit and contradictory recorded debt is not presented as a total", () => {
  const f = loansFixture(); row(f).lastAccruedAt = null; row(f).recordedOutstanding = "999.00";
  assert.match(progress(f), /Interest last recorded Not recorded/);
  assert.match(progress(f), /Recorded outstanding unavailable/); assert.doesNotMatch(progress(f), /999\.00/);
});

test("missing interest preserves principal-only progress while duplicate facility keys fail closed", () => {
  const f = loansFixture(); row(f).accruedInterest = null;
  assert.match(progress(f), /Principal repaid: NRC 95\.99 of NRC 100\.00/);
  assert.match(progress(f), /Stored accrued interest NRC Unavailable/);
  assert.match(progress(f), /Recorded outstanding unavailable/);
  f.lifecycle.facilities.items.push({ ...row(f) });
  assert.match(progress(f), /Principal progress unavailable/);
  assert.doesNotMatch(render(f), /role="progressbar"|data-loan-paid-milestones/);
});

test("paid milestone requires exact server paid status and consistent recorded zero debt", () => {
  const f = loansFixture(); assert.match(render(f), /Loan paid · Working capital/);
  for (const [field, value] of [["status", "active"], ["status", "defaulted"], ["recordedOutstanding", null], ["recordedOutstanding", "0.01"], ["principalBalance", "0.01"], ["accruedInterest", "0.01"], ["currencyCode", null]]) {
    const changed = loansFixture(); changed.lifecycle.facilities.items[2][field] = value;
    assert.doesNotMatch(render(changed), /data-loan-paid-milestones/);
  }
});

test("incomplete histories cannot become lifetime totals or inferred payoff", () => {
  const f = loansFixture(); f.lifecycle.facilities.complete = false; f.lifecycle.facilities.hasMore = true;
  f.lifecycle.payments.complete = false; f.lifecycle.payments.hasMore = true; f.lifecycle.payments.items = [];
  assert.match(render(f), /Facility history is incomplete; these are only the returned records/);
  assert.match(progress(f), /NRC 95\.99 of NRC 100\.00/);
  f.lifecycle.facilities.items = [row(f)];
  f.lifecycle.payments.items = [{ ...loansFixture().lifecycle.payments.items[0], amount: "100.00", principalAmount: "100.00" }];
  assert.doesNotMatch(render(f), /data-loan-paid-milestones/);
  f.lifecycle.payments.items[0].status = "reversed";
  assert.match(progress(f), /NRC 95\.99 of NRC 100\.00/);
});

test("milestone escapes product text and never creates a payment command or reward", () => {
  const f = loansFixture(); f.lifecycle.facilities.items[2].currentProduct.name = '<img src=x onerror="bad()">';
  f.lifecycle.facilities.items[2].closedAt = null;
  const html = render(f); assert.doesNotMatch(html, /<img src=x/); assert.match(html, /&lt;img/);
  assert.match(html, /Closed date not recorded/);
  assert.equal((html.match(/data-endpoint="loanRepay"/g) || []).length, 1);
  assert.doesNotMatch(html, new RegExp(`data-loan-id="${f.lifecycle.facilities.items[2].id}"`));
  assert.match(html, /This does not mean all your debt is paid/);
});
