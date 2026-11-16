import type {
  StaffBootstrapProfile,
  StaffGameSessionBootstrapRecord,
  StaffGameSessionBootstrapRepository,
} from "../../../src/domains/auth/application/staffGameSessionBootstrap.ts";
import type { StaffGameSessionBootstrapSupabaseClient } from "../../../src/domains/auth/infrastructure/supabaseStaffGameSessionBootstrapRepository.ts";
import {
  AdminBootstrapCompositionError,
  applicationContextForAdminGame,
  authorizeAndHydrateAdminBootstrapContext,
  discoverAdminOwnedGameIdentities,
  hydrateAdminBootstrapContext,
} from "./adminBootstrapComposition.ts";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";

const STAFF_ID = "00000000-0000-4000-8000-000000000101";
const FIRST_GAME_ID = "00000000-0000-4000-8000-000000000102";
const SECOND_GAME_ID = "00000000-0000-4000-8000-000000000103";
const REQUEST_ID = "admin-bootstrap-request";

Deno.test("Admin discovery delegates all-status owner ID lookup in repository order", async () => {
  const calls: unknown[] = [];
  const repository = repositoryFixture({
    discover(input) {
      calls.push(input);
      return [SECOND_GAME_ID, FIRST_GAME_ID];
    },
  });

  const identities = await discoverAdminOwnedGameIdentities(
    unusedClient(),
    STAFF_ID,
    { repository },
  );

  assertEquals(calls, [{ staffUserId: STAFF_ID, visibility: "all" }]);
  assertEquals(identities, [{ id: SECOND_GAME_ID }, { id: FIRST_GAME_ID }]);
  assert(Object.isFrozen(identities));
  assert(identities.every(Object.isFrozen));
});

Deno.test("Admin hydration creates one exact reviewed context per owned game and preserves persistence-shaped rows", async () => {
  let receivedContexts: readonly any[] = [];
  const repository = repositoryFixture({
    hydrate(input) {
      receivedContexts = input.applicationContexts;
      return [gameRecord(FIRST_GAME_ID), gameRecord(SECOND_GAME_ID)];
    },
  });
  const identityContext = {
    token: "server-token",
    user: { id: "auth-user" },
    staff: { id: STAFF_ID },
    games: [{ id: SECOND_GAME_ID }, { id: FIRST_GAME_ID }],
    service: unusedClient(),
  };

  const hydrated = await hydrateAdminBootstrapContext({
    context: identityContext,
    security: reviewedSecurity(),
    requestId: REQUEST_ID,
  }, { repository });

  assertEquals(receivedContexts.length, 2);
  assert(receivedContexts[0] !== receivedContexts[1]);
  for (const [index, applicationContext] of receivedContexts.entries()) {
    assert(Object.isFrozen(applicationContext));
    assert(Object.isFrozen(applicationContext.actor));
    assert(Object.isFrozen(applicationContext.permissions));
    assertEquals(applicationContext.requestId, REQUEST_ID);
    assertEquals(applicationContext.actor.staffUserId, STAFF_ID);
    assertEquals(
      applicationContext.gameSessionId,
      identityContext.games[index].id,
    );
  }
  assert(
    hydrated.gameBootstrapEntries[0].applicationContext === receivedContexts[0],
  );
  assert(
    hydrated.gameBootstrapEntries[1].applicationContext === receivedContexts[1],
  );
  assert(hydrated.gameBootstrapEntries[0].game === hydrated.games[0]);
  assert(hydrated.gameBootstrapEntries[1].game === hydrated.games[1]);
  assertEquals(hydrated.games.map((game) => game.id), [
    SECOND_GAME_ID,
    FIRST_GAME_ID,
  ]);
  assertEquals(hydrated.games[0], {
    id: SECOND_GAME_ID,
    name: `Game ${SECOND_GAME_ID}`,
    status: "archived",
    game_join_code: null,
    game_join_code_status: "inactive",
    created_at: "2026-08-17T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
  });
  assertEquals(hydrated.staff, {
    id: STAFF_ID,
    supabase_auth_user_id: "auth-user",
    email: "admin@example.test",
    display_name: "Admin",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
  });
  assert(
    applicationContextForAdminGame(
      hydrated.gameBootstrapEntries,
      hydrated.games[1],
    ) === receivedContexts[1],
  );
  assertEquals(
    "owner_staff_user_id" in hydrated.games[0],
    false,
  );
});

