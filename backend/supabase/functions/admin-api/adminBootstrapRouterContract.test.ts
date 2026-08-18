import compositionSource from "./adminBootstrapComposition.ts" with {
  type: "text",
};
import commonSource from "./common.ts" with { type: "text" };
import indexSource from "./index.ts" with { type: "text" };

Deno.test("Admin preguard resolution discovers only Staff and owned-game identities", () => {
  const resolveSource = boundedSource(
    commonSource,
    "export async function resolveContext(request)",
    "export function gameDto(game)",
  );

  assertIncludes(resolveSource, '.select("id")');
  assertIncludes(resolveSource, "discoverAdminOwnedGameIdentities(");
  assertEquals(resolveSource.match(/\.select\(/g)?.length, 1);
  for (
    const browserField of [
      "display_name",
      "email",
      "game_join_code",
      "created_at,updated_at",
    ]
  ) {
    assert(
      !resolveSource.includes(browserField),
      `Preguard resolution must not select ${browserField}.`,
    );
  }
});

Deno.test("Admin root guards once before one postguard multi-game hydration", () => {
  const serveSource = indexSource.slice(indexSource.indexOf("Deno.serve("));
  const resolution = serveSource.indexOf("await resolveContext(request)");
  const guard = serveSource.indexOf("await guardAdminRequest(");
  const hydration = serveSource.indexOf(
    "await hydrateAdminBootstrapContext({",
  );
  const globalDispatch = serveSource.indexOf("await handleGlobalRoute(");
  const ownedGame = serveSource.indexOf(
    "ensureOwnedGame(securedContext, gameId)",
  );
  const pairedContext = serveSource.indexOf(
    "applicationContextForAdminGame(",
  );

  assert(resolution >= 0, "Admin identity resolution must run.");
  assert(guard > resolution, "Admin guard must follow identity resolution.");
  assert(hydration > guard, "Detailed hydration must follow the Admin guard.");
  assert(
    globalDispatch > hydration,
    "Global DTO dispatch must follow hydration.",
  );
  assert(ownedGame > hydration, "Scoped ownership must use hydrated rows.");
  assert(
    pairedContext > ownedGame,
    "Scoped dispatch must reuse the context paired with the hydrated row.",
  );
  assertEquals(serveSource.match(/await guardAdminRequest\(/g)?.length, 1);
  assertEquals(
    serveSource.match(/await hydrateAdminBootstrapContext\(\{/g)?.length,
    1,
  );
  assertEquals(
    serveSource.match(/requestId:\s*crypto\.randomUUID\(\)/g)?.length,
    1,
  );
  assert(
    !serveSource.includes("createAdminRequestApplicationContext("),
    "The Admin root must not create a second selected-game context.",
  );
});

Deno.test("Admin composition keeps exact contexts paired with persistence-shaped rows", () => {
  const contextCreation = compositionSource.indexOf(
    "createAdminRequestApplicationContext({",
  );
  const hydration = compositionSource.indexOf(
    "hydrateStaffGameSessionBootstrap(",
  );
  assert(contextCreation >= 0);
  assert(hydration > contextCreation);
  assertIncludes(compositionSource, 'visibility: "all"');
  assertIncludes(
    compositionSource,
    "applicationContext: entry.applicationContext",
  );
  assertIncludes(compositionSource, "candidate.game === game");
  assertIncludes(
    compositionSource,
    "profile.supabaseAuthUserId !== supabaseAuthUserId",
  );
  assertIncludes(compositionSource, "game_join_code: gameSession.gameJoinCode");
  assert(
    !boundedSource(
      compositionSource,
      "function toAdminGameRow(",
      "}",
    ).includes("owner_staff_user_id"),
    "Admin persistence-shaped rows must not expand archive browser output.",
  );
});

Deno.test("Admin bootstrap composition errors retain auth_failed envelopes", () => {
  assertIncludes(
    indexSource,
    "error instanceof AdminBootstrapCompositionError",
  );
  assertIncludes(indexSource, 'code: "auth_failed"');
  assertIncludes(indexSource, "message: error.responseMessage");
});

function boundedSource(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0, `Missing source boundary: ${start}`);
  assert(endIndex > startIndex, `Missing source boundary: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertIncludes(value: string, fragment: string): void {
  assert(value.includes(fragment), `Missing fragment: ${fragment}`);
}

function assert(value: boolean, message = "Assertion failed."): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `Expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}
