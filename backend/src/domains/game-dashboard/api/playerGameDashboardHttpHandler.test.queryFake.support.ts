import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import { FakeClient } from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import { compareValues } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";

export class FakeQueryBuilder
  implements
    PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
  }[] = [];
  private readonly inFilters: {
    readonly column: string;
    readonly values: readonly unknown[];
  }[] = [];
  private readonly orderings: {
    readonly column: string;
    readonly ascending: boolean;
  }[] = [];
  private columns = "";
  private operation: "select" | "update" = "select";
  private updateValues: Record<string, unknown> | null = null;
  private limitCount: number | null = null;

  constructor(
    private readonly client: FakeClient,
    private readonly tableName: string,
  ) {}

  select(columns = ""): FakeQueryBuilder {
    this.columns = columns;
    return this;
  }

  insert(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`insert:${this.tableName}`);
    return this;
  }

  update(values: Record<string, unknown>): FakeQueryBuilder {
    this.operation = "update";
    this.updateValues = values;
    this.client.forbiddenCalls.push(`update:${this.tableName}`);
    return this;
  }

  delete(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`delete:${this.tableName}`);
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ column, value });
    return this;
  }

  is(column: string, value: null): FakeQueryBuilder {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    this.inFilters.push({ column, values });
    return this;
  }

  order(
    column: string,
    options: { readonly ascending?: boolean } = {},
  ): FakeQueryBuilder {
    this.orderings.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.limitCount = count;
    return this;
  }

  async maybeSingle() {
    const result = this.operation === "update"
      ? await this.executeUpdate()
      : await this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
  }

  then<
    TResult1 = { readonly data: unknown[] | null; readonly error: unknown },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
        value: { readonly data: unknown[] | null; readonly error: unknown },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    readonly data: unknown[] | null;
    readonly error: unknown;
  }> {
    this.client.trace.push({
      table: this.tableName,
      columns: this.columns,
      filters: this.filters,
      inFilters: this.inFilters,
      orderings: this.orderings,
      limit: this.limitCount,
    });
    if (this.client.failTable === this.tableName) {
      return { data: null, error: { message: "synthetic dependency failure" } };
    }
    return { data: this.readRows(), error: null };
  }

  private async executeUpdate(): Promise<{
    readonly data: unknown[] | null;
    readonly error: unknown;
  }> {
    const rows = this.readRows();

    for (const row of rows) {
      Object.assign(row, this.updateValues ?? {});
    }

    return { data: rows, error: null };
  }

  private readRows(): Record<string, unknown>[] {
    let rows = [...(this.client.tables[this.tableName] ?? [])];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    for (const filter of this.inFilters) {
      rows = rows.filter((row) => filter.values.includes(row[filter.column]));
    }

    for (const ordering of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const comparison = compareValues(
          left[ordering.column],
          right[ordering.column],
        );
        return ordering.ascending ? comparison : -comparison;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }
}
