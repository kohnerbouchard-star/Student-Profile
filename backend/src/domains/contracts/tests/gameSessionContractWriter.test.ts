import {
  type CreateGameSessionContractInput,
  createGameSessionContractWriter,
} from "../index.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "../infrastructure/supabaseContractRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

type FakeError = { readonly message: string; readonly code: string };

function makeClient(failure?: FakeError) {
  const calls: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      if (table !== "game_session_contracts") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        insert(input: Record<string, unknown>) {
          const row = {
            ...input,
            id: `contract-${rows.length + 1}`,
            created_at: "2026-06-25T12:00:00.000Z",
            updated_at: "2026-06-25T12:00:00.000Z",
          };
          if (!failure) rows.push(row);
          return {
            select(_columns: string) {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: failure ? null : row,
                    error: failure ?? null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls, rows };
}

function input(
  overrides: Partial<CreateGameSessionContractInput> = {},
): CreateGameSessionContractInput {
  return {
    gameSessionId: "game-1",
    contractTemplateId: null,
    contractKey: "aurora-export-drive",
    sourceType: "story_event",
    sourceId: "00000000-0000-4000-8000-000000000001",
    createdByStaffId: null,
    title: "Aurora Export Drive",
    description: "Prepare a basic export plan.",
    instructions: "Submit a memo and complete the required action.",
    category: "trade",
    status: "active",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: { manualText: "Submit a memo." },
    rewardPayload: { cash: { amount: 500, currencyCode: "ECO" } },
    completionMode: "manual_review",
    publishedAt: "2026-06-25T12:00:00.000Z",
    deadlineAt: null,
    expiresAt: null,
    metadata: {},
    ...overrides,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} differs from ${
        JSON.stringify(expected)
      }`,
    );
  }
}

async function errorFrom(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to reject.");
}

Deno.test("Contract creation capability preserves repository results and game scope", async () => {
  const baseline = makeClient();
  const actual = makeClient();
  const repository = new SupabaseContractRepository(baseline.client as never);
  const writer = createGameSessionContractWriter(actual.client as never);
  assertEquals(Object.keys(writer), ["createGameSessionContract"]);
  assertEquals(actual.calls, []);

  for (
    const item of [
      input(),
      input({
        gameSessionId: "game-2",
        sourceId: "00000000-0000-4000-8000-000000000002",
      }),
    ]
  ) {
    assertEquals(
      await writer.createGameSessionContract(item),
      await repository.createGameSessionContract(item),
    );
  }
  assertEquals(actual.rows, baseline.rows);
  assertEquals(actual.rows.map((row) => row.game_session_id), [
    "game-1",
    "game-2",
  ]);
  assertEquals(actual.calls, [
    "game_session_contracts",
    "game_session_contracts",
  ]);

  const invalid = await errorFrom(() =>
    writer.createGameSessionContract(input({ contractKey: "" }))
  );
  if (
    !(invalid instanceof Error) ||
    !invalid.message.includes("contract.contractKey")
  ) {
    throw new Error(
      `Expected Contract validation error, got ${String(invalid)}`,
    );
  }
  assertEquals(actual.calls, [
    "game_session_contracts",
    "game_session_contracts",
  ]);
});

Deno.test("Contract creation capability preserves repository and transport failures", async () => {
  for (const code of ["42501", "23505"]) {
    const baseline = makeClient({ message: "insert failed", code });
    const actual = makeClient({ message: "insert failed", code });
    const repository = new SupabaseContractRepository(baseline.client as never);
    const writer = createGameSessionContractWriter(actual.client as never);
    const expected = await errorFrom(() =>
      repository.createGameSessionContract(input())
    );
    const observed = await errorFrom(() =>
      writer.createGameSessionContract(input())
    );
    if (
      !(expected instanceof ContractRepositoryError) ||
      !(observed instanceof ContractRepositoryError)
    ) {
      throw new Error("Expected canonical ContractRepositoryError.");
    }
    assertEquals(
      [observed.code, observed.message, observed.tableName, observed.operation],
      [expected.code, expected.message, expected.tableName, expected.operation],
    );
    assertEquals(observed.code, "contract_repository_query_failed");
    assertEquals(actual.calls, ["game_session_contracts"]);
    assertEquals(actual.rows, []);
  }

  const transportError = new Error("transport failed");
  const writer = createGameSessionContractWriter({
    from() {
      throw transportError;
    },
  } as never);
  const observed = await errorFrom(() =>
    writer.createGameSessionContract(input())
  );
  if (observed !== transportError) {
    throw new Error("Transport error identity changed.");
  }
});
