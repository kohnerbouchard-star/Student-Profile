import { SupabasePlayerStoryContextRepository } from "./supabasePlayerStoryContextRepository.ts";
import { PlayerStoryContextRepositoryError } from "../contracts/playerStoryContextRepositoryContracts.ts";
import {
  assert,
  equal,
  flush,
  initialTables,
  read,
  RecordingClient,
} from "./supabasePlayerStoryContextCharacterizationSupport.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story characterization: exact selects, filters, order and parallel admission", async () => {
  const client = new RecordingClient(
    {
      player_country_assignments: [
        { player_id: "p", country_profile_id: "z", assigned_at: "new" },
        { player_id: "p", country_profile_id: "a", assigned_at: "old" },
        { player_id: "q", country_profile_id: "z", assigned_at: "old" },
      ],
    },
    {},
    true,
  );
  const result = new SupabasePlayerStoryContextRepository(client)
    .listPlayerStoryContexts("game-scope");
  await flush();
  equal(client.admitted, initialTables);
  const game = ["eq", "game_session_id", "game-scope"];
  equal(client.calls, [
    {
      table: "players",
      operations: [["select", "id"], game, ["eq", "status", "active"], [
        "order",
        "id",
        { ascending: true },
      ]],
    },
    {
      table: "player_country_assignments",
      operations: [
        ["select", "player_id,country_profile_id,assigned_at"],
        game,
        ["eq", "status", "active"],
        ["order", "assigned_at", { ascending: false }],
      ],
    },
    {
      table: "account_balances",
      operations: [
        ["select", "player_id,account_type,balance,currency_code"],
        game,
        ["eq", "account_type", "checking"],
      ],
    },
    {
      table: "game_session_stock_assets",
      operations: [
        ["select", "id,sector_key,country_code,current_price"],
        game,
        ["eq", "is_active", true],
      ],
    },
    {
      table: "stock_holdings",
      operations: [["select", "player_id,stock_asset_id,quantity"], game],
    },
    {
      table: "game_session_contracts",
      operations: [["select", "id,contract_key,status,visibility"], game],
    },
    {
      table: "player_contract_progress",
      operations: [["select", "player_id,contract_id,status"], game],
    },
    {
      table: "player_story_relationships",
      operations: [
        [
          "select",
          "player_id,character_key,character_name,country_code,relationship_role,stage,contact_count,reply_count,trust_score,memory,updated_at",
        ],
        game,
        ["order", "updated_at", { ascending: true }],
      ],
    },
    {
      table: "game_session_story_flags",
      operations: [["select", "flag_key,value,created_at"], game, [
        "order",
        "created_at",
        { ascending: true },
      ]],
    },
  ]);
  client.release("player_country_assignments");
  await flush();
  equal(client.calls[9], {
    table: "country_profiles",
    operations: [["select", "id,country_code,currency_code"], ["in", "id", [
      "a",
      "z",
    ]]],
  });
  equal(client.admitted, [...initialTables, "country_profiles"]);
  for (const table of [...client.pending.keys()]) client.release(table);
  equal(await result, []);
});

for (const table of [...initialTables, "country_profiles"]) {
  Deno.test(`story characterization: ${table} error identity and details`, async () => {
    const client = new RecordingClient({
      player_country_assignments: [{ player_id: "p", country_profile_id: "c" }],
    }, {
      [table]: {
        message: `failure:${table}`,
        code: "provider-code",
        details: "private detail",
        hint: "private hint",
      },
    });
    let error: unknown;
    try {
      await new SupabasePlayerStoryContextRepository(client)
        .listPlayerStoryContexts("g");
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof PlayerStoryContextRepositoryError);
    equal([
      error.name,
      error.code,
      error.message,
      error.tableName,
      error.operation,
    ], [
      "PlayerStoryContextRepositoryError",
      `player_story_context_${table}_select_failed`,
      `failure:${table}`,
      table,
      "select",
    ]);
    assert(!("details" in error) && !("hint" in error));
    if (table === "player_country_assignments") {
      assert(!client.calls.some((call) => call.table === "country_profiles"));
    }
  });
}

Deno.test("story characterization: null reads yield complete sparse shape and skip country lookup", async () => {
  const client = new RecordingClient({ players: [{ id: "p" }, { id: "q" }] });
  const contexts = await new SupabasePlayerStoryContextRepository(client)
    .listPlayerStoryContexts("g");
  equal(contexts[0], {
    playerId: "p",
    gameSessionId: "g",
    homeCountryId: null,
    homeCountryCode: null,
    currentCountryId: null,
    currentCountryCode: null,
    cashBalance: 0,
    resources: {},
    sectorExposurePct: {},
    countryExposurePct: {},
    activeContractKeys: [],
    completedContractKeys: [],
    storyFlags: {},
    relationships: {},
  });
  assert(!client.calls.some((call) => call.table === "country_profiles"));
  assert(contexts[0].storyFlags === contexts[1].storyFlags);
  for (
    const key of [
      "resources",
      "relationships",
      "sectorExposurePct",
      "countryExposurePct",
      "activeContractKeys",
      "completedContractKeys",
    ] as const
  ) assert(contexts[0][key] !== contexts[1][key]);
  equal(await read({}), []);
});

Deno.test("story characterization: assignment result order wins and missing profile retains identity", async () => {
  const contexts = await read({
    players: [{ id: "p" }, { id: "q" }],
    player_country_assignments: [
      { player_id: "p", country_profile_id: "missing", assigned_at: "older" },
      { player_id: "p", country_profile_id: "found", assigned_at: "newer" },
      { player_id: "q", country_profile_id: "found" },
    ],
    country_profiles: [{
      id: "found",
      country_code: " raw code ",
      currency_code: "usd",
    }],
  });
  equal(
    contexts.map((
      c,
    ) => [
      c.homeCountryId,
      c.currentCountryId,
      c.homeCountryCode,
      c.currentCountryCode,
    ]),
    [
      ["missing", "missing", null, null],
      ["found", "found", " raw code ", " raw code "],
    ],
  );
  const [nullProfile] = await read({
    players: [{ id: "p" }],
    player_country_assignments: [{ player_id: "p", country_profile_id: "c" }],
    country_profiles: null,
  });
  equal([nullProfile.homeCountryId, nullProfile.homeCountryCode], ["c", null]);
});

Deno.test("story characterization: first settled failure wins independently of admission order", async () => {
  const client = new RecordingClient({}, {
    players: { message: "first admitted, last settled" },
    game_session_story_flags: { message: "last admitted, first settled" },
  }, true);
  let caught: unknown;
  const result = new SupabasePlayerStoryContextRepository(client)
    .listPlayerStoryContexts("g")
    .catch((error: unknown) => {
      caught = error;
    });
  await flush();
  equal(client.admitted, initialTables);
  client.release("game_session_story_flags");
  await flush();
  assert(caught instanceof PlayerStoryContextRepositoryError);
  equal([caught.tableName, caught.message], [
    "game_session_story_flags",
    "last admitted, first settled",
  ]);
  for (const table of [...client.pending.keys()]) client.release(table);
  await result;
  equal(caught.tableName, "game_session_story_flags");
});
