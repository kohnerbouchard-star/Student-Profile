import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Loans V2 is source-owned but not configured without an authoritative portfolio read", async () => {
  const [navigation, client, controller, route] = await Promise.all([
    read("admin/v2/src/core/navigation-registry.js"),
    read("admin/v2/src/routes/loans/LoansApiClient.js"),
    read("admin/v2/src/routes/loans/LoansController.js"),
    read("admin/v2/src/routes/loans/LoansRoute.js"),
  ]);

  assert.match(navigation, /id:\s*"loans"[\s\S]*?permission:\s*"economy\.adjust"[\s\S]*?migration:\s*"v2"/);
  assert.match(navigation, /id:\s*"banking"[\s\S]*?permission:\s*"economy\.adjust"[\s\S]*?migration:\s*"v2"/);
  assert.match(client, /implementationStatus:\s*"not_configured"/);
  assert.doesNotMatch(client, /fetch\s*\(|\/api\/admin|\/games\/.*\/loans|readLoans|\bPOST\b|\bPATCH\b|\bDELETE\b/i);
  assert.match(controller, /status:\s*"not-configured"/);
  assert.doesNotMatch(controller, /readLoans|normalizeLoansReadModel|beginAdminDataLoad/);
  assert.match(route, /Loan supervision is not configured/);
  assert.match(route, /no browser-safe supervisory read contract for outstanding loans and repayment history/);
});

test("current authoritative Admin/BFF loan reads remain partial and unchanged", async () => {
  const [operations, security, workflow] = await Promise.all([
    read("backend/supabase/functions/admin-api/businessBankingOperations.ts"),
    read("backend/supabase/functions/admin-api/adminSecurityGuard.ts"),
    read(".github/workflows/business-banking-runtime.yml"),
  ]);

  assert.match(operations, /input\.suffix === "\/loan-applications"[\s\S]*?request\.method === "GET"/);
  assert.match(operations, /input\.suffix === "\/loan-products"[\s\S]*?request\.method === "GET"/);
  assert.doesNotMatch(operations, /input\.suffix === "\/loans"[\s\S]*?request\.method === "GET"/);
  assert.match(operations, /player_id,business_id,loan_product_id/);
  assert.doesNotMatch(security, /^\s*loans:\s*"economy\.adjust"/m);
  assert.doesNotMatch(workflow, /admin\/v2\/src\/routes\/loans|loanOperations|admin-v2-loans-api/);

  await assert.rejects(
    access(new URL("../backend/supabase/functions/admin-api/loanOperations.ts", import.meta.url)),
  );
});
