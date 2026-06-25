import type { JsonValue } from "../../../supabase/tableTypes.ts";
import { SupabaseStorylineRepository } from "./supabaseStorylineRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("storyline repository lists active game session storyline activations", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);

  const rows = await repository.listActiveGameSessionStorylines("game-1");

  assertEquals(rows.map((row) => row.id), ["activation-1"]);
  assertEquals(rows[0]?.gameSessionId, "game-1");
  assertEquals(rows[0]?.storylineId, "storyline-1");
  assertEquals(rows[0]?.status, "active");
});

Deno.test("storyline repository lists unresolved automatic active event candidates", async () => {
  const tables = baseTables();
  tables.storyline_events.push(
    storylineEvent({
      id: "elapsed-due",
      event_key: "elapsed-due",
      trigger_type: "elapsed_time",
      scheduled_offset_seconds: 300,
    }),
    storylineEvent({
      id: "wall-clock-due",
      event_key: "wall-clock-due",
      trigger_type: "wall_clock_time",
      scheduled_at: "2026-06-25T12:04:00.000Z",
    }),
    storylineEvent({
      id: "market-tick-due",
      event_key: "market-tick-due",
      trigger_type: "market_tick",
      scheduled_market_tick: 9,
    }),
    storylineEvent({
      id: "condition-candidate",
      event_key: "condition-candidate",
      trigger_type: "condition",
      trigger_condition: {
        type: "story_flag_equals",
        flagKey: "northreach_border_closed",
        value: true,
      },
    }),
    storylineEvent({
      id: "manual-not-auto",
      event_key: "manual-not-auto",
      trigger_type: "manual",
    }),
    storylineEvent({
      id: "market-tick-future",
      event_key: "market-tick-future",
      trigger_type: "market_tick",
      scheduled_market_tick: 10,
    }),
    storylineEvent({
      id: "inactive-event",
      event_key: "inactive-event",
      trigger_type: "condition",
      is_active: false,
    }),
    storylineEvent({
      id: "resolved-event",
      event_key: "resolved-event",
      trigger_type: "elapsed_time",
      scheduled_offset_seconds: 1,
    }),
  );
  tables.story_event_resolutions.push({
    id: "resolution-1",
    game_session_id: "game-1",
    storyline_event_id: "resolved-event",
    resolved_at: "2026-06-25T12:01:00.000Z",
    resolved_market_tick: null,
    status: "resolved",
    result_payload: {},
    created_at: "2026-06-25T12:01:00.000Z",
  });
  const client = new FakeClient(tables);
  const repository = new SupabaseStorylineRepository(client as never);

  const rows = await repository.listUnresolvedActiveStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:07:00.000Z",
    currentMarketTick: 9,
  });

  assertEquals(rows.map((row) => row.eventKey), [
    "elapsed-due",
    "wall-clock-due",
    "market-tick-due",
    "condition-candidate",
  ]);
  assertEquals(rows[0]?.gameSessionId, "game-1");
  assertEquals(rows[0]?.gameSessionStorylineId, "activation-1");
});

Deno.test("storyline repository creates story event resolution idempotently", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);
  const input = {
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    resolvedAt: "2026-06-25T12:00:00.000Z",
    resolvedMarketTick: 7,
    resultPayload: { applied: true },
  };

  const inserted = await repository.createStoryEventResolution(input);
  const existing = await repository.createStoryEventResolution(input);

  assertEquals(inserted.status, "inserted");
  assertEquals(existing.status, "existing");
  assertEquals(inserted.resolution.id, existing.resolution.id);
  assertEquals(client.tables.story_event_resolutions.length, 1);
  assertEquals(
    client.tables.story_event_resolutions[0]?.result_payload,
    { applied: true },
  );
});

Deno.test("storyline repository inserts player story impact using effect dependency shape", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);

  const result = await repository.createPlayerImpact({
    gameSessionId: "game-1",
    playerId: "player-1",
    storylineEventId: "event-1",
    effectType: "cash_debit",
    impactLabel: "Emergency security levy",
    impactReason: "You were located in Northreach.",
    amount: -150,
    payload: { source: "test" },
    idempotencyKey: "impact-key",
  });

  assertEquals(result.id, "player_story_impacts-1");
  assertEquals(client.tables.player_story_impacts[0], {
    game_session_id: "game-1",
    player_id: "player-1",
    storyline_event_id: "event-1",
    effect_type: "cash_debit",
    impact_label: "Emergency security levy",
    impact_reason: "You were located in Northreach.",
    amount: -150,
    payload: { source: "test" },
    id: "player_story_impacts-1",
    created_at: "2026-06-25T12:00:00.000Z",
  });
});

Deno.test("storyline repository upserts game session policy using effect dependency shape", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);

  const first = await repository.upsertPolicy({
    gameSessionId: "game-1",
    policyKey: "northreach-outbound-freeze",
    policyType: "immigration_lock",
    scopeType: "country",
    scopeKey: "NORTHREACH",
    startsAt: "2026-06-25T12:00:00.000Z",
    expiresAt: "2026-06-25T12:20:00.000Z",
    durationSeconds: 1200,
    payload: { blockedDirection: "outbound" },
    sourceStoryEventId: "event-1",
    idempotencyKey: "policy-key",
  });
  const second = await repository.upsertPolicy({
    gameSessionId: "game-1",
    policyKey: "northreach-outbound-freeze",
    policyType: "immigration_lock",
    scopeType: "country",
    scopeKey: "NORTHREACH",
    startsAt: "2026-06-25T12:05:00.000Z",
    expiresAt: null,
    durationSeconds: null,
    payload: { blockedDirection: "both" },
    sourceStoryEventId: "event-2",
    idempotencyKey: "policy-key-2",
  });

  assertEquals(first.id, "game_session_policies-1");
  assertEquals(second.id, "game_session_policies-1");
  assertEquals(client.tables.game_session_policies.length, 1);
  assertEquals(
    client.tables.game_session_policies[0]?.starts_at,
    "2026-06-25T12:05:00.000Z",
  );
  assertEquals(client.tables.game_session_policies[0]?.expires_at, null);
  assertEquals(client.tables.game_session_policies[0]?.payload, {
    blockedDirection: "both",
  });
});

