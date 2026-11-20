import {
  calculateAttendanceRewardAmount,
  selectAttendanceIncomeModifier,
} from "./attendanceRewardPolicy.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("attendance reward applies difficulty income and country exchange modifiers", () => {
  assertEquals(calculateAttendanceRewardAmount(10, 0.75, 1.2), 9);
});

Deno.test("attendance reward rounds to currency precision", () => {
  assertEquals(calculateAttendanceRewardAmount(1.01, 1.1, 1.05), 1.17);
});

Deno.test("attendance reward clamps policy multipliers to bounded game settings", () => {
  assertEquals(calculateAttendanceRewardAmount(10, 9, 0.1), 10);
});

Deno.test("active game difficulty policy overrides the saved preset profile", () => {
  assertEquals(selectAttendanceIncomeModifier(0.82, 0.95), 0.82);
});

Deno.test("saved difficulty preset profile supplies the modifier when no active policy exists", () => {
  assertEquals(selectAttendanceIncomeModifier(null, "0.9500"), 0.95);
});

Deno.test("missing difficulty policy data falls back to a neutral modifier", () => {
  assertEquals(selectAttendanceIncomeModifier(undefined, undefined), 1);
});

Deno.test("difficulty policy fallback values remain inside supported bounds", () => {
  assertEquals(selectAttendanceIncomeModifier(null, 0.1), 0.5);
  assertEquals(selectAttendanceIncomeModifier(9, 0.95), 2);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `Expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

import { resolveAttendanceRewardPolicyFromRepository } from "../application/resolveAttendanceRewardPolicy.ts";
import type { AttendanceRewardReadRepository } from "../contracts/attendanceRewardReadRepository.ts";
import { SupabaseAttendanceRewardReadRepository } from "../infrastructure/supabaseAttendanceRewardReadRepository.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";

const input = {
  gameSessionId: "game-a",
  playerId: "player-a",
  configuredBaseAmount: 1.01,
  attendanceConfig: {
    timezone: "Asia/Seoul",
    lateCutoffMinutes: null,
    presentRewardAmount: 1,
    lateRewardAmount: 0,
    currencyCode: "ECO",
    currencyMode: "player_country" as const,
    applyDifficultyIncomeModifier: true,
  },
};
const rows = {
  readActiveDifficulty: null,
  readGameDifficulty: { difficulty_preset: " MODERATE " },
  readDifficultyProfile: { income_modifier: "1.1" },
  readLatestAssignment: {
    country_profile_id: "country-a",
    assigned_at: "2026-01-01",
  },
  readActiveCountry: { country_code: "KR", currency_code: "KRW" },
  readLatestExchangeRate: {
    exchange_rate_index: "1.05",
    snapshot_sequence: "2",
  },
};
function fixture(overrides: Record<string, unknown> = {}, fail = "") {
  const calls: unknown[][] = [];
  const repository = Object.fromEntries(
    Object.entries({ ...rows, ...overrides }).map((
      [name, data],
    ) => [name, (...args: unknown[]) => {
      calls.push([name, ...args]);
      return Promise.resolve({
        data,
        error: fail === name ? { message: "private database details" } : null,
      });
    }]),
  ) as unknown as AttendanceRewardReadRepository;
  return { repository, calls };
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
Deno.test("reward port preserves scoped fallback order, amount and latest country inputs", async () => {
  const f = fixture();
  equal(
    await resolveAttendanceRewardPolicyFromRepository(f.repository, input),
    {
      configuredBaseAmount: 1.01,
      effectiveAmount: 1.17,
      baseCurrencyCode: "ECO",
      currencyCode: "KRW",
      currencyMode: "player_country",
      countryCode: "KR",
      incomeModifier: 1.1,
      exchangeRateIndex: 1.05,
    },
  );
  equal(f.calls, [
    ["readActiveDifficulty", "game-a"],
    ["readGameDifficulty", "game-a"],
    ["readDifficultyProfile", "moderate"],
    ["readLatestAssignment", "game-a", "player-a"],
    ["readActiveCountry", "country-a"],
    ["readLatestExchangeRate", "game-a", "country-a"],
  ]);
});
Deno.test("reward port retains active precedence and fixed mode short circuit", async () => {
  const f = fixture({ readActiveDifficulty: { income_modifier: 9 } });
  const result = await resolveAttendanceRewardPolicyFromRepository(
    f.repository,
    {
      ...input,
      attendanceConfig: { ...input.attendanceConfig, currencyMode: "fixed" },
    },
  );
  equal(result.effectiveAmount, 2.02);
  equal(result.incomeModifier, 2);
  equal(f.calls, [["readActiveDifficulty", "game-a"]]);
});
Deno.test("reward port disables income reads and preserves missing country fallback", async () => {
  for (
    const overrides of [{ readLatestAssignment: null }, {
      readActiveCountry: null,
    }, { readActiveCountry: { country_code: "KR", currency_code: "" } }]
  ) {
    const f = fixture(overrides);
    const result = await resolveAttendanceRewardPolicyFromRepository(
      f.repository,
      {
        ...input,
        attendanceConfig: {
          ...input.attendanceConfig,
          applyDifficultyIncomeModifier: false,
        },
      },
    );
    equal(result.currencyMode, "fixed_fallback");
    equal(result.effectiveAmount, 1.01);
    equal(
      f.calls.some(([name]) =>
        String(name).includes("Difficulty") || name === "readLatestExchangeRate"
      ),
      false,
    );
  }
});
Deno.test("reward port preserves explicit/custom/missing preset and missing snapshot behavior", async () => {
  for (const preset of [" CUSTOM ", "", "moderate"]) {
    const f = fixture({
      readGameDifficulty: null,
      readDifficultyProfile: null,
      readLatestExchangeRate: null,
    });
    const result = await resolveAttendanceRewardPolicyFromRepository(
      f.repository,
      { ...input, difficultyPreset: preset },
    );
    equal(result.effectiveAmount, 1.01);
    equal(
      f.calls.some(([name]) => name === "readGameDifficulty"),
      preset === "",
    );
    equal(
      f.calls.some(([name]) => name === "readDifficultyProfile"),
      preset === "moderate",
    );
  }
});
for (const failure of Object.keys(rows)) {
  Deno.test(`reward port fails closed at ${failure} without leaking database errors`, async () => {
    const f = fixture({}, failure);
    let caught: unknown;
    try {
      await resolveAttendanceRewardPolicyFromRepository(f.repository, input);
    } catch (error) {
      caught = error;
    }
    equal(
      (caught as { code: string })?.code,
      "attendance_reward_policy_failed",
    );
    equal(
      (caught as Error)?.message,
      "Attendance reward policy could not be resolved.",
    );
    equal(f.calls.at(-1)?.[0], failure);
  });
}
Deno.test("reward adapter preserves every query filter ordering limit and result/error identity", async () => {
  const queries: unknown[][] = [];
  const response = { data: { sentinel: true }, error: { message: "failure" } };
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const trace: unknown[] = [["from", table]];
      queries.push(trace);
      for (const method of ["select", "eq", "order", "limit"]) {
        chain[method] = (...args: unknown[]) => {
          trace.push([method, ...args]);
          return chain;
        };
      }
      chain.maybeSingle = () => {
        trace.push(["maybeSingle"]);
        return Promise.resolve(response);
      };
      return chain;
    },
  } as unknown as EdgeSupabaseClient;
  const repo = new SupabaseAttendanceRewardReadRepository(client);
  for (
    const result of [
      await repo.readActiveDifficulty("g"),
      await repo.readGameDifficulty("g"),
      await repo.readDifficultyProfile("easy"),
      await repo.readLatestAssignment("g", "p"),
      await repo.readActiveCountry("c"),
      await repo.readLatestExchangeRate("g", "c"),
    ]
  ) {
    if (result !== response as unknown) {
      throw new Error("Adapter changed response");
    }
  }
  equal(queries, [
    [
      ["from", "game_difficulty_policy_settings"],
      ["select", "income_modifier"],
      ["eq", "game_session_id", "g"],
      ["eq", "status", "active"],
      ["maybeSingle"],
    ],
    [["from", "game_settings"], ["select", "difficulty_preset"], [
      "eq",
      "game_session_id",
      "g",
    ], ["maybeSingle"]],
    [
      ["from", "difficulty_policy_profiles"],
      ["select", "income_modifier"],
      ["eq", "preset_key", "easy"],
      ["eq", "status", "active"],
      ["maybeSingle"],
    ],
    [
      ["from", "player_country_assignments"],
      ["select", "country_profile_id,assigned_at"],
      ["eq", "game_session_id", "g"],
      ["eq", "player_id", "p"],
      ["eq", "status", "active"],
      ["order", "assigned_at", { ascending: false }],
      ["limit", 1],
      ["maybeSingle"],
    ],
    [
      ["from", "country_profiles"],
      ["select", "country_code,currency_code"],
      ["eq", "id", "c"],
      ["eq", "status", "active"],
      ["maybeSingle"],
    ],
    [
      ["from", "country_economic_snapshots"],
      ["select", "exchange_rate_index,snapshot_sequence"],
      ["eq", "game_session_id", "g"],
      ["eq", "country_profile_id", "c"],
      ["order", "snapshot_sequence", { ascending: false }],
      ["limit", 1],
      ["maybeSingle"],
    ],
  ]);
});
