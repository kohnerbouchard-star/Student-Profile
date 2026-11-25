import type { PlayerRequestApplicationContext } from "../../players/index.ts";
import { handlePlayerBankingFxRequest } from "./playerBankingFxHttpHandler.ts";
import { readPlayerBankingFxRoutePath } from "./playerBankingFxRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const ACCOUNT = `bac_${"a".repeat(32)}`;
const FIXING = `fxf_${"f".repeat(32)}`;
const CONTEXT = {
  gameSessionId: GAME,
  actor: { kind: "player", playerUuid: PLAYER },
} as PlayerRequestApplicationContext;

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}

for (
  const [label, amounts, expected] of [
    ["complete", { posted_amount: "15.34", held_amount: "3", available_amount: "12.34" }, [15.34, 3, 12.34]],
    ["fully held", { posted_amount: "15.34", held_amount: "15.34", available_amount: "0" }, [15.34, 15.34, 0]],
    ["known hold without availability", { posted_amount: "15.34", activeHolds: "3" }, [15.34, 3, 12.34]],
    ["posted only", { balance: "15.34" }, null],
    ["explicit availability without hold", { posted_amount: "15.34", available_amount: "15.34" }, null],
    ["blank hold", { posted_amount: "15.34", held_amount: " " }, null],
    ["negative hold", { posted_amount: "15.34", held_amount: "-3" }, null],
    ["malformed availability", { posted_amount: "15.34", held_amount: "3", available_amount: "0xC" }, null],
  ] as const
) {
  Deno.test(`Player Banking FX actual overview read requires hold evidence: ${label}`, async () => {
    const rpcValues: Record<string, unknown> = {
      get_player_banking_fx_overview_v1: {
        fixing: {
          fixing_key: FIXING,
          effective_at: "2026-08-26T00:00:00.000Z",
          calculated_at: "2026-08-26T00:00:01.000Z",
          next_fixing_at: "2026-08-27T00:00:00.000Z",
          overdue: false,
          policy_version: "fixture",
        },
        currencies: [{ currency_code: "ECO", minor_unit: 2 }],
      },
      list_player_bank_accounts_v1: [{
        account_key: ACCOUNT,
        account_kind: "checking",
        currency_code: "ECO",
        ...amounts,
      }],
    };
    const calls: Array<[string, unknown]> = [];
    const client = {
      rpc(name: string, args: unknown) {
        calls.push([name, args]);
        if (!Object.hasOwn(rpcValues, name)) throw new Error("Unexpected fixture RPC");
        return Promise.resolve({ data: rpcValues[name], error: null });
      },
    };
    const path = "/players/me/banking/fx";
    const route = readPlayerBankingFxRoutePath(path);
    if (!route) throw new Error("Missing fixture route");
    const response = await handlePlayerBankingFxRequest(
      new Request(`https://fixture.invalid${path}`),
      route,
      {
        createServiceClient: () => client as never,
        readEnvironment: () => ({
          ok: true as const,
          value: {
            supabaseUrl: "https://example.test",
            supabaseAnonKey: "fixture",
            supabaseServiceRoleKey: "fixture",
          },
        }),
      },
      CONTEXT,
    );
    const scope = { p_game_session_id: GAME, p_player_id: PLAYER };
    assertEquals(calls, [
      ["get_player_banking_fx_overview_v1", scope],
      ["list_player_bank_accounts_v1", scope],
    ]);
    const body = await response.json();
    if (expected === null) {
      assertEquals(response.status, 503);
      assertEquals(body.error.code, "player_banking_fx_result_invalid");
      assertEquals(body.error.retryable, true);
      assertEquals(Object.hasOwn(body, "balances"), false);
    } else {
      assertEquals(response.status, 200);
      assertEquals(body.accounts[0], body.balances[0]);
      const row = body.accounts[0];
      assertEquals([row.postedAmount, row.heldAmount, row.availableAmount], expected);
    }
  });
}
