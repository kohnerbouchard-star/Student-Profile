import adminIndex from "./index.ts" with { type: "text" };
import adminBootstrapComposition from "./adminBootstrapComposition.ts" with {
  type: "text",
};

Deno.test("Admin router dispatches authenticated owned-game redemption operations before generic routes", () => {
  for (
    const fragment of [
      'import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";',
      "await authorizeAndHydrateAdminBootstrapContext(",
      "securedContext = authorization.context;",
      "const game = ensureOwnedGame(securedContext, gameId);",
      "const applicationContext = applicationContextForAdminGame(",
      "const redemptionOperation = await handleInventoryRedemptionOperation(",
      "applicationContext,",
    ]
  ) assertIncludes(adminIndex, fragment);
  for (
    const fragment of [
      "await guardAdminRequest(request, context, path)",
      "if (security.ok === false) return security",
      "requestId: createRequestId()",
      "await hydrateAdminBootstrapContext({",
    ]
  ) assertIncludes(adminBootstrapComposition, fragment);

  const authorization = adminIndex.indexOf(
    "await authorizeAndHydrateAdminBootstrapContext(",
  );
  const hydration = adminIndex.indexOf(
    "securedContext = authorization.context;",
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
    authorization >= 0 &&
      hydration > authorization &&
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
