import {
  Client,
  empty,
  equal,
  fail,
  GAME,
  graph,
  id,
  key,
  ME,
  NOW,
  ok,
  order,
  query,
  rejects,
  reservation,
  type Row,
  scope,
} from "./marketplaceRepositoryRowFixtures.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const input = {
  gameSessionId: GAME,
  playerId: ME,
  listingKey: key("lst"),
  expectedVersion: 4,
  quantity: 2,
  idempotencyKey: "characterize-0001",
};
const committed = (patch: Row = {}) => ({
  outcome: "applied",
  listing_key: key("lst"),
  order_key: key("ord"),
  dispute_key: key("dsp"),
  status: "active",
  version: 2,
  created_at: NOW,
  ...patch,
});
Deno.test("Marketplace rows: all mutation RPC names and exact argument mapping", async () => {
  const c = new Client([], [
    ok(committed()),
    ok(committed()),
    ok(committed()),
    ok(committed()),
    ok({ reservation_key: key("mpr") }),
    ok(committed()),
  ]);
  const repo = c.repository();
  await repo.createListing({
    gameSessionId: GAME,
    playerId: ME,
    itemKey: "book",
    quantity: 2,
    unitPrice: 12.5,
    currencyCode: "USD",
    condition: "Used",
    durationHours: null,
    idempotencyKey: input.idempotencyKey,
  });
  await repo.activateListing(input);
  await repo.cancel(input);
  await repo.openDispute({
    gameSessionId: GAME,
    playerId: ME,
    orderKey: key("ord"),
    reason: "Wrong item",
    idempotencyKey: input.idempotencyKey,
  });
  await repo.purchase(input);
  const base = {
    p_game_session_id: GAME,
    p_seller_player_id: ME,
    p_listing_key: key("lst"),
    p_expected_version: 4,
    p_idempotency_key: input.idempotencyKey,
  };
  equal(c.calls, [
    {
      name: "create_marketplace_listing_public_v2",
      args: {
        p_game_session_id: GAME,
        p_seller_player_id: ME,
        p_item_key: "book",
        p_quantity: 2,
        p_unit_price: 12.5,
        p_currency_code: "USD",
        p_condition_label: "Used",
        p_duration_hours: null,
        p_idempotency_key: input.idempotencyKey,
      },
    },
    { name: "activate_marketplace_listing_public_v1", args: base },
    { name: "cancel_marketplace_listing_public_v2", args: base },
    {
      name: "open_marketplace_dispute_public_v2",
      args: {
        p_game_session_id: GAME,
        p_player_id: ME,
        p_order_key: key("ord"),
        p_reason: "Wrong item",
        p_idempotency_key: input.idempotencyKey,
      },
    },
    {
      name: "reserve_marketplace_purchase_public_v1",
      args: {
        p_game_session_id: GAME,
        p_buyer_player_id: ME,
        p_listing_key: key("lst"),
        p_quantity: 2,
        p_expected_version: 4,
        p_idempotency_key: input.idempotencyKey,
      },
    },
    {
      name: "settle_marketplace_purchase_public_v1",
      args: {
        p_game_session_id: GAME,
        p_buyer_player_id: ME,
        p_reservation_key: key("mpr"),
      },
    },
  ]);
  equal(c.queries, []);
});
Deno.test("Marketplace rows: mutation object and first array row normalize outcomes, keys and timestamps", async () => {
  for (const array of [false, true]) {
    const row = committed({
      outcome: " REPLAYED ",
      listing_key: ` ${key("lst").toUpperCase()} `,
      status: " ACTIVE ",
      version: "3",
      completed_at: NOW,
      updated_at: "2020-01-01",
    });
    const c = new Client([], [
      ok(array ? [row, { outcome: "bad" }] : row),
    ]);
    equal(await c.repository().cancel(input), {
      outcome: "replayed",
      targetId: key("lst"),
      status: "active",
      version: 3,
      committedAt: NOW,
    });
  }
});
Deno.test("Marketplace rows: mutation nullable version and nullish timestamp precedence", async () => {
  for (const version of [null, undefined]) {
    const c = new Client([], [
      ok(
        committed({ version, completed_at: null, updated_at: "2020-01-01" }),
      ),
    ]);
    equal(await c.repository().cancel(input), {
      outcome: "applied",
      targetId: key("lst"),
      status: "active",
      version: null,
      committedAt: "2020-01-01",
    });
  }
  const c = new Client([], [
    ok(committed({ completed_at: "", updated_at: NOW })),
  ]);
  equal((await c.repository().cancel(input)).committedAt, null);
});
Deno.test("Marketplace rows: malformed RPC envelopes and committed fields fail closed", async () => {
  for (
    const data of [
      null,
      1,
      [],
      [[]],
      "row",
      committed({ outcome: "unknown" }),
      committed({ listing_key: key("ord") }),
      committed({ status: "bad status" }),
      committed({ version: 0 }),
      committed({ completed_at: "invalid" }),
    ]
  ) {
    await rejects(() => new Client([], [ok(data)]).repository().cancel(input));
  }
});
Deno.test("Marketplace rows: RPC error wins over otherwise valid returned data", async () => {
  await rejects(
    () =>
      new Client([], [{
        data: committed(),
        error: { code: "NOT_FOUND", message: "conflict" },
      }]).repository().cancel(input),
    "player_marketplace_not_found",
    true,
  );
});
Deno.test("Marketplace rows: RPC mapping precedence and all conflict/policy markers", async () => {
  const cases: [string, string][] = [
    ["NOT_FOUND INSUFFICIENT DISABLED CONFLICT", "not_found"],
    ["INSUFFICIENT DISABLED CONFLICT", "insufficient_funds"],
    ["QUANTITY_UNAVAILABLE", "insufficient_funds"],
    ...["DISABLED CONFLICT", "COUNTRY_BLOCKED", "CROSS_COUNTRY_BLOCKED"].map(
      (x) => [x, "disabled"] as [string, string],
    ),
    ...[
      "STALE_VERSION",
      "CONFLICT",
      "TRANSITION",
      "NOT_ACTIVE",
      "SCOPE_INACTIVE",
      "GAME_PAUSED",
      "GAME_ENDED",
      "RESERVATION_ACTIVE",
      "EXPIRED",
      "SELF_PURCHASE",
      "WINDOW_CLOSED",
      "NOT_DISPUTABLE",
    ].map((x) => [x, "conflict"] as [string, string]),
  ];
  for (const [marker, code] of cases) {
    await rejects(
      () =>
        new Client([], [{
          data: null,
          error: { message: marker.toLowerCase() },
        }]).repository().cancel(input),
      `player_marketplace_${code}`,
      true,
    );
  }
  await rejects(
    () =>
      new Client([], [fail("UNKNOWN")]).repository().cancel(
        input,
      ),
    "UNKNOWN",
  );
  await rejects(
    () =>
      new Client([], [{ data: null, error: { message: "unknown" } }])
        .repository().cancel(input),
    "marketplace_persistence_failed",
  );
});
Deno.test("Marketplace rows: reservation expiry and invalid key prevent settlement", async () => {
  for (
    const row of [{ outcome: " EXPIRED " }, { reservation_key: id(20) }]
  ) {
    const c = new Client([], [ok(row)]);
    const expired = "outcome" in row;
    await rejects(
      () => c.repository().purchase(input),
      expired ? "player_marketplace_conflict" : "marketplace_response_invalid",
      expired,
    );
    equal(c.calls.length, 1);
  }
  const c = new Client([], [fail("NOT_FOUND")]);
  await rejects(
    () => c.repository().purchase(input),
    "player_marketplace_not_found",
    true,
  );
  equal(c.calls.length, 1);
});
Deno.test("Marketplace rows: activation expiry and settlement terminal outcomes stay bounded", async () => {
  await rejects(
    () =>
      new Client([], [ok({ outcome: " EXPIRED " })])
        .repository()
        .activateListing(input),
    "player_marketplace_conflict",
    true,
  );
  for (
    const outcome of ["insufficient_funds", "released", "reservation_lost"]
  ) {
    const c = new Client([], [
      ok({ reservation_key: key("mpr") }),
      ok({ outcome: ` ${outcome.toUpperCase()} ` }),
    ]);
    await rejects(
      () => c.repository().purchase(input),
      outcome === "insufficient_funds"
        ? "player_marketplace_insufficient_funds"
        : "player_marketplace_conflict",
      true,
    );
    equal(c.calls.length, 2);
  }
});