Deno.test("storyline repository upserts and lists game session story flags", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);

  const first = await repository.setStoryFlag({
    gameSessionId: "game-1",
    flagKey: "northreach_border_closed",
    value: true,
    sourceStoryEventId: "event-1",
    idempotencyKey: "flag-key",
  });
  const second = await repository.setStoryFlag({
    gameSessionId: "game-1",
    flagKey: "northreach_border_closed",
    value: { phase: "warning" },
    sourceStoryEventId: "event-2",
    idempotencyKey: "flag-key-2",
  });
  await repository.setStoryFlag({
    gameSessionId: "game-2",
    flagKey: "other_game_flag",
    value: true,
    sourceStoryEventId: "event-3",
    idempotencyKey: "flag-key-3",
  });

  assertEquals(first.id, "game_session_story_flags-1");
  assertEquals(second.id, "game_session_story_flags-1");
  assertEquals(client.tables.game_session_story_flags.length, 2);
  assertEquals(await repository.listGameSessionStoryFlags("game-1"), {
    northreach_border_closed: { phase: "warning" },
  });
});

interface FakeTables {
  readonly game_session_storylines: Record<string, unknown>[];
  readonly storyline_events: Record<string, unknown>[];
  readonly story_event_resolutions: Record<string, unknown>[];
  readonly player_story_impacts: Record<string, unknown>[];
  readonly game_session_policies: Record<string, unknown>[];
  readonly game_session_story_flags: Record<string, unknown>[];
}

type FakeTableName = keyof FakeTables;

class FakeClient {
  readonly tables: FakeTables;

  constructor(tables: FakeTables) {
    this.tables = tables;
  }

  from(tableName: FakeTableName): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables, tableName);
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
  }[] = [];

  constructor(
    private readonly tables: FakeTables,
    private readonly tableName: FakeTableName,
  ) {}

  select(_columns: string): FakeQueryBuilder {
    return this;
  }

  insert(row: unknown): FakeWriteBuilder {
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

  upsert(
    row: unknown,
    options?: { readonly onConflict?: string },
  ): FakeWriteBuilder {
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
    options?: { readonly ascending?: boolean },
  ): FakeQueryBuilder {
    this.orderRules.push({
      column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  maybeSingle(): Promise<FakeResponse<unknown>> {
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
        compareValues(left[orderRule.column], right[orderRule.column]) *
        (orderRule.ascending ? 1 : -1)
      );
    }

    return rows;
  }

  private isDuplicateInsert(row: unknown): boolean {
    if (this.tableName !== "story_event_resolutions") {
      return false;
    }

    const input = row as Record<string, unknown>;

    return this.tables.story_event_resolutions.some((existing) =>
      existing.game_session_id === input.game_session_id &&
      existing.storyline_event_id === input.storyline_event_id
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
      Object.assign(existing, input);
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
    };
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

function baseTables(): FakeTables {
  return {
    game_session_storylines: [
      {
        id: "activation-1",
        game_session_id: "game-1",
        storyline_id: "storyline-1",
        status: "active",
        story_started_at: "2026-06-25T12:00:00.000Z",
        paused_at: null,
        accumulated_pause_seconds: 60,
        time_scale: 1,
        created_at: "2026-06-25T12:00:00.000Z",
      },
      {
        id: "activation-paused",
        game_session_id: "game-1",
        storyline_id: "storyline-paused",
        status: "paused",
        story_started_at: "2026-06-25T12:00:00.000Z",
        paused_at: "2026-06-25T12:01:00.000Z",
        accumulated_pause_seconds: 0,
        time_scale: 1,
        created_at: "2026-06-25T12:01:00.000Z",
      },
      {
        id: "activation-other-game",
        game_session_id: "game-2",
        storyline_id: "storyline-1",
        status: "active",
        story_started_at: "2026-06-25T12:00:00.000Z",
        paused_at: null,
        accumulated_pause_seconds: 0,
        time_scale: 1,
        created_at: "2026-06-25T12:00:00.000Z",
      },
    ],
    storyline_events: [],
    story_event_resolutions: [],
    player_story_impacts: [],
    game_session_policies: [],
    game_session_story_flags: [],
  };
}

function storylineEvent(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: "event-1",
    storyline_id: "storyline-1",
    event_key: "event-1",
    title: "Story Event",
    description: "",
    act: 1,
    sequence: 1,
    trigger_type: "manual",
    scheduled_offset_seconds: null,
    scheduled_at: null,
    scheduled_market_tick: null,
    trigger_condition: {},
    reveal_payload: {},
    public_news_payload: {},
    player_rules: [],
    policy_payloads: [],
    flag_payloads: [],
    contract_unlock_payloads: [],
    priority: "normal",
    is_active: true,
    created_at: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
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
