import { SupabaseStoryEffectLedgerWriter } from "./supabaseStoryEffectLedgerWriter.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story effect ledger writer uses atomic replay-safe Story cash RPC", async () => {
  const client = new FakeRpcClient();
  const writer = new SupabaseStoryEffectLedgerWriter(client);

  const result = await writer.recordCashAdjustment(cashInput({
    effectType: "cash_credit",
    amount: 150,
    signedAmount: 150,
  }));

  assertEquals(result, { id: "ledger-1" });
  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0]?.functionName, "apply_story_cash_adjustment_v1");
  assertEquals(client.calls[0]?.args, {
    p_game_session_id: "game-1",
    p_player_id: "player-1",
    p_storyline_event_id: "event-1",
    p_effect_type: "cash_credit",
    p_amount: 150,
    p_signed_amount: 150,
    p_label: "Emergency subsidy",
    p_reason: "Player received emergency support.",
    p_payload: { source: "test" },
    p_idempotency_key: "story:event-1:player-1:0:ledger",
  });
});

Deno.test("story effect ledger writer preserves signed cash debit", async () => {
  const client = new FakeRpcClient();
  const writer = new SupabaseStoryEffectLedgerWriter(client);

  const result = await writer.recordCashAdjustment(cashInput({
    effectType: "cash_debit",
    amount: 75,
    signedAmount: -75,
  }));

  assertEquals(result, { id: "ledger-1" });
  assertEquals(client.calls[0]?.args?.p_signed_amount, -75);
  assertEquals(client.calls[0]?.args?.p_effect_type, "cash_debit");
});

Deno.test("story effect ledger writer accepts replayed atomic result", async () => {
  const client = new FakeRpcClient("replayed");
  const writer = new SupabaseStoryEffectLedgerWriter(client);

  assertEquals(await writer.recordCashAdjustment(cashInput({})), {
    id: "ledger-1",
  });
});

Deno.test("story effect ledger writer reports RPC failures", async () => {
  const client = new FakeRpcClient("fail");
  const writer = new SupabaseStoryEffectLedgerWriter(client);

  try {
    await writer.recordCashAdjustment(cashInput({}));
    throw new Error("Expected ledger failure.");
  } catch (error) {
    assertEquals(
      error instanceof Error ? error.message : String(error),
      "ledger unavailable",
    );
  }
});

Deno.test("story effect ledger writer rejects malformed RPC row", async () => {
  const client = new FakeRpcClient("empty");
  const writer = new SupabaseStoryEffectLedgerWriter(client);

  try {
    await writer.recordCashAdjustment(cashInput({}));
    throw new Error("Expected missing row failure.");
  } catch (error) {
    assertEquals(
      error instanceof Error ? error.message : String(error),
      "Storyline cash adjustment returned no ledger entry.",
    );
  }
});

type StoryEffectType = "cash_credit" | "cash_debit";
type FakeMode = "ok" | "replayed" | "fail" | "empty";

class FakeRpcClient {
  readonly calls: {
    readonly functionName: string;
    readonly args: Record<string, unknown>;
  }[] = [];

  constructor(private readonly mode: FakeMode = "ok") {}

  rpc<Data = unknown>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{
    readonly data: Data | null;
    readonly error: { readonly message: string } | null;
  }> {
    this.calls.push({ functionName, args: args ?? {} });

    if (this.mode === "fail") {
      return Promise.resolve({
        data: null,
        error: { message: "ledger unavailable" },
      });
    }

    if (this.mode === "empty") {
      return Promise.resolve({
        data: [] as Data,
        error: null,
      });
    }

    return Promise.resolve({
      data: [{
        adjustment_outcome: this.mode === "replayed" ? "replayed" : "applied",
        adjustment_id: "adjustment-1",
        ledger_entry_id: "ledger-1",
        currency_code: "NRC",
        balance: "1150",
      }] as Data,
      error: null,
    });
  }
}

function cashInput(
  overrides: Partial<{
    effectType: StoryEffectType;
    amount: number;
    signedAmount: number;
  }>,
): {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly storylineEventId: string;
  readonly effectType: StoryEffectType;
  readonly amount: number;
  readonly signedAmount: number;
  readonly label: string;
  readonly reason: string;
  readonly payload: { readonly source: string };
  readonly idempotencyKey: string;
} {
  const effectType = overrides.effectType ?? "cash_credit";

  return {
    gameSessionId: "game-1",
    playerId: "player-1",
    storylineEventId: "event-1",
    effectType,
    amount: overrides.amount ?? 150,
    signedAmount: overrides.signedAmount ?? 150,
    label: "Emergency subsidy",
    reason: "Player received emergency support.",
    payload: { source: "test" },
    idempotencyKey: "story:event-1:player-1:0:ledger",
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed. Actual: ${actualJson} Expected: ${expectedJson}`,
    );
  }
}
