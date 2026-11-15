import { assertRouteModuleImports, readEdgeCompositionSource } from "./edgeCompositionSource.test.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const CLASSROOM_API = new URL(
  "../../supabase/functions/classroom-api/index.ts",
  import.meta.url,
);
const PLAYER_API_RUNTIME = new URL(
  "../../supabase/functions/player-api/runtime.ts",
  import.meta.url,
);

Deno.test("Classroom API dispatch applies one central guard to each integrated reviewed route", async () => {
  const source = await Deno.readTextFile(CLASSROOM_API);

  assertEquals(
    occurrences(source, "return dispatchRateLimitedReviewedPlayerRequest("),
    25,
  );
  assertEquals(
    occurrences(source, "reviewed(request,"),
    0,
  );
  assertEquals(
    occurrences(source, "dispatchRateLimitedPlayerLoginRequest("),
    1,
  );
  assertEquals(
    occurrences(source, '"marketplace"'),
    1,
  );
  for (
    const endpointKey of [
      '"marketplaceListing"',
      '"marketplaceActivate"',
      '"marketplacePurchase"',
      '"marketplaceCancel"',
      '"marketplaceDispute"',
      '"progression"',
      '"progressionUnlock"',
      '"progressionClaim"',
    ]
  ) {
    assertEquals(source.includes(endpointKey), true);
  }
  for (
    const directReturn of [
      "return handlePlayerCapabilityManifestRequest(",
      "return handlePlayerBankingPublicRequest(",
      "return handlePlayerBankingFxRequest(",
      "return handlePlayerBusinessBankingRequest(",
      "return handlePlayerGameDashboardRequest(",
      "return handlePlayerWorldReadRequest(",
      "return handlePlayerWorldRuntimeEdgeRequest(",
      "return handlePlayerInventoryReadRequest(",
      "return handlePlayerInventoryRedemptionRequest(",
      "return handlePlayerContractAcceptanceRequest(",
      "return handlePlayerContractPublicSubmitRequest(",
      "return handlePlayerContractPublicListRequest(",
      "return handlePlayerStorePublicRequest(",
      "return handlePlayerNotificationRequest(",
      "return handlePlayerStoryDeliveryRequest(",
      "return handlePlayerMarketplaceRequest(",
      "return handlePlayerProgressionRequest(",
      "return handlePlayerSessionLogoutRequest(",
      "return handlePlayerStockAssetListRequest(",
      "return handlePlayerStockMarketReadRequest(",
      "return handlePlayerStockMarketTradingRequest(",
      "return handlePlayerSessionBootstrapRequest(",
      "return handlePlayerLoginRequest(",
    ]
  ) {
    assertEquals(source.includes(directReturn), false);
  }
});

Deno.test("both Player composition roots forward the authenticated Inventory context", async () => {
  for (const sourceUrl of [CLASSROOM_API, PLAYER_API_RUNTIME]) {
    const source = await readEdgeCompositionSource(sourceUrl);
    const normalized = source.replace(/\s+/gu, " ");

    assertEquals(
      normalized.includes(
        '"inventoryRedemption", (applicationContext) => handlePlayerInventoryRedemptionRequest( request, playerInventoryRedemptionRoute, { createServiceClient }, applicationContext, )',
      ),
      true,
    );
    assertEquals(
      normalized.includes(
        '"inventory", (applicationContext) => handlePlayerInventoryReadRequest( request, playerInventoryRoute, { createServiceClient }, applicationContext, )',
      ),
      true,
    );
  }
});

Deno.test("both Player composition roots share the Store route rate-limit classifier", async () => {
  for (const sourceUrl of [CLASSROOM_API, PLAYER_API_RUNTIME]) {
    const source = await readEdgeCompositionSource(sourceUrl);
    const normalized = source.replace(/\s+/gu, " ");

    assertEquals(
      normalized.includes(
        "playerStoreRouteRateLimitKey(playerStoreRoute), () => handlePlayerStorePublicRequest",
      ),
      true,
    );
    assertEquals(
      normalized.includes('playerStoreRoute.kind === "items"'),
      false,
    );
  }
});

Deno.test("both Player composition roots share the Banking FX parser, classifier, and authenticated context", async () => {
  for (const sourceUrl of [CLASSROOM_API, PLAYER_API_RUNTIME]) {
    const source = await readEdgeCompositionSource(sourceUrl);
    const normalized = source.replace(/\s+/gu, " ");
    assertEquals(source.includes("readPlayerBankingFxRoutePath"), true);
    assertEquals(source.includes("playerBankingFxRateLimitKey"), true);
    assertEquals(
      normalized.includes(
        "handlePlayerBankingFxRequest( request, playerBankingFxRoute, { createServiceClient }, applicationContext, )",
      ),
      true,
    );
  }
});

function occurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}

Deno.test("composition reader rejects disconnected route modules", () => {
  let rejected = false;
  try {
    assertRouteModuleImports('const label = "./dispatchPlayerWorldRoutes.ts";', ["dispatchPlayerWorldRoutes.ts"]);
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true);
  assertRouteModuleImports('import { dispatchPlayerWorldRoutes } from "./dispatchPlayerWorldRoutes.ts";', ["dispatchPlayerWorldRoutes.ts"]);
});

for (const [name, source] of [
  ["type declaration", 'import type { dispatch } from "./route.ts";'],
  ["type specifier", 'import { type dispatch } from "./route.ts";'],
  ["line comment", '// import { dispatch } from "./route.ts";'],
  ["block comment", '/* import { dispatch } from "./route.ts"; */'],
  ["template literal", 'const text = `import { dispatch } from "./route.ts";`;'],
  ["quoted literal", 'const text = \'import { dispatch } from "./route.ts";\';'],
]) {
  Deno.test(`route source reader rejects ${name} as a value import`, () => {
    let rejected = false;
    try { assertRouteModuleImports(source, ["route.ts"]); } catch { rejected = true; }
    assertEquals(rejected, true);
  });
}
