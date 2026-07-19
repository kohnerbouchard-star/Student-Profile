import { handleAttendancePlayerOperation } from "../../../../supabase/functions/admin-api/attendancePlayerOperations.ts";
import {
  alreadyIssuedRewardResult,
  ContractRewardLedgerRpcWriter,
  issueContractRewards,
} from "../../contracts/services/contractRewardService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const PLAYER = "00000000-0000-4000-8000-000000000011";
const STAFF = "00000000-0000-4000-8000-000000000021";
const ATTENDANCE = "00000000-0000-4000-8000-000000000031";
const DATE = "2026-07-19";

Deno.test("staff Attendance and Player adjustments create one ledger result, replay safely, and preserve exact balances", async () => {
  const service = new LedgerFixtureService();

  const attendanceInput = {
    gameSessionId: GAME,
    staffUserId: STAFF,
    path: `/games/${GAME}/attendance/reward-adjustments`,
    method: "POST",
    body: {
      playerId: PLAYER,
      attendanceDate: DATE,
      amount: 10,
      currencyCode: "ECO",
      note: "Present reward correction.",
      idempotencyKey: "attendance-adjustment-001",
    },
  };

  const attendanceApplied = await handleAttendancePlayerOperation(service, attendanceInput);
  assertEquals(attendanceApplied.status, 200);
  assertEquals(attendanceApplied.body.data.outcome, "applied");
  assertEquals(service.ledgerEntries.length, 1);
  assertEquals(service.balance(GAME, PLAYER, "cash", "ECO"), 110);
  assertEquals(service.ledgerEntries[0], {
    amount: 10,
    entryType: "credit",
    sourceDomain: "attendance",
    sourceAction: "staff_reward_adjustment",
  });

  const attendanceReplay = await handleAttendancePlayerOperation(service, attendanceInput);
  assertEquals(attendanceReplay.status, 200);
  assertEquals(attendanceReplay.body.data.outcome, "replayed");
  assertEquals(service.ledgerEntries.length, 1);
  assertEquals(service.balance(GAME, PLAYER, "cash", "ECO"), 110);

  const attendanceConflict = await handleAttendancePlayerOperation(service, {
    ...attendanceInput,
    body: { ...attendanceInput.body, amount: 11 },
  });
  assertEquals(attendanceConflict.status, 409);
  assertEquals(attendanceConflict.body.code, "ledger_idempotency_conflict");
  assertEquals(service.ledgerEntries.length, 1);

  service.lockedDates.add(`${GAME}:${DATE}`);
  const locked = await handleAttendancePlayerOperation(service, {
    ...attendanceInput,
    body: { ...attendanceInput.body, idempotencyKey: "attendance-locked-001" },
  });
  assertEquals(locked.status, 423);
  assertEquals(service.ledgerEntries.length, 1);
  service.lockedDates.clear();

  const missingKey = await handleAttendancePlayerOperation(service, {
    ...attendanceInput,
    body: { ...attendanceInput.body, idempotencyKey: "" },
  });
  assertEquals(missingKey.status, 400);
  assertEquals(service.ledgerEntries.length, 1);

  const wrongGame = await handleAttendancePlayerOperation(service, {
    ...attendanceInput,
    gameSessionId: OTHER_GAME,
    path: `/games/${OTHER_GAME}/attendance/reward-adjustments`,
    body: { ...attendanceInput.body, idempotencyKey: "attendance-wrong-game-001" },
  });
  assertEquals(wrongGame.status, 404);
  assertEquals(service.ledgerEntries.length, 1);

  const playerInput = {
    gameSessionId: GAME,
    staffUserId: STAFF,
    path: `/games/${GAME}/players/${PLAYER}/ledger-adjustments`,
    method: "POST",
    body: {
      amount: 25,
      adjustmentType: "debit",
      currencyCode: "ECO",
      reason: "Administrative correction.",
      idempotencyKey: "player-adjustment-001",
    },
  };

  const playerApplied = await handleAttendancePlayerOperation(service, playerInput);
  assertEquals(playerApplied.status, 200);
  assertEquals(playerApplied.body.data.outcome, "applied");
  assertEquals(service.ledgerEntries.length, 2);
  assertEquals(service.balance(GAME, PLAYER, "cash", "ECO"), 85);
  assertEquals(service.ledgerEntries[1], {
    amount: -25,
    entryType: "debit",
    sourceDomain: "players",
    sourceAction: "staff_player_balance_adjustment",
  });

  const playerReplay = await handleAttendancePlayerOperation(service, playerInput);
  assertEquals(playerReplay.body.data.outcome, "replayed");
  assertEquals(service.ledgerEntries.length, 2);
  assertEquals(service.balance(GAME, PLAYER, "cash", "ECO"), 85);

  const playerConflict = await handleAttendancePlayerOperation(service, {
    ...playerInput,
    body: { ...playerInput.body, amount: 30 },
  });
  assertEquals(playerConflict.status, 409);
  assertEquals(service.ledgerEntries.length, 2);
});

