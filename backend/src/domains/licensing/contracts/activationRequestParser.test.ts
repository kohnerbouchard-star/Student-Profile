import {
  LicensingActivationRequestParseError,
  parseLicensingActivationRequestBody,
} from "./activationRequestParser.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Licensing activation retains normalized Stock market settings", () => {
  const stockMarketWindow = { timezone: " Asia/Seoul ", opensAt: "09:00" };
  const result = parseLicensingActivationRequestBody({
    purchaseCode: " purchase-code ",
    gameName: " Game ",
    stockMarketWindow,
  });

  assertEquals(result.purchaseCode, "purchase-code");
  assertEquals(result.gameName, "Game");
  assertEquals(result.stockMarketWindow, { timezone: "Asia/Seoul", opensAt: "09:00" });
  assertEquals(stockMarketWindow, { timezone: " Asia/Seoul ", opensAt: "09:00" });
});

Deno.test("Licensing activation translates Stock timezone errors", () => {
  const cases = [
    { value: undefined, message: "stockMarketWindow is required and must be a JSON object." },
    { value: {}, message: "stockMarketWindow.timezone is required and must be a valid IANA timezone." },
    { value: { timezone: "Invalid/Timezone" }, message: "stockMarketWindow.timezone is required and must be a valid IANA timezone." },
  ];

  for (const testCase of cases) {
    try {
      parseLicensingActivationRequestBody({
        purchaseCode: "purchase-code",
        gameName: "Game",
        stockMarketWindow: testCase.value,
      });
      throw new Error("Expected an activation parse error.");
    } catch (error) {
      if (!(error instanceof LicensingActivationRequestParseError)) throw error;
      assertEquals(error.code, "invalid_activation_settings");
      assertEquals(error.message, testCase.message);
    }
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
