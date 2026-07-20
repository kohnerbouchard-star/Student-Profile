import { readPlayerStoryDeliveryRoutePath } from "./playerStoryDeliveryRoutePaths.ts";

Deno.test("player story delivery route parser accepts direct and edge paths", () => {
  assertEquals(readPlayerStoryDeliveryRoutePath("/players/me/story-deliveries"), { kind: "list" });
  assertEquals(
    readPlayerStoryDeliveryRoutePath("/functions/v1/classroom-api/players/me/story-deliveries"),
    { kind: "list" },
  );
  assertEquals(
    readPlayerStoryDeliveryRoutePath("/players/me/story-deliveries/ndl_0123456789abcdef0123456789abcdef/state"),
    { kind: "state", publicDeliveryId: "ndl_0123456789abcdef0123456789abcdef" },
  );
});

Deno.test("player story delivery route parser fails malformed paths closed", () => {
  assertEquals(readPlayerStoryDeliveryRoutePath("/players/me/story-deliveries/not-public/state"), { kind: "malformed" });
  assertEquals(readPlayerStoryDeliveryRoutePath("/players/me/story-deliveries/extra"), { kind: "malformed" });
  assertEquals(readPlayerStoryDeliveryRoutePath("/players/me/notifications"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
