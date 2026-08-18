import adminIndex from "./index.ts" with { type: "text" };

Deno.test("Admin router dispatches authenticated owned-game redemption operations before generic routes", () => {
  for (
    const fragment of [
      'import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";',
      "securedContext = await hydrateAdminBootstrapContext({",
      "requestId: crypto.randomUUID(),",
      "const game = ensureOwnedGame(securedContext, gameId);",
      "const applicationContext = applicationContextForAdminGame(",
      "const redemptionOperation = await handleInventoryRedemptionOperation(",
      "applicationContext,",
    ]
  ) assertIncludes(adminIndex, fragment);

  const securityGuard = adminIndex.indexOf(
    "const security = await guardAdminRequest(",
  );
  const hydration = adminIndex.indexOf(
    "securedContext = await hydrateAdminBootstrapContext({",
  );
  const ownership = adminIndex.indexOf(
    "const game = ensureOwnedGame(securedContext, gameId);",
  );
  const applicationContext = adminIndex.indexOf(
    "const applicationContext = applicationContextForAdminGame(",
  );
  const redemption = adminIndex.indexOf(
    "const redemptionOperation = await handleInventoryRedemptionOperation(",
  );
  const genericRead = adminIndex.indexOf(
    "const readResponse = await handleGameRead(",
  );
  assert(
    securityGuard >= 0 &&
      hydration > securityGuard &&
      ownership > hydration &&
      applicationContext > ownership &&
      redemption > applicationContext &&
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
