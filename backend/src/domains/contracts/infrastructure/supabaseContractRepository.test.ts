import {
  ContractRepositoryError,
  type CreateGameSessionContractInput,
  type ReviewPlayerContractProgressInput,
} from "../contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "./supabaseContractRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("contract repository creates and maps template rows", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseContractRepository(client as never);

  const template = await repository.createContractTemplate({
    templateKey: "starter-import-license",
    title: "Starter Import License",
    description: "Learn the basics of importing goods.",
    instructions: "Submit a memo for teacher review.",
    category: "trade",
    difficulty: "intro",
    estimatedDurationMinutes: 15,
    requirementsPayload: {
      manualText: "Explain why the import matters.",
    },
    rewardPayload: {
      cash: {
        amount: 250,
        currencyCode: "ECO",
      },
    },
    metadata: {
      seedPack: "core",
    },
    isActive: true,
  });

  assertEquals(template.id, "contract_templates-1");
  assertEquals(template.templateKey, "starter-import-license");
  assertEquals(
    template.requirementsPayload.manualText,
    "Explain why the import matters.",
  );
  assertEquals(
    client.tables.contract_templates[0]?.template_key,
    "starter-import-license",
  );
});

Deno.test("contract repository gets template by key and returns null when missing", async () => {
  const client = new FakeClient(baseTables({
    contract_templates: [
      contractTemplateRow({
        template_key: "starter-import-license",
        is_active: false,
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const template = await repository.getContractTemplateByKey(
    "starter-import-license",
  );
  const missing = await repository.getContractTemplateByKey("missing-template");

  assertEquals(template?.templateKey, "starter-import-license");
  assertEquals(template?.isActive, false);
  assertEquals(missing, null);
});

Deno.test("contract repository rejects duplicate template keys cleanly", async () => {
  const client = new FakeClient(baseTables({
    contract_templates: [
      contractTemplateRow({ template_key: "starter-import-license" }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const error = await assertRejects(
    () =>
      repository.createContractTemplate({
        templateKey: "starter-import-license",
        title: "Duplicate Template",
        description: "Duplicate template key.",
        instructions: "No-op.",
        category: "trade",
        difficulty: "intro",
      }),
    ContractRepositoryError,
  );

  assertEquals(error.code, "contract_template_conflict");
  assertEquals(error.tableName, "contract_templates");
});

Deno.test("contract repository creates teacher, system, and story_event contracts", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseContractRepository(client as never);

  const teacher = await repository.createGameSessionContract(
    validContractInput({
      sourceType: "teacher",
      createdByStaffId: "staff-1",
    }),
  );
  const system = await repository.createGameSessionContract(validContractInput({
    contractKey: "system-contract",
    sourceType: "system",
    sourceId: "00000000-0000-4000-8000-000000000001",
  }));
  const story = await repository.createGameSessionContract(validContractInput({
    contractKey: "story-contract",
    sourceType: "story_event",
    sourceId: "00000000-0000-4000-8000-000000000002",
  }));

  assertEquals(
    [teacher.sourceType, system.sourceType, story.sourceType],
    ["teacher", "system", "story_event"],
  );
  assertEquals(client.tables.game_session_contracts.length, 3);
});

Deno.test("contract repository lists game session contracts and excludes other sessions", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "contract-new",
        game_session_id: "game-1",
        contract_key: "new-contract",
        published_at: "2026-06-25T12:10:00.000Z",
        created_at: "2026-06-25T12:00:00.000Z",
      }),
      gameSessionContractRow({
        id: "contract-draft",
        game_session_id: "game-1",
        contract_key: "draft-contract",
        status: "draft",
        published_at: null,
        created_at: "2026-06-25T12:15:00.000Z",
      }),
      gameSessionContractRow({
        id: "contract-other",
        game_session_id: "game-2",
        contract_key: "other-contract",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const contracts = await repository.listGameSessionContracts({
    gameSessionId: "game-1",
  });

  assertEquals(contracts.map((contract) => contract.id), [
    "contract-new",
    "contract-draft",
  ]);
});

Deno.test("contract repository gets game session contract by scoped id", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "contract-1",
        game_session_id: "game-1",
      }),
      gameSessionContractRow({
        id: "contract-1",
        game_session_id: "game-2",
        contract_key: "other-game-contract",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const contract = await repository.getGameSessionContractById({
    gameSessionId: "game-1",
    contractId: "contract-1",
  });
  const missing = await repository.getGameSessionContractById({
    gameSessionId: "game-1",
    contractId: "missing-contract",
  });

  assertEquals(contract?.gameSessionId, "game-1");
  assertEquals(contract?.contractKey, "contract-1");
  assertEquals(missing, null);
});

Deno.test("contract repository updates contract status scoped by game session", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "contract-1",
        game_session_id: "game-1",
        status: "draft",
        published_at: null,
      }),
      gameSessionContractRow({
        id: "contract-1",
        game_session_id: "game-2",
        status: "draft",
        published_at: null,
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const updated = await repository.updateGameSessionContractStatus({
    gameSessionId: "game-1",
    contractId: "contract-1",
    status: "active",
    publishedAt: "2026-06-25T12:30:00.000Z",
  });
  const missing = await repository.updateGameSessionContractStatus({
    gameSessionId: "game-1",
    contractId: "missing-contract",
    status: "active",
    publishedAt: "2026-06-25T12:30:00.000Z",
  });

  assertEquals(updated?.status, "active");
  assertEquals(updated?.publishedAt, "2026-06-25T12:30:00.000Z");
  assertEquals(
    client.tables.game_session_contracts.find((row) =>
      row.game_session_id === "game-2"
    )?.status,
    "draft",
  );
  assertEquals(missing, null);
});

Deno.test("contract repository filters game session contracts by status and source type", async () => {
  const client = new FakeClient(baseTables({
    game_session_contracts: [
      gameSessionContractRow({
        id: "active-teacher",
        status: "active",
        source_type: "teacher",
      }),
      gameSessionContractRow({
        id: "scheduled-system",
        status: "scheduled",
        source_type: "system",
      }),
      gameSessionContractRow({
        id: "active-story",
        status: "active",
        source_type: "story_event",
      }),
    ],
  }));
  const repository = new SupabaseContractRepository(client as never);

  const contracts = await repository.listGameSessionContracts({
    gameSessionId: "game-1",
    statuses: ["active"],
    sourceTypes: ["teacher", "story_event"],
  });

  assertEquals(contracts.map((contract) => contract.id), [
    "active-teacher",
    "active-story",
  ]);
});

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

Deno.test("contract repository maps atomic accept outcomes", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseContractRepository(client as never);

  const accepted = await repository.acceptPlayerContractProgress({
    gameSessionId: "game-1",
    contractId: "contract-1",
    playerId: "player-1",
  });
  const replay = await repository.acceptPlayerContractProgress({
    gameSessionId: "game-1",
    contractId: "contract-1",
    playerId: "player-1",
  });
  client.tables.player_contract_progress[0].status = "submitted";
  const locked = await repository.acceptPlayerContractProgress({
    gameSessionId: "game-1",
    contractId: "contract-1",
    playerId: "player-1",
  });

  assertEquals(accepted.outcome, "accepted");
  assertEquals(accepted.progress?.status, "in_progress");
  assertEquals(replay.outcome, "already_accepted");
  assertEquals(locked.outcome, "locked");
  assertEquals(locked.progress?.status, "submitted");
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

interface FakeTables {
  readonly contract_templates: Record<string, unknown>[];
  readonly game_session_contracts: Record<string, unknown>[];
  readonly player_contract_progress: Record<string, unknown>[];
}

type FakeTableName = keyof FakeTables;
type FakeOperation = "select" | "insert" | "update" | "upsert";
type FakeFailureKey = `${FakeTableName}:${FakeOperation}`;

class FakeClient {
  constructor(
    readonly tables: FakeTables,
    private readonly failures: Partial<Record<FakeFailureKey, FakeQueryError>> =
      {},
  ) {}

  from(tableName: FakeTableName): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables, this.failures, tableName);
  }

  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<FakeResponse<unknown[]>> {
    if (functionName !== "accept_player_contract") {
      return Promise.resolve({
        data: null,
        error: { message: `Unknown RPC ${functionName}` },
      });
    }

    const existing = this.tables.player_contract_progress.find((row) =>
      row.game_session_id === args.p_game_session_id &&
      row.contract_id === args.p_contract_id &&
      row.player_id === args.p_player_id
    );
    const row = existing ?? playerContractProgressRow({
      id: `player_contract_progress-${
        this.tables.player_contract_progress.length + 1
      }`,
      game_session_id: args.p_game_session_id,
      contract_id: args.p_contract_id,
      player_id: args.p_player_id,
      status: "in_progress",
    });

    if (!existing) this.tables.player_contract_progress.push(row);

    const acceptOutcome = !existing
      ? "accepted"
      : existing.status === "available"
      ? "accepted"
      : existing.status === "in_progress"
      ? "already_accepted"
      : "locked";

    if (existing?.status === "available") existing.status = "in_progress";

    return Promise.resolve({
      data: [{ ...row, accept_outcome: acceptOutcome }],
      error: null,
    });
  }
}

class FakeQueryBuilder {
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
    readonly operator: "eq" | "in";
  }[] = [];
  private readonly orderRules: {
    readonly column: string;
    readonly ascending: boolean;
    readonly nullsFirst: boolean | null;
  }[] = [];

  constructor(
    private readonly tables: FakeTables,
    private readonly failures: Partial<Record<FakeFailureKey, FakeQueryError>>,
    private readonly tableName: FakeTableName,
  ) {}

  select(_columns: string): FakeQueryBuilder {
    return this;
  }

  insert(row: unknown): FakeWriteBuilder {
    const failure = this.failures[`${this.tableName}:insert`];

    if (failure) {
      return new FakeWriteBuilder(null, failure);
    }

    if (this.isDuplicateInsert(row)) {
      return new FakeWriteBuilder(null, {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      });
    }

    const stored = this.withGeneratedFields(row);
    this.tables[this.tableName].push(stored);

    return new FakeWriteBuilder(stored, null);
  }

  update(row: unknown): FakeUpdateBuilder {
    return new FakeUpdateBuilder(
      this.tables,
      this.failures,
      this.tableName,
      row,
    );
  }

  upsert(
    row: unknown,
    options?: { readonly onConflict?: string },
  ): FakeWriteBuilder {
    const failure = this.failures[`${this.tableName}:upsert`];

    if (failure) {
      return new FakeWriteBuilder(null, failure);
    }

    const stored = this.upsertRow(row, options?.onConflict);
    return new FakeWriteBuilder(stored, null);
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ column, value, operator: "eq" });
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    this.filters.push({ column, value: values, operator: "in" });
    return this;
  }

  order(
    column: string,
    options?: {
      readonly ascending?: boolean;
      readonly nullsFirst?: boolean;
    },
  ): FakeQueryBuilder {
    this.orderRules.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst ?? null,
    });
    return this;
  }

  maybeSingle(): Promise<FakeResponse<unknown>> {
    const failure = this.failures[`${this.tableName}:select`];

    if (failure) {
      return Promise.resolve({ data: null, error: failure });
    }

    return Promise.resolve({
      data: this.readRows()[0] ?? null,
      error: null,
    });
  }

  then<TResult1 = FakeResponse<unknown[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResponse<unknown[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    _onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    const failure = this.failures[`${this.tableName}:select`];

    if (failure) {
      return Promise.resolve({ data: null, error: failure }).then(
        onfulfilled ?? undefined,
      );
    }

    return Promise.resolve({
      data: this.readRows(),
      error: null,
    }).then(onfulfilled ?? undefined);
  }

  private readRows(): Record<string, unknown>[] {
    let rows = [...this.tables[this.tableName]];

    for (const filter of this.filters) {
      if (filter.operator === "eq") {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      } else {
        const values = filter.value as readonly unknown[];
        rows = rows.filter((row) => values.includes(row[filter.column]));
      }
    }

    for (const orderRule of [...this.orderRules].reverse()) {
      rows.sort((left, right) =>
        compareValues(
          left[orderRule.column],
          right[orderRule.column],
          orderRule,
        )
      );
    }

    return rows;
  }

  private isDuplicateInsert(row: unknown): boolean {
    if (this.tableName !== "contract_templates") {
      return false;
    }

    const input = row as Record<string, unknown>;

    return this.tables.contract_templates.some((existing) =>
      existing.template_key === input.template_key
    );
  }

  private upsertRow(
    row: unknown,
    onConflict: string | undefined,
  ): Record<string, unknown> {
    const input = row as Record<string, unknown>;
    const conflictColumns = (onConflict ?? "")
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    const existing = conflictColumns.length === 0
      ? null
      : this.tables[this.tableName].find((stored) =>
        conflictColumns.every((column) => stored[column] === input[column])
      );

    if (existing) {
      Object.assign(existing, input, {
        updated_at: "2026-06-25T12:30:00.000Z",
      });
      return existing;
    }

    const stored = this.withGeneratedFields(input);
    this.tables[this.tableName].push(stored);

    return stored;
  }

  private withGeneratedFields(row: unknown): Record<string, unknown> {
    return {
      ...(row as Record<string, unknown>),
      id: `${this.tableName}-${this.tables[this.tableName].length + 1}`,
      created_at: "2026-06-25T12:00:00.000Z",
      updated_at: "2026-06-25T12:00:00.000Z",
    };
  }
}

class FakeUpdateBuilder {
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
    readonly operator: "eq" | "is";
  }[] = [];

  constructor(
    private readonly tables: FakeTables,
    private readonly failures: Partial<Record<FakeFailureKey, FakeQueryError>>,
    private readonly tableName: FakeTableName,
    private readonly values: unknown,
  ) {}

  eq(column: string, value: unknown): FakeUpdateBuilder {
    this.filters.push({ column, value, operator: "eq" });
    return this;
  }

  is(column: string, value: unknown): FakeUpdateBuilder {
    this.filters.push({ column, value, operator: "is" });
    return this;
  }

  select(_columns: string): FakeWriteBuilder {
    const failure = this.failures[`${this.tableName}:update`];

    if (failure) {
      return new FakeWriteBuilder(null, failure);
    }

    const row = this.tables[this.tableName].find((stored) =>
      this.filters.every((filter) => {
        if (filter.operator === "is" && filter.value === null) {
          return stored[filter.column] === null ||
            stored[filter.column] === undefined;
        }

        return stored[filter.column] === filter.value;
      })
    );

    if (!row) {
      return new FakeWriteBuilder(null, null);
    }

    Object.assign(row, this.values, {
      updated_at: "2026-06-25T12:30:00.000Z",
    });

    return new FakeWriteBuilder(row, null);
  }
}

class FakeWriteBuilder {
  constructor(
    private readonly row: unknown | null,
    private readonly error: FakeQueryError | null,
  ) {}

  select(_columns: string): FakeWriteBuilder {
    return this;
  }

  maybeSingle(): Promise<FakeResponse<unknown>> {
    return Promise.resolve({
      data: this.row,
      error: this.error,
    });
  }
}

interface FakeResponse<T> {
  readonly data: T | null;
  readonly error: FakeQueryError | null;
}

interface FakeQueryError {
  readonly message: string;
  readonly code?: string;
}

function baseTables(overrides: Partial<FakeTables> = {}): FakeTables {
  return {
    contract_templates: [],
    game_session_contracts: [],
    player_contract_progress: [],
    ...overrides,
  };
}

function validContractInput(
  overrides: Partial<CreateGameSessionContractInput> = {},
): CreateGameSessionContractInput {
  return {
    gameSessionId: "game-1",
    contractTemplateId: null,
    contractKey: "aurora-export-drive",
    sourceType: "teacher",
    sourceId: null,
    createdByStaffId: null,
    title: "Aurora Export Drive",
    description: "Prepare a basic export plan.",
    instructions: "Submit a memo and complete the required action.",
    category: "trade",
    status: "active",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: {
      manualText: "Submit a memo.",
    },
    rewardPayload: {
      cash: {
        amount: 500,
        currencyCode: "ECO",
      },
    },
    completionMode: "manual_review",
    publishedAt: "2026-06-25T12:00:00.000Z",
    deadlineAt: null,
    expiresAt: null,
    metadata: {},
    ...overrides,
  };
}

function contractTemplateRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "template-1",
    template_key: "template-1",
    title: "Template",
    description: "Template description.",
    instructions: "Template instructions.",
    category: "general",
    difficulty: "intro",
    estimated_duration_minutes: null,
    requirements_payload: {},
    reward_payload: {},
    metadata: {},
    is_active: true,
    created_at: "2026-06-25T12:00:00.000Z",
    updated_at: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

function gameSessionContractRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "contract-1",
    game_session_id: "game-1",
    contract_template_id: null,
    contract_key: "contract-1",
    source_type: "teacher",
    source_id: null,
    created_by_staff_id: null,
    title: "Contract",
    description: "Contract description.",
    instructions: "Contract instructions.",
    category: "general",
    status: "active",
    visibility: "public",
    targeting_payload: {},
    requirements_payload: {},
    reward_payload: {},
    completion_mode: "manual_review",
    published_at: "2026-06-25T12:00:00.000Z",
    deadline_at: null,
    expires_at: null,
    metadata: {},
    created_at: "2026-06-25T12:00:00.000Z",
    updated_at: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

function playerContractProgressRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "progress-1",
    game_session_id: "game-1",
    contract_id: "contract-1",
    player_id: "player-1",
    status: "available",
    evidence_payload: {},
    result_payload: {},
    submitted_at: null,
    completed_at: null,
    reward_issued_at: null,
    created_at: "2026-06-25T12:00:00.000Z",
    updated_at: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

function compareValues(
  left: unknown,
  right: unknown,
  orderRule: {
    readonly ascending: boolean;
    readonly nullsFirst: boolean | null;
  },
): number {
  const leftIsNull = left === null || left === undefined;
  const rightIsNull = right === null || right === undefined;

  if (leftIsNull || rightIsNull) {
    if (leftIsNull && rightIsNull) {
      return 0;
    }

    if (orderRule.nullsFirst === false) {
      return leftIsNull ? 1 : -1;
    }

    return leftIsNull ? -1 : 1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * (orderRule.ascending ? 1 : -1);
  }

  return String(left).localeCompare(String(right)) *
    (orderRule.ascending ? 1 : -1);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

async function assertRejects<TError extends Error>(
  run: () => unknown | Promise<unknown>,
  expectedErrorClass: new (...args: never[]) => TError,
): Promise<TError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof expectedErrorClass) {
      return error;
    }

    throw new Error(
      `Expected ${expectedErrorClass.name}, got ${String(error)}`,
    );
  }

  throw new Error(`Expected ${expectedErrorClass.name} to be thrown.`);
}
