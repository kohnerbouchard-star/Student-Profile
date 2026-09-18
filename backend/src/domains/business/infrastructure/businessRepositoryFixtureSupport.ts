export class FixtureBuilder implements
  PromiseLike<{
    data: unknown[];
    error: null;
  }> {
  constructor(
    private readonly data: unknown[],
    private readonly onSelect: (columns: string) => void,
  ) {}
  select(columns: string) {
    this.onSelect(columns);
    return this;
  }
  eq() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((
        value: { data: unknown[]; error: null },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.data, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

export function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
      .test(serialized)
  ) {
    throw new Error(
      `Business Store-sales projection leaked an internal UUID: ${serialized}`,
    );
  }
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}

export function businessRepositoryFixtureClient(
  overrides: Record<string, unknown[]>,
  gameId: string,
  playerId: string,
) {
  const fixtures: Record<string, unknown[]> = {
    business_entities: [],
    business_products: [],
    business_employees: [],
    business_inventory: [],
    business_production_runs: [],
    account_balances: [],
    store_offer_purchase_receipts: [],
    business_activity_events: [],
    ...overrides,
  };
  const selections: Array<{ table: string; columns: string }> = [];
  return {
    selections,
    from(table: string) {
      return new FixtureBuilder(
        fixtures[table] ?? [],
        (columns) => selections.push({ table, columns }),
      );
    },
    rpc(command: string, args: Record<string, unknown>) {
      if (command === "resolve_player_business_v2") {
        assertEquals(args, {
          p_game_session_id: gameId,
          p_player_id: playerId,
        });
        const businesses = fixtures.business_entities as Record<
          string,
          unknown
        >[];
        const active = businesses.filter((row) => row.status !== "closed");
        if (!active.length) {
          return Promise.resolve({
            data: null,
            error: { message: "BUSINESS_NOT_FOUND" },
          });
        }
        if (active.length > 1) {
          return Promise.resolve({
            data: null,
            error: { message: "BUSINESS_OWNERSHIP_AMBIGUOUS" },
          });
        }
        return Promise.resolve({
          data: [{ business_id: active[0].id }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}
