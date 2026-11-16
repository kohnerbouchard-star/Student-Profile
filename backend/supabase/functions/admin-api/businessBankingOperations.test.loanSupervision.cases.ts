import { handleBusinessBankingAdminOperation } from "./businessBankingOperations.ts";
import {
  APP_KEY,
  APPLICATION_ID,
  assert,
  assertEquals,
  BUSINESS_ID,
  BUSINESS_KEY,
  GAME_ID,
  LOAN_ID,
  LOAN_KEY,
  NOW,
  PAYMENT_ID,
  PAYMENT_KEY,
  PLAYER_ID,
  PRODUCT_ID,
  PRODUCT_KEY,
  request,
  service,
  STAFF_ID,
} from "./businessBankingTestSupport.ts";

Deno.test("Admin Loans supervision projects authoritative data without internal ownership UUIDs", async () => {
  const mock = service({
    player_loans: [{
      id: LOAN_ID,
      public_key: LOAN_KEY,
      player_id: PLAYER_ID,
      business_id: BUSINESS_ID,
      loan_product_id: PRODUCT_ID,
      application_id: APPLICATION_ID,
      currency_code: "ECO",
      original_principal: 1000,
      principal_balance: 800,
      accrued_interest: 20,
      annual_rate: 0.08,
      origination_fee: 10,
      scheduled_payment: 120,
      status: "active",
      next_due_at: NOW,
      last_accrued_at: NOW,
      delinquent_at: null,
      defaulted_at: null,
      closed_at: null,
      created_at: NOW,
      updated_at: NOW,
    }],
    loan_payments: [{
      id: PAYMENT_ID,
      public_key: PAYMENT_KEY,
      player_id: PLAYER_ID,
      loan_id: LOAN_ID,
      amount: 200,
      principal_amount: 180,
      interest_amount: 20,
      status: "posted",
      created_at: NOW,
    }],
    loan_applications: [{
      id: APPLICATION_ID,
      public_key: APP_KEY,
      player_id: PLAYER_ID,
      business_id: BUSINESS_ID,
      loan_product_id: PRODUCT_ID,
      amount: 1000,
      purpose: "Working capital",
      credit_score: 720,
      projected_payment: 120,
      affordability_ratio: 0.2,
      status: "pending_review",
      reviewed_at: null,
      created_at: NOW,
      updated_at: NOW,
    }],
    loan_products: [{
      id: PRODUCT_ID,
      public_key: PRODUCT_KEY,
      name: "Growth Credit",
      borrower_type: "business",
      status: "active",
      currency_code: "ECO",
      minimum_amount: 100,
      maximum_amount: 5000,
      annual_rate: 0.08,
      origination_fee_rate: 0.01,
      term_cycles: 12,
      payment_frequency_cycles: 1,
      minimum_credit_score: 600,
      maximum_payment_to_income: 0.35,
      delinquency_grace_days: 7,
      default_after_days: 30,
      disclosure_text:
        "Authoritative lending disclosure for the configured credit facility.",
      created_at: NOW,
      updated_at: NOW,
    }],
    business_entities: [{
      id: BUSINESS_ID,
      public_key: BUSINESS_KEY,
      legal_name: "Atlas Works",
      status: "active",
    }],
    players: [{
      id: PLAYER_ID,
      display_name: "Avery",
      player_identifier: "PLY-1001",
      roster_label: "A-01",
      status: "active",
    }],
  });
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/economy/loans`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/economy/loans",
  });
  assertEquals(result.status, 200);
  const snapshot = (result.body as { data: Record<string, any> }).data;
  assertEquals(snapshot.summary.openLoanCount, 1);
  assertEquals(snapshot.summary.pendingApplicationCount, 1);
  assertEquals(snapshot.loans[0].id, LOAN_KEY);
  assertEquals(snapshot.loans[0].borrower.playerIdentifier, "PLY-1001");
  assertEquals(snapshot.loans[0].business.id, BUSINESS_KEY);
  assertEquals(snapshot.loans[0].product.id, PRODUCT_KEY);
  assertEquals(snapshot.payments[0].id, PAYMENT_KEY);
  const serialized = JSON.stringify(snapshot);
  for (
    const internalId of [
      PLAYER_ID,
      LOAN_ID,
      PRODUCT_ID,
      APPLICATION_ID,
      BUSINESS_ID,
      PAYMENT_ID,
    ]
  ) {
    assert(
      !serialized.includes(internalId),
      `Loans snapshot leaked internal UUID ${internalId}`,
    );
  }
  for (
    const forbidden of [
      "ledger_entry_id",
      "request_hash",
      "idempotency_key",
      "repayment_source",
    ]
  ) {
    assert(
      !serialized.includes(forbidden),
      `Loans snapshot leaked internal field ${forbidden}`,
    );
  }
});

Deno.test("Admin loan application read projects public evidence without internal UUIDs", async () => {
  const mock = service({
    loan_applications: [{
      public_key: APP_KEY,
      player_id: PLAYER_ID,
      business_id: BUSINESS_ID,
      loan_product_id: PRODUCT_ID,
      amount: 1000,
      purpose: "Working capital",
      repayment_source: "Internal-only evidence",
      credit_score: 720,
      projected_payment: 120,
      affordability_ratio: 0.2,
      status: "pending_review",
      reviewed_at: null,
      review_reason: null,
      created_at: NOW,
    }],
  });
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/loan-applications`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/loan-applications",
  });
  assertEquals(result.status, 200);
  const applications =
    (result.body as { data: { applications: unknown[] } }).data.applications;
  assertEquals(
    (applications[0] as Record<string, unknown>).public_key,
    APP_KEY,
  );
  const serialized = JSON.stringify(applications);
  for (
    const forbidden of [
      PLAYER_ID,
      BUSINESS_ID,
      PRODUCT_ID,
      "player_id",
      "business_id",
      "loan_product_id",
      "repayment_source",
      "Internal-only evidence",
    ]
  ) {
    assert(
      !serialized.includes(forbidden),
      `Loan application read leaked ${forbidden}`,
    );
  }
  const selection =
    mock.selects.find((entry) => entry.table === "loan_applications")
      ?.columns ?? "";
  for (
    const forbiddenColumn of [
      "player_id",
      "business_id",
      "loan_product_id",
      "repayment_source",
    ]
  ) {
    assert(
      !selection.split(",").includes(forbiddenColumn),
      `Loan application read selected ${forbiddenColumn}`,
    );
  }
});
