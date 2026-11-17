
export interface FakeTables {
  readonly game_session_storylines: Record<string, unknown>[];
  readonly storyline_events: Record<string, unknown>[];
  readonly game_session_story_event_overrides: Record<string, unknown>[];
  readonly story_event_resolutions: Record<string, unknown>[];
  readonly player_story_impacts: Record<string, unknown>[];
  readonly game_session_policies: Record<string, unknown>[];
  readonly game_session_story_flags: Record<string, unknown>[];
}

export type FakeTableName = keyof FakeTables;

export class FakeClient {
  readonly tables: FakeTables;

  constructor(tables: FakeTables) {
    this.tables = tables;
  }

  from(tableName: FakeTableName): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables, tableName);
  }
}

export class FakeQueryBuilder {
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

export class FakeWriteBuilder {
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

export interface FakeResponse<T> {
  readonly data: T | null;
  readonly error: FakeQueryError | null;
}

export interface FakeQueryError {
  readonly message: string;
  readonly code?: string;
}

export function baseTables(): FakeTables {
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
    game_session_story_event_overrides: [],
    story_event_resolutions: [],
    player_story_impacts: [],
    game_session_policies: [],
    game_session_story_flags: [],
  };
}

export function storylineEvent(
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

export function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
