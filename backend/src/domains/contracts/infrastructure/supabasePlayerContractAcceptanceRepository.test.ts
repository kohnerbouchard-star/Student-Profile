import {
  PlayerContractAcceptancePersistenceError,
} from "../contracts/playerContractAcceptanceContracts.ts";
import { SupabasePlayerContractAcceptanceRepository } from "./supabasePlayerContractAcceptanceRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const CONTRACT_KEY = "arrival-orientation";
const ACCEPTED_AT = "2026-07-18T11:20:00.000Z";

Deno.test("acceptance repository calls the scoped public-key rpc", async () => {
  let captured: Record<string, unknown> | null = null;
  const repository = new SupabasePlayerContractAcceptanceRepository({
    rpc: (_name, args) => {
      captured = args;
      return Promise.resolve({
        data: [{
          accept_outcome: "accepted",
          contract_key: CONTRACT_KEY,
          progress_status: "in_progress",
          accepted_at: ACCEPTED_AT,
        }],
        error: null,
      });
    },
  });

  const result = await repository.acceptContract({
    gameId: GAME,
    playerUuid: PLAYER,
    contractKey: CONTRACT_KEY,
  });

  assertEquals(captured, {
    p_game_session_id: GAME,
    p_player_id: PLAYER,
    p_contract_key: CONTRACT_KEY,
  });
  assertEquals(result, {
    outcome: "accepted",
    contractKey: CONTRACT_KEY,
    progressStatus: "in_progress",
    acceptedAt: ACCEPTED_AT,
  });
});

Deno.test("acceptance repository preserves idempotent and unavailable outcomes", async () => {
  const alreadyAccepted = new SupabasePlayerContractAcceptanceRepository(
    client([{
      accept_outcome: "already_accepted",
      contract_key: CONTRACT_KEY,
      progress_status: "in_progress",
      accepted_at: ACCEPTED_AT,
    }]),
  );
  assertEquals(
    await alreadyAccepted.acceptContract({
      gameId: GAME,
      playerUuid: PLAYER,
      contractKey: CONTRACT_KEY,
    }),
    {
      outcome: "already_accepted",
      contractKey: CONTRACT_KEY,
      progressStatus: "in_progress",
      acceptedAt: ACCEPTED_AT,
    },
  );

  const unavailable = new SupabasePlayerContractAcceptanceRepository(client([{
    accept_outcome: "not_available",
    contract_key: CONTRACT_KEY,
    progress_status: null,
    accepted_at: null,
  }]));
  assertEquals(
    await unavailable.acceptContract({
      gameId: GAME,
      playerUuid: PLAYER,
      contractKey: CONTRACT_KEY,
    }),
    {
      outcome: "not_available",
      contractKey: CONTRACT_KEY,
      progressStatus: null,
      acceptedAt: null,
    },
  );
});

Deno.test("acceptance repository fails closed on schema and result errors", async () => {
  const missing = new SupabasePlayerContractAcceptanceRepository({
    rpc: () => Promise.resolve({
      data: null,
      error: { code: "42883", message: "function does not exist" },
    }),
  });
  await assertRejects(
    () => missing.acceptContract({
      gameId: GAME,
      playerUuid: PLAYER,
      contractKey: CONTRACT_KEY,
    }),
    "player_contract_acceptance_schema_not_applied",
  );

  const invalid = new SupabasePlayerContractAcceptanceRepository(client([{
    accept_outcome: "accepted",
    contract_key: "different-key",
    progress_status: "in_progress",
    accepted_at: ACCEPTED_AT,
  }]));
  await assertRejects(
    () => invalid.acceptContract({
      gameId: GAME,
      playerUuid: PLAYER,
      contractKey: CONTRACT_KEY,
    }),
    "player_contract_acceptance_invalid_result",
  );
});

function client(rows: readonly Record<string, unknown>[]) {
  return {
    rpc: () => Promise.resolve({ data: rows, error: null }),
  };
}

async function assertRejects(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (
      error instanceof PlayerContractAcceptancePersistenceError &&
      error.code === code
    ) return;
    throw error;
  }
  throw new Error(`Expected rejection: ${code}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
