import {
  ContractRepositoryError,
  type UpsertPlayerContractProgressInput,
} from "../contracts/contractRepositoryContracts.ts";
import {
  type GameSessionContractRow,
  SupabaseContractRepository,
  toGameSessionContractRecord,
} from "./supabaseContractRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const templateSelect =
  "id,template_key,title,description,instructions,category,difficulty,estimated_duration_minutes,requirements_payload,reward_payload,metadata,is_active,created_at,updated_at";
const contractSelect =
  "id,game_session_id,contract_template_id,contract_key,source_type,source_id,created_by_staff_id,title,description,instructions,category,status,visibility,targeting_payload,requirements_payload,reward_payload,completion_mode,published_at,deadline_at,expires_at,metadata,created_at,updated_at";
const progressSelect =
  "id,game_session_id,contract_id,player_id,status,evidence_payload,result_payload,submitted_at,completed_at,reward_issued_at,created_at,updated_at";
const timestamp = "2026-06-25T12:00:00.000Z";

for (
  const [input, expected] of [
    [undefined, null],
    [null, null],
    ["15", 15],
    ["", 0],
    ["  ", 0],
    ["1e2", 100],
    ["not-a-number", null],
    [Infinity, null],
    [NaN, null],
    [0, 0],
  ] as const
) {
  Deno.test(`Contract row duration retains conversion for ${String(input)}`, async () => {
    const client = new TraceClient(
      templateRow({ estimated_duration_minutes: input }),
    );
    const result = await repository(client).getContractTemplateByKey(
      " template-1 ",
    );
    equal(result?.estimatedDurationMinutes, expected);
    equal(client.trace, [
      ["from", "contract_templates"],
      ["select", templateSelect],
      ["eq", "template_key", "template-1"],
      ["maybeSingle"],
    ]);
  });
}

for (const input of [-1, "1.5"]) {
  Deno.test(`Contract row duration retains validation for ${input}`, async () => {
    const client = new TraceClient(
      templateRow({ estimated_duration_minutes: input }),
    );
    const error = await rejection(() =>
      repository(client).getContractTemplateByKey("template-1")
    );
    truth(error.message.includes("estimatedDurationMinutes"));
  });
}

Deno.test("Contract public mapper preserves identity, nullable fields and payload references", () => {
  const row = contractRow({ contract_key: " contract-1 ", title: " Title " });
  const before = JSON.stringify(row);
  const result = toGameSessionContractRecord(row);
  equal([result.id, result.gameSessionId, result.contractKey, result.title], [
    "contract-1",
    "game-1",
    "contract-1",
    "Title",
  ]);
  equal([
    result.contractTemplateId,
    result.sourceId,
    result.createdByStaffId,
    result.publishedAt,
    result.deadlineAt,
    result.expiresAt,
  ], [null, null, null, null, null, null]);
  equal([result.createdAt, result.updatedAt], [timestamp, timestamp]);
  truth(result.targetingPayload === row.targeting_payload);
  truth(result.requirementsPayload === row.requirements_payload);
  truth(result.rewardPayload === row.reward_payload);
  truth(result.metadata === row.metadata);
  equal(JSON.stringify(row), before);
});

Deno.test("Contract mapper retains first validation failure", () => {
  try {
    toGameSessionContractRecord(
      contractRow({ game_session_id: "", source_type: "invalid" }),
    );
    throw new Error("Expected validation failure");
  } catch (error) {
    truth(
      error instanceof Error &&
        error.message.includes("contract.gameSessionId"),
    );
  }
});

Deno.test("Contract list retains select, filter, order and no per-row fan-out", async () => {
  const rows = Array.from(
    { length: 250 },
    (_, index) => contractRow({ id: `contract-${index}` }),
  );
  const client = new TraceClient(rows);
  const result = await repository(client).listGameSessionContracts({
    gameSessionId: "game-1",
    statuses: ["active", "paused"],
    sourceTypes: ["teacher"],
    visibility: "targeted",
  });
  equal(result.map((row) => row.id), rows.map((row) => row.id));
  equal(client.trace, [
    ["from", "game_session_contracts"],
    ["select", contractSelect],
    ["eq", "game_session_id", "game-1"],
    ["in", "status", ["active", "paused"]],
    ["in", "source_type", ["teacher"]],
    ["eq", "visibility", "targeted"],
    ...ordering(),
    ["await"],
  ]);
});

