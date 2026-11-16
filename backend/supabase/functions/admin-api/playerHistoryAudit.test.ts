import { loadPlayerHistoryAudit } from "./playerHistoryAudit.ts";
import type { AdminPlayerHistoryRow } from "../../../src/domains/players/contracts/adminPlayerHistoryReadRepository.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
const tables = [
  "audit_log",
  "ledger_entries",
  "player_attendance_records",
  "player_contract_progress",
  "player_sessions",
  "player_admin_flags",
  "player_admin_settings",
];
const game = "game-a", player = "player-a";
const playerRow = { id: player, game_session_id: game, display_name: "A" };
type Rows = Record<string, AdminPlayerHistoryRow[]>;
function fixture(
  rows: Rows = { players: [playerRow] },
  errors: Record<string, unknown> = {},
  gates: Record<string, Promise<void>> = {},
) {
  const calls: { table: string; operations: unknown[][] }[] = [];
  const awaited: string[] = [];
  const service = {
    from(table: string) {
      const call = { table, operations: [] as unknown[][] };
      calls.push(call);
      let data = rows[table] ?? [];
      const result = () => ({ data, error: errors[table] ?? null });
      const query = {
        select(columns: string) {
          call.operations.push(["select", columns]);
          return query;
        },
        eq(column: string, value: string) {
          call.operations.push(["eq", column, value]);
          data = data.filter((row) => row[column] === value);
          return query;
        },
        order(column: string, options: { ascending: boolean }) {
          call.operations.push(["order", column, options]);
          return query;
        },
        limit(count: number) {
          call.operations.push(["limit", count]);
          return query;
        },
        maybeSingle() {
          call.operations.push(["maybeSingle"]);
          awaited.push(table);
          return Promise.resolve(gates[table]).then(() => ({
            data: data[0] ?? null,
            error: errors[table] ?? null,
          }));
        },
        then<
          TResult1 = { data: AdminPlayerHistoryRow[]; error: unknown },
          TResult2 = never,
        >(
          onfulfilled?:
            | ((
              value: { data: AdminPlayerHistoryRow[]; error: unknown },
            ) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ): Promise<TResult1 | TResult2> {
          awaited.push(table);
          return Promise.resolve(gates[table]).then(result).then(
            onfulfilled,
            onrejected,
          );
        },
      };
      return query;
    },
  };
  return { service, calls, awaited };
}

Deno.test("history keeps exact query scope, selection, ordering, limits and output keys", async () => {
  const f = fixture();
  const result = await loadPlayerHistoryAudit(f.service, game, player);
  equal(f.calls.map((c) => c.table), ["players", ...tables]);
  equal(f.calls[0].operations, [
    ["select", "id,display_name,roster_label,status"],
    ["eq", "game_session_id", game],
    ["eq", "id", player],
    ["maybeSingle"],
  ]);
  const sortColumns = [
    "created_at",
    "created_at",
    "attendance_date",
    "updated_at",
    "created_at",
    "created_at",
  ];
  tables.forEach((table, i) => {
    equal(f.calls[i + 1].operations, [
      [
        "select",
        table === "player_sessions"
          ? "id,status,created_at,updated_at,expires_at,revoked_at"
          : "*",
      ],
      ["eq", "game_session_id", game],
      ["eq", table === "audit_log" ? "target_id" : "player_id", player],
      ...(i === 6
        ? [["maybeSingle"]]
        : [["order", sortColumns[i], { ascending: false }], [
          "limit",
          i < 4 ? 250 : 100,
        ]]),
    ]);
  });
  equal(result, {
    player: playerRow,
    timeline: [],
    auditLogs: [],
    ledgerEntries: [],
    attendance: [],
    contractProgress: [],
    sessions: [],
    flags: [],
    settings: {},
  });
  equal([...f.awaited].sort(), ["players", ...tables].sort());
});
for (
  const [label, gameId, playerId] of [["wrong game", "game-b", player], [
    "wrong player",
    game,
    "player-b",
  ], ["missing player", game, "missing"]]
) {
  Deno.test(`history ${label} stops before follow-up reads`, async () => {
    const f = fixture();
    equal(await loadPlayerHistoryAudit(f.service, gameId, playerId), null);
    equal(f.calls.length, 1);
  });
}
for (const table of ["players", ...tables]) {
  Deno.test(`history preserves ${table} error identity`, async () => {
    const error = { source: table };
    const f = fixture(undefined, { [table]: error });
    try {
      await loadPlayerHistoryAudit(f.service, game, player);
      throw new Error("Expected rejection");
    } catch (actual) {
      if (actual !== error) throw actual;
    }
    equal(f.calls.length, table === "players" ? 1 : 8);
  });
}
Deno.test("history first-error precedence follows source order, not completion order", async () => {
  for (let i = 0; i < tables.length; i++) {
    const first = { source: tables[i] };
    const errors = Object.fromEntries(
      tables.slice(i).map((t, j) => [t, j ? { source: t } : first]),
    );
    const f = fixture(undefined, errors);
    try {
      await loadPlayerHistoryAudit(f.service, game, player);
      throw new Error("Expected rejection");
    } catch (actual) {
      if (actual !== first) throw actual;
    }
    equal(f.calls.length, 8);
  }
});
Deno.test("history keeps timeline fallbacks, row identity and stable ties", async () => {
  const at = "2026-01-01T00:00:00Z";
  const scoped = (extra: AdminPlayerHistoryRow) => ({
    game_session_id: game,
    player_id: player,
    ...extra,
  });
  const rows: Rows = {
    players: [playerRow],
    audit_log: [{ game_session_id: game, target_id: player, created_at: at }],
    ledger_entries: [scoped({ created_at: at })],
    player_attendance_records: [
      scoped({ corrected_at: at, clocked_in_at: "older", created_at: "older" }),
      scoped({ clocked_in_at: at }),
      scoped({ created_at: at }),
    ],
    player_contract_progress: [scoped({ updated_at: at })],
    player_sessions: [scoped({ created_at: at })],
    player_admin_flags: [scoped({ created_at: at })],
    player_admin_settings: [scoped({ settings: { visible: true } })],
  };
  const f = fixture(rows);
  const result = await loadPlayerHistoryAudit(f.service, game, player);
  if (!result) throw new Error("Missing history");
  equal(result.timeline.map((t) => t.type), [
    "audit",
    "ledger",
    "attendance",
    "attendance",
    "attendance",
    "contract",
    "session",
    "flag",
  ]);
  equal(result.timeline.map((t) => t.at), Array(8).fill(at));
  if (result.timeline[0].data !== rows.audit_log[0]) {
    throw new Error("Row cloned");
  }
  equal(result.settings, { visible: true });
});
Deno.test("history sorts descending and retains missing timestamps", async () => {
  const f = fixture({
    players: [playerRow],
    audit_log: [
      { game_session_id: game, target_id: player, created_at: "2020-01-01" },
      { game_session_id: game, target_id: player, created_at: "2021-01-01" },
      { game_session_id: game, target_id: player },
      { game_session_id: "other", target_id: player, created_at: "2022-01-01" },
    ],
  });
  const result = await loadPlayerHistoryAudit(f.service, game, player);
  equal(result?.timeline.map((t) => t.at), [
    "2021-01-01",
    "2020-01-01",
    undefined,
  ]);
});
for (const settings of [null, false, 0, "", { nested: true }]) {
  Deno.test(`history preserves settings fallback ${JSON.stringify(settings)}`, async () => {
    const f = fixture({
      players: [playerRow],
      player_admin_settings: [{
        game_session_id: game,
        player_id: player,
        settings,
      }],
    });
    equal(
      (await loadPlayerHistoryAudit(f.service, game, player))?.settings,
      settings || {},
    );
  });
}

Deno.test("history launches all seven reads before reverse completion and keeps source error precedence", async () => {
  const releases: Record<string, () => void> = {};
  const gates = Object.fromEntries(
    tables.map((table) => [
      table,
      new Promise<void>((resolve) => {
        releases[table] = resolve;
      }),
    ]),
  );
  const first = { source: "audit" };
  const f = fixture(undefined, {
    audit_log: first,
    ledger_entries: { source: "ledger" },
  }, gates);
  const pending = loadPlayerHistoryAudit(f.service, game, player);
  for (let i = 0; i < 20 && f.awaited.length < 8; i++) await Promise.resolve();
  equal([...f.awaited].sort(), ["players", ...tables].sort());
  for (const table of [...tables].reverse()) {
    releases[table]();
    await Promise.resolve();
  }
  try {
    await pending;
    throw new Error("Expected rejection");
  } catch (error) {
    if (error !== first) throw error;
  }
});
Deno.test("history preserves rejected-query identity", async () => {
  const reason = new Error("Transport rejected");
  let reject!: (reason: unknown) => void;
  const gate = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  const f = fixture(undefined, {}, { ledger_entries: gate });
  const pending = loadPlayerHistoryAudit(f.service, game, player);
  for (let i = 0; i < 20 && f.awaited.length < 8; i++) await Promise.resolve();
  reject(reason);
  try {
    await pending;
    throw new Error("Expected rejection");
  } catch (error) {
    if (error !== reason) throw error;
  }
});
