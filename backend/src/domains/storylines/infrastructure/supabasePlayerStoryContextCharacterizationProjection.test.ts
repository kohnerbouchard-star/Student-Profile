import {
  assert,
  equal,
  read,
} from "./supabasePlayerStoryContextCharacterizationSupport.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

for (
  const [name, preferred, balances, expected] of [
    ["preferred currency normalizes and excludes foreign cash", " usd ", [
      ["USD", "10.125"],
      [" usd ", "2.125"],
      ["EUR", 900],
    ], 12.25],
    ["one normalized currency is the default choice", null, [
      [" eur ", "3.335"],
      [
        "EUR",
        1,
      ],
    ], 4.34],
    ["mixed currencies without preference are zero", null, [["USD", 50], [
      "EUR",
      80,
    ]], 0],
    ["valid unmatched preference does not switch currencies", "CAD", [[
      "USD",
      50,
    ]], 0],
    ["invalid preference falls back to only valid currency", "u$", [[
      "bad!",
      100,
    ], [" usd ", 12]], 12],
    ["invalid currencies alone are ignored", null, [["", 100], ["US", 20], [
      "ABCDEFGHIJKLMNOPQ",
      3,
    ]], 0],
    [
      "alphanumeric and sixteen-character currencies remain valid",
      "ABC1234567890123",
      [["abc1234567890123", 7]],
      7,
    ],
    ["invalid numbers become zero while finite negatives remain", "USD", [
      ["USD", "nope"],
      ["USD", "Infinity"],
      ["USD", Infinity],
      ["USD", NaN],
      ["USD", -4],
      ["USD", " 5.125 "],
    ], 1.13],
    ["empty currency data is zero", null, [], 0],
  ] as const
) {
  Deno.test(`story characterization: cash ${name}`, async () => {
    const [context] = await read({
      players: [{ id: "p" }],
      player_country_assignments: [{ player_id: "p", country_profile_id: "c" }],
      country_profiles: [{
        id: "c",
        country_code: "C",
        currency_code: preferred,
      }],
      account_balances: [
        ...balances.map(([currency_code, balance]) => ({
          player_id: "p",
          currency_code,
          balance,
        })),
        { player_id: "other", currency_code: "USD", balance: 999 },
      ],
    });
    equal(context.cashBalance, expected);
  });
}

Deno.test("story characterization: stock keys trim without case folding and denominator excludes missing keys", async () => {
  const [context] = await read({
    players: [{ id: "p" }],
    game_session_stock_assets: [
      {
        id: "a",
        sector_key: " Tech ",
        country_code: " A ",
        current_price: "1",
      },
      { id: "b", sector_key: "Tech", country_code: "B", current_price: 1 },
      { id: "c", sector_key: "tech", country_code: " ", current_price: 1 },
      { id: "d", sector_key: null, country_code: "B", current_price: 1 },
      {
        id: "bad",
        sector_key: "BAD",
        country_code: "BAD",
        current_price: "oops",
      },
      {
        id: "negative",
        sector_key: "NEG",
        country_code: "NEG",
        current_price: 2,
      },
    ],
    stock_holdings: [
      ...["a", "b", "c", "d", "bad", "missing"].map((stock_asset_id) => ({
        player_id: "p",
        stock_asset_id,
        quantity: "1",
      })),
      { player_id: "p", stock_asset_id: "negative", quantity: -1 },
      { player_id: "p", stock_asset_id: "a", quantity: "Infinity" },
      { player_id: "p", stock_asset_id: "a", quantity: NaN },
      { player_id: "other", stock_asset_id: "a", quantity: 900 },
    ],
  });
  equal(context.sectorExposurePct, { tech: 33.33, Tech: 66.67 });
  equal(context.countryExposurePct, { A: 33.33, B: 66.67 });
});

Deno.test("story characterization: duplicate stock IDs use last row and negative times negative is positive", async () => {
  const [context] = await read({
    players: [{ id: "p" }],
    game_session_stock_assets: [
      { id: "a", sector_key: "old", country_code: "old", current_price: 99 },
      { id: "a", sector_key: "new", country_code: "new", current_price: -2 },
    ],
    stock_holdings: [{ player_id: "p", stock_asset_id: "a", quantity: -3 }],
  });
  equal(context.sectorExposurePct, { new: 100 });
  equal(context.countryExposurePct, { new: 100 });
});

Deno.test("story characterization: contracts preserve exact statuses, latest IDs, sorting and duplicates", async () => {
  const [p, q] = await read({
    players: [{ id: "p" }, { id: "q" }],
    game_session_contracts: [
      {
        id: "public",
        contract_key: "z-public",
        status: "active",
        visibility: "public",
      },
      {
        id: "duplicate",
        contract_key: "z-public",
        status: "active",
        visibility: "public",
      },
      {
        id: "private",
        contract_key: "a-private",
        status: "inactive",
        visibility: "private",
      },
      {
        id: "completed",
        contract_key: "b-completed",
        status: "closed",
        visibility: "private",
      },
      {
        id: "overwritten",
        contract_key: "old",
        status: "closed",
        visibility: "private",
      },
      {
        id: "overwritten",
        contract_key: "new",
        status: "closed",
        visibility: "private",
      },
      {
        id: "case",
        contract_key: "case",
        status: "Active",
        visibility: "public",
      },
      {
        id: "empty",
        contract_key: "",
        status: "closed",
        visibility: "private",
      },
    ],
    player_contract_progress: [
      { player_id: "p", contract_id: "private", status: "in_progress" },
      { player_id: "p", contract_id: "private", status: "submitted" },
      { player_id: "p", contract_id: "private", status: "approved" },
      { player_id: "p", contract_id: "completed", status: "completed" },
      { player_id: "p", contract_id: "completed", status: "approved" },
      { player_id: "p", contract_id: "overwritten", status: "submitted" },
      ...["accepted", "failed", "cancelled", "Submitted", " approved "].map((
        status,
      ) => ({ player_id: "p", contract_id: "case", status })),
      { player_id: "p", contract_id: "missing", status: "in_progress" },
      { player_id: "p", contract_id: "empty", status: "completed" },
    ],
  });
  equal(p.activeContractKeys, ["a-private", "new", "z-public"]);
  equal(p.completedContractKeys, ["a-private", "b-completed"]);
  equal(q.activeContractKeys, ["z-public"]);
  equal(q.completedContractKeys, []);
});

