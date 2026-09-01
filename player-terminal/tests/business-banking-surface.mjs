import assert from "node:assert/strict";

import { resolveBusinessBankingBackendRequest } from "../src/api/business-banking-backend-routes.js";
import { PLAYER_ENDPOINTS } from "../src/api/endpoints.js";
import { playerSafeErrorMessage } from "../src/api/errors.js";
import { WRITE_INVALIDATIONS } from "../src/api/resource-plan.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { renderBusinessPage } from "../src/pages/business-page.js";
import { renderLoansPage } from "../src/pages/loans-page.js";

const businessKey = `biz_${"a".repeat(32)}`;
const productKey = `bpr_${"b".repeat(32)}`;
const manufacturingJobKey = `mfg_${"7".repeat(32)}`;
const employeeKey = `emp_${"c".repeat(32)}`;
const candidateKey = `wfc_${"f".repeat(32)}`;
const payrollRunKey = `pay_${"9".repeat(32)}`;
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
      cash: 1000,
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
      version: 1,
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
    manufacturingJobs: [{
      jobKey: manufacturingJobKey,
      businessKey,
      productKey,
      productName: "Utility Module",
      status: "in_progress",
      resourceState: "reserved",
      priority: "standard",
      quantity: 10,
      completedOutputQuantity: 0,
      queuedAt: "2026-08-23T00:00:00.000Z",
      startedAt: "2026-08-23T00:01:00.000Z",
      completesAt: "2026-08-23T00:11:00.000Z",
      completedAt: null,
      cancelledAt: null,
      failedAt: null,
      failureCode: null,
      canCancel: true,
    }],
    workforceUtilization: {
      businessKey,
      payrollPeriodKey: "payroll:1",
      generatedAt: "2026-08-23T00:00:00.000Z",
      payroll: {
        payrollRunKey,
        periodKey: "payroll:1",
        status: "partially_paid",
        employeeCount: 1,
        wageDue: 25,
        wagePaid: 15,
        wageUnpaid: 10,
        currencyCode: "LUM",
        completedAt: "2026-08-23T00:00:00.000Z",
      },
      employees: [{
        employeeKey,
        roleKey: "production.specialist",
        roleName: "Production Specialist",
        status: "active",
        workforceSource: "candidate_v2",
        capacityMinutes: 480,
        reservedMinutes: 0,
        consumedMinutes: 120,
        utilizedMinutes: 120,
        availableMinutes: 360,
        idleMinutes: 360,
        utilizationBasisPoints: 2500,
        latestPayrollStatus: "partially_paid",
        wageDue: 25,
        wagePaid: 15,
        wageUnpaid: 10,
        currencyCode: "LUM",
      }],
    },
  },
  businessWorkforce: {
    businessKey,
    generatedAt: "2026-08-22T00:00:00.000Z",
    candidates: [{
      candidateKey,
      roleKey: "production.specialist",
      roleName: "Production Specialist",
      laborClass: "manufacturing",
      displayLabel: "Lumenor Production Candidate",
      countryCode: "LUMENOR",
      currencyCode: "LUM",
      wagePerCycle: 25,
      laborMinutesPerCycle: 480,
      skillBasisPoints: 7500,
      productivityIndex: 1,
      contractType: "cycle",
      availabilityEndsAt: null,
      version: 1,
    }],
  },
  banking: {
    checking: { accountId: "checking", balance: 1000, available: 1000, currencyCode: "LUM" },
    savings: { accountId: "savings", balance: 200, available: 200, interestRate: 3, interestEarned: 2, configured: true },
    balances: [
      { accountType: "checking", balance: 1000, currencyCode: "LUM" },
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
  "businessManufacturingStart",
  "businessPrice",
  "businessTerminate",
  "businessStatus",
]) {
  assert.match(markup, new RegExp(`data-endpoint="${endpoint}"`), `missing ${endpoint} control`);
  assert.ok(WRITE_INVALIDATIONS[endpoint]?.includes("business"), `missing ${endpoint} Business invalidation`);
  assertAccessibleForm(markup, endpoint);
}
assert.match(markup, /data-endpoint="businessManufacturingCancel"/);
assert.match(markup, new RegExp(`data-business-manufacturing-job="${manufacturingJobKey}"`));
assert.ok(
  WRITE_INVALIDATIONS.businessManufacturingCancel?.includes("business"),
  "missing businessManufacturingCancel Business invalidation",
);
assert.doesNotMatch(markup, /data-endpoint="businessProduction"/);
assert.equal(
  PLAYER_ENDPOINTS.businessManufacturingStart.path,
  "/businesses/:businessId/manufacturing/jobs",
);
assert.equal(
  PLAYER_ENDPOINTS.businessManufacturingCancel.path,
  "/businesses/:businessId/manufacturing/jobs/:jobId/cancel",
);
assert.match(markup, /data-endpoint="businessCandidateHire"/);
assert.ok(WRITE_INVALIDATIONS.businessCandidateHire?.includes("business"), "missing businessCandidateHire Business invalidation");
assert.match(markup, /data-business-workforce-utilization/);
assert.match(markup, /payroll:1/);
assert.match(markup, /25% utilization/);
assert.match(markup, /360 minutes available/);
assert.match(markup, new RegExp(`data-workforce-employee-id="${employeeKey}"`));
assert.match(markup, new RegExp(`data-candidate-id="${candidateKey}"`));
assert.match(markup, new RegExp(`name="candidateKey" type="hidden" value="${candidateKey}"`));
assert.match(markup, /<form[^>]*data-endpoint="businessCandidateHire"[^>]*>[\s\S]*?<button[^>]*type="submit"/u);
assert.match(markup, new RegExp(`name="businessKey" type="hidden" value="${businessKey}"`));
assert.match(markup, new RegExp(`data-employee-id="${employeeKey}"`));
assert.doesNotMatch(markup, /name="wagePerCycle"|name="productivityIndex"|name="roleName"|name="unitLaborCost"/u);
assert.doesNotMatch(markup, /name="baseDemandUnits"|Company value|Cycle revenue|operating margin/u);
assert.match(markup, /Recent Store sales/);
assert.match(markup, /Committed seller receipts/);
assert.match(markup, /name="expectedVersion" type="hidden" value="2"/);
assert.doesNotMatch(markup, /playerUuid|gameSessionId|ownerPlayerId/);
assert.doesNotMatch(markup, /businessInputPurchase|Purchase production inputs|Purchase inputs/);
assert.equal(PLAYER_ENDPOINTS.businessInputPurchase, undefined);
assert.match(
  playerSafeErrorMessage({ status: 409, code: "BUSINESS_LABOR_CAPACITY_UNAVAILABLE" }),
  /labor minutes left in the current payroll period/u,
);
assert.match(
  playerSafeErrorMessage({ status: 409, code: "BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE" }),
  /Hire an eligible candidate/u,
);