Deno.test("Contract list omits empty optional filters and maps null data to empty", async () => {
  const client = new TraceClient(null);
  equal(
    await repository(client).listGameSessionContracts({
      gameSessionId: "game-1",
      statuses: [],
      sourceTypes: [],
    }),
    [],
  );
  equal(client.trace, [
    ["from", "game_session_contracts"],
    ["select", contractSelect],
    ["eq", "game_session_id", "game-1"],
    ...ordering(),
    ["await"],
  ]);
});

for (
  const [target, input, expected] of [
    [{ playerIds: [42, "player-1"] }, {}, true],
    [{ playerIds: ["PLAYER-1"] }, {}, false],
    [{ countryCodes: ["CA"] }, { countryCode: "CA" }, true],
    [{ countryCodes: ["ca"] }, { countryCode: "CA" }, false],
    [{ rosterLabels: ["A"] }, { rosterLabel: "A" }, true],
    [{ rosterLabels: [""] }, { rosterLabel: "" }, false],
    [{ playerIds: "player-1", countryCodes: null, rosterLabels: 1 }, {}, false],
  ] as const
) {
  Deno.test(`Contract targeting retains exact matching ${JSON.stringify([target, input])}`, async () => {
    const client = new TraceClient([
      contractRow({ id: "public" }),
      contractRow({
        id: "target",
        visibility: "targeted",
        targeting_payload: target,
      }),
      contractRow({ id: "hidden", visibility: "hidden" }),
    ]);
    const result = await repository(client).listPlayerAvailableContracts({
      gameSessionId: "game-1",
      playerId: "player-1",
      ...input,
    });
    equal(
      result.map((row) => row.id),
      expected ? ["public", "target"] : ["public"],
    );
    equal(client.trace, [
      ["from", "game_session_contracts"],
      ["select", contractSelect],
      ["eq", "game_session_id", "game-1"],
      ["eq", "status", "active"],
      ["in", "visibility", ["public", "targeted"]],
      ...ordering(),
      ["await"],
    ]);
  });
}

Deno.test("Contract availability validates rows before excluding hidden entries", async () => {
  const client = new TraceClient([
    contractRow({ visibility: "hidden", title: "" }),
  ]);
  const error = await rejection(() =>
    repository(client).listPlayerAvailableContracts({
      gameSessionId: "game-1",
      playerId: "player-1",
    })
  );
  truth(error.message.includes("contract.title"));
});

for (
  const [extra, expected] of [
    [{}, {}],
    [{ status: undefined }, {}],
    [{ status: null }, {}],
    [{ status: "submitted" }, { status: "submitted" }],
    [{ evidencePayload: null }, { evidence_payload: {} }],
    [{ evidencePayload: { proof: true }, resultPayload: { score: 2 } }, {
      evidence_payload: { proof: true },
      result_payload: { score: 2 },
    }],
    [{ submittedAt: null, completedAt: null, rewardIssuedAt: null }, {
      submitted_at: null,
      completed_at: null,
      reward_issued_at: null,
    }],
    [{
      submittedAt: timestamp,
      completedAt: timestamp,
      rewardIssuedAt: timestamp,
    }, {
      submitted_at: timestamp,
      completed_at: timestamp,
      reward_issued_at: timestamp,
    }],
  ] as const
) {
  Deno.test(`Contract progress sparse upsert preserves omitted versus null ${JSON.stringify(extra)}`, async () => {
    const client = new TraceClient(progressRow());
    const input = {
      gameSessionId: " game-1 ",
      contractId: " contract-1 ",
      playerId: " player-1 ",
      ...extra,
    };
    const before = JSON.stringify(input);
    const result = await repository(client).upsertPlayerContractProgress(
      input as UpsertPlayerContractProgressInput,
    );
    equal(result.id, "progress-1");
    equal(client.trace, [["from", "player_contract_progress"], ["upsert", {
      game_session_id: "game-1",
      contract_id: "contract-1",
      player_id: "player-1",
      ...expected,
    }, { onConflict: "game_session_id,contract_id,player_id" }], [
      "select",
      progressSelect,
    ], ["maybeSingle"]]);
    equal(JSON.stringify(input), before);
  });
}