Deno.test("Contract cash rewards issue one ledger write while invalid and already-issued paths issue none", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: [{
          ledger_entry_id: "00000000-0000-4000-8000-000000000041",
          account_type: "cash",
          balance: 125,
          currency_code: "ECO",
          created_at: "2026-07-19T06:00:00.000Z",
        }],
        error: null,
      });
    },
  };
  const writer = new ContractRewardLedgerRpcWriter(client);
  const applied = await issueContractRewards({
    gameSessionId: GAME,
    contractId: "00000000-0000-4000-8000-000000000051",
    progressId: "00000000-0000-4000-8000-000000000061",
    playerId: PLAYER,
    rewardPayload: { cash: { amount: 15, currencyCode: "ECO", accountType: "cash" } },
    issuedAt: "2026-07-19T06:00:00.000Z",
    staffId: STAFF,
    requestId: "contract-reward-001",
    ledger: writer,
  });
  assertEquals(applied.ok, true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "record_player_ledger_entry");
  assertEquals(calls[0].args.p_source_domain, "contracts");
  assertEquals(calls[0].args.p_source_action, "contract_reward_cash");
  assertEquals(calls[0].args.p_amount, 15);

  const invalid = await issueContractRewards({
    gameSessionId: GAME,
    contractId: "00000000-0000-4000-8000-000000000051",
    progressId: "00000000-0000-4000-8000-000000000062",
    playerId: PLAYER,
    rewardPayload: { cash: { amount: 0 } },
    issuedAt: "2026-07-19T06:00:00.000Z",
    staffId: STAFF,
    requestId: "contract-reward-invalid",
    ledger: writer,
  });
  assertEquals(invalid.ok, false);
  assertEquals(calls.length, 1);

  const alreadyIssued = alreadyIssuedRewardResult();
  assertEquals(alreadyIssued.status, "skipped");
  assertEquals(alreadyIssued.appliedRewards.length, 0);
  assertEquals(calls.length, 1);
});

Deno.test("economic SQL mutation matrix enforces replay-before-write and zero-ledger rejection paths", async () => {
  const [attendance, contracts, store, stocks, staff, dispatcher, browser, classroom] = await Promise.all([
    Deno.readTextFile("supabase/migrations/20260713085704_repair_player_attendance_clock_in_v1.sql"),
    Deno.readTextFile("supabase/migrations/20260713194500_issue_contract_rewards_atomic_v1.sql"),
    Deno.readTextFile("supabase/migrations/20260624070500_fix_store_purchase_rpc_ambiguous_columns.sql"),
    Deno.readTextFile("supabase/migrations/20260624131500_fix_stock_market_order_country_cash_rpc_v1.sql"),
    Deno.readTextFile("supabase/migrations/20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql"),
    Deno.readTextFile("supabase/functions/admin-api/attendancePlayerOperations.ts"),
    Deno.readTextFile("../admin/classroom-write-fallback.js"),
    Deno.readTextFile("src/domains/economy/api/staffLedgerAdjustmentHttpHandler.ts"),
  ]);

  assertEquals(count(attendance, "from public.record_player_ledger_entry("), 1);
  assertBefore(attendance, "on conflict on constraint player_attendance_records_scope_unique", "from public.record_player_ledger_entry(");
  assertBefore(attendance, "if v_attendance.id is null then", "from public.record_player_ledger_entry(");

  assertEquals(count(contracts, "from public.record_player_ledger_entry("), 1);
  assertContains(contracts, "constraint contract_reward_issuances_scope_unique unique (game_session_id, progress_id)");
  assertBefore(contracts, "if v_progress.reward_issued_at is not null then", "from public.record_player_ledger_entry(");
  assertBefore(contracts, "if v_progress.status <> 'completed' then", "from public.record_player_ledger_entry(");

  assertEquals(count(store, "from public.record_player_ledger_entry("), 1);
  assertBefore(store, "if v_idempotency.status = 'COMPLETED' then", "from public.record_player_ledger_entry(");
  for (const rejection of ["QUOTE_NOT_FOUND", "QUOTE_EXPIRED", "ITEM_UNAVAILABLE", "INSUFFICIENT_STOCK", "INSUFFICIENT_BALANCE"]) {
    assertBefore(store, rejection, "from public.record_player_ledger_entry(");
  }
  assertContains(store, "on conflict on constraint mutation_idempotency_keys_scope_unique");

  assertEquals(count(stocks, "from public.record_player_ledger_entry("), 2);
  assertBefore(stocks, "if found then", "from public.record_player_ledger_entry(");
  assertBefore(stocks, "'insufficient_cash'", "from public.record_player_ledger_entry(");
  assertBefore(stocks, "'insufficient_shares'", stocks.lastIndexOf("from public.record_player_ledger_entry("));
  assertContains(stocks, "perform pg_advisory_xact_lock(");
  assertContains(stocks, "'stocks',\n        'stock_buy'");
  assertContains(stocks, "'stocks',\n        'stock_sell'");

  assertEquals(count(staff, "from public.record_player_ledger_entry("), 1);
  assertBefore(staff, "if v_idempotency.status = 'COMPLETED' then", "from public.record_player_ledger_entry(");
  assertBefore(staff, "LEDGER_IDEMPOTENCY_CONFLICT", "from public.record_player_ledger_entry(");
  assertContains(staff, "on conflict on constraint mutation_idempotency_keys_scope_unique");
  assertContains(staff, "result_type = 'ledger_entry'");

  assertBefore(dispatcher, "handleIdempotentLedgerOperation", "handleAttendanceOperation");
  assertContains(browser, "withEconomicIdempotency");
  assertContains(browser, "idempotencyKey: lifecycle.requestId");
  assertContains(browser, "X-Idempotency-Key");
  assertContains(classroom, "recordIdempotentStaffLedgerAdjustment");
  assertContains(classroom, "ledger_idempotency_key_required");
});

