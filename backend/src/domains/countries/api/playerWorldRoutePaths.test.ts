import { readPlayerWorldRoutePath } from "./playerWorldRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("player world routes parse direct and classroom-api paths", () => {
  assertEquals(readPlayerWorldRoutePath("/players/me/world/countries"), { kind: "countries" });
  assertEquals(
    readPlayerWorldRoutePath("/functions/v1/classroom-api/players/me/world/countries/NRC"),
    { kind: "country", countryIdentifier: "NRC" },
  );
  assertEquals(
    readPlayerWorldRoutePath("/functions/v1/classroom-api/players/me/world/news"),
    { kind: "news" },
  );
});

Deno.test("player world routes reject spoofed and overlong paths", () => {
  assertEquals(readPlayerWorldRoutePath("/not-classroom-api/players/me/world/news"), null);
  assertEquals(readPlayerWorldRoutePath("/players/me/world/countries/NRC/extra"), null);
  assertEquals(readPlayerWorldRoutePath("/players/other/world/countries"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}
