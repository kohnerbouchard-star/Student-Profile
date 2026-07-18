import adminIndex from "./index.ts" with { type: "text" };

Deno.test("Admin router dispatches authenticated owned-game redemption operations before generic routes", () => {
  for (
    const fragment of [
      'import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";',
      "const game = ensureOwnedGame(context, gameId);",
      "const redemptionOperation = await handleInventoryRedemptionOperation(",
      "staffUserId: context.staff.id",
    ]
  ) assertIncludes(adminIndex, fragment);

  const ownership = adminIndex.indexOf(
    "const game = ensureOwnedGame(context, gameId);",
  );
  const redemption = adminIndex.indexOf(
    "const redemptionOperation = await handleInventoryRedemptionOperation(",
  );
  const genericRead = adminIndex.indexOf(
    "const readResponse = await handleGameRead(",
  );
  assert(ownership >= 0 && redemption > ownership && genericRead > redemption);
});

function assertIncludes(value: string, fragment: string): void {
  if (!value.includes(fragment)) {
    throw new Error(`Missing fragment: ${fragment}`);
  }
}

function assert(value: boolean): void {
  if (!value) throw new Error("Assertion failed");
}
