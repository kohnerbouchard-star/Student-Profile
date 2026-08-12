import {
  OPTIONAL_STORY_EVENT_OVERRIDE_TABLE,
  withOptionalStoryEventOverrideReads,
} from "./optionalStoryEventOverrideClient.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("optional story override reads treat PostgREST missing-table errors as empty state", async () => {
  const client = new FakeClient({
    [OPTIONAL_STORY_EVENT_OVERRIDE_TABLE]: {
      data: null,
      error: { code: "PGRST205", message: "table not in schema cache" },
    },
  });
  const wrapped = withOptionalStoryEventOverrideReads(client);

  const response = await (wrapped.from(OPTIONAL_STORY_EVENT_OVERRIDE_TABLE) as FakeBuilder)
    .select("storyline_event_id,enabled")
    .eq("game_session_id", "game-1");

  assertEquals(response, { data: [], error: null });
});

Deno.test("optional story override reads treat PostgreSQL undefined-table errors as empty state", async () => {
  const client = new FakeClient({
    [OPTIONAL_STORY_EVENT_OVERRIDE_TABLE]: {
      data: null,
      error: { code: "42P01", message: "relation does not exist" },
    },
  });
  const wrapped = withOptionalStoryEventOverrideReads(client);

  const response = await (wrapped.from(OPTIONAL_STORY_EVENT_OVERRIDE_TABLE) as FakeBuilder)
    .select("storyline_event_id")
    .order("storyline_event_id");

  assertEquals(response, { data: [], error: null });
});

Deno.test("optional story override reads keep non-schema database errors fail-closed", async () => {
  const expected = {
    data: null,
    error: { code: "42501", message: "permission denied" },
  };
  const client = new FakeClient({
    [OPTIONAL_STORY_EVENT_OVERRIDE_TABLE]: expected,
  });
  const wrapped = withOptionalStoryEventOverrideReads(client);

  const response = await (wrapped.from(OPTIONAL_STORY_EVENT_OVERRIDE_TABLE) as FakeBuilder)
    .select("storyline_event_id");

  assertEquals(response, expected);
});

Deno.test("optional story override adapter never suppresses missing-table errors on other tables", async () => {
  const expected = {
    data: null,
    error: { code: "PGRST205", message: "storyline_events missing" },
  };
  const client = new FakeClient({ storyline_events: expected });
  const wrapped = withOptionalStoryEventOverrideReads(client);

  const response = await (wrapped.from("storyline_events") as FakeBuilder)
    .select("id");

  assertEquals(response, expected);
});

interface FakeResponse {
  readonly data: unknown;
  readonly error: { readonly code: string; readonly message: string } | null;
}

class FakeClient {
  constructor(
    private readonly responses: Readonly<Record<string, FakeResponse>>,
  ) {}

  from(tableName: string): FakeBuilder {
    return new FakeBuilder(
      this.responses[tableName] ?? { data: [], error: null },
    );
  }
}

class FakeBuilder implements PromiseLike<FakeResponse> {
  constructor(private readonly response: FakeResponse) {}

  select(_columns: string): FakeBuilder {
    return this;
  }

  eq(_column: string, _value: unknown): FakeBuilder {
    return this;
  }

  order(_column: string): FakeBuilder {
    return this;
  }

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