Deno.test("story characterization: later flag and normalized relationship rows win with retained references", async () => {
  const memory = { nested: { seen: true } };
  const flagValue = { nested: ["value"] };
  const [p, q] = await read({
    players: [{ id: "p" }, { id: "q" }],
    game_session_story_flags: [
      { flag_key: " flag ", value: false, created_at: "later" },
      { flag_key: " flag ", value: flagValue, created_at: "earlier" },
      { flag_key: "", value: null },
    ],
    player_story_relationships: [
      {
        player_id: "p",
        character_key: " person ",
        character_name: "old",
        memory: {},
        updated_at: "later",
      },
      {
        player_id: "p",
        character_key: "person",
        character_name: " Name ",
        country_code: " cc ",
        relationship_role: "sponsor",
        stage: "trusted",
        contact_count: "3.9",
        reply_count: "-2.3",
        trust_score: "123.8",
        memory,
        updated_at: "earlier",
      },
      { player_id: "p", character_key: " ", character_name: "ignored" },
    ],
  });
  equal(p.storyFlags, { " flag ": flagValue, "": null });
  assert(p.storyFlags === q.storyFlags && p.storyFlags[" flag "] === flagValue);
  equal(p.relationships, {
    person: {
      characterKey: "person",
      characterName: "Name",
      countryCode: "cc",
      relationshipRole: "sponsor",
      stage: "trusted",
      contactCount: 3,
      replyCount: 0,
      trustScore: 100,
      memory,
    },
  });
  assert(p.relationships?.person.memory === memory);
  equal(q.relationships, {});
});

for (
  const [role, stage, trust, memory, expectedRole, expectedStage, expectedTrust]
    of [
      ["sponsor", "contacted", -200, [], "sponsor", "contacted", -100],
      ["local_friend", "engaged", "-4.9", null, "local_friend", "engaged", -4],
      ["rival_peer", "trusted", "4.9", "text", "rival_peer", "trusted", 4],
      ["gatekeeper", "strained", "bad", 12, "gatekeeper", "strained", 0],
      ["former_home", "broken", Infinity, {}, "former_home", "broken", 0],
      [" Sponsor ", "Trusted", NaN, {}, "other", "contacted", 0],
    ] as const
) {
  Deno.test(`story characterization: relationship role ${role} and stage ${stage}`, async () => {
    const [context] = await read({
      players: [{ id: "p" }],
      player_story_relationships: [{
        player_id: "p",
        character_key: " key ",
        character_name: " ",
        country_code: " ",
        relationship_role: role,
        stage,
        contact_count: "bad",
        reply_count: Infinity,
        trust_score: trust,
        memory,
      }],
    });
    equal(context.relationships?.key, {
      characterKey: "key",
      characterName: "key",
      countryCode: null,
      relationshipRole: expectedRole,
      stage: expectedStage,
      contactCount: 0,
      replyCount: 0,
      trustScore: expectedTrust,
      memory: {},
    });
  });
}

Deno.test("story characterization: reading does not mutate frozen rows or nested payloads", async () => {
  const memory = Object.freeze({ nested: Object.freeze({ seen: true }) });
  const flag = Object.freeze({ nested: Object.freeze(["value"]) });
  const tables = {
    players: [{ id: "p" }, { id: "q" }],
    player_country_assignments: [{
      player_id: "p",
      country_profile_id: "c",
      assigned_at: "now",
    }],
    country_profiles: [{
      id: "c",
      country_code: " C ",
      currency_code: " usd ",
    }],
    account_balances: [{
      player_id: "p",
      currency_code: "usd",
      balance: "2.25",
    }],
    stock_holdings: [{ player_id: "p", stock_asset_id: "a", quantity: "2" }],
    game_session_stock_assets: [{
      id: "a",
      sector_key: " sector ",
      country_code: " C ",
      current_price: "3",
    }],
    game_session_contracts: [{
      id: "contract",
      contract_key: "key",
      status: "active",
      visibility: "public",
    }],
    player_contract_progress: [{
      player_id: "p",
      contract_id: "contract",
      status: "completed",
    }],
    player_story_relationships: [{
      player_id: "p",
      character_key: " person ",
      character_name: " Person ",
      country_code: " C ",
      relationship_role: "sponsor",
      stage: "trusted",
      contact_count: "2",
      reply_count: "1",
      trust_score: "3",
      memory,
      updated_at: "now",
    }],
    game_session_story_flags: [{
      flag_key: "flag",
      value: flag,
      created_at: "now",
    }],
  };
  const before = JSON.stringify(tables);
  for (const rows of Object.values(tables)) {
    for (const row of rows) Object.freeze(row);
    Object.freeze(rows);
  }
  Object.freeze(tables);
  const [p, q] = await read(tables);
  equal(JSON.stringify(tables), before);
  assert(p.relationships?.person.memory === memory);
  assert(p.relationships.person.memory.nested === memory.nested);
  assert(p.storyFlags === q.storyFlags);
  assert(Object.is(p.storyFlags.flag, flag));
  assert((p.storyFlags.flag as unknown as typeof flag).nested === flag.nested);
});
