import { SupabaseContractRepository } from "./supabaseContractRepository.ts";
import {
  assertEquals,
  baseTables,
  FakeClient,
  gameSessionContractRow,
  playerContractProgressRow,
} from "./supabaseContractRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("contract repository lists public active contracts available to player", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "public-active",
        visibility: "public",
        status: "active",
      }),
      gameSessionContractRow({
        id: "targeted-player",
        visibility: "targeted",
        status: "active",
        targeting_payload: {
          playerIds: ["player-1"],
        },
      }),
      gameSessionContractRow({
        id: "targeted-country",
        visibility: "targeted",
        status: "active",
        targeting_payload: {
          countryCodes: ["AURORA"],
        },
      }),
      gameSessionContractRow({
        id: "targeted-roster",
        visibility: "targeted",
        status: "active",
        targeting_payload: {
          rosterLabels: ["period-1"],
        },
      }),
      gameSessionContractRow({
        id: "targeted-other",
        visibility: "targeted",
        status: "active",
        targeting_payload: {
          playerIds: ["player-2"],
        },
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const contracts = await repository.listPlayerAvailableContracts({
    gameSessionId: "game-1",
    playerId: "player-1",
    countryCode: "AURORA",
    rosterLabel: "period-1",
  });

  assertEquals(contracts.map((contract) => contract.id), [
    "public-active",
    "targeted-player",
    "targeted-country",
    "targeted-roster",
  ]);
});

Deno.test("contract repository excludes hidden draft paused and archived player contracts", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "public-active",
        visibility: "public",
        status: "active",
      }),
      gameSessionContractRow({
        id: "hidden-active",
        visibility: "hidden",
        status: "active",
      }),
      gameSessionContractRow({
        id: "public-draft",
        visibility: "public",
        status: "draft",
      }),
      gameSessionContractRow({
        id: "public-paused",
        visibility: "public",
        status: "paused",
      }),
      gameSessionContractRow({
        id: "public-archived",
        visibility: "public",
        status: "archived",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const contracts = await repository.listPlayerAvailableContracts({
    gameSessionId: "game-1",
    playerId: "player-1",
  });

  assertEquals(contracts.map((contract) => contract.id), ["public-active"]);
});

Deno.test("contract repository gets player progress row and null", async () => {
  const client = new FakeClient(baseTables({
    player_contract_progress: [
      playerContractProgressRow({
        contract_id: "contract-1",
        player_id: "player-1",
        status: "submitted",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const progress = await repository.getPlayerContractProgress({
    gameSessionId: "game-1",
    contractId: "contract-1",
    playerId: "player-1",
  });
  const missing = await repository.getPlayerContractProgress({
    gameSessionId: "game-1",
    contractId: "contract-2",
    playerId: "player-1",
  });

  assertEquals(progress?.status, "submitted");
  assertEquals(missing, null);
});

Deno.test("contract repository upserts player progress idempotently", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseContractRepository(client as never);

  const created = await repository.upsertPlayerContractProgress({
    gameSessionId: "game-1",
    contractId: "contract-1",
    playerId: "player-1",
    status: "in_progress",
    evidencePayload: {
      note: "Started.",
    },
  });
  const updated = await repository.upsertPlayerContractProgress({
    gameSessionId: "game-1",
    contractId: "contract-1",
    playerId: "player-1",
    status: "submitted",
    evidencePayload: {
      note: "Submitted memo.",
    },
    submittedAt: "2026-06-25T12:30:00.000Z",
  });
  const completed = await repository.upsertPlayerContractProgress({
    gameSessionId: "game-1",
    contractId: "contract-1",
    playerId: "player-1",
    status: "completed",
    resultPayload: {
      decision: "approved",
    },
    completedAt: "2026-06-25T12:45:00.000Z",
  });

  assertEquals(created.id, "player_contract_progress-1");
  assertEquals(updated.id, "player_contract_progress-1");
  assertEquals(completed.id, "player_contract_progress-1");
  assertEquals(completed.status, "completed");
  assertEquals(completed.evidencePayload, { note: "Submitted memo." });
  assertEquals(completed.resultPayload, { decision: "approved" });
  assertEquals(client.tables.player_contract_progress.length, 1);
});

Deno.test("contract repository lists player progress by player game and status", async () => {
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
        contract_id: "contract-2",
        player_id: "player-1",
        status: "completed",
      }),
      playerContractProgressRow({
        id: "progress-other-player",
        game_session_id: "game-1",
        contract_id: "contract-3",
        player_id: "player-2",
        status: "submitted",
      }),
      playerContractProgressRow({
        id: "progress-other-game",
        game_session_id: "game-2",
        contract_id: "contract-4",
        player_id: "player-1",
        status: "submitted",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const rows = await repository.listPlayerContractProgress({
    gameSessionId: "game-1",
    playerId: "player-1",
    statuses: ["submitted"],
  });

  assertEquals(rows.map((row) => row.id), ["progress-submitted"]);
});
