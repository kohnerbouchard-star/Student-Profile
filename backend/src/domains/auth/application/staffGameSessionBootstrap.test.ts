import { createStaffRequestApplicationContext } from "../../../shared/staffRequestApplicationContextFactory.ts";
import type { StaffRequestApplicationContext } from "../../../shared/staffRequestApplicationContext.ts";
import {
  discoverStaffGameSessionIds,
  hydrateStaffGameSessionBootstrap,
  readStaffBootstrapProfile,
  type StaffBootstrapProfile,
  StaffGameSessionBootstrapError,
  type StaffGameSessionBootstrapRecord,
  type StaffGameSessionBootstrapRepository,
} from "./staffGameSessionBootstrap.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const STAFF_ID = "staff-1";
const REQUEST_ID = "request-1";
const PROFILE: StaffBootstrapProfile = {
  id: STAFF_ID,
  supabaseAuthUserId: "auth-1",
  email: "staff@example.test",
  displayName: "Staff One",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

Deno.test("Staff bootstrap discovery preserves repository order and visibility", async () => {
  const repository = new StubRepository();
  repository.ids = ["game-new", "game-old"];

  const result = await discoverStaffGameSessionIds(repository, {
    staffUserId: STAFF_ID,
    visibility: "all",
  });

  assertEquals(result, ["game-new", "game-old"]);
  assertEquals(repository.discoveryInputs, [{
    staffUserId: STAFF_ID,
    visibility: "all",
  }]);
  assert(Object.isFrozen(result));
});

Deno.test("Staff bootstrap discovery rejects invalid or repeated IDs", async () => {
  for (const ids of [["game-1", "game-1"], ["game-1", ""]]) {
    const repository = new StubRepository();
    repository.ids = ids;
    await assertBootstrapFailure(() =>
      discoverStaffGameSessionIds(repository, {
        staffUserId: STAFF_ID,
        visibility: "active",
      })
    );
  }

  const repository = new StubRepository();
  await assertBootstrapFailure(() =>
    discoverStaffGameSessionIds(repository, {
      staffUserId: " ",
      visibility: "all",
    })
  );
  assertEquals(repository.discoveryInputs.length, 0);
});

Deno.test("Staff bootstrap profile requires the requested Staff record", async () => {
  const repository = new StubRepository();
  repository.profile = PROFILE;

  const result = await readStaffBootstrapProfile(repository, {
    staffUserId: STAFF_ID,
  });

  assertSame(result, PROFILE);
  assertEquals(repository.profileInputs, [{ staffUserId: STAFF_ID }]);

  repository.profile = { ...PROFILE, id: "staff-2" };
  await assertBootstrapFailure(() =>
    readStaffBootstrapProfile(repository, {
      staffUserId: STAFF_ID,
    })
  );
  repository.profile = null;
  await assertBootstrapFailure(() =>
    readStaffBootstrapProfile(repository, {
      staffUserId: STAFF_ID,
    })
  );
});

Deno.test("Staff bootstrap hydration pairs exact contexts in discovery order", async () => {
  const repository = new StubRepository();
  const contexts = [context("game-new"), context("game-old")];
  const newGame = game("game-new");
  const oldGame = game("game-old");
  repository.rows = [oldGame, newGame];

  const result = await hydrateStaffGameSessionBootstrap(repository, {
    applicationContexts: contexts,
    visibility: "active",
  });

  assertSame(repository.hydrationInputs[0]?.applicationContexts, contexts);
  assertEquals(result.map((entry) => entry.gameSession.id), [
    "game-new",
    "game-old",
  ]);
  assertSame(result[0]?.applicationContext, contexts[0]);
  assertSame(result[1]?.applicationContext, contexts[1]);
  assertSame(result[0]?.gameSession, newGame);
  assertSame(result[1]?.gameSession, oldGame);
  assert(result.every(Object.isFrozen));
  assert(Object.isFrozen(result));
});

Deno.test("Staff bootstrap hydration performs no read for zero games", async () => {
  const repository = new StubRepository();

  const result = await hydrateStaffGameSessionBootstrap(repository, {
    applicationContexts: [],
    visibility: "active",
  });

  assertEquals(result, []);
  assertEquals(repository.hydrationInputs.length, 0);
});

Deno.test("Staff bootstrap hydration rejects unreviewed context batches before reading", async () => {
  const first = context("game-1");
  const candidates: readonly (readonly StaffRequestApplicationContext[])[] = [
    [first, first],
    [first, context("game-2", { staffUserId: "staff-2" })],
    [first, context("game-2", { requestId: "request-2" })],
    [first, unfrozenContext("game-2")],
  ];

  for (const applicationContexts of candidates) {
    const repository = new StubRepository();
    await assertBootstrapFailure(() =>
      hydrateStaffGameSessionBootstrap(
        repository,
        { applicationContexts, visibility: "active" },
      )
    );
    assertEquals(repository.hydrationInputs.length, 0);
  }
});

Deno.test("Staff bootstrap hydration rejects incomplete or cross-owner rows", async () => {
  const contexts = [context("game-1"), context("game-2")];
  const invalidSets: readonly (readonly StaffGameSessionBootstrapRecord[])[] = [
    [game("game-1")],
    [game("game-1"), game("game-3")],
    [game("game-1"), game("game-1")],
    [game("game-1"), game("game-2", { ownerStaffUserId: "staff-2" })],
    [game("game-1"), game("game-2", { name: "" })],
  ];

  for (const rows of invalidSets) {
    const repository = new StubRepository();
    repository.rows = rows;
    await assertBootstrapFailure(() =>
      hydrateStaffGameSessionBootstrap(
        repository,
        { applicationContexts: contexts, visibility: "all" },
      )
    );
  }
});

Deno.test("Staff bootstrap active hydration rejects a status change", async () => {
  const repository = new StubRepository();
  repository.rows = [game("game-1", { status: "archived" })];

  await assertBootstrapFailure(() =>
    hydrateStaffGameSessionBootstrap(
      repository,
      { applicationContexts: [context("game-1")], visibility: "active" },
    )
  );

  const allResult = await hydrateStaffGameSessionBootstrap(repository, {
    applicationContexts: [context("game-1")],
    visibility: "all",
  });
  assertEquals(allResult[0]?.gameSession.status, "archived");
});

Deno.test("Staff bootstrap normalizes repository errors", async () => {
  const repository = new StubRepository();
  repository.failure = new Error("storage detail");

  await assertBootstrapFailure(() =>
    discoverStaffGameSessionIds(repository, {
      staffUserId: STAFF_ID,
      visibility: "all",
    })
  );
  await assertBootstrapFailure(() =>
    readStaffBootstrapProfile(repository, {
      staffUserId: STAFF_ID,
    })
  );
  await assertBootstrapFailure(() =>
    hydrateStaffGameSessionBootstrap(
      repository,
      { applicationContexts: [context("game-1")], visibility: "all" },
    )
  );
});

class StubRepository implements StaffGameSessionBootstrapRepository {
  ids: readonly string[] = [];
  profile: StaffBootstrapProfile | null = PROFILE;
  rows: readonly StaffGameSessionBootstrapRecord[] = [];
  failure: Error | null = null;
  readonly discoveryInputs: {
    readonly staffUserId: string;
    readonly visibility: "all" | "active";
  }[] = [];
  readonly profileInputs: { readonly staffUserId: string }[] = [];
  readonly hydrationInputs: {
    readonly applicationContexts: readonly StaffRequestApplicationContext[];
    readonly visibility: "all" | "active";
  }[] = [];

  async discoverOwnedGameSessionIds(input: {
    readonly staffUserId: string;
    readonly visibility: "all" | "active";
  }): Promise<readonly string[]> {
    this.discoveryInputs.push(input);
    if (this.failure) throw this.failure;
    return this.ids;
  }

  async readStaffBootstrapProfile(input: {
    readonly staffUserId: string;
  }): Promise<StaffBootstrapProfile | null> {
    this.profileInputs.push(input);
    if (this.failure) throw this.failure;
    return this.profile;
  }

  async hydrateOwnedGameSessions(input: {
    readonly applicationContexts: readonly StaffRequestApplicationContext[];
    readonly visibility: "all" | "active";
  }): Promise<readonly StaffGameSessionBootstrapRecord[]> {
    this.hydrationInputs.push(input);
    if (this.failure) throw this.failure;
    return this.rows;
  }
}

function context(
  gameSessionId: string,
  overrides: { readonly staffUserId?: string; readonly requestId?: string } =
    {},
): StaffRequestApplicationContext {
  return createStaffRequestApplicationContext({
    ownedGame: { id: gameSessionId },
    staff: {
      id: overrides.staffUserId ?? STAFF_ID,
      role: "game_admin",
    },
    assuranceLevel: "aal2",
    requestId: overrides.requestId ?? REQUEST_ID,
    permissions: ["game.read"],
  });
}

function unfrozenContext(
  gameSessionId: string,
): StaffRequestApplicationContext {
  return {
    gameSessionId,
    actor: { kind: "staff", staffUserId: STAFF_ID },
    role: "game_admin",
    permissions: ["game.read"],
    requestId: REQUEST_ID,
    assuranceLevel: "aal2",
  };
}

function game(
  id: string,
  overrides: Partial<StaffGameSessionBootstrapRecord> = {},
): StaffGameSessionBootstrapRecord {
  return {
    id,
    ownerStaffUserId: STAFF_ID,
    name: `Game ${id}`,
    status: "active",
    gameJoinCode: "JOIN12",
    gameJoinCodeStatus: "active",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

async function assertBootstrapFailure(
  run: () => Promise<unknown>,
): Promise<void> {
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof StaffGameSessionBootstrapError);
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed.");
}

function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error("Expected identical references.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}
