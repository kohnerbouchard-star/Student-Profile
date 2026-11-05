import {
  createGame,
  CreateGameValidationError,
  normalizeCreateGameInput,
  type CreateGameInput,
} from "./createGame.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const ownerStaffUserId = "00000000-0000-4000-8000-000000000201";

Deno.test("game creation retains the normalized Stock market timezone and other fields", () => {
  const stockMarketWindow = { timezone: " Europe/London ", opensAt: "08:00" };
  const result = normalizeCreateGameInput({
    ownerStaffUserId,
    name: " Market Game ",
    stockMarketWindow,
  });

  assertEquals(result.stockMarketWindow, { timezone: "Europe/London", opensAt: "08:00" });
  assertEquals(stockMarketWindow, { timezone: " Europe/London ", opensAt: "08:00" });
  assertEquals(result.name, "Market Game");
});

Deno.test("game creation rejects missing or invalid Stock timezones before persistence", async () => {
  const cases: { value: CreateGameInput["stockMarketWindow"]; message: string }[] = [
    { value: undefined, message: "stockMarketWindow is required and must be a JSON object." },
    { value: {}, message: "stockMarketWindow.timezone is required and must be a valid IANA timezone." },
    { value: { timezone: "Invalid/Timezone" }, message: "stockMarketWindow.timezone is required and must be a valid IANA timezone." },
  ];
  let persistenceCalls = 0;
  const dependencies = {
    gameRepository: {
      createGameSession: async () => { persistenceCalls += 1; throw new Error("Unexpected game write"); },
      createGameSettings: async () => { persistenceCalls += 1; throw new Error("Unexpected settings write"); },
    },
    auditRepository: {
      writeAuditLogEntry: async () => { persistenceCalls += 1; throw new Error("Unexpected audit write"); },
    },
  };

  for (const testCase of cases) {
    try {
      await createGame({ ownerStaffUserId, name: "Game", stockMarketWindow: testCase.value }, dependencies);
      throw new Error("Expected a game validation error.");
    } catch (error) {
      if (!(error instanceof CreateGameValidationError)) throw error;
      assertEquals(error.message, testCase.message);
    }
  }
  assertEquals(persistenceCalls, 0);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
