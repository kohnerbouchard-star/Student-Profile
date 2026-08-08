import { requiredAdminPermission } from "./adminSecurityGuard.ts";
import { handlePersonalBankingAdminOperation } from "./bankingOperations.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000003";
const COUNTRY_ID = "00000000-0000-4000-8000-000000000004";

class Query {
  rows: Record<string, any>[];

  constructor(rows: Record<string, any>[]) {
    this.rows = rows.map((row) => ({ ...row }));
  }

  select(_columns: string): Query {
    return this;
  }

  eq(column: string, value: unknown): Query {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): Query {
    const direction = options.ascending === false ? -1 : 1;
    this.rows.sort((left, right) =>
      String(left[column] ?? "").localeCompare(String(right[column] ?? "")) *
      direction
    );
    return this;
  }

  limit(count: number): Query {
    this.rows = this.rows.slice(0, count);
    return this;
  }

  maybeSingle(): Promise<{ data: Record<string, any> | null; error: null }> {
    return Promise.resolve({ data: this.rows[0] || null, error: null });
  }

  then(resolve: (value: { data: Record<string, any>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.rows, error: null }).then(resolve);
  }
}

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function service() {
  const rpcCalls: Array<{ functionName: string; args: Record<string, unknown> }> = [];
  const tables: Record<string, Record<string, any>[]> = {
    players: [{
      id: PLAYER_ID,
      game_session_id: GAME_ID,
      display_name: "Banking Player",
      roster_label: "Y10-A-01",
      status: "active",
      created_at: "2026-08-08T00:00:00.000Z",
    }],
    account_balances: [
      {
        game_session_id: GAME_ID,
        player_id: PLAYER_ID,
        account_type: "checking",
        balance: "120.50",
        currency_code: "HWC",
        updated_at: "2026-08-08T01:00:00.000Z",
      },
      {
        game_session_id: GAME_ID,
        player_id: PLAYER_ID,
        account_type: "savings",
        balance: 45,
        currency_code: "HWC",
        updated_at: "2026-08-08T01:00:00.000Z",
      },
      {
        game_session_id: GAME_ID,
        player_id: PLAYER_ID,
        account_type: "cash",
        balance: 999,
        currency_code: "HWC",
      },
      {
        game_session_id: GAME_ID,
        player_id: PLAYER_ID,
        account_type: "credit",
        balance: 5000,
        currency_code: "ECO",
      },
    ],
    player_country_assignments: [{
      game_session_id: GAME_ID,
      player_id: PLAYER_ID,
      country_profile_id: COUNTRY_ID,
      status: "active",
      assigned_at: "2026-08-08T00:00:00.000Z",
    }],
    country_profiles: [{
      id: COUNTRY_ID,
      country_name: "Hanmin",
      currency_code: "HWC",
      status: "active",
    }],
    ledger_entries: [
      {
        id: "00000000-0000-4000-8000-000000000010",
        game_session_id: GAME_ID,
        player_id: PLAYER_ID,
        account_type: "checking",
        amount: -10,
        currency_code: "HWC",
        entry_type: "debit",
        source_domain: "banking",
        source_action: "savings_transfer",
        source_id: "00000000-0000-4000-8000-000000000011",
        created_at: "2026-08-08T02:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000012",
        game_session_id: GAME_ID,
        player_id: PLAYER_ID,
        account_type: "cash",
        amount: 99,
        currency_code: "HWC",
        entry_type: "credit",
        source_domain: "legacy",
        source_action: "cash_credit",
        created_at: "2026-08-08T01:00:00.000Z",
      },
    ],
  };

  return {
    rpcCalls,
    from(table: string) {
      return new Query(tables[table] || []);
    },
    rpc(functionName: string, args: Record<string, unknown>) {
      rpcCalls.push({ functionName, args });
      return Promise.resolve({
        data: [{
          outcome: "applied",
          ledger_entry_id: "00000000-0000-4000-8000-000000000020",
          account_balance_id: "00000000-0000-4000-8000-000000000021",
          account_type: args.p_account_type,
          balance: 55,
          currency_code: args.p_currency_code,
          created_at: "2026-08-08T03:00:00.000Z",
        }],
        error: null,
      });
    },
  };
}

Deno.test("personal Banking routes preserve economy.adjust without weakening Players", () => {
  assertEquals(
    requiredAdminPermission("GET", `/games/${GAME_ID}/banking/players`),
    "economy.adjust",
  );
  assertEquals(
    requiredAdminPermission("GET", `/games/${GAME_ID}/players`),
    "players.manage",
  );
  assertEquals(
    requiredAdminPermission(
      "POST",
      `/games/${GAME_ID}/banking/players/${PLAYER_ID}/ledger-adjustments`,
    ),
    "economy.adjust",
  );
});

