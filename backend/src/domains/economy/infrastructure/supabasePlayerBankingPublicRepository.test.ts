import { SupabasePlayerBankingPublicRepository } from "./supabasePlayerBankingPublicRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("public Banking repository reads account identities and hold-aware balances without exposing UUIDs", async () => {
  const client = new FakeClient();
  const repository = new SupabasePlayerBankingPublicRepository(client as never);
  const page = await repository.readPage({
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    playerId: "00000000-0000-4000-8000-000000000002",
    limit: 2,
    offset: 4,
  });

  assertEquals(client.rpcCalls, [{
    command: "list_player_bank_accounts_v1",
    args: {
      p_game_session_id: "00000000-0000-4000-8000-000000000001",
      p_player_id: "00000000-0000-4000-8000-000000000002",
    },
  }, {
    command: "list_player_bank_activity_v1",
    args: {
      p_game_session_id: "00000000-0000-4000-8000-000000000001",
      p_player_id: "00000000-0000-4000-8000-000000000002",
      p_limit: 2,
      p_offset: 4,
    },
  }]);
  assertEquals(page.entries.length, 2);
  assertEquals(page.hasMore, true);
  assertEquals(page.balances, [
    account(
      "bac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "checking",
      "ECO",
      1250,
      200,
    ),
    account("bac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "checking", "THD", 30, 5),
    account("bac_cccccccccccccccccccccccccccccccc", "savings", "THD", 100, 0),
  ]);
  assertEquals(page.entries.map((entry) => entry.accountType), [
    "checking",
    "checking",
  ]);
  const serialized = JSON.stringify(page);
  assertEquals(serialized.includes("00000000-0000-4000-8000"), false);
  assertEquals(serialized.includes("sourceId"), false);
  assertEquals(serialized.includes('"cash"'), false);
});

class FakeClient {
  readonly rpcCalls: { command: string; args: unknown }[] = [];

  rpc(command: string, args: unknown) {
    this.rpcCalls.push({ command, args });
    return Promise.resolve({
      data: command === "list_player_bank_activity_v1"
        ? [
          ledger("25", "ECO", "2026-07-19T04:00:00.000Z"),
          ledger("-4", "LUM", "2026-07-19T03:59:00.000Z"),
          ledger("1", "ECO", "2026-07-19T03:58:00.000Z"),
        ]
        : [
          bankAccount(
            "bac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "checking",
            "ECO",
            "1250",
            "200",
            "1050",
          ),
          bankAccount(
            "bac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "checking",
            "THD",
            "30",
            "5",
            "25",
          ),
          bankAccount(
            "bac_cccccccccccccccccccccccccccccccc",
            "savings",
            "THD",
            "100",
            "0",
            "100",
          ),
        ],
      error: null,
    });
  }
}

function bankAccount(
  accountKey: string,
  accountKind: string,
  currencyCode: string,
  postedAmount: string,
  heldAmount: string,
  availableAmount: string,
) {
  return {
    account_key: accountKey,
    account_kind: accountKind,
    currency_code: currencyCode,
    posted_amount: postedAmount,
    held_amount: heldAmount,
    available_amount: availableAmount,
  };
}

function account(
  accountKey: string,
  accountKind: string,
  currencyCode: string,
  postedAmount: number,
  heldAmount: number,
) {
  return {
    accountKey,
    accountKind,
    accountType: accountKind,
    balance: postedAmount,
    currencyCode,
    postedAmount,
    heldAmount,
    availableAmount: postedAmount - heldAmount,
  };
}

function ledger(amount: string, currencyCode: string, createdAt: string) {
  return {
    account_type: "checking",
    amount,
    currency_code: currencyCode,
    entry_type: Number(amount) < 0 ? "debit" : "credit",
    source_domain: "economy",
    source_action: "adjustment",
    created_at: createdAt,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
