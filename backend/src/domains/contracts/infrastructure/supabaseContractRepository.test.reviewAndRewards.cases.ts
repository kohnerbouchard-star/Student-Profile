import {
  ContractRepositoryError,
  type ReviewPlayerContractProgressInput,
} from "../contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "./supabaseContractRepository.ts";
import {
  assertEquals,
  assertRejects,
  baseTables,
  FakeClient,
  playerContractProgressRow,
} from "./supabaseContractRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("contract repository lists contract progress for staff scoped by contract and filters", async () => {
  const client = new FakeClient(baseTables({
    player_contract_progress: [
      playerContractProgressRow({
        id: "progress-submitted",
        game_session_id: "game-1",
        contract_id: "contract-1",
        player_id: "player-1",
        status: "submitted",
      }),
      playerContractProgressRow({
        id: "progress-completed",
        game_session_id: "game-1",
        contract_id: "contract-1",
        player_id: "player-2",
        status: "completed",
      }),
      playerContractProgressRow({
        id: "progress-other-contract",
        game_session_id: "game-1",
        contract_id: "contract-2",
        player_id: "player-1",
        status: "submitted",
      }),
      playerContractProgressRow({
        id: "progress-other-game",
        game_session_id: "game-2",
        contract_id: "contract-1",
        player_id: "player-1",
        status: "submitted",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const rows = await repository.listContractProgressForStaff({
    gameSessionId: "game-1",
    contractId: "contract-1",
    statuses: ["submitted"],
    playerId: "player-1",
  });

  assertEquals(rows.map((row) => row.id), ["progress-submitted"]);
});

Deno.test("contract repository gets contract progress by scoped progress id", async () => {
  const client = new FakeClient(baseTables({
    player_contract_progress: [
      playerContractProgressRow({
        id: "progress-1",
        game_session_id: "game-1",
        contract_id: "contract-1",
      }),
      playerContractProgressRow({
        id: "progress-1",
        game_session_id: "game-2",
        contract_id: "contract-1",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const row = await repository.getContractProgressById({
    gameSessionId: "game-1",
    contractId: "contract-1",
    progressId: "progress-1",
  });
  const missing = await repository.getContractProgressById({
    gameSessionId: "game-1",
    contractId: "contract-2",
    progressId: "progress-1",
  });

  assertEquals(row?.gameSessionId, "game-1");
  assertEquals(missing, null);
});

Deno.test("contract repository reviews progress scoped by game contract and progress", async () => {
  const client = new FakeClient(baseTables({
    player_contract_progress: [
      playerContractProgressRow({
        id: "progress-1",
        game_session_id: "game-1",
        contract_id: "contract-1",
        status: "submitted",
      }),
      playerContractProgressRow({
        id: "progress-1",
        game_session_id: "game-2",
        contract_id: "contract-1",
        status: "submitted",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);
  const input: ReviewPlayerContractProgressInput = {
    gameSessionId: "game-1",
    contractId: "contract-1",
    progressId: "progress-1",
    status: "completed",
    resultPayload: {
      decision: "approved",
    },
    completedAt: "2026-06-25T12:30:00.000Z",
  };

  const updated = await repository.reviewPlayerContractProgress(input);

  assertEquals(updated?.status, "completed");
  assertEquals(updated?.resultPayload, { decision: "approved" });
  assertEquals(updated?.completedAt, "2026-06-25T12:30:00.000Z");
  assertEquals(
    client.tables.player_contract_progress.find((row) =>
      row.game_session_id === "game-2"
    )?.status,
    "submitted",
  );
});

Deno.test("contract repository marks rewards issued only once", async () => {
  const client = new FakeClient(baseTables({
    player_contract_progress: [
      playerContractProgressRow({
        id: "progress-1",
        status: "completed",
        reward_issued_at: null,
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const marked = await repository.markContractRewardIssued({
    gameSessionId: "game-1",
    contractId: "contract-1",
    progressId: "progress-1",
    rewardIssuedAt: "2026-06-25T12:30:00.000Z",
  });
  const repeated = await repository.markContractRewardIssued({
    gameSessionId: "game-1",
    contractId: "contract-1",
    progressId: "progress-1",
    rewardIssuedAt: "2026-06-25T12:31:00.000Z",
  });

  assertEquals(marked?.rewardIssuedAt, "2026-06-25T12:30:00.000Z");
  assertEquals(repeated, null);
  assertEquals(
    client.tables.player_contract_progress[0]?.reward_issued_at,
    "2026-06-25T12:30:00.000Z",
  );
});

Deno.test("contract repository handles persistence errors deterministically", async () => {
  const client = new FakeClient(baseTables(), {
    "game_session_contracts:select": {
      message: "database unavailable",
    },
  });
  const repository = new SupabaseContractRepository(client as never);

  const error = await assertRejects(
    () => repository.listGameSessionContracts({ gameSessionId: "game-1" }),
    ContractRepositoryError,
  );

  assertEquals(error.code, "contract_repository_query_failed");
  assertEquals(error.tableName, "game_session_contracts");
  assertEquals(error.operation, "select");
});
