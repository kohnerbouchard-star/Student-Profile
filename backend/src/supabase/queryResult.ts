export interface SupabaseQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface SupabaseQueryResponse<TData> {
  readonly data: TData | null;
  readonly error: SupabaseQueryError | null;
  readonly count?: number | null;
  readonly status?: number;
  readonly statusText?: string;
}

export interface SupabaseQueryContext {
  readonly tableName: string;
  readonly operation: string;
}

export interface SupabaseTableQuery<Row> {
  select(columns: string): SupabaseFilterQuery<Row>;
  insert(values: unknown): SupabaseInsertQuery<Row>;
  update(values: unknown): SupabaseUpdateQuery<Row>;
}

export interface SupabaseFilterQuery<Row>
  extends PromiseLike<SupabaseQueryResponse<ReadonlyArray<Row>>> {
  eq(column: string, value: unknown): SupabaseFilterQuery<Row>;
  limit(count: number): SupabaseFilterQuery<Row>;
  maybeSingle(): PromiseLike<SupabaseQueryResponse<Row | null>>;
  single(): PromiseLike<SupabaseQueryResponse<Row>>;
}

export interface SupabaseInsertQuery<Row> {
  select(columns: string): SupabaseInsertSelectQuery<Row>;
}

export interface SupabaseInsertSelectQuery<Row> {
  single(): PromiseLike<SupabaseQueryResponse<Row>>;
}

export interface SupabaseUpdateQuery<Row> {
  eq(column: string, value: unknown): SupabaseUpdateQuery<Row>;
  select(columns: string): SupabaseUpdateSelectQuery<Row>;
}

export interface SupabaseUpdateSelectQuery<Row> {
  maybeSingle(): PromiseLike<SupabaseQueryResponse<Row | null>>;
  single(): PromiseLike<SupabaseQueryResponse<Row>>;
}

export interface SupabaseRepositoryClient<Tables> {
  from<TableName extends Extract<keyof Tables, string>>(
    tableName: TableName,
  ): SupabaseTableQuery<Tables[TableName]>;
}

export interface SupabaseRpcClient<Functions> {
  rpc<FunctionName extends Extract<keyof Functions, string>>(
    functionName: FunctionName,
    args: unknown,
  ): PromiseLike<SupabaseQueryResponse<Functions[FunctionName]>>;
}

export class SupabaseRepositoryError extends Error {
  readonly tableName: string;
  readonly operation: string;
  readonly queryError: SupabaseQueryError;

  constructor(context: SupabaseQueryContext, queryError: SupabaseQueryError) {
    super(
      `Supabase ${context.operation} failed for ${context.tableName}: ${queryError.message}`,
    );
    this.name = "SupabaseRepositoryError";
    this.tableName = context.tableName;
    this.operation = context.operation;
    this.queryError = queryError;
  }
}

export function normalizeQueryRows<Row>(
  response: SupabaseQueryResponse<ReadonlyArray<Row>>,
  context: SupabaseQueryContext,
): ReadonlyArray<Row> {
  assertNoQueryError(response, context);

  if (!response.data) {
    return [];
  }

  return response.data;
}

export function normalizeMaybeQueryRow<Row>(
  response: SupabaseQueryResponse<Row | null>,
  context: SupabaseQueryContext,
): Row | null {
  assertNoQueryError(response, context);
  return response.data ?? null;
}

export function normalizeRequiredQueryRow<Row>(
  response: SupabaseQueryResponse<Row>,
  context: SupabaseQueryContext,
): Row {
  assertNoQueryError(response, context);

  if (!response.data) {
    throw new SupabaseRepositoryError(context, {
      message: "Expected one row, but Supabase returned no data.",
    });
  }

  return response.data;
}

function assertNoQueryError(
  response: SupabaseQueryResponse<unknown>,
  context: SupabaseQueryContext,
): void {
  if (response.error) {
    throw new SupabaseRepositoryError(context, response.error);
  }
}
