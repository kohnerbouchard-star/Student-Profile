import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { isEndpointEnabled } from "../src/api/capabilities.js";
import { resolveBusinessBankingBackendRequest } from "../src/api/business-banking-backend-routes.js";

const employeeKey = `emp_${"c".repeat(32)}`;
const businessKey = `biz_${"a".repeat(32)}`;
const capabilities = {
  actions: {
    marketplaceActivate: true,
    marketplaceDispute: true,
    messageSend: true,
  },
};

assert.equal(isEndpointEnabled(capabilities, "marketplaceActivate"), true);
assert.equal(isEndpointEnabled(capabilities, "marketplaceDispute"), true);
assert.equal(isEndpointEnabled(capabilities, "messageThreadCreate"), true);
assert.equal(isEndpointEnabled(capabilities, "messageRead"), true);

const businessPageSource = await readFile(
  new URL("../src/pages/business-page.js", import.meta.url),
  "utf8",
);
assert.match(
  businessPageSource,
  /<input name="employeeKey" type="hidden" value="\$\{escapeHtml\(employee\.id\)\}" \/>/,
  "Employee termination must submit the public employee key rather than relying on browser-owned UUID context.",
);

const termination = resolveBusinessBankingBackendRequest({
  endpointKey: "businessTerminate",
  method: "POST",
  path: "/players/me/business/employees/terminate",
  params: {},
  payload: {
    businessKey,
    employeeKey,
    reason: "Role no longer required",
    idempotencyKey: "business-terminate-regression-0001",
  },
});
assert.equal(
  termination.path,
  `/players/me/business/employees/${employeeKey}/terminate`,
);
assert.deepEqual(termination.payload, {
  businessKey,
  reason: "Role no longer required",
  idempotencyKey: "business-terminate-regression-0001",
});
assert.doesNotMatch(JSON.stringify(termination), /playerUuid|gameSessionId|ownerPlayerId/);

console.log("Mutation capability aliases and public route-context regression checks passed.");