Deno.test("zero-game Admin hydration loads only the profile and fabricates no context", async () => {
  let gameHydrationCalls = 0;
  const repository = repositoryFixture({
    hydrate() {
      gameHydrationCalls += 1;
      return [];
    },
  });
  const hydrated = await hydrateAdminBootstrapContext({
    context: {
      user: { id: "auth-user" },
      staff: { id: STAFF_ID },
      games: [],
      service: unusedClient(),
    },
    security: reviewedSecurity(),
    requestId: REQUEST_ID,
  }, { repository });

  assertEquals(gameHydrationCalls, 0);
  assertEquals(hydrated.games, []);
  assertEquals(hydrated.gameBootstrapEntries, []);
});

Deno.test("Admin permission denial performs zero request-ID, hydration, or context work", async () => {
  let staffSecurityReads = 0;
  let permissionGrantReads = 0;
  let requestIdCalls = 0;
  let profileHydrationCalls = 0;
  let gameHydrationCalls = 0;
  let applicationContextCalls = 0;
  const service = {
    from(table: string): any {
      if (table === "staff_users") {
        staffSecurityReads += 1;
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: {
              status: "active",
              role: "game_admin",
              permission_version: 1,
              security_version: 1,
              mfa_required: true,
            },
            error: null,
          }),
        };
        return query;
      }
      if (table === "staff_permission_grants") {
        permissionGrantReads += 1;
        const query = {
          select: () => query,
          eq: async () => ({
            data: [{ permission: "account.read" }],
            error: null,
          }),
        };
        return query;
      }
      throw new Error(`Unexpected guard table: ${table}`);
    },
    async rpc<T>(): Promise<{ data: T | null; error: null }> {
      return { data: null, error: null };
    },
  };
  const repository: StaffGameSessionBootstrapRepository = {
    async discoverOwnedGameSessionIds() {
      throw new Error("Post-guard discovery must not run.");
    },
    async readStaffBootstrapProfile() {
      profileHydrationCalls += 1;
      return staffProfile();
    },
    async hydrateOwnedGameSessions(input) {
      gameHydrationCalls += 1;
      return input.applicationContexts.map((context) =>
        gameRecord(context.gameSessionId)
      );
    },
  };

  const result = await authorizeAndHydrateAdminBootstrapContext(
    new Request(`https://example.test/admin-api/games/${FIRST_GAME_ID}`, {
      method: "GET",
    }),
    {
      token: "guard-denial-token",
      user: {
        id: "auth-user",
        app_metadata: {
          econovaria_role: "game_admin",
          permission_version: 1,
          security_version: 1,
        },
      },
      staff: { id: STAFF_ID },
      games: [{ id: FIRST_GAME_ID }],
      service,
    },
    `/games/${FIRST_GAME_ID}`,
    {
      repository,
      createRequestId() {
        requestIdCalls += 1;
        return REQUEST_ID;
      },
      createApplicationContext(input) {
        applicationContextCalls += 1;
        return createAdminRequestApplicationContext(input);
      },
    },
  );

  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.status, 403);
    assertEquals(result.code, "staff_permission_denied");
  }
  assertEquals(staffSecurityReads, 1);
  assertEquals(permissionGrantReads, 1);
  assertEquals(requestIdCalls, 0);
  assertEquals(profileHydrationCalls, 0);
  assertEquals(gameHydrationCalls, 0);
  assertEquals(applicationContextCalls, 0);
});

