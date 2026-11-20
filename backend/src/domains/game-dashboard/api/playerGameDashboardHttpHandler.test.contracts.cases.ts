import { SupabasePlayerGameDashboardRepository } from "../infrastructure/supabasePlayerGameDashboardRepository.ts";
import { createDashboardStoreListingsReadQuery } from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import {
  ContractRepositoryError,
  createPlayerContractsReadQuery,
  type PlayerContractsReadInput,
} from "../../contracts/index.ts";
import {
  createStockMarketOpenStateReadRepository,
  createStockMarketReadRepository,
} from "../../stocks/index.ts";
import { handlePlayerGameDashboardRequest } from "./playerGameDashboardHttpHandler.ts";
import {
  CONTRACT_ID,
  CONTRACT_PROGRESS_ID,
  DRAFT_CONTRACT_ID,
  GAME_SESSION_ID,
  OTHER_GAME_CONTRACT_ID,
  OTHER_GAME_CONTRACT_PROGRESS_ID,
  OTHER_GAME_PLAYER_ID,
  OTHER_GAME_SESSION_ID,
  OTHER_PLAYER_CONTRACT_PROGRESS_ID,
  OTHER_PLAYER_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import {
  dependencies,
  request,
} from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import {
  gameSessionContract,
  playerContractProgress,
} from "./playerGameDashboardHttpHandler.test.rowFixtures.support.ts";
import { FakeClient } from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import { assertEquals } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player dashboard populates contracts for authenticated player only", async () => {
  const seededTables = tables();
  seededTables.game_session_contracts = [
    gameSessionContract(),
    gameSessionContract({
      id: DRAFT_CONTRACT_ID,
      contract_key: "draft_contract",
      title: "Draft Contract",
      status: "draft",
    }),
    gameSessionContract({
      id: OTHER_GAME_CONTRACT_ID,
      game_session_id: OTHER_GAME_SESSION_ID,
      contract_key: "other_game_contract",
      title: "Other Game Contract",
    }),
  ];
  seededTables.player_contract_progress = [
    playerContractProgress(),
    playerContractProgress({
      id: OTHER_PLAYER_CONTRACT_PROGRESS_ID,
      player_id: OTHER_PLAYER_ID,
    }),
    playerContractProgress({
      id: OTHER_GAME_CONTRACT_PROGRESS_ID,
      game_session_id: OTHER_GAME_SESSION_ID,
      contract_id: OTHER_GAME_CONTRACT_ID,
      player_id: OTHER_GAME_PLAYER_ID,
    }),
  ];

  const client = new FakeClient(seededTables);
  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(
    body.me.contracts.available.map((
      contract: { readonly contractId: string },
    ) => contract.contractId),
    [CONTRACT_ID],
  );
  assertEquals(body.me.contracts.available[0].title, "Market Research Brief");
  assertEquals(body.me.contracts.available[0].status, "active");

  assertEquals(
    body.me.contracts.progress.map((
      progress: { readonly progressId: string },
    ) => progress.progressId),
    [CONTRACT_PROGRESS_ID],
  );
  assertEquals(body.me.contracts.progress[0].status, "submitted");
  assertEquals(body.me.contracts.progress[0].playerId, PLAYER_ID);

  assertEquals(
    body.public.contracts.map((
      contract: { readonly contractId: string },
    ) => contract.contractId),
    [CONTRACT_ID],
  );

  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(DRAFT_CONTRACT_ID), false);
  assertEquals(serialized.includes(OTHER_GAME_CONTRACT_ID), false);
  assertEquals(serialized.includes(OTHER_PLAYER_CONTRACT_PROGRESS_ID), false);
  assertEquals(serialized.includes(OTHER_GAME_CONTRACT_PROGRESS_ID), false);
});

Deno.test("public Contracts query exposes reads and returns scoped player DTOs", async () => {
  const data = tables();
  data.game_session_contracts = [
    gameSessionContract({
      metadata: { quiz: { prompt: "Visible question", correctAnswer: "Hidden answer" } },
      requirements_payload: { quiz: { expectedAnswer: "Hidden requirement" } },
    }),
    gameSessionContract({
      id: DRAFT_CONTRACT_ID,
      visibility: "targeted",
      targeting_payload: { playerIds: [OTHER_PLAYER_ID], countryCodes: ["SOLVEND"] },
    }),
    gameSessionContract({ id: OTHER_GAME_CONTRACT_ID, game_session_id: OTHER_GAME_SESSION_ID }),
  ];
  data.player_contract_progress = [
    playerContractProgress(),
    playerContractProgress({ id: OTHER_PLAYER_CONTRACT_PROGRESS_ID, player_id: OTHER_PLAYER_ID }),
    playerContractProgress({
      id: OTHER_GAME_CONTRACT_PROGRESS_ID,
      game_session_id: OTHER_GAME_SESSION_ID,
      contract_id: OTHER_GAME_CONTRACT_ID,
      player_id: OTHER_GAME_PLAYER_ID,
    }),
  ];
  const client = new FakeClient(data);
  const query = createPlayerContractsReadQuery(client as any);
  assertEquals(Object.keys(query), ["read"]);
  for (const method of [
    "createContractTemplate", "createGameSessionContract",
    "updateGameSessionContractStatus", "upsertPlayerContractProgress",
    "reviewPlayerContractProgress", "markContractRewardIssued",
  ]) {
    assertEquals((query as unknown as Record<string, unknown>)[method], undefined);
  }
  const result = await query.read({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    countryCode: "SOLVEND",
    rosterLabel: "A-1",
  } as PlayerContractsReadInput);
  assertEquals(result.available.map((row) => row.contractId), [CONTRACT_ID]);
  assertEquals(result.progress.map((row) => row.progressId), [CONTRACT_PROGRESS_ID]);
  assertEquals(result.available[0].metadata, { quiz: { prompt: "Visible question" } });
  assertEquals(result.available[0].requirementsPayload, { quiz: {} });
  assertEquals("createdByStaffId" in result.available[0], false);
  assertEquals("contractTemplateId" in result.available[0], false);
  assertEquals(data.game_session_contracts[0].metadata, {
    quiz: { prompt: "Visible question", correctAnswer: "Hidden answer" },
  });
  const other = await query.read({
    gameSessionId: OTHER_GAME_SESSION_ID,
    playerId: OTHER_GAME_PLAYER_ID,
  });
  assertEquals(other.available.map((row) => row.contractId), [OTHER_GAME_CONTRACT_ID]);
  assertEquals(other.progress.map((row) => row.progressId), [OTHER_GAME_CONTRACT_PROGRESS_ID]);
  assertEquals(client.forbiddenCalls, []);
});

