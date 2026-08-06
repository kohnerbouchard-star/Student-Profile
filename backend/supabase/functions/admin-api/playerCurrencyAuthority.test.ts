import { resolvePlayerLedgerCurrencyAuthority } from "./playerOperations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Player ledger local mode derives the active country currency", async () => {
  const service = new FakeService({ currencyCode: "THD" });
  const result = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: "game-1",
    playerId: "player-1",
    body: { currencyMode: "player_country", currencyCode: "THD" },
  });

  assertEquals(result, {
    ok: true,
    currencyMode: "player_country",
    currencyCode: "THD",
  });
  assertEquals(service.tables, ["player_country_assignments", "country_profiles"]);
});

Deno.test("Player ledger local mode rejects a browser currency mismatch", async () => {
  const service = new FakeService({ currencyCode: "THD" });
  const result = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: "game-1",
    playerId: "player-1",
    body: { currencyMode: "player_country", currencyCode: "ECO" },
  });

  assertEquals(result, {
    ok: false,
    status: 400,
    body: {
      code: "ledger_currency_mismatch",
      message: "The requested currency does not match the player's active country.",
    },
  });
});

Deno.test("Player ledger global mode remains an explicit ECO wallet", async () => {
  const service = new FakeService({ currencyCode: "THD" });
  const result = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: "game-1",
    playerId: "player-1",
    body: { currencyMode: "global_eco", currencyCode: "ECO" },
  });

  assertEquals(result, {
    ok: true,
    currencyMode: "global_eco",
    currencyCode: "ECO",
  });
  assertEquals(service.tables, []);
});

Deno.test("Legacy explicit ECO requests remain compatible during rollout", async () => {
  const service = new FakeService({ currencyCode: "THD" });
  const result = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: "game-1",
    playerId: "player-1",
    body: { currencyCode: "ECO" },
  });

  assertEquals(result, {
    ok: true,
    currencyMode: "global_eco",
    currencyCode: "ECO",
  });
  assertEquals(service.tables, []);
});

Deno.test("Player ledger defaults an unspecified currency to local authority", async () => {
  const service = new FakeService({ currencyCode: "LUM" });
  const result = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: "game-1",
    playerId: "player-1",
    body: {},
  });

  assertEquals(result, {
    ok: true,
    currencyMode: "player_country",
    currencyCode: "LUM",
  });
});

Deno.test("Player ledger fails closed when the active country currency is absent", async () => {
  const service = new FakeService({ assignmentAvailable: false });
  const result = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: "game-1",
    playerId: "player-1",
    body: { currencyMode: "player_country" },
  });

  assertEquals(result, {
    ok: false,
    status: 409,
    body: {
      code: "player_country_currency_unavailable",
      message: "The player's active country currency is unavailable.",
    },
  });
});

Deno.test("Player ledger rejects unknown currency modes", async () => {
  const service = new FakeService({ currencyCode: "THD" });
  const result = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: "game-1",
    playerId: "player-1",
    body: { currencyMode: "automatic_conversion" },
  });

  assertEquals(result, {
    ok: false,
    status: 400,
    body: {
      code: "ledger_currency_mode_invalid",
      message: "currencyMode must be player_country or global_eco.",
    },
  });
  assertEquals(service.tables, []);
});

class FakeService {
  readonly tables: string[] = [];

  constructor(
    readonly options: {
      readonly currencyCode?: string;
      readonly assignmentAvailable?: boolean;
    },
  ) {}

  from(table: string): FakeQuery {
    this.tables.push(table);
    return new FakeQuery(table, this.options);
  }
}

class FakeQuery {
  constructor(
    readonly table: string,
    readonly options: {
      readonly currencyCode?: string;
      readonly assignmentAvailable?: boolean;
    },
  ) {}

  select(_columns: string): this {
    return this;
  }

  eq(_column: string, _value: unknown): this {
    return this;
  }

  order(_column: string, _options: { ascending: boolean }): this {
    return this;
  }

  limit(_value: number): this {
    return this;
  }

  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    if (this.table === "player_country_assignments") {
      return Promise.resolve({
        data: this.options.assignmentAvailable === false
          ? null
          : { country_profile_id: "country-1" },
        error: null,
      });
    }
    if (this.table === "country_profiles") {
      return Promise.resolve({
        data: this.options.currencyCode
          ? { currency_code: this.options.currencyCode, status: "active" }
          : null,
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
