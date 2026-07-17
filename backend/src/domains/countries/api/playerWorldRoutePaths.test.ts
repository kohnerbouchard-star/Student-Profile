import { readPlayerWorldRoutePath } from "./playerWorldRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player world routes parse direct and Edge Function paths", () => {
  assertEquals(
    readPlayerWorldRoutePath("/players/me/world/countries"),
    { kind: "countries" },
  );
  assertEquals(
    readPlayerWorldRoutePath(
      "/functions/v1/classroom-api/players/me/world/countries/northreach",
    ),
    { kind: "country", countryIdentifier: "northreach" },
  );
  assertEquals(
    readPlayerWorldRoutePath(
      "/functions/v1/classroom-api/players/me/world/news",
    ),
    { kind: "news" },
  );
});

Deno.test("player world routes reject spoofed prefixes and extra segments", () => {
  assertEquals(
    readPlayerWorldRoutePath(
      "/not-classroom-api/players/me/world/countries",
    ),
    null,
  );
  assertEquals(
    readPlayerWorldRoutePath("/players/me/world/countries/northreach/extra"),
    null,
  );
  assertEquals(
    readPlayerWorldRoutePath("/players/someone/world/news"),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
