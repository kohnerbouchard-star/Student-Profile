import { handleBusinessBankingAdminOperation } from "./businessBankingOperations.ts";
import {
  APP_KEY,
  assertEquals,
  BUSINESS_KEY,
  GAME_ID,
  LOAN_KEY,
  PLAYER_ID,
  request,
  service,
  STAFF_ID,
} from "./businessBankingTestSupport.ts";

Deno.test("Admin loan review supports the economy-scoped V2 route", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request(
      "POST",
      `/games/${GAME_ID}/economy/loan-applications/${APP_KEY}/review`,
      {
        decision: "approve",
        reason: "Verified economic eligibility",
        idempotencyKey: "loan-review-0001",
      },
    ),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/economy/loan-applications/${APP_KEY}/review`,
  });
  assertEquals(result.status, 200);
  assertEquals(mock.calls[0], {
    functionName: "review_player_loan_application_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_application_key: APP_KEY,
      p_decision: "approve",
      p_reason: "Verified economic eligibility",
      p_idempotency_key: "loan-review-0001",
    },
  });
});

Deno.test("Admin correction rejects invalid replay keys before persistence", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("POST", `/games/${GAME_ID}/business-banking/corrections`, {
      playerId: PLAYER_ID,
      accountType: "cash",
      currencyCode: "LUM",
      amount: 10,
      targetType: "business",
      targetPublicKey: BUSINESS_KEY,
      reason: "Correct duplicated settlement entry",
      idempotencyKey: "short",
    }),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/business-banking/corrections",
  });
  assertEquals(result.handled, true);
  assertEquals(result.status, 400);
  assertEquals(mock.calls.length, 0);
});

Deno.test("Admin Business handler leaves unrelated routes untouched", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/players`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/players",
  });
  assertEquals(result, { handled: false });
});

Deno.test("Loan recovery aliases keep server scope and one authoritative RPC", async () => {
  for (const prefix of ["", "/economy"]) {
    const mock = service();
    const suffix = `${prefix}/loans/${LOAN_KEY}/restructure`;
    const result = await handleBusinessBankingAdminOperation(mock, {
      request: request("POST", `/games/${GAME_ID}${suffix}`, {
        scheduledPayment: 12.345,
        nextDueAt: "2026-11-01T00:00:00.000Z",
        reason: "Reviewed recovery plan",
        idempotencyKey: "recovery-fixture-01",
        gameId: "spoof",
        staffUserId: "spoof",
      }),
      gameId: GAME_ID,
      staffUserId: STAFF_ID,
      suffix,
    });
    assertEquals(result.status, 200);
    assertEquals(mock.calls, [{
      functionName: "restructure_player_loan_v1",
      args: {
        p_game_session_id: GAME_ID,
        p_staff_user_id: STAFF_ID,
        p_loan_key: LOAN_KEY,
        p_scheduled_payment: 12.35,
        p_next_due_at: "2026-11-01T00:00:00.000Z",
        p_reason: "Reviewed recovery plan",
        p_idempotency_key: "recovery-fixture-01",
      },
    }]);
  }
});

Deno.test("Loan review validates decision before replay key without sending an RPC", async () => {
  for (const decision of ["invalid", "approve"]) {
    const mock = service();
    const suffix = `/loan-applications/${APP_KEY}/review`;
    const result = await handleBusinessBankingAdminOperation(mock, {
      request: request("POST", suffix, {
        decision,
        reason: "Reviewed",
        idempotencyKey: "x",
      }),
      gameId: GAME_ID,
      staffUserId: STAFF_ID,
      suffix,
    });
    assertEquals(result.status, 400);
    assertEquals(mock.calls, []);
    assertEquals(
      (result.body as { code: string }).code,
      decision === "invalid" ? "invalid_enum_field" : "invalid_idempotency_key",
    );
  }
});
