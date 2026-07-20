declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const CLASSROOM_API = new URL(
  "../../supabase/functions/classroom-api/index.ts",
  import.meta.url,
);

Deno.test("Classroom API dispatch applies one central guard to each integrated reviewed route", async () => {
  const source = await Deno.readTextFile(CLASSROOM_API);

  assertEquals(
    occurrences(source, "dispatchRateLimitedReviewedPlayerRequest("),
    19,
  );
  assertEquals(
    occurrences(source, "dispatchRateLimitedPlayerLoginRequest("),
    1,
  );
  for (
    const directReturn of [
      "return handlePlayerCapabilityManifestRequest(",
      "return handlePlayerBankingPublicRequest(",
      "return handlePlayerGameDashboardRequest(",
      "return handlePlayerWorldReadRequest(",
      "return handlePlayerInventoryReadRequest(",
      "return handlePlayerInventoryRedemptionRequest(",
      "return handlePlayerContractAcceptanceRequest(",
      "return handlePlayerContractPublicSubmitRequest(",
      "return handlePlayerContractPublicListRequest(",
      "return handlePlayerStorePublicRequest(",
      "return handlePlayerNotificationRequest(",
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
