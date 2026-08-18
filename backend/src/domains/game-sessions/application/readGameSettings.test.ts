import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import {
  type AdminGameSettingsReadModelPersistence,
  GameSettingsReadError,
  type GameSettingsReadRepository,
  type GameSettingsReadScope,
  readGameSettings,
} from "./readGameSettings.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000102";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UPDATED_AT = "2026-08-05T02:45:00.000Z";

Deno.test("settings read preserves exact context and reconstructs its public result", async () => {
  const repository = new FakeRepository({
    difficulty_preset: "hard",
    attendance_window: { timezone: "Asia/Seoul" },
    business_market_window: null,
    stock_market_window: ["private malformed value"],
    news_schedule: { cadence: "weekly" },
    updated_at: UPDATED_AT,
    owner_staff_user_id: STAFF_ID,
    private_schema_detail: "must not escape",
  });
  const applicationContext = context();
  const ownedGameAtRuntime = {
    id: GAME_ID,
    name: "Period 4 Economy",
    status: "active",
    owner_staff_user_id: STAFF_ID,
  };

  const result = await readGameSettings({
    applicationContext,
    gameSession: ownedGameAtRuntime,
  }, repository);

  assertEquals(repository.inputs.length, 1);
  assertSame(repository.inputs[0]?.applicationContext, applicationContext);
  assertEquals(result, {
    gameSession: {
      id: GAME_ID,
      name: "Period 4 Economy",
      status: "active",
    },
    settings: {
      difficultyPreset: "hard",
      attendanceWindow: { timezone: "Asia/Seoul" },
      businessMarketWindow: {},
      stockMarketWindow: {},
      newsSchedule: { cadence: "weekly" },
      updatedAt: UPDATED_AT,
    },
  });
  assertEquals(result.gameSession === ownedGameAtRuntime, false);
  const serialized = JSON.stringify(result);
  assertEquals(serialized.includes(STAFF_ID), false);
  assertEquals(serialized.includes("owner_staff_user_id"), false);
  assertEquals(serialized.includes("private_schema_detail"), false);
  assertEquals(serialized.includes(applicationContext.requestId), false);
});

Deno.test("settings read rejects a cross-game input before repository access", async () => {
  const repository = new FakeRepository({});

  await assertReadError(
    repository,
    "game_settings_failed",
    500,
    {
      applicationContext: context(OTHER_GAME_ID),
      gameSession: gameSession(),
    },
  );
  assertEquals(repository.inputs, []);
});

Deno.test("settings read preserves the missing-settings response contract", async () => {
  await assertReadError(
    new FakeRepository(null),
    "game_settings_not_found",
    404,
  );
});

Deno.test("settings read sanitizes persistence failures", async () => {
  const repository = new FakeRepository(null);
  repository.error = new Error("private database detail");

  await assertReadError(repository, "game_settings_failed", 500);
});

class FakeRepository implements GameSettingsReadRepository {
  readonly inputs: GameSettingsReadScope[] = [];
  error: Error | null = null;

  constructor(
    private readonly value: Readonly<Record<string, unknown>> | null,
  ) {}

  readGameSettings(
    input: GameSettingsReadScope,
  ): Promise<Readonly<Record<string, unknown>> | null> {
    this.inputs.push(input);
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve(this.value);
  }

  readAdminGameSettingsView(
    _input: GameSettingsReadScope,
  ): Promise<AdminGameSettingsReadModelPersistence> {
    return Promise.reject(new Error("Unexpected Admin settings read."));
  }
}

function input() {
  return {
    applicationContext: context(),
    gameSession: gameSession(),
  };
}

function gameSession() {
  return {
    id: GAME_ID,
    name: "Period 4 Economy",
    status: "active",
  };
}

function context(gameSessionId = GAME_ID): GameSessionsStaffApplicationContext {
  return Object.freeze({
    gameSessionId,
    actor: Object.freeze({ kind: "staff" as const, staffUserId: STAFF_ID }),
    role: "game_admin" as const,
    permissions: Object.freeze(["settings.manage"]),
    requestId: "server-request-settings-read-001",
    assuranceLevel: "aal2" as const,
  });
}

async function assertReadError(
  repository: GameSettingsReadRepository,
  code: string,
  status: number,
  readInput = input(),
): Promise<void> {
  try {
    await readGameSettings(readInput, repository);
  } catch (error) {
    if (error instanceof GameSettingsReadError) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      assertEquals(error.retryable, false);
      assertEquals(error.message.includes("private database"), false);
      return;
    }
    throw error;
  }
  throw new Error(`Expected GameSettingsReadError with code ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error("Expected identical references.");
}
