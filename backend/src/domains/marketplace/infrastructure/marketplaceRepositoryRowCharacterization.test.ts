import {
  assertPublicGraph,
  empty,
  equal,
  fail,
  GAME,
  graph,
  id,
  key,
  listing,
  ME,
  newest,
  NOW,
  ok,
  order,
  OTHER,
  query,
  rejects,
  reservation,
  scope,
  SELECT,
} from "./marketplaceRepositoryRowFixtures.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Marketplace rows: full read graph uses exact scoped selects, ordering and limits", async () => {
  const client = graph();
  const result = await client.repository().read(scope);
  equal(client.queries, [
    query("marketplace_policies", SELECT.policy, [
      "maybeSingle",
    ]),
    query(
      "marketplace_listings",
      SELECT.listing,
      newest,
      ["limit", 250],
    ),
    query(
      "marketplace_purchase_reservations",
      SELECT.reservation,
      ["eq", "buyer_player_id", ME],
      newest,
      ["limit", 100],
    ),
    query(
      "marketplace_orders",
      SELECT.order,
      ["eq", "buyer_player_id", ME],
      newest,
      ["limit", 100],
    ),
    query(
      "marketplace_orders",
      SELECT.order,
      ["eq", "seller_player_id", ME],
      newest,
      ["limit", 100],
    ),
    query(
      "marketplace_disputes",
      SELECT.dispute,
      ["in", "order_id", [id(30)]],
      ["order", "opened_at", { ascending: false }],
      ["limit", 100],
    ),
    query("players", "id,display_name,player_identifier,roster_label", [
      "in",
      "id",
      [OTHER, ME],
    ]),
    query("store_items", "item_key,name,description,category", [
      "in",
      "item_key",
      ["book"],
    ]),
  ]);
  equal(client.calls.map((c) => c.name), [
    "expire_marketplace_purchase_reservations_v1",
    "expire_marketplace_listings_v1",
  ]);
  for (const call of client.calls) {
    equal(Object.keys(call.args), ["p_game_session_id", "p_now"]);
    equal(call.args.p_game_session_id, GAME);
    if (Number.isNaN(Date.parse(String(call.args.p_now)))) {
      throw new Error("Missing expiry timestamp");
    }
  }
  assertPublicGraph(result);
});
Deno.test("Marketplace rows: empty nullable graph skips all dependent lookups and defaults policy", async () => {
  const c = empty();
  const r = await c.repository().read(scope);
  equal(c.queries.length, 5);
  equal(r, {
    policy: {
      marketplaceEnabled: true,
      crossCountryTradingEnabled: true,
      moderationRequired: false,
      feeRate: .025,
      taxRate: 0,
      listingDurationHours: 168,
      purchaseReservationMinutes: 5,
      disputeWindowDays: 7,
      disputesEnabled: true,
    },
    listings: [],
    myListings: [],
    reservations: [],
    orders: [],
    disputes: [],
    summary: { listingCount: 0, activeSellers: 0, volume: 0 },
  });
});
Deno.test("Marketplace rows: deduplicates orders first-wins and resolves seller reservations without exposing them", async () => {
  const c = graph();
  c.reads[3] = ok([
    order(),
    order({ status: "refunded" }),
  ]);
  c.reads[4] = ok([
    order({ status: "disputed" }),
    order({
      id: id(31),
      public_id: key("ord", 2),
      reservation_id: id(21),
      buyer_player_id: OTHER,
      seller_player_id: ME,
    }),
  ]);
  c.reads.splice(
    5,
    0,
    ok([
      reservation({
        id: id(21),
        public_id: key("mpr", 2),
        buyer_player_id: OTHER,
      }),
      reservation({
        id: id(20),
        public_id: key("mpr", 9),
      }),
    ]),
  );
  const r = await c.repository().read(scope);
  equal(
    r.orders.map((o) => [o.id, o.status, o.role, o.reservationId]),
    [[
      key("ord"),
      "completed",
      "buyer",
      key("mpr"),
    ], [key("ord", 2), "completed", "seller", key("mpr", 2)]],
  );
  equal(r.reservations.map((r) => r.id), [key("mpr")]);
  equal(
    c.queries[5],
    query(
      "marketplace_purchase_reservations",
      SELECT.reservation,
      [
        "in",
        "id",
        [id(21)],
      ],
    ),
  );
  equal(r.summary.volume, 52);
});
Deno.test("Marketplace rows: missing item and seller labels preserve null reference", async () => {
  const r = await graph({ players: [], items: [] }).repository().read(
    scope,
  );
  equal([
    r.listings[0].seller,
    r.listings[0].sellerReference,
    r.listings[0].name,
    r.listings[0].description,
    r.listings[0].category,
    r.orders[0].itemName,
  ], [
    "Player",
    null,
    "Marketplace item",
    "No description is available.",
    "other",
    "Marketplace item",
  ]);
});
Deno.test("Marketplace rows: roster label precedence and optional text trimming", async () => {
  const r = await graph({
    players: [{
      id: OTHER,
      display_name: " ",
      player_identifier: null,
      roster_label: " Roster 3 ",
    }],
    listing: { moderation_reason: " reason " },
    reservation: { release_reason: " released " },
    dispute: { resolution_note: " done ", resolved_at: NOW },
  }).repository().read(scope);
  equal([
    r.listings[0].seller,
    r.listings[0].sellerReference,
    r.listings[0].moderationReason,
    r.reservations[0].releaseReason,
    r.disputes[0].resolutionNote,
    r.disputes[0].resolvedAt,
  ], ["Player", "Roster 3", "reason", "released", "done", NOW]);
});
Deno.test("Marketplace rows: policy coercion distinguishes missing from null and exact booleans", async () => {
  const r = await empty({
    marketplace_enabled: false,
    cross_country_trading_enabled: "false",
    moderation_required: "true",
    disputes_enabled: false,
    fee_rate: null,
    tax_rate: "0.25",
    listing_duration_hours: "720",
    purchase_reservation_minutes: null,
    dispute_window_days: "1",
  }).repository().read(scope);
  equal(r.policy, {
    marketplaceEnabled: false,
    crossCountryTradingEnabled: true,
    moderationRequired: false,
    feeRate: 0,
    taxRate: .25,
    listingDurationHours: 720,
    purchaseReservationMinutes: 5,
    disputeWindowDays: 1,
    disputesEnabled: false,
  });
});
Deno.test("Marketplace rows: invalid policy numbers use bounded defaults", async () => {
  const r = await empty({
    fee_rate: Infinity,
    tax_rate: -.1,
    listing_duration_hours: 1.5,
    purchase_reservation_minutes: 61,
    dispute_window_days: "invalid",
    moderation_required: true,
  }).repository().read(scope);
  equal([
    r.policy.feeRate,
    r.policy.taxRate,
    r.policy.listingDurationHours,
    r.policy.purchaseReservationMinutes,
    r.policy.disputeWindowDays,
    r.policy.moderationRequired,
  ], [.025, 0, 168, 5, 7, true]);
});
for (
  const [entity, statuses] of Object.entries({
    listing: [
      "draft",
      "active",
      "moderation_hold",
      "sold_out",
      "cancelled",
      "expired",
      "rejected",
    ],
    reservation: ["reserved", "settling", "settled", "released", "expired"],
    order: ["settling", "completed", "disputed", "refunded"],
    dispute: ["open", "resolved_buyer", "resolved_seller", "rejected"],
  })
) {
  Deno.test(`Marketplace rows: all ${entity} status variants normalize and preserve visibility`, async () => {
    for (const status of statuses) {
      const r = await graph({
        [entity]: { status: ` ${status.toUpperCase()} ` },
      }).repository().read(scope);
      if (entity === "listing") {
        equal(
          r.listings.map((x) => x.status),
          status === "active" ? [status] : [],
        );
      }
      if (entity === "reservation") {
        equal(r.reservations[0].status, status);
      }
      if (entity === "order") {
        equal(r.orders[0].status, status);
        equal(r.summary.volume, status === "settling" ? 0 : 26);
      }
      if (entity === "dispute") equal(r.disputes[0].status, status);
    }
  });
}
Deno.test("Marketplace rows: owned inactive listings remain visible and depleted listings are excluded", async () => {
  for (const status of ["active", "cancelled", "expired"]) {
    const r = await graph({
      listing: { seller_player_id: ME, status, quantity_available: 0 },
    }).repository().read(scope);
    equal(r.listings, []);
    equal(r.myListings.map((x) => [x.status, x.mine]), [[
      status,
      true,
    ]]);
  }
  equal(
    (await graph({ listing: { quantity_available: 0 } }).repository()
      .read(
        scope,
      )).listings,
    [],
  );
});
Deno.test("Marketplace rows: normalized identifiers, numeric boundaries and condition variants", async () => {
  for (const condition of ["New", "Like New", "Used", "Damaged"]) {
    const r = await graph({
      listing: {
        public_id: ` ${key("lst").toUpperCase()} `,
        condition_label: condition,
        unit_price: .0001,
        quantity_available: "1000000",
        version: Number.MAX_SAFE_INTEGER,
      },
      order: { fee_amount: null, tax_amount: false },
    }).repository().read(scope);
    equal([
      r.listings[0].id,
      r.listings[0].condition,
      r.listings[0].unitPrice,
      r.listings[0].quantity,
      r.listings[0].version,
      r.orders[0].feeAmount,
      r.orders[0].taxAmount,
    ], [
      key("lst"),
      condition,
      .0001,
      1000000,
      Number.MAX_SAFE_INTEGER,
      0,
      0,
    ]);
  }
});
for (
  const [name, patch] of [
    ["listing UUID", { listing: { seller_player_id: "not-uuid" } }],
    ["public key", { listing: { public_id: id(10) } }],
    ["token", { listing: { item_key: "bad/key" } }],
    ["currency", { listing: { currency_code: "US$" } }],
    ["condition case", { listing: { condition_label: "used" } }],
    ["price bound", { listing: { unit_price: 0 } }],
    ["fractional quantity", { reservation: { quantity: 1.5 } }],
    ["nonfinite total", { order: { buyer_total: Infinity } }],
    ["unsafe version", { dispute: { version: Number.MAX_SAFE_INTEGER + 1 } }],
    ["invalid date", { order: { completed_at: "not-a-date" } }],
    ["whitespace optional text", { listing: { moderation_reason: " " } }],
    ["unknown statuses", { dispute: { status: "closed" } }],
  ] as const
) {
  Deno.test(`Marketplace rows: rejects ${name}`, () =>
    rejects(() => graph(patch).repository().read(scope)));
}
Deno.test("Marketplace rows: every entity rejects unsupported status", async () => {
  for (const entity of ["listing", "reservation", "order", "dispute"]) {
    await rejects(() =>
      graph({ [entity]: { status: "unsupported" } }).repository().read(
        scope,
      )
    );
  }
});
Deno.test("Marketplace rows: missing listing, reservation or order relations fail closed", async () => {
  for (
    const patch of [{ reservation: { listing_id: id(99) } }, {
      order: { listing_id: id(99) },
    }, { dispute: { order_id: id(99) } }]
  ) {
    await rejects(() => graph(patch).repository().read(scope));
  }
  const c = graph({ order: { reservation_id: id(99) } });
  c.reads.splice(5, 0, ok([]));
  await rejects(() => c.repository().read(scope));
});
Deno.test("Marketplace rows: text and token truncation preserve established field limits", async () => {
  const longKey = "a".repeat(64);
  const c = graph({
    listing: {
      item_key: longKey + "discarded",
      moderation_reason: "x".repeat(1001),
    },
    order: { item_key: longKey },
    players: [{
      id: OTHER,
      display_name: "s".repeat(181),
      player_identifier: "p".repeat(81),
    }],
    items: [{
      item_key: longKey,
      name: "n".repeat(181),
      description: "d".repeat(1201),
      category: "c".repeat(65),
    }],
    dispute: { reason: "r".repeat(1001), resolution_note: "z".repeat(1001) },
  });
  const r = await c.repository().read(scope);
  equal([
    r.listings[0].itemId.length,
    r.listings[0].name.length,
    r.listings[0].description.length,
    r.listings[0].category.length,
    r.listings[0].seller.length,
    r.listings[0].sellerReference?.length,
    r.listings[0].moderationReason?.length,
    r.disputes[0].reason.length,
    r.disputes[0].resolutionNote?.length,
  ], [64, 180, 1200, 64, 180, 80, 1000, 1000, 1000]);
  equal(
    c.queries[7],
    query("store_items", "item_key,name,description,category", [
      "in",
      "item_key",
      [longKey],
    ]),
  );
});

Deno.test("Marketplace rows: listing order is retained and active sellers count public references", async () => {
  const c = graph();
  c.reads[1] = ok([
    listing({ id: id(11), public_id: key("lst", 2) }),
    listing(),
    listing({
      id: id(12),
      public_id: key("lst", 3),
      seller_player_id: id(4),
    }),
    listing({
      id: id(13),
      public_id: key("lst", 4),
      seller_player_id: ME,
    }),
  ]);
  c.reads[6] = ok([{
    id: OTHER,
    display_name: "Same name",
    player_identifier: "seller-one",
  }, {
    id: id(4),
    display_name: "Same name",
    player_identifier: "seller-two",
  }]);
  const r = await c.repository().read(scope);
  equal(r.listings.map((l) => l.id), [
    key("lst", 2),
    key("lst"),
    key("lst", 3),
  ]);
  equal(r.myListings.map((l) => l.id), [key("lst", 4)]);
  equal(r.summary, { listingCount: 3, activeSellers: 2, volume: 26 });
});
