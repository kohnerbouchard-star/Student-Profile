import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Loans V2 consumes the economy-scoped authoritative supervisory contract", async () => {
  const [navigation, client, controller, route, app] = await Promise.all([
    read("admin/v2/src/core/navigation-registry.js"),
    read("admin/v2/src/routes/loans/LoansApiClient.js"),
    read("admin/v2/src/routes/loans/LoansController.js"),
    read("admin/v2/src/routes/loans/LoansRoute.js"),
    read("admin/v2/src/app.js"),
  ]);

  assert.match(navigation, /id:\s*"loans"[\s\S]*?permission:\s*"economy\.adjust"[\s\S]*?migration:\s*"v2"/);
  assert.match(client, /\/economy\/loans/);
  assert.match(client, /readLoans/);
  assert.match(client, /reviewApplication/);
  assert.match(client, /upsertProduct/);
  assert.match(client, /restructureLoan/);
  assert.match(client, /serviceLoans/);
  assert.match(controller, /normalizeLoansReadModel/);
  assert.match(controller, /beginAdminDataLoad/);
  assert.match(controller, /hasPermission\("economy\.adjust"\)/);
  assert.match(route, /implementationStatus = "configured"/);
  assert.match(route, /Loan authority boundary/);
  assert.match(route, /Internal ownership and ledger identifiers are not exposed/);
  assert.match(app, /createLoansApiClient\(\{ fetchImpl: transport \}\)/);
  assert.match(app, /createLoansController\(\{[\s\S]*?api: loansApi[\s\S]*?selectedGameId[\s\S]*?hasPermission/);
  assert.doesNotMatch(client, /Authorization/);
});

test("Admin Loans backend publishes privacy-safe portfolio, repayment, application and product projections", async () => {
  const [operations, supervision] = await Promise.all([
    read("backend/supabase/functions/admin-api/businessBankingOperations.ts"),
    read("backend/supabase/functions/admin-api/businessBankingLoanSupervision.ts"),
  ]);
  const backend = `${operations}\n${supervision}`;

  assert.match(operations, /input\.suffix === "\/economy\/loans"[\s\S]*?request\.method === "GET"/);
  for (const table of ["player_loans", "loan_payments", "loan_applications", "loan_products", "business_entities", "players"]) {
    assert.match(backend, new RegExp(`from\\("${table}"\\)`, "u"), `missing Loans source ${table}`);
  }
  for (const publicPrefix of ["lon", "pay", "lna", "lop", "biz"]) {
    assert.match(backend, new RegExp(`publicKey\\([^)]*, "${publicPrefix}"\\)`, "u"));
  }
  for (const prohibitedProjection of ["ledger_entry_id", "request_hash", "idempotency_key", "repayment_source"]) {
    assert.doesNotMatch(supervision, new RegExp(`['\"]${prohibitedProjection}['\"]`, "u"));
  }
  assert.match(operations, /projectLoanApplicationRows\(data\)/u);
  assert.doesNotMatch(
    operations,
    /"public_key,player_id,business_id,loan_product_id,[^"]*"/u,
    "legacy loan-application reads must not select internal ownership UUIDs",
  );
  assert.match(supervision, /uniqueInternalIds/);
  assert.match(supervision, /playerReference/);
  assert.match(supervision, /currencyTotals/);
  assert.ok(operations.includes("(?:economy\\/)?loan-applications"));
  assert.ok(operations.includes("(?:economy\\/)?loans"));
  assert.match(operations, /"\/economy\/loan-products"/);
  assert.match(operations, /"\/economy\/loans\/service"/);
});
