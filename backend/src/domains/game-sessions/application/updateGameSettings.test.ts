import { AdminMutationError } from "../../../platform/supabase/adminMutation.ts";
import type {
  GameJoinCodeRotationCommand,
  GameSessionMutationPersistenceResult,
  GameSessionMutationRepository,
  GameSettingsMutationCommand,
} from "../contracts/gameSessionMutationRepository.ts";
import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import {
  buildGameSettingsMutationPatches,
  resetGameSettingsGroup,
  updateGameSettings,
} from "./updateGameSettings.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UPDATED_AT = "2026-08-05T02:45:00.000Z";

Deno.test("settings mutation preserves context and identity while deriving validated patches", async () => {
  const repository = new FakeMutationRepository({
    status: 200,
    replayed: false,
    body: {
      settings: settingsRow(),
      difficultyPolicy: {
        difficulty_preset: "custom",
        source: "custom",
        price_modifier: 2,
        income_modifier: 0.5,
      },
    },
  });
  const applicationContext = context();
  const mutation = {
    idempotencyKey: "settings-command-001",
    requestId: "mutation-request-settings-001",
  };

  const result = await updateGameSettings(repository, {
    applicationContext,
    requestBody: {
      settings: {
        difficultyPreset: "Hard",
        attendanceWindow: { timezone: "Asia/Seoul" },
        stockMarketWindow: { timezone: " Asia/Seoul ", opensAt: "09:00" },
        priceMultiplier: 3,
        incomeModifier: "0.25",
        customLabel: "Challenge",
      },
    },
    mutation,
  });

  assertEquals(repository.settingsInputs.length, 1);
  const command = repository.settingsInputs[0];
  assertSame(command?.applicationContext, applicationContext);
  assertSame(command?.mutation, mutation);
  assertEquals(command?.gameSettingsPatch, {
    difficulty_preset: "hard",
    attendance_window: { timezone: "Asia/Seoul" },
    stock_market_window: { timezone: "Asia/Seoul", opensAt: "09:00" },
  });
  assertEquals(command?.difficultyPolicyPatch, {
    price_modifier: 2,
    income_modifier: 0.5,
    difficulty_preset: "custom",
    source: "custom",
    custom_label: "Challenge",
    difficulty_policy_profile_id: null,
  });
  assertEquals(command?.requestPayload, {
    gameSettingsPatch: command?.gameSettingsPatch,
    difficultyPolicyPatch: command?.difficultyPolicyPatch,
  });
  assertEquals(result, {
    status: 200,
    replayed: false,
    settings: {
      difficultyPreset: "hard",
      attendanceWindow: { timezone: "Asia/Seoul" },
      businessMarketWindow: {},
      stockMarketWindow: { timezone: "Asia/Seoul" },
      newsSchedule: {},
      updatedAt: UPDATED_AT,
    },
    difficultyPolicy: {
      difficulty_preset: "custom",
      source: "custom",
      price_modifier: 2,
      income_modifier: 0.5,
    },
  });
  const serialized = JSON.stringify(result);
  assertEquals(serialized.includes(STAFF_ID), false);
  assertEquals(serialized.includes(applicationContext.requestId), false);
  assertEquals(serialized.includes(mutation.requestId), false);
});

Deno.test("settings validation rejects invalid timezone before the repository", () => {
  const repository = new FakeMutationRepository(null);
  let failure: AdminMutationError | null = null;
  try {
    updateGameSettings(repository, {
      applicationContext: context(),
      requestBody: {
        stockMarketWindow: { timezone: "not/a-timezone" },
      },
      mutation: mutation(),
    });
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.code, "invalid_stock_market_timezone");
  assertEquals(failure?.status, 400);
  assertEquals(repository.settingsInputs, []);
});

Deno.test("settings mutation flattens the double-wrapped v606 terminal envelope without dropping sibling settings", () => {
  const patches = buildGameSettingsMutationPatches({
    action: "save-settings",
    payload: {
      attendanceWindow: { timezone: "Asia/Seoul" },
      payload: {
        mode: "explicit-save",
        settings: {
          difficultyPreset: "hard",
          priceMultiplier: 1.25,
          incomeModifier: 0.9,
        },
      },
    },
  });

  assertEquals(patches.gameSettingsPatch, {
    difficulty_preset: "hard",
    attendance_window: { timezone: "Asia/Seoul" },
  });
  assertEquals(patches.difficultyPolicyPatch, {
    price_modifier: 1.25,
    income_modifier: 0.9,
    difficulty_preset: "custom",
    source: "custom",
    custom_label: "Custom",
    difficulty_policy_profile_id: null,
  });
});

Deno.test("settings mutation returns the stored result for an exact replay", async () => {
  const repository = new FakeMutationRepository({
    status: 200,
    replayed: true,
    body: {
      settings: settingsRow(),
      difficultyPolicy: {
        difficulty_preset: "hard",
        source: "preset",
      },
    },
  });

  const result = await updateGameSettings(repository, {
    applicationContext: context(),
    requestBody: { difficultyPreset: "hard" },
    mutation: mutation("settings-replay-command-001"),
  });

  assertEquals(result.replayed, true);
  assertEquals(result.status, 200);
  assertEquals(result.settings.difficultyPreset, "hard");
  assertEquals(result.difficultyPolicy, {
    difficulty_preset: "hard",
    source: "preset",
  });
  assertEquals(
    repository.settingsInputs[0]?.mutation.idempotencyKey,
    "settings-replay-command-001",
  );
});