Deno.test("public Contracts query starts both reads before either completes", async () => {
  const client = new FakeClient(tables());
  const from = client.from.bind(client);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => release = resolve);
  const started: string[] = [];
  client.from = (table) => {
    const builder = from(table);
    return new Proxy(builder, {
      get(target, key, receiver) {
        if (key !== "then") return Reflect.get(target, key, receiver);
        return (
          resolve: Parameters<typeof target.then>[0],
          reject: Parameters<typeof target.then>[1],
        ) => {
          started.push(table);
          return gate.then(() => target.then(resolve, reject));
        };
      },
    });
  };
  const pending = createPlayerContractsReadQuery(client as any).read({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  });
  try {
    await Promise.resolve();
    assertEquals(started, ["game_session_contracts", "player_contract_progress"]);
  } finally {
    release();
  }
  await pending;
});

Deno.test("public Contracts query preserves persistence errors and unknown rejection identity", async () => {
  for (const table of ["game_session_contracts", "player_contract_progress"]) {
    const client = new FakeClient(tables(), table);
    let caught: unknown;
    try {
      await createPlayerContractsReadQuery(client as any).read({
        gameSessionId: GAME_SESSION_ID,
        playerId: PLAYER_ID,
      });
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof ContractRepositoryError)) {
      throw new Error("Expected the existing Contracts persistence error");
    }
    assertEquals([caught.code, caught.message, caught.tableName, caught.operation], [
      "contract_repository_query_failed", "synthetic dependency failure", table, "select",
    ]);
    const failure = new Error("Synthetic Contracts provider failure");
    const unknownClient = new FakeClient(tables());
    const from = unknownClient.from.bind(unknownClient);
    unknownClient.from = (name) => {
      if (name === table) throw failure;
      return from(name);
    };
    let unknown: unknown;
    try {
      await createPlayerContractsReadQuery(unknownClient as any).read({
        gameSessionId: GAME_SESSION_ID,
        playerId: PLAYER_ID,
      });
    } catch (error) {
      unknown = error;
    }
    if (unknown !== failure) throw new Error("Contracts rejection was replaced");
  }
});

Deno.test("dashboard uses injected Contracts DTOs in both response locations on fresh reads", async () => {
  let result = await createPlayerContractsReadQuery(new FakeClient(tables()) as any).read({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  });
  const calls: PlayerContractsReadInput[] = [];
  const client = new FakeClient(tables(), "game_session_contracts");
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: createStockMarketReadRepository(client as any),
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
      playerContractsReadQuery: { read: (input) => { calls.push(input); return Promise.resolve(result); } },
      storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
    },
    () => new Date("2026-06-24T00:00:00Z"),
  );
  const input = {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    playerSessionId: PLAYER_SESSION_ID,
    playerDisplayName: "Avery",
    playerRosterLabel: "A-1",
  };
  const first = await repository.read(input);
  if (first.me.contracts.available !== result.available || first.public.contracts !== result.available || first.me.contracts.progress !== result.progress) {
    throw new Error("Dashboard replaced the owned Contracts DTO arrays");
  }
  result = { available: [], progress: [] };
  const second = await repository.read(input);
  assertEquals(second.me.contracts, result);
  assertEquals(second.public.contracts, []);
  assertEquals(calls, [
    { gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID },
    { gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID },
  ]);
  assertEquals(client.trace.filter((entry) =>
    ["game_session_contracts", "player_contract_progress"].includes((entry as { table?: string }).table ?? "")
  ), []);
});

Deno.test("dashboard preserves an injected Contracts query rejection unchanged", async () => {
  const client = new FakeClient(tables());
  const failure = new Error("Synthetic Contracts query failure");
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: createStockMarketReadRepository(client as any),
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
      playerContractsReadQuery: { read: () => Promise.reject(failure) },
      storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
    },
  );
  let caught: unknown;
  try {
    await repository.read({
      gameSessionId: GAME_SESSION_ID,
      playerId: PLAYER_ID,
      playerSessionId: PLAYER_SESSION_ID,
      playerDisplayName: "Avery",
      playerRosterLabel: "A-1",
    });
  } catch (error) {
    caught = error;
  }
  if (caught !== failure) throw new Error("Contracts query failure was replaced");
});
