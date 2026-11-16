import { handleStaffAttendanceDailyRequest } from "../api/staffAttendanceDailyHttpHandler.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";

const game = { id: "game-one", name: "Class", status: "active" };
const player = {
  id: "p1",
  display_name: "First",
  roster_label: null,
  status: "active",
};
const missing = {
  ...player,
  id: "p2",
  display_name: "Second",
  roster_label: "B",
};
const record = {
  id: "record",
  player_id: "p1",
  attendance_date: "2026-11-06",
  status: "late",
  clocked_in_at: "2026-11-06T09:00:00Z",
};
type Options = {
  fail?: string;
  absent?: boolean;
  denied?: boolean;
  empty?: boolean;
  nulls?: boolean;
  throwAt?: string;
};
function fixture(options: Options = {}) {
  const trace: unknown[][] = [];
  let resolved = 0;
  const client = {
    from(table: string) {
      const call: unknown[] = [table];
      trace.push(call);
      const data: Record<string, unknown> = {
        game_sessions: options.absent ? null : game,
        game_settings: options.nulls ? null : { attendance_window: { timezone: "UTC" } },
        players: options.nulls ? null : options.empty ? [] : [player, missing],
        player_attendance_records: options.nulls
          ? null
          : options.empty
          ? []
          : [record, { ...record, id: "orphan", player_id: "outside-roster" }],
      };
      const result = () => {
        if (options.throwAt === table) {
          throw new Error("private SQL diagnostic");
        }
        return {
          data: data[table],
          error: options.fail === table ? { message: "private SQL diagnostic" } : null,
        };
      };
      const builder = {
        select(value: string) {
          call.push(["select", value]);
          return builder;
        },
        eq(field: string, value: string) {
          call.push(["eq", field, value]);
          return builder;
        },
        order(field: string, value: unknown) {
          call.push(["order", field, value]);
          return builder;
        },
        maybeSingle() {
          call.push(["maybeSingle"]);
          return Promise.resolve().then(result);
        },
        then(
          resolve: (value: unknown) => unknown,
          reject: (error: unknown) => unknown,
        ) {
          return Promise.resolve().then(result).then(resolve, reject);
        },
      };
      return builder;
    },
  } as unknown as EdgeSupabaseClient;
  const dependencies = {
    resolveStaffForRequest: async () => {
      resolved++;
      return options.denied
        ? {
          ok: false as const,
          status: 401,
          error: {
            code: "staff_required",
            message: "Staff required.",
            retryable: false,
          },
        }
        : {
          ok: true as const,
          staff: { id: "staff-one" },
          serviceClient: client,
        };
    },
  };
  return {
    trace,
    resolved: () => resolved,
    request: (method = "GET", date = "2026-11-06") =>
      handleStaffAttendanceDailyRequest(
        new Request(`https://example.test/attendance?date=${date}`, { method }),
        game.id,
        dependencies,
      ),
  };
}
function expectedTrace() {
  return [
    [
      "game_sessions",
      ["select", "id,name,status,owner_staff_user_id"],
      ["eq", "id", game.id],
      ["eq", "owner_staff_user_id", "staff-one"],
      ["maybeSingle"],
    ],
    ["game_settings", ["select", "attendance_window"], [
      "eq",
      "game_session_id",
      game.id,
    ], ["maybeSingle"]],
    [
      "players",
      ["select", "id,display_name,roster_label,status"],
      ["eq", "game_session_id", game.id],
      ["eq", "status", "active"],
      ["order", "display_name", { ascending: true }],
    ],
    [
      "player_attendance_records",
      ["select", "id,player_id,attendance_date,status,clocked_in_at"],
      ["eq", "game_session_id", game.id],
      ["eq", "attendance_date", "2026-11-06"],
      ["order", "clocked_in_at", { ascending: true }],
    ],
  ];
}
Deno.test("daily read preserves production query sequence, scope, projection and response", async () => {
  const f = fixture(),
    response = await f.request(),
    body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(f.trace, expectedTrace());
  assert.equal(f.resolved(), 1);
  assert(Number.isFinite(Date.parse(body.generatedAt)));
  delete body.generatedAt;
  assert.deepEqual(body, {
    ok: true,
    gameSession: game,
    attendanceDate: "2026-11-06",
    timezone: "UTC",
    summary: {
      presentCount: 0,
      lateCount: 1,
      scannedCount: 1,
      missingCount: 1,
      activePlayerCount: 2,
    },
    records: [{
      id: "record",
      status: "late",
      attendanceDate: "2026-11-06",
      clockedInAt: record.clocked_in_at,
      player: {
        id: "p1",
        displayName: "First",
        rosterLabel: null,
        status: "active",
      },
    }],
    missingPlayers: [{
      id: "p2",
      displayName: "Second",
      rosterLabel: "B",
      status: "active",
    }],
  });
});
Deno.test("daily method and Staff denial execute no ownership or domain reads", async () => {
  const method = fixture();
  assert.equal((await method.request("POST")).status, 405);
  assert.equal(method.resolved(), 0);
  assert.deepEqual(method.trace, []);
  const denied = fixture({ denied: true });
  assert.equal((await denied.request()).status, 401);
  assert.deepEqual(denied.trace, []);
});
Deno.test("daily owned-game absence and lookup failure stop before Attendance reads", async () => {
  for (
    const [options, status, code] of [
      [{ absent: true }, 404, "game_session_not_found"],
      [{ fail: "game_sessions" }, 500, "game_session_lookup_failed"],
    ] as const
  ) {
    const f = fixture(options), response = await f.request();
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
    assert.deepEqual(f.trace, expectedTrace().slice(0, 1));
  }
});
Deno.test("daily each sequential read failure short-circuits and redacts diagnostics", async () => {
  for (
    const [index, table] of [
      "game_settings",
      "players",
      "player_attendance_records",
    ].entries()
  ) {
    for (const mode of ["fail", "throwAt"] as const) {
      const f = fixture({ [mode]: table }), response = await f.request();
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: {
          code: "attendance_daily_list_failed",
          message: "Daily attendance could not be loaded.",
          retryable: false,
        },
      });
      assert.deepEqual(f.trace, expectedTrace().slice(0, index + 2));
    }
  }
});
Deno.test("daily empty and null results retain empty summaries and default timezone", async () => {
  for (const options of [{ empty: true }, { nulls: true }]) {
    const f = fixture(options),
      response = await f.request(),
      body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(f.trace, expectedTrace());
    assert.deepEqual(body.records, []);
    assert.deepEqual(body.missingPlayers, []);
    assert.deepEqual(body.summary, {
      presentCount: 0,
      lateCount: 0,
      scannedCount: 0,
      missingCount: 0,
      activePlayerCount: 0,
    });
    assert.equal(body.timezone, options.nulls ? "Asia/Seoul" : "UTC");
  }
});
Deno.test("daily malformed date stops after window read with existing validation error", async () => {
  const f = fixture(), response = await f.request("GET", "invalid-date");
  assert.equal(response.status, 400);
  assert.deepEqual(f.trace, expectedTrace().slice(0, 2));
});
Deno.test("daily missing runtime environment stops before Staff resolution", async () => {
  const saved = Deno.env.get("SUPABASE_URL");
  try {
    Deno.env.delete("SUPABASE_URL");
    const f = fixture(), response = await f.request();
    assert.equal(response.status, 500);
    assert.equal(
      (await response.json()).error.code,
      "missing_edge_runtime_config",
    );
    assert.equal(f.resolved(), 0);
    assert.deepEqual(f.trace, []);
  } finally {
    if (saved !== undefined) Deno.env.set("SUPABASE_URL", saved);
  }
});

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  env: { get(name: string): string | undefined; set(name: string, value: string): void; delete(name: string): void };
};
function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion failed");
}
namespace assert {
  export function equal(actual: unknown, expected: unknown) {
    assert(Object.is(actual, expected));
  }
  export function deepEqual(actual: unknown, expected: unknown) {
    const canonical = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object"
        ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]),
        )
        : value;
    const a = JSON.stringify(canonical(actual)), b = JSON.stringify(canonical(expected));
    if (a !== b) throw new Error(`Expected ${b}; got ${a}`);
  }
}
