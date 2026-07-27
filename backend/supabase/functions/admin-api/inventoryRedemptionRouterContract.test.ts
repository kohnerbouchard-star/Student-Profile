import adminIndex from "./index.ts" with { type: "text" };

Deno.test("Admin router dispatches authenticated owned-game redemption operations before generic routes", () => {
  for (
    const fragment of [
      'import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";',
      "const securedContext = { ...authorizedContext, security };",
      "const game = ensureOwnedGame(securedContext, gameId);",
      "const redemptionOperation = await handleInventoryRedemptionOperation(",
      "staffUserId: securedContext.staff.id",
    ]
  ) assertIncludes(adminIndex, fragment);

  const securityGuard = adminIndex.indexOf(
    "const securedContext = { ...authorizedContext, security };",
  );
  const ownership = adminIndex.indexOf(
    "const game = ensureOwnedGame(securedContext, gameId);",
  );
  const redemption = adminIndex.indexOf(
    "const redemptionOperation = await handleInventoryRedemptionOperation(",
  );
  const genericRead = adminIndex.indexOf(
    "const readResponse = await handleGameRead(",
  );
  assert(
    securityGuard >= 0 &&
      ownership > securityGuard &&
      redemption > ownership &&
      genericRead > redemption,
  );
});

function assertIncludes(value: string, fragment: string): void {
  if (!value.includes(fragment)) {
    throw new Error(`Missing fragment: ${fragment}`);
  }
}

function assert(value: boolean): void {
  if (!value) throw new Error("Assertion failed");
}
