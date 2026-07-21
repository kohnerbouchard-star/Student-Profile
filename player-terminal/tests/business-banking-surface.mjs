import assert from "node:assert/strict";

import { resolveBusinessBankingBackendRequest } from "../src/api/business-banking-backend-routes.js";
import { PLAYER_ENDPOINTS } from "../src/api/endpoints.js";
import { WRITE_INVALIDATIONS } from "../src/api/resource-plan.js";
import { renderBusinessPage } from "../src/pages/business-page.js";

const businessKey = `biz_${"a".repeat(32)}`;
const productKey = `bpr_${"b".repeat(32)}`;
const employeeKey = `emp_${"c".repeat(32)}`;
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

console.log("Player Business and Banking surface contract passed.");