Deno.test("Contract progress rejects invalid data before opening a query", async () => {
  const client = new TraceClient(progressRow());
  const error = await rejection(() =>
    repository(client).upsertPlayerContractProgress({
      gameSessionId: "",
      contractId: "contract-1",
      playerId: "player-1",
    })
  );
  truth(error.message.includes("gameSessionId"));
  equal(client.trace, []);
});

for (const message of ["Database unavailable", ""]) {
  Deno.test(`Contract read error wins over malformed data and retains metadata ${JSON.stringify(message)}`, async () => {
    const client = new TraceClient([contractRow({ title: "" })], { message });
    const error = await rejection(() =>
      repository(client).listGameSessionContracts({ gameSessionId: "game-1" })
    );
    truth(error instanceof ContractRepositoryError);
    const typed = error as ContractRepositoryError;
    equal([typed.code, typed.message, typed.tableName, typed.operation], [
      "contract_repository_query_failed",
      message || "Contract repository query failed.",
      "game_session_contracts",
      "select",
    ]);
  });
}

Deno.test("Contract upsert missing row retains error metadata", async () => {
  const client = new TraceClient(null);
  const error = await rejection(() =>
    repository(client).upsertPlayerContractProgress({
      gameSessionId: "game-1",
      contractId: "contract-1",
      playerId: "player-1",
    })
  );
  truth(error instanceof ContractRepositoryError);
  const typed = error as ContractRepositoryError;
  equal([typed.code, typed.tableName, typed.operation], [
    "contract_repository_missing_row",
    "player_contract_progress",
    "upsert",
  ]);
});

function ordering(): unknown[][] {
  return [["order", "published_at", { ascending: false, nullsFirst: false }], [
    "order",
    "created_at",
    { ascending: false },
  ]];
}

function repository(client: TraceClient): SupabaseContractRepository {
  return new SupabaseContractRepository(client as never);
}

class TraceClient {
  readonly trace: unknown[][] = [];
  constructor(
    readonly data: unknown,
    readonly error: { message: string } | null = null,
  ) {}
  from(table: string): TraceQuery {
    this.trace.push(["from", table]);
    return new TraceQuery(this);
  }
}

class TraceQuery {
  constructor(readonly client: TraceClient) {}
  select(columns: string): this {
    return this.record("select", columns);
  }
  eq(column: string, value: unknown): this {
    return this.record("eq", column, value);
  }
  in(column: string, values: unknown[]): this {
    return this.record("in", column, values);
  }
  order(column: string, options: unknown): this {
    return this.record("order", column, options);
  }
  upsert(row: unknown, options: unknown): this {
    return this.record("upsert", row, options);
  }
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> {
    this.record("maybeSingle");
    return Promise.resolve({
      data: this.client.data,
      error: this.client.error,
    });
  }
  then<T>(
    resolve: (value: { data: unknown; error: { message: string } | null }) => T,
  ): Promise<T> {
    this.record("await");
    return Promise.resolve(
      resolve({ data: this.client.data, error: this.client.error }),
    );
  }
  private record(...entry: unknown[]): this {
    this.client.trace.push(entry);
    return this;
  }
}

function templateRow(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "template-1",
    template_key: "template-1",
    title: "Template",
    description: "Description",
    instructions: "Instructions",
    category: "general",
    difficulty: "intro",
    requirements_payload: {},
    reward_payload: {},
    metadata: {},
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
    ...extra,
  };
}

function contractRow(
  extra: Record<string, unknown> = {},
): GameSessionContractRow {
  return {
    id: "contract-1",
    game_session_id: "game-1",
    contract_key: "contract-1",
    source_type: "teacher",
    title: "Title",
    description: "Description",
    instructions: "Instructions",
    category: "general",
    status: "active",
    visibility: "public",
    targeting_payload: {},
    requirements_payload: {},
    reward_payload: {},
    completion_mode: "manual_review",
    metadata: {},
    created_at: timestamp,
    updated_at: timestamp,
    ...extra,
  };
}

function progressRow(): Record<string, unknown> {
  return {
    id: "progress-1",
    game_session_id: "game-1",
    contract_id: "contract-1",
    player_id: "player-1",
    status: "available",
    evidence_payload: {},
    result_payload: {},
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}; received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function truth(value: unknown): asserts value {
  if (!value) throw new Error("Expected truthy value");
}

async function rejection(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error("Expected rejection");
}