Deno.test("Admin profile and game hydration failures retain exact auth envelopes", async () => {
  const missingProfile = repositoryFixture({ profile: null });
  await assertCompositionFailure(
    () =>
      hydrateAdminBootstrapContext({
        context: identityContext(),
        security: reviewedSecurity(),
        requestId: REQUEST_ID,
      }, { repository: missingProfile }),
    "profile",
    403,
    "This account is not registered as staff.",
  );

  const missingGame = repositoryFixture({ hydrate: () => [] });
  await assertCompositionFailure(
    () =>
      hydrateAdminBootstrapContext({
        context: identityContext(),
        security: reviewedSecurity(),
        requestId: REQUEST_ID,
      }, { repository: missingGame }),
    "games",
    500,
    "Administrator games could not be loaded.",
  );

  const relinkedProfile = repositoryFixture({
    profile: { ...staffProfile(), supabaseAuthUserId: "different-auth-user" },
  });
  await assertCompositionFailure(
    () =>
      hydrateAdminBootstrapContext({
        context: identityContext(),
        security: reviewedSecurity(),
        requestId: REQUEST_ID,
      }, { repository: relinkedProfile }),
    "profile",
    403,
    "This account is not registered as staff.",
  );
});

function identityContext() {
  return {
    user: { id: "auth-user" },
    staff: { id: STAFF_ID },
    games: [{ id: FIRST_GAME_ID }],
    service: unusedClient(),
  };
}

function reviewedSecurity() {
  return {
    ok: true as const,
    assuranceLevel: "aal2" as const,
    permissions: ["game.read" as const],
    requiredPermission: "game.read" as const,
  };
}

function repositoryFixture(options: {
  readonly discover?: (
    input: {
      readonly staffUserId: string;
      readonly visibility: "all" | "active";
    },
  ) => readonly string[];
  readonly profile?: StaffBootstrapProfile | null;
  readonly hydrate?: (
    input: Parameters<
      StaffGameSessionBootstrapRepository["hydrateOwnedGameSessions"]
    >[0],
  ) => readonly StaffGameSessionBootstrapRecord[];
} = {}): StaffGameSessionBootstrapRepository {
  return {
    async discoverOwnedGameSessionIds(input) {
      return options.discover?.(input) ?? [FIRST_GAME_ID];
    },
    async readStaffBootstrapProfile() {
      return options.profile === undefined ? staffProfile() : options.profile;
    },
    async hydrateOwnedGameSessions(input) {
      return options.hydrate?.(input) ??
        input.applicationContexts.map((context) =>
          gameRecord(context.gameSessionId)
        );
    },
  };
}

function staffProfile(): StaffBootstrapProfile {
  return {
    id: STAFF_ID,
    supabaseAuthUserId: "auth-user",
    email: "admin@example.test",
    displayName: "Admin",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
}

function gameRecord(id: string): StaffGameSessionBootstrapRecord {
  return {
    id,
    ownerStaffUserId: STAFF_ID,
    name: `Game ${id}`,
    status: "archived",
    gameJoinCode: null,
    gameJoinCodeStatus: "inactive",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
}

function unusedClient(): StaffGameSessionBootstrapSupabaseClient {
  return {
    from(): never {
      throw new Error("Injected repository should be used.");
    },
  };
}

async function assertCompositionFailure(
  run: () => Promise<unknown>,
  issue: "profile" | "games",
  status: number,
  responseMessage: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert(error instanceof AdminBootstrapCompositionError);
    assertEquals(error.issue, issue);
    assertEquals(error.status, status);
    assertEquals(error.responseMessage, responseMessage);
    return;
  }
  throw new Error("Expected Admin bootstrap composition to fail.");
}

function assert(value: boolean): asserts value {
  if (!value) throw new Error("Assertion failed.");
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