Deno.test("settings mutation propagates same-key divergent-payload conflicts", async () => {
  const repository = new FakeMutationRepository(null);
  repository.error = new AdminMutationError(
    "idempotency_key_conflict",
    "That Idempotency-Key was already used for a different request.",
    409,
  );
  let failure: AdminMutationError | null = null;

  try {
    await updateGameSettings(repository, {
      applicationContext: context(),
      requestBody: { difficultyPreset: "easy" },
      mutation: mutation("settings-replay-command-001"),
    });
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }

  assertEquals(failure?.status, 409);
  assertEquals(failure?.code, "idempotency_key_conflict");
});

Deno.test("settings persistence failure cannot become a success response", async () => {
  const repository = new FakeMutationRepository(null);
  repository.error = new AdminMutationError(
    "game_settings_failed",
    "Game settings request failed.",
    500,
  );
  let failure: AdminMutationError | null = null;
  try {
    await updateGameSettings(repository, {
      applicationContext: context(),
      requestBody: { difficultyPreset: "standard" },
      mutation: mutation("settings-command-002"),
    });
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.status, 500);
  assertEquals(failure?.code, "game_settings_failed");
  assertEquals(failure?.message, "Game settings request failed.");
});

Deno.test("settings group reset uses the same repository seam and exact context", async () => {
  const repository = new FakeMutationRepository({
    status: 200,
    replayed: false,
    body: {
      settings: { ...settingsRow(), stock_market_window: {} },
      difficultyPolicy: null,
    },
  });
  const applicationContext = context();
  const identity = mutation("settings-reset-command-001");

  const result = await resetGameSettingsGroup(repository, {
    applicationContext,
    group: "stock-market",
    mutation: identity,
  });

  const command = repository.settingsInputs[0];
  assertSame(command?.applicationContext, applicationContext);
  assertSame(command?.mutation, identity);
  assertEquals(command?.gameSettingsPatch, { stock_market_window: {} });
  assertEquals(command?.difficultyPolicyPatch, {});
  assertEquals(command?.requestPayload, {
    resetGroup: "stock-market",
    gameSettingsPatch: { stock_market_window: {} },
    difficultyPolicyPatch: {},
  });
  assertEquals(result.group, "stock-market");
  assertEquals(result.settings.stockMarketWindow, {});
});

Deno.test("settings group reset rejects unconfigured groups before the repository", async () => {
  const repository = new FakeMutationRepository(null);
  let failure: AdminMutationError | null = null;
  try {
    await resetGameSettingsGroup(repository, {
      applicationContext: context(),
      group: "taxes",
      mutation: mutation("settings-reset-command-002"),
    });
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.status, 409);
  assertEquals(failure?.code, "settings_group_reset_not_configured");
  assertEquals(repository.settingsInputs, []);
});

Deno.test("settings mutation rejects malformed persistence output", async () => {
  const repository = new FakeMutationRepository({
    status: 200,
    replayed: false,
    body: { settings: { difficulty_preset: "hard" } },
  });
  let failure: AdminMutationError | null = null;
  try {
    await updateGameSettings(repository, {
      applicationContext: context(),
      requestBody: { difficultyPreset: "hard" },
      mutation: mutation(),
    });
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.code, "game_settings_failed");
  assertEquals(failure?.status, 500);
});

class FakeMutationRepository implements GameSessionMutationRepository {
  readonly settingsInputs: GameSettingsMutationCommand[] = [];
  error: Error | null = null;

  constructor(
    private readonly value: GameSessionMutationPersistenceResult | null,
  ) {}

  rotateGameJoinCode(
    _command: GameJoinCodeRotationCommand,
  ): Promise<never> {
    return Promise.reject(new Error("Unexpected join-code rotation."));
  }

  updateGameSettings(command: GameSettingsMutationCommand) {
    this.settingsInputs.push(command);
    if (this.error) return Promise.reject(this.error);
    if (!this.value) return Promise.reject(new Error("missing fixture"));
    return Promise.resolve(this.value);
  }
}

function settingsRow(): Record<string, unknown> {
  return {
    difficulty_preset: "hard",
    attendance_window: { timezone: "Asia/Seoul" },
    business_market_window: null,
    stock_market_window: { timezone: "Asia/Seoul" },
    news_schedule: null,
    updated_at: UPDATED_AT,
  };
}

function context(): GameSessionsStaffApplicationContext {
  return Object.freeze({
    gameSessionId: GAME_ID,
    actor: Object.freeze({ kind: "staff" as const, staffUserId: STAFF_ID }),
    role: "game_admin" as const,
    permissions: Object.freeze(["game.update"]),
    requestId: "server-request-settings-001",
    assuranceLevel: "aal2" as const,
  });
}

function mutation(idempotencyKey = "settings-command-001") {
  return {
    idempotencyKey,
    requestId: `mutation-request-${idempotencyKey}`,
  };
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
