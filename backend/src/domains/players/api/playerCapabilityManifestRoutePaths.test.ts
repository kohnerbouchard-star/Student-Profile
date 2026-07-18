import { readPlayerCapabilityManifestRoutePath } from "./playerCapabilityManifestRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player capability manifest route accepts only exact direct and Edge paths", () => {
  assertEquals(
    readPlayerCapabilityManifestRoutePath("/players/me/capabilities"),
    { kind: "manifest" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/functions/v1/classroom-api/players/me/capabilities",
    ),
    { kind: "manifest" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath("/players/me/capabilities/extra"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath("/spoof/players/me/capabilities"),
    null,
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath(
      "/spoof/classroom-api/players/me/capabilities",
    ),
    null,
  );
  assertEquals(
    readPlayerCapabilityManifestRoutePath("/players/me/inventory"),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
