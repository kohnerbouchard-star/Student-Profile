import { handleBusinessBankingAdminOperation } from "./businessBankingOperations.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000000-0000-4000-8000-000000000002";
const APP_KEY = `lna_${"a".repeat(32)}`;

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function service() {
  const calls: Array<{ functionName: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: unknown) {
              return {
                order(orderColumn: string, options: unknown) {
                  return Promise.resolve({
                    data: [{ table, columns, column, value, orderColumn, options }],
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
    rpc(functionName: string, args: Record<string, unknown>) {
      calls.push({ functionName, args });
      return Promise.resolve({ data: [{ outcome: "applied" }], error: null });
    },
  };
}

Deno.test("Admin Business read is game scoped", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/businesses`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/businesses",
  });
  assertEquals(result.handled, true);
  assertEquals(result.status, 200);
  const businesses = (result.body as { data: { businesses: unknown[] } }).data.businesses;
  assertEquals((businesses[0] as Record<string, unknown>).value, GAME_ID);
});

Deno.test("Admin loan review publishes staff and game scope with an idempotency key", async () => {
  const mock = service();
  const result = await handleBusinessBankingAdminOperation(mock, {
    request: request("POST", `/games/${GAME_ID}/loan-applications/${APP_KEY}/review`, {
      decision: "approve",
      reason: "Verified economic eligibility",
      idempotencyKey: "loan-review-0001",
    }),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/loan-applications/${APP_KEY}/review`,
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
      playerId: "00000000-0000-4000-8000-000000000003",
      accountType: "cash",
      currencyCode: "LUM",
      amount: 10,
      targetType: "business",
      targetPublicKey: `biz_${"b".repeat(32)}`,
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