const unconfigured = renderBusinessPage({
  session: { currencyCode: "LUM" },
  business: {
    ...data.business,
    configured: false,
    company: { ...data.business.company, id: "" },
    products: [], employees: [], inventory: [], workforceUtilization: null,
  },
});
assert.match(unconfigured, /data-endpoint="businessCreate"/);
assert.match(unconfigured, /Create one game-scoped enterprise/);
assert.doesNotMatch(
  unconfigured,
  /name="acquireBusinessKey"|Create or acquire|acquire an enterprise/iu,
);
assertAccessibleForm(unconfigured, "businessCreate");

const assignedCountryCurrency = renderBusinessPage({
  session: { currencyCode: "LUM" },
  countries: [{ isPlayerCountry: true, currencyCode: "YRC" }],
  business: {
    ...data.business,
    configured: false,
    company: { ...data.business.company, id: "" },
    products: [], employees: [], inventory: [], workforceUtilization: null,
  },
});
assert.match(assignedCountryCurrency, /STARTING CAPITAL \(YRC\)/);
assert.doesNotMatch(assignedCountryCurrency, /STARTING CAPITAL \(LUM\)/);

const bankingMarkup = renderBankingPage(data);
assert.match(bankingMarkup, /data-player-banking-balance="checking:LUM"/);
assert.match(bankingMarkup, /CHECKING ACCOUNT/);
assert.doesNotMatch(bankingMarkup, /CASH ACCOUNT|Cash ·/);
assert.match(bankingMarkup, /data-endpoint="bankTransfer"/);
assert.match(bankingMarkup, /name="recipientPlayerIdentifier"/);
assert.match(bankingMarkup, /data-endpoint="savingsTransfer"/);
assert.match(bankingMarkup, /name="fromAccount"/);
assert.match(bankingMarkup, /name="toAccount"/);
assert.match(bankingMarkup, /<details class="player-terminal-disclosure"[^>]*><summary>/);
assert.doesNotMatch(bankingMarkup, /recipientPlayerUuid|senderPlayerId/);
assertAccessibleForm(bankingMarkup, "bankTransfer");
assertAccessibleForm(bankingMarkup, "savingsTransfer");

const loansMarkup = renderLoansPage(data, { loanOfferId: loanOfferKey });
assert.match(loansMarkup, /data-endpoint="loanApply"/);
assert.match(loansMarkup, new RegExp(`name="businessKey" type="hidden" value="${businessKey}"`));
assert.match(loansMarkup, /APR and fees are disclosed before review/);
assert.match(loansMarkup, /data-endpoint="loanRepay"/);
assert.match(loansMarkup, /Delinquent/);
assert.match(loansMarkup, /accrued interest/);
assert.match(loansMarkup, /<details class="player-terminal-disclosure"[^>]*><summary>/);
assertAccessibleForm(loansMarkup, "loanApply");
assertAccessibleForm(loansMarkup, "loanRepay");

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
assert.equal(termination.path, `/players/me/business/employees/${employeeKey}/terminate`);
assert.equal(termination.payload.businessKey, businessKey);
assert.equal(termination.payload.reason, "Role no longer required");

const productCreation = resolveBusinessBankingBackendRequest({
  endpointKey: "businessProductCreate",
  method: PLAYER_ENDPOINTS.businessProductCreate.method,
  path: PLAYER_ENDPOINTS.businessProductCreate.path,
  params: {},
  payload: {
    businessKey,
    name: "Utility Module",
    category: "general",
    unitPrice: 20,
    unitInputCost: 5,
    capacityUnits: 100,
    qualityScore: 50,
    baseDemandUnits: 99_999,
    idempotencyKey: "business-product-create-0001",
  },
});
assert.equal(Object.hasOwn(productCreation.payload, "baseDemandUnits"), false);

console.log("Player Business workforce utilization, checking/savings Banking, and Loans surface contract passed.");

function assertAccessibleForm(source, endpoint) {
  const match = source.match(new RegExp(`<form[^>]*data-endpoint="${endpoint}"[^>]*>([\\s\\S]*?)<\\/form>`, "u"));
  assert.ok(match, `missing ${endpoint} form`);
  assert.match(match[1], /<label>/u, `${endpoint} must expose labeled controls`);
  assert.match(match[1], /<button[^>]*type="submit"/u, `${endpoint} must expose a submit control`);
  assert.doesNotMatch(
    match[1],
    /playerUuid|gameSessionId|ownerPlayerId|recipientPlayerUuid|senderPlayerId/u,
    `${endpoint} must not expose internal ownership fields`,
  );
}