Deno.test("Marketplace rows: expiry failures short-circuit in RPC order without mapping domain errors", async () => {
  for (let at = 0; at < 2; at++) {
    const c = empty();
    c.rpcs.push(
      ...Array.from({ length: at }, () => ok(0)),
      fail("NOT_FOUND"),
    );
    await rejects(
      () => c.repository().read(scope),
      "NOT_FOUND",
    );
    equal(c.calls.length, at + 1);
    equal(c.queries.length, 0);
  }
});
Deno.test("Marketplace rows: initial query error precedence follows policy, listings, reservations, buyer, seller", async () => {
  for (let at = 0; at < 5; at++) {
    const c = empty();
    for (let i = at; i < 5; i++) c.reads[i] = fail(`error${i}`);
    await rejects(
      () => c.repository().read(scope),
      `error${at}`,
    );
    equal(c.queries.length, 5);
  }
});
Deno.test("Marketplace rows: dependent errors stop later stages and players precede item errors", async () => {
  for (const stage of ["reference", "dispute", "players", "items"]) {
    const c = graph();
    if (stage === "reference") {
      c.reads[4] = ok([
        order({ id: id(31), reservation_id: id(21) }),
      ]);
      c.reads.splice(5, 0, fail(stage));
    } else if (stage === "dispute") c.reads[5] = fail(stage);
    else {
      c.reads[stage === "players" ? 6 : 7] = fail(stage);
      if (stage === "players") c.reads[7] = fail("items");
    }
    await rejects(() => c.repository().read(scope), stage);
    equal(
      c.queries.length,
      stage === "reference" || stage === "dispute" ? 6 : 8,
    );
  }
});
