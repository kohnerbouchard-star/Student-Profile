import { SupabasePlayerSessionLogoutRepository } from "./playerSessionLogoutRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const TOKEN_HASH = "hash:player-token";
const NOW = "2026-07-17T08:00:00.000Z";

Deno.test("logout repository revokes with token, session, game, player, and active-state predicates", async () => {
  const client = new FakeClient([sessionRow()]);
  const repository = new SupabasePlayerSessionLogoutRepository(client as never);
  const revoked = await repository.revokeActiveSession({
    id: PLAYER_SESSION_ID,
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    sessionTokenHash: TOKEN_HASH,
    revokedAt: NOW,
  });

  assertEquals(revoked, {
    id: PLAYER_SESSION_ID,
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    status: "revoked",
    expiresAt: "2099-07-17T08:00:00.000Z",
    revokedAt: NOW,
  });
  assertEquals(client.lastUpdateFilters, [
    ["id", PLAYER_SESSION_ID],
    ["game_session_id", GAME_SESSION_ID],
    ["player_id", PLAYER_ID],
    ["session_token_hash", TOKEN_HASH],
    ["status", "active"],
    ["revoked_at", null],
  ]);

  const replayedUpdate = await repository.revokeActiveSession({
    id: PLAYER_SESSION_ID,
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    sessionTokenHash: TOKEN_HASH,
    revokedAt: "2026-07-17T08:01:00.000Z",
  });
  assertEquals(replayedUpdate, null);

  const reloaded = await repository.findByTokenHash(TOKEN_HASH);
  assertEquals(reloaded?.revokedAt, NOW);
});

class FakeClient {
  readonly rows: Record<string, unknown>[];
  lastUpdateFilters: readonly (readonly [string, unknown])[] = [];

  constructor(rows: readonly Record<string, unknown>[]) {
    this.rows = rows.map((row) => ({ ...row }));
  }

  from(): FakeQueryBuilder {
    return new FakeQueryBuilder(this);
  }
}

class FakeQueryBuilder {
  private readonly filters: [string, unknown][] = [];
  private updateValues: Record<string, unknown> | null = null;

  constructor(private readonly client: FakeClient) {}

  select(): FakeQueryBuilder {
    return this;
  }

  update(values: Record<string, unknown>): FakeQueryBuilder {
    this.updateValues = values;
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push([column, value]);
    return this;
  }

  is(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push([column, value]);
    return this;
  }

  async maybeSingle() {
    const row = this.client.rows.find((candidate) =>
      this.filters.every(([column, value]) => candidate[column] === value)
    );

    if (!row) {
      return { data: null, error: null };
    }

    if (this.updateValues) {
      this.client.lastUpdateFilters = [...this.filters];
      Object.assign(row, this.updateValues);
    }

    return { data: { ...row }, error: null };
  }
}

function sessionRow(): Record<string, unknown> {
  return {
    id: PLAYER_SESSION_ID,
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    session_token_hash: TOKEN_HASH,
    status: "active",
    expires_at: "2099-07-17T08:00:00.000Z",
    revoked_at: null,
  };
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