Deno.test("Banking roster exposes only canonical personal account rows", async () => {
  const mock = service();
  const result = await handlePersonalBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/banking/players`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/banking/players",
  });

  assertEquals(result.handled, true);
  assertEquals(result.status, 200);
  const players = result.body.data.players as Record<string, any>[];
  assertEquals(players.length, 1);
  assertEquals(players[0].displayName, "Banking Player");
  assertEquals(players[0].countryName, "Hanmin");
  assertEquals(
    players[0].balances.map((row: Record<string, any>) => row.accountType),
    ["checking", "savings"],
  );
  assert(!JSON.stringify(players).includes("stockPositions"), "Banking roster leaked unrelated Player admin data.");
  assert(!JSON.stringify(players).includes("adminSettings"), "Banking roster leaked Player admin settings.");
});

Deno.test("Banking history is canonical and strips ledger/source ownership identifiers", async () => {
  const mock = service();
  const result = await handlePersonalBankingAdminOperation(mock, {
    request: request(
      "GET",
      `/games/${GAME_ID}/banking/players/${PLAYER_ID}/history-audit`,
    ),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/banking/players/${PLAYER_ID}/history-audit`,
  });

  assertEquals(result.status, 200);
  assertEquals(result.body.data.ledgerEntries, [{
    accountType: "checking",
    amount: -10,
    currencyCode: "HWC",
    entryType: "debit",
    sourceDomain: "banking",
    sourceAction: "savings_transfer",
    createdAt: "2026-08-08T02:00:00.000Z",
  }]);
  const serialized = JSON.stringify(result.body.data);
  assert(!serialized.includes(PLAYER_ID), "Banking history leaked the Player ownership UUID.");
  assert(!serialized.includes("00000000-0000-4000-8000-000000000010"), "Banking history leaked a ledger UUID.");
  assert(!serialized.includes("00000000-0000-4000-8000-000000000011"), "Banking history leaked a source UUID.");
});

Deno.test("Banking adjustment uses canonical account, explicit currency, and Banking idempotency authority", async () => {
  const mock = service();
  const result = await handlePersonalBankingAdminOperation(mock, {
    request: request(
      "POST",
      `/games/${GAME_ID}/banking/players/${PLAYER_ID}/ledger-adjustments`,
      {
        accountType: "savings",
        currencyCode: "HWC",
        amount: 10,
        reason: "Correct savings balance",
        idempotencyKey: "admin-banking-adjustment-0001",
      },
    ),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/banking/players/${PLAYER_ID}/ledger-adjustments`,
  });

  assertEquals(result.status, 200);
  assertEquals(result.body.data.adjusted, true);
  assertEquals(mock.rpcCalls.length, 1);
  assertEquals(mock.rpcCalls[0].functionName, "record_idempotent_staff_ledger_adjustment_v1");
  assertEquals(mock.rpcCalls[0].args, {
    p_game_session_id: GAME_ID,
    p_player_id: PLAYER_ID,
    p_staff_user_id: STAFF_ID,
    p_route_key: "admin.banking.ledger_adjustment",
    p_idempotency_key: "admin-banking-adjustment-0001",
    p_account_type: "savings",
    p_amount: 10,
    p_currency_code: "HWC",
    p_entry_type: "credit",
    p_source_domain: "banking",
    p_source_action: "staff_player_balance_adjustment",
    p_source_id: null,
    p_audit_metadata: {
      note: "Correct savings balance",
      currencyMode: "player_country",
      resolvedCurrencyCode: "HWC",
    },
  });
  assert(!JSON.stringify(result.body).includes("ledger_entry_id"), "Banking mutation leaked a ledger UUID.");
  assert(!JSON.stringify(result.body).includes("account_balance_id"), "Banking mutation leaked an account-balance UUID.");
});

Deno.test("Banking adjustment rejects retired cash before persistence", async () => {
  const mock = service();
  const result = await handlePersonalBankingAdminOperation(mock, {
    request: request(
      "POST",
      `/games/${GAME_ID}/banking/players/${PLAYER_ID}/ledger-adjustments`,
      {
        accountType: "cash",
        currencyCode: "HWC",
        amount: 5,
        reason: "Legacy compatibility must not be accepted",
        idempotencyKey: "admin-banking-adjustment-0002",
      },
    ),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/banking/players/${PLAYER_ID}/ledger-adjustments`,
  });

  assertEquals(result.status, 400);
  assertEquals(result.body.code, "banking_account_type_invalid");
  assertEquals(mock.rpcCalls.length, 0);
});

Deno.test("Banking handler leaves unrelated Admin routes untouched", async () => {
  const mock = service();
  const result = await handlePersonalBankingAdminOperation(mock, {
    request: request("GET", `/games/${GAME_ID}/players`),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/players",
  });
  assertEquals(result, { handled: false });
});