class LedgerFixtureService {
  readonly lockedDates = new Set<string>();
  readonly ledgerEntries: Array<{
    amount: number;
    entryType: string;
    sourceDomain: string;
    sourceAction: string;
  }> = [];
  private readonly balances = new Map<string, number>([
    [`${GAME}:${PLAYER}:cash:ECO`, 100],
  ]);
  private readonly idempotency = new Map<string, { hash: string; row: Record<string, unknown> }>();

  from(table: string) {
    return new FixtureQuery(this, table);
  }

  rpc(name: string, args: Record<string, unknown>) {
    if (name !== "record_idempotent_staff_ledger_adjustment_v1") {
      return Promise.resolve({ data: null, error: { message: "UNKNOWN_RPC" } });
    }
    const game = String(args.p_game_session_id);
    const player = String(args.p_player_id);
    if (game !== GAME || player !== PLAYER) {
      return Promise.resolve({ data: null, error: { message: "PLAYER_NOT_FOUND" } });
    }
    const scope = `${game}:${player}:${args.p_route_key}:${args.p_idempotency_key}`;
    const hash = stableJson({ ...args, p_idempotency_key: undefined });
    const existing = this.idempotency.get(scope);
    if (existing) {
      if (existing.hash !== hash) {
        return Promise.resolve({ data: null, error: { message: "LEDGER_IDEMPOTENCY_CONFLICT" } });
      }
      return Promise.resolve({ data: [{ ...existing.row, outcome: "replayed" }], error: null });
    }

    const accountType = String(args.p_account_type);
    const currencyCode = String(args.p_currency_code);
    const amount = Number(args.p_amount);
    const balanceKey = `${game}:${player}:${accountType}:${currencyCode}`;
    const balance = (this.balances.get(balanceKey) ?? 0) + amount;
    this.balances.set(balanceKey, balance);
    this.ledgerEntries.push({
      amount,
      entryType: String(args.p_entry_type),
      sourceDomain: String(args.p_source_domain),
      sourceAction: String(args.p_source_action),
    });
    const sequence = this.ledgerEntries.length;
    const row = {
      outcome: "applied",
      ledger_entry_id: uuid(sequence),
      account_balance_id: uuid(100 + sequence),
      account_type: accountType,
      balance,
      currency_code: currencyCode,
      created_at: `2026-07-19T06:00:0${sequence}.000Z`,
    };
    this.idempotency.set(scope, { hash, row });
    return Promise.resolve({ data: [row], error: null });
  }

  read(table: string, filters: Record<string, unknown>) {
    if (table === "players") {
      return filters.game_session_id === GAME && filters.id === PLAYER
        ? { id: PLAYER, display_name: "Player", roster_label: "P-1", status: "active" }
        : null;
    }
    if (table === "attendance_day_locks") {
      const key = `${filters.game_session_id}:${filters.attendance_date}`;
      return this.lockedDates.has(key) ? { id: "lock-1", status: "locked", reason: "Closed" } : null;
    }
    if (table === "player_attendance_records") {
      return filters.game_session_id === GAME && filters.player_id === PLAYER && filters.attendance_date === DATE
        ? { id: ATTENDANCE, status: "present" }
        : null;
    }
    return null;
  }

  balance(game: string, player: string, accountType: string, currencyCode: string) {
    return this.balances.get(`${game}:${player}:${accountType}:${currencyCode}`) ?? 0;
  }
}

class FixtureQuery implements PromiseLike<{ data: unknown; error: null }> {
  private readonly filters: Record<string, unknown> = {};
  constructor(private readonly service: LedgerFixtureService, private readonly table: string) {}
  select(_columns: string) { return this; }
  eq(column: string, value: unknown) { this.filters[column] = value; return this; }
  maybeSingle() { return Promise.resolve({ data: this.service.read(this.table, this.filters), error: null }); }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.maybeSingle().then(onfulfilled, onrejected);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function count(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function assertBefore(value: string, first: string, second: string | number): void {
  const firstIndex = value.indexOf(first);
  const secondIndex = typeof second === "number" ? second : value.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`Expected ${first} before ${String(second)}.`);
  }
}

function assertContains(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Expected source to contain ${expected}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
