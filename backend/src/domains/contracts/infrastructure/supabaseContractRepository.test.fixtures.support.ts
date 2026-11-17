import { type CreateGameSessionContractInput } from "../contracts/contractRepositoryContracts.ts";

export interface FakeTables {
  readonly contract_templates: Record<string, unknown>[];
  readonly game_session_contracts: Record<string, unknown>[];
  readonly player_contract_progress: Record<string, unknown>[];
}

export type FakeTableName = keyof FakeTables;

export type FakeOperation = "select" | "insert" | "update" | "upsert";

export type FakeFailureKey = `${FakeTableName}:${FakeOperation}`;

export class FakeClient {
  constructor(
    readonly tables: FakeTables,
    private readonly failures: Partial<Record<FakeFailureKey, FakeQueryError>> =
      {},
  ) {}

  from(tableName: FakeTableName): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables, this.failures, tableName);
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

export class FakeUpdateBuilder {
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

export function baseTables(overrides: Partial<FakeTables> = {}): FakeTables {
  return {
    contract_templates: [],
    game_session_contracts: [],
    player_contract_progress: [],
    ...overrides,
  };
}

export function validContractInput(
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

export function contractTemplateRow(
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

export function gameSessionContractRow(
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

export function playerContractProgressRow(
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

export function compareValues(
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

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

export async function assertRejects<TError extends Error>(
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
