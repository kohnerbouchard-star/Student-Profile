import assert from "node:assert/strict";

import { resolveBusinessBankingBackendRequest } from "../src/api/business-banking-backend-routes.js";
import { PLAYER_ENDPOINTS } from "../src/api/endpoints.js";
import { WRITE_INVALIDATIONS } from "../src/api/resource-plan.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { renderBusinessPage } from "../src/pages/business-page.js";
import { renderLoansPage } from "../src/pages/loans-page.js";

const businessKey = `biz_${"a".repeat(32)}`;
const productKey = `bpr_${"b".repeat(32)}`;
const employeeKey = `emp_${"c".repeat(32)}`;
const loanOfferKey = `lop_${"d".repeat(32)}`;
const loanKey = `lon_${"e".repeat(32)}`;
const data = {
  session: { currencyCode: "LUM" },
  business: {
    configured: true,
    company: {
      id: businessKey,
      name: "Lumen Works",
      registration: businessKey.toUpperCase(),
      status: "Active",
      industry: "Manufacturing",
      headquarters: "Lumenor",
      valuation: 5000,
      valuationChange: 2,
      cash: 1000,
      revenue: 800,
      margin: 20,
      reputation: 65,
      reputationLabel: "Established operator",
      summary: "Ledger-backed enterprise.",
    },
    operations: {
      employees: 1,
      output: 20,
      backlog: 5,
      capacityUse: 40,
      maxRun: 100,
      capacityNote: "Capacity remains available.",
    },
    products: [{
      id: productKey,
      category: "General",
      name: "Utility Module",
      description: "50/100 quality",
      price: 20,
      margin: 30,
      demand: "Stable",
      icon: "factory",
      version: 2,
    }],
    suppliers: [],
    employees: [{
      id: employeeKey,
      role: "Production Specialist",
      contractType: "cycle",
      wage: 25,
      productivity: 1,
      status: "Active",
    }],
    inventory: [{ itemKey: "machine-steel-billet", kind: "input", quantity: 10, unitCost: 2 }],
  },
  banking: {
    checking: { accountId: "cash", balance: 1000, available: 1000, currencyCode: "LUM" },
    savings: { accountId: "savings", balance: 200, available: 200, interestRate: 3, interestEarned: 2, configured: true },
    balances: [
      { accountType: "cash", balance: 1000, currencyCode: "LUM" },
      { accountType: "savings", balance: 200, currencyCode: "LUM" },
    ],
    creditConfigured: true,
    creditScore: 700,
    transfersConfigured: true,
    transferLimit: 500,
    transactions: [],
    pagination: { hasMore: false, nextCursor: null },
    stale: false,
  },
  loans: {
    creditScore: 700,
    availableCredit: 5000,
    outstanding: 1000,
    nextPayment: { amount: 100, due: "Cycle 2" },
    onTimeRate: 100,
    paymentsMade: 2,
    offers: [{
      id: loanOfferKey,
      name: "Business working capital",
      purpose: "Business finance",
      description: "Fixed economic disclosure.",
      disclosure: "APR and fees are disclosed before review.",
      limit: 5000,
      minimumAmount: 500,
      apr: 8,
      fee: 1,
      termCycles: 12,
      risk: "Low",
      borrowerType: "business",
      icon: "business",
    }],
    activeLoans: [{
      id: loanKey,
      name: "Business working capital",
      status: "Delinquent",
      balance: 1000,
      originalAmount: 1500,
      nextPayment: 100,
      nextDue: "Cycle 2",
      repaidPercent: 33,
      accruedInterest: 20,
      businessId: businessKey,
    }],
    schedule: [{ cycle: "Cycle 2", due: "Cycle 2", amount: 100, status: "Late" }],
  },
};

const markup = renderBusinessPage(data);
for (const endpoint of [
  "businessProductCreate",
  "businessInputPurchase",
  "businessProduction",
  "businessPrice",
  "businessHire",
  "businessTerminate",
  "businessStatus",
]) {
  assert.match(markup, new RegExp(`data-endpoint="${endpoint}"`), `missing ${endpoint} control`);
  assert.ok(WRITE_INVALIDATIONS[endpoint]?.includes("business"), `missing ${endpoint} Business invalidation`);
}
assert.match(markup, new RegExp(`name="businessKey" type="hidden" value="${businessKey}"`));
assert.match(markup, new RegExp(`data-employee-id="${employeeKey}"`));
assert.match(markup, /name="wagePerCycle"/);
assert.match(markup, /name="productivityIndex"/);
assert.match(markup, /name="expectedVersion" type="hidden" value="2"/);
assert.doesNotMatch(markup, /playerUuid|gameSessionId|ownerPlayerId/);

const unconfigured = renderBusinessPage({
  session: { currencyCode: "LUM" },
  business: {
    ...data.business,
    configured: false,
    company: { ...data.business.company, id: "" },
    products: [], employees: [], inventory: [],
  },
});
assert.match(unconfigured, /data-endpoint="businessCreate"/);
assert.match(unconfigured, /name="acquireBusinessKey"/);

const bankingMarkup = renderBankingPage(data);
assert.match(bankingMarkup, /data-endpoint="bankTransfer"/);
assert.match(bankingMarkup, /name="recipientPlayerIdentifier"/);
assert.match(bankingMarkup, /data-endpoint="savingsTransfer"/);
assert.match(bankingMarkup, /name="fromAccount"/);
assert.match(bankingMarkup, /name="toAccount"/);
assert.doesNotMatch(bankingMarkup, /recipientPlayerUuid|senderPlayerId/);

const loansMarkup = renderLoansPage(data, { loanOfferId: loanOfferKey });
assert.match(loansMarkup, /data-endpoint="loanApply"/);
assert.match(loansMarkup, new RegExp(`name="businessKey" type="hidden" value="${businessKey}"`));
assert.match(loansMarkup, /APR and fees are disclosed before review/);
assert.match(loansMarkup, /data-endpoint="loanRepay"/);
assert.match(loansMarkup, /Delinquent/);
assert.match(loansMarkup, /accrued interest/);

const blockedBusinessLoan = renderLoansPage({
  ...data,
  business: { ...data.business, configured: false, company: { ...data.business.company, id: "" } },
}, { loanOfferId: loanOfferKey });
assert.match(blockedBusinessLoan, /Create or recover an active business/);
assert.match(blockedBusinessLoan, /type="submit" disabled/);

assert.equal(PLAYER_ENDPOINTS.businessTerminate.path.includes(":"), false);
const termination = resolveBusinessBankingBackendRequest({
  endpointKey: "businessTerminate",
  method: PLAYER_ENDPOINTS.businessTerminate.method,
  path: PLAYER_ENDPOINTS.businessTerminate.path,
  params: {},
  payload: {
    businessKey,
    employeeKey,
    reason: "Role no longer required",
    idempotencyKey: "business-terminate-0001",
  },
});
assert.equal(
  termination.path,
  `/players/me/business/employees/${employeeKey}/terminate`,
);
assert.equal(termination.payload.businessKey, businessKey);
assert.equal(termination.payload.reason, "Role no longer required");

console.log("Player Business, Banking, and Loans surface contract passed.");
