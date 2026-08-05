import {
  AdminMutationError,
  type AdminMutationRpcClient,
} from "../../../platform/supabase/adminMutation.ts";
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

Deno.test("settings mutation derives validated snake-case patches and calls one RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = fakeClient(calls, {
    data: [{
      response_status: 200,
      response_body: {
        settings: settingsRow(),
        difficultyPolicy: {
          difficulty_preset: "custom",
          source: "custom",
          price_modifier: 2,
          income_modifier: 0.5,
        },
      },
      was_replayed: false,
    }],
    error: null,
  });

  const result = await updateGameSettings(client, {
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
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
    mutation: {
      idempotencyKey: "settings-command-001",
      requestId: "request-settings-001",
    },
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0], {
    name: "admin_update_game_settings_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_game_settings_patch: {
        difficulty_preset: "hard",
        attendance_window: { timezone: "Asia/Seoul" },
        stock_market_window: { timezone: "Asia/Seoul", opensAt: "09:00" },
      },
      p_difficulty_policy_patch: {
        price_modifier: 2,
        income_modifier: 0.5,
        difficulty_preset: "custom",
        source: "custom",
        custom_label: "Challenge",
        difficulty_policy_profile_id: null,
      },
      p_request_payload: {
        gameSettingsPatch: {
          difficulty_preset: "hard",
          attendance_window: { timezone: "Asia/Seoul" },
          stock_market_window: { timezone: "Asia/Seoul", opensAt: "09:00" },
        },
        difficultyPolicyPatch: {
          price_modifier: 2,
          income_modifier: 0.5,
          difficulty_preset: "custom",
          source: "custom",
          custom_label: "Challenge",
          difficulty_policy_profile_id: null,
        },
      },
      p_idempotency_key: "settings-command-001",
      p_request_id: "request-settings-001",
    },
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
});

Deno.test("settings validation rejects invalid timezone before privileged RPC", () => {
  let called = false;
  try {
    buildGameSettingsMutationPatches({
      stockMarketWindow: { timezone: "not/a-timezone" },
    });
  } catch (error) {
    called = error instanceof AdminMutationError &&
      error.code === "invalid_stock_market_timezone" && error.status === 400;
  }
  assertEquals(called, true);
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
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const result = await updateGameSettings(
    fakeClient(calls, {
      data: [{
        response_status: 200,
        response_body: {
          settings: settingsRow(),
          difficultyPolicy: {
            difficulty_preset: "hard",
            source: "preset",
          },
        },
        was_replayed: true,
      }],
      error: null,
    }),
    {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      requestBody: { difficultyPreset: "hard" },
      mutation: {
        idempotencyKey: "settings-replay-command-001",
        requestId: "request-settings-replay-001",
      },
    },
  );

  assertEquals(result.replayed, true);
  assertEquals(result.status, 200);
  assertEquals(result.settings.difficultyPreset, "hard");
  assertEquals(result.difficultyPolicy, {
    difficulty_preset: "hard",
    source: "preset",
  });
  assertEquals(calls.length, 1);
  assertEquals(
    calls[0]?.args.p_idempotency_key,
    "settings-replay-command-001",
  );
});

Deno.test("settings mutation maps same-key divergent-payload conflict to 409", async () => {
  const client = fakeClient([], {
    data: null,
    error: { message: "ADMIN_MUTATION_IDEMPOTENCY_CONFLICT" },
  });
  let failure: AdminMutationError | null = null;

  try {
    await updateGameSettings(client, {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      requestBody: { difficultyPreset: "easy" },
      mutation: {
        idempotencyKey: "settings-replay-command-001",
        requestId: "request-settings-replay-002",
      },
    });
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }

  assertEquals(failure?.status, 409);
  assertEquals(failure?.code, "idempotency_key_conflict");
});

Deno.test("settings database failure cannot become a success response", async () => {
  const client = fakeClient([], {
    data: null,
    error: { message: "private database detail" },
  });
  let failure: AdminMutationError | null = null;
  try {
    await updateGameSettings(client, {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      requestBody: { difficultyPreset: "standard" },
      mutation: {
        idempotencyKey: "settings-command-002",
        requestId: "settings-command-002",
      },
    });
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.status, 500);
  assertEquals(failure?.code, "game_settings_failed");
  assertEquals(failure?.message.includes("private database detail"), false);
});

Deno.test("settings group reset uses the same atomic idempotent settings RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = fakeClient(calls, {
    data: [{
      response_status: 200,
      response_body: {
        settings: { ...settingsRow(), stock_market_window: {} },
        difficultyPolicy: null,
      },
      was_replayed: false,
    }],
    error: null,
  });

  const result = await resetGameSettingsGroup(client, {
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    group: "stock-market",
    mutation: {
      idempotencyKey: "settings-reset-command-001",
      requestId: "request-settings-reset-001",
    },
  });

  assertEquals(calls[0], {
    name: "admin_update_game_settings_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_game_settings_patch: { stock_market_window: {} },
      p_difficulty_policy_patch: {},
      p_request_payload: {
        resetGroup: "stock-market",
        gameSettingsPatch: { stock_market_window: {} },
        difficultyPolicyPatch: {},
      },
      p_idempotency_key: "settings-reset-command-001",
      p_request_id: "request-settings-reset-001",
    },
  });
  assertEquals(result.group, "stock-market");
  assertEquals(result.settings.stockMarketWindow, {});
});

Deno.test("settings group reset rejects groups without an authoritative profile", async () => {
  const client = fakeClient([], { data: null, error: null });
  let failure: AdminMutationError | null = null;
  try {
    await resetGameSettingsGroup(client, {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      group: "taxes",
      mutation: {
        idempotencyKey: "settings-reset-command-002",
        requestId: "settings-reset-command-002",
      },
    });
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.status, 409);
  assertEquals(failure?.code, "settings_group_reset_not_configured");
});

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

function fakeClient(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  response: {
    readonly data: unknown;
    readonly error:
      | { readonly message?: string; readonly code?: string }
      | null;
  },
): AdminMutationRpcClient {
  return {
    rpc<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(
        response as {
          readonly data: T | null;
          readonly error: typeof response.error;
        },
      );
    },
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
