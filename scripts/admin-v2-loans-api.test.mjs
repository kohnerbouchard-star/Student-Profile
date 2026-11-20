import assert from "node:assert/strict";
import { readBrowserSource as readFile } from "./lib/browser-module-source.mjs";
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

test("Business Banking row extraction preserves projector, dispatch and scalar source parity", async () => {
  const { createHash } = await import("node:crypto");
  const operations = await read("backend/supabase/functions/admin-api/businessBankingOperations.ts");
  const projection = await read("backend/supabase/functions/admin-api/businessBankingRowProjection.ts");
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const originalProjection = projection.slice(projection.indexOf("  function projectBusinessRows("), projection.indexOf("\n  return { projectBusinessRows")).split("\n").map(line => line.startsWith("  ") ? line.slice(2) : line).join("\n");
  assert.equal(hash(originalProjection), "e761427ef9f3dd22d956afc2b88f46d95f1e88f96b1ad2af54e93256e355797d");
  assert.equal(hash(operations.slice(operations.indexOf("export async function handleBusinessBankingAdminOperation("), operations.indexOf("async function rpc(")).trim()), "58297726a344ef51de3128b96cf9fa463f922137974b6d1a5607cb35ee5c9fb0");
  assert.equal(hash(operations.slice(operations.indexOf("async function rpc(")).trim()), "75f14bc7624ceaceaf67103d584a5170590e9aca26250209fb32fceb008d0adc");
});

test("Business Banking public rows preserve allowlists, validation and null handling without I/O", async () => {
  const { handleBusinessBankingAdminOperation } = await import("../backend/supabase/functions/admin-api/businessBankingOperations.ts");
  const key = "biz_" + "a".repeat(32);
  const calls = [];
  async function request(rows, suffix = "/businesses") {
    const query = { select() { return this; }, eq(...args) { calls.push(args); return this; },
      order() { return this; }, limit() { return this; }, then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); } };
    return handleBusinessBankingAdminOperation({ from() { return query; }, rpc() { throw Error("Unexpected RPC"); } },
      { request: new Request("https://fixture.invalid" + suffix), gameId: "synthetic-game", staffUserId: "synthetic-staff", suffix });
  }
  const result = await request([null, [], { public_key: key, legal_name: "Synthetic", status: "active", failure_count: 0, private_id: "must-not-leak", capitalization: "123.4500" }]);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.businesses.length, 1);
  assert.equal(result.body.data.businesses[0].operational_readiness, "unknown");
  assert.equal(result.body.data.businesses[0].capitalization, "123.4500");
  assert.equal("private_id" in result.body.data.businesses[0], false);
  assert.deepEqual(calls[0], ["game_session_id", "synthetic-game"]);
  assert.deepEqual((await request(null)).body.data.businesses, []);
  assert.equal((await request({})).status, 400);
  assert.equal((await request([{ public_key: "invalid" }])).body.code, "invalid_public_key");
  const attention = (await request([{ public_key: key, status: "suspended", failure_count: 2 }])).body.data.businesses[0];
  assert.deepEqual(attention.attention_flags, ["status:suspended", "recorded-failures"]);
  assert.equal(attention.operational_readiness, "attention");
  assert.equal((await request([{ public_key: key, status: "closed" }])).body.data.businesses[0].operational_readiness, "closed");
  const application = { public_key: "lna_" + "b".repeat(32), amount: "50.0000", purpose: "Synthetic", private_id: "must-not-leak" };
  const loan = (await request([application], "/loan-applications")).body.data.applications[0];
  assert.equal(loan.amount, "50.0000");
  assert.equal("private_id" in loan, false);
});
