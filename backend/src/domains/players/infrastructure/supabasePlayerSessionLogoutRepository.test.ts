import { SupabasePlayerSessionLogoutRepository } from "./supabasePlayerSessionLogoutRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = "2026-07-18T09:00:00.000Z";

Deno.test("logout repository reads and conditionally revokes a token-owned session", async () => {
  const repository = new SupabasePlayerSessionLogoutRepository(client([
    row("active", null),
    row("revoked", NOW),
  ]) as never);

  const found = await repository.findByTokenHash("hash");
  assertEquals(found?.internalSessionUuid, SESSION);
  assertEquals(found?.gameId, GAME);

  const revoked = await repository.revokeActiveSession({
    internalSessionUuid: SESSION,
    gameId: GAME,
    playerUuid: PLAYER,
    sessionTokenHash: "hash",
    revokedAt: NOW,
  });
  assertEquals(revoked?.status, "revoked");
  assertEquals(revoked?.revokedAt, NOW);
});

Deno.test("logout repository returns null when no row matches", async () => {
  const repository = new SupabasePlayerSessionLogoutRepository(client([
    null,
  ]) as never);
  assertEquals(await repository.findByTokenHash("missing"), null);
});

Deno.test("logout repository fails closed on persistence errors", async () => {
  const repository = new SupabasePlayerSessionLogoutRepository(errorClient() as never);
  await assertRejects(() => repository.findByTokenHash("hash"));
});

function row(status: string, revokedAt: string | null) {
  return {
    id: SESSION,
    game_session_id: GAME,
    player_id: PLAYER,
    status,
    expires_at: "2026-07-19T00:00:00.000Z",
    revoked_at: revokedAt,
  };
}

function client(responses: readonly (Record<string, unknown> | null)[]) {
  let index = 0;
  const next = () => ({ data: responses[index++] ?? null, error: null });
  return {
    from() {
      return {
        select() { return new FakeFilter(next); },
        update() { return new FakeUpdate(next); },
      };
    },
  };
}

function errorClient() {
  return {
    from() {
      return {
        select() {
          return new FakeFilter(() => ({ data: null, error: { message: "failed" } }));
        },
        update() {
          return new FakeUpdate(() => ({ data: null, error: { message: "failed" } }));
        },
      };
    },
  };
}

class FakeFilter {
  constructor(private readonly response: () => unknown) {}
  eq(): FakeFilter { return this; }
  maybeSingle(): PromiseLike<unknown> { return Promise.resolve(this.response()); }
}

class FakeUpdate {
  constructor(private readonly response: () => unknown) {}
  eq(): FakeUpdate { return this; }
  is(): FakeUpdate { return this; }
  select(): { maybeSingle(): PromiseLike<unknown> } {
    return { maybeSingle: () => Promise.resolve(this.response()) };
  }
}

async function assertRejects(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error("Expected rejection.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
