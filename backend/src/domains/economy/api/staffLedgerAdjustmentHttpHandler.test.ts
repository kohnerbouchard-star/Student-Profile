import { handleStaffLedgerAdjustmentRequest } from "./staffLedgerAdjustmentHttpHandler.ts";
declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000011";
const STAFF = "00000000-0000-4000-8000-000000000021";
function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
// Exercise the retained HTTP boundary before and after the REF-022 extraction.
async function adjustmentFixture(
  options: {
    denied?: boolean;
    absent?: string;
    inactive?: boolean;
    failure?: string;
    rpcError?: string;
    malformed?: boolean;
  },
  run: (f: any) => Promise<void>,
) {
  const runtime = (globalThis as any).Deno, saved = runtime.env.get;
  runtime.env.get = (key: string) =>
    ({
      SUPABASE_URL: "https://ref022.invalid",
      SUPABASE_ANON_KEY: "fixture-anon",
      SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
    } as Record<string, string>)[key];
  const calls: any[] = [], reads: any[] = [];
  const client = {
    from(table: string) {
      const filters: any[] = [];
      reads.push({ table, filters });
      const query = {
        select(columns: string) {
          Object.assign(reads.at(-1), { columns });
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        async maybeSingle() {
          const data = options.absent === table
            ? null
            : table === "game_sessions"
            ? { id: GAME, status: "active", owner_staff_user_id: STAFF }
            : {
              id: PLAYER,
              display_name: "Fixture",
              roster_label: null,
              status: options.inactive ? "archived" : "active",
            };
          return {
            data,
            error: options.failure === table
              ? { message: "private database detail" }
              : null,
          };
        },
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return {
        data: options.malformed ? [] : [{
          outcome: "applied",
          ledger_entry_id: "entry",
          account_balance_id: "balance",
          account_type: args.p_account_type,
          balance: "112.3400",
          currency_code: args.p_currency_code,
          created_at: "2026-10-01T00:00:00Z",
        }],
        error: options.rpcError ? { message: options.rpcError } : null,
      };
    },
  };
  const send = (
    patch: Record<string, unknown> = {},
    key = "fixture-key",
    method = "POST",
    header = "x-idempotency-key",
  ) =>
    handleStaffLedgerAdjustmentRequest(
      new Request("https://ref022.invalid/ledger", {
        method,
        headers: { [header]: key },
        ...(method === "POST"
          ? {
            body: JSON.stringify({
              amount: 12.34,
              reason: "Correction",
              currencyCode: "eco",
              ...patch,
            }),
          }
          : {}),
      }),
      GAME,
      PLAYER,
      {
        resolveStaffForRequest: async () =>
          options.denied
            ? {
              ok: false as const,
              status: 403,
              error: {
                code: "staff_forbidden",
                message: "Forbidden",
                retryable: false,
              },
            }
            : {
              ok: true as const,
              staff: { id: STAFF },
              serviceClient: client as never,
            },
      },
    );
  try {
    await run({ send, calls, reads });
  } finally {
    runtime.env.get = saved;
  }
}
for (
  const [amount, expected] of [[12.34, 12.34], [-2.55, -2.55], [1.005, 1], [
    0.001,
    0,
  ]]
) {
  Deno.test(`REF022 preserves rounding and atomic command for ${amount}`, () =>
    adjustmentFixture({}, async (f) => {
      const response = await f.send({ amount, accountType: "cash" }),
        body = await response.json();
      assertEquals(response.status, 200);
      assertEquals(body.ledgerEntry.amount, expected);
      assertEquals(body.ledgerEntry.balance, 112.34);
      assertEquals(body.ledgerEntry.accountType, "checking");
      assertEquals(f.calls, [{
        name: "record_idempotent_staff_ledger_adjustment_v1",
        args: {
          p_game_session_id: GAME,
          p_player_id: PLAYER,
          p_staff_user_id: STAFF,
          p_route_key: "staff.players.ledger_adjustment",
          p_idempotency_key: "fixture-key",
          p_account_type: "checking",
          p_amount: expected,
          p_currency_code: "ECO",
          p_entry_type: expected > 0 ? "credit" : "debit",
          p_source_domain: "ledger",
          p_source_action: "staff_player_balance_adjustment",
          p_source_id: null,
          p_audit_metadata: {
            requestId: "fixture-key",
            reason: "Correction",
            source: "classroom_api_edge_staff_ledger_adjustment",
          },
        },
      }]);
      assertEquals(f.reads.map((r: any) => [r.table, r.filters]), [[
        "game_sessions",
        [["id", GAME], ["owner_staff_user_id", STAFF]],
      ], ["players", [["game_session_id", GAME], ["id", PLAYER]]]]);
    }));
}
for (
  const patch of [{ amount: 0 }, { amount: "invalid" }, { reason: "" }, {
    currencyCode: "",
  }, { currencyCode: "!!" }]
) {
  Deno.test(`REF022 invalid body never calls command: ${JSON.stringify(patch)}`, () =>
    adjustmentFixture({}, async (f) => {
      assertEquals((await f.send(patch)).status, 400);
      assertEquals(f.calls, []);
    }));
}
for (
  const [options, status] of [
    [{ denied: true }, 403],
    [{ absent: "game_sessions" }, 404],
    [{ absent: "players" }, 404],
    [{ inactive: true }, 409],
    [{ failure: "players" }, 500],
  ] as const
) {
  Deno.test(`REF022 denial precedes command: ${JSON.stringify(options)}`, () =>
    adjustmentFixture(options, async (f) => {
      assertEquals((await f.send()).status, status);
      assertEquals(f.calls, []);
    }));
}
for (
  const [message, status, code] of [
    ["LEDGER_IDEMPOTENCY_CONFLICT", 409, "ledger_idempotency_conflict"],
    ["LEDGER_IDEMPOTENCY_IN_PROGRESS", 409, "ledger_adjustment_in_progress"],
    ["PLAYER_NOT_FOUND", 404, "player_not_found"],
    ["INVALID_CURRENCY_CODE", 400, "invalid_ledger_adjustment"],
    ["private database detail", 500, "ledger_adjustment_failed"],
  ] as const
) {
  Deno.test(`REF022 preserves command error ${code}`, () =>
    adjustmentFixture({ rpcError: message }, async (f) => {
      const r = await f.send(), b = await r.json();
      assertEquals(r.status, status);
      assertEquals(b.error.code, code);
      assertEquals(b.error.retryable, false);
      assertEquals(f.calls.length, 1);
    }));
}
Deno.test("REF022 method/key boundaries, request-id header and malformed receipt", async () => {
  await adjustmentFixture({}, async (f) => {
    assertEquals((await f.send({}, "", "GET")).status, 405);
    assertEquals(f.reads, []);
    assertEquals((await f.send({}, "")).status, 400);
    assertEquals((await f.send({}, "x".repeat(201))).status, 400);
    assertEquals(f.calls, []);
    assertEquals(
      (await f.send({}, "request-id-key", "POST", "x-request-id")).status,
      200,
    );
    assertEquals(f.calls[0].args.p_idempotency_key, "request-id-key");
  });
  await adjustmentFixture({ malformed: true }, async (f) => {
    assertEquals((await f.send()).status, 500);
    assertEquals(f.calls.length, 1);
  });
});

for (const accountType of ["savings", "custom-account"]) Deno.test(`REF022 account ${accountType} stays command-owned and body identity is ignored`, () => adjustmentFixture({}, async f => {
  const response = await f.send({ accountType, gameSessionId: "untrusted-game", playerId: "untrusted-player", staffUserId: "untrusted-staff" });
  assertEquals(response.status, 200);
  assertEquals(f.calls[0].args.p_account_type, accountType);
  assertEquals([f.calls[0].args.p_game_session_id, f.calls[0].args.p_player_id, f.calls[0].args.p_staff_user_id], [GAME, PLAYER, STAFF]);
}));
