import {
  DELIVERY,
  delivery,
  DELIVERY_SELECT,
  equal,
  errorCode,
  fail,
  GAME,
  harness,
  LATER,
  listInput,
  notification,
  NOTIFICATION_SELECT,
  NOTIFICATION_UUID,
  NOW,
  ok,
  PLAYER,
} from "./playerStoryDeliveryCharacterizationSupport.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story rows retain exact scoped read admission and selects", async () => {
  const h = harness([ok([notification()]), ok([delivery()])]);
  await h.repo.listPendingDeliveries(listInput);
  equal(h.trace, [
    ["from", "notifications"],
    ["select", NOTIFICATION_SELECT],
    ["eq", "game_session_id", GAME],
    ["eq", "notification_type", "story_cutscene"],
    ["in", "display_mode", ["modal_immediate", "modal_on_next_login"]],
    ["order", "published_at", { ascending: false }],
    ["limit", 50],
    ["await"],
    ["from", "notification_deliveries"],
    ["select", DELIVERY_SELECT],
    ["eq", "game_session_id", GAME],
    ["eq", "player_id", PLAYER],
    ["in", "notification_id", [NOTIFICATION_UUID]],
    ["is", "dismissed_at", null],
    ["order", "delivered_at", { ascending: false }],
    ["limit", 50],
    ["await"],
  ]);
});

for (const data of [null, []]) {
  Deno.test(`story rows empty notifications ${JSON.stringify(data)} stop the dependent read`, async () => {
    const h = harness([ok(data)]);
    equal(await h.repo.listPendingDeliveries(listInput), []);
    equal(h.consumed(), 1);
  });
}
Deno.test("story rows null deliveries produce an empty result", async () => {
  const h = harness([ok([notification()]), ok(null)]);
  equal(await h.repo.listPendingDeliveries(listInput), []);
});

for (
  const [message, code, expected] of [
    ["missing", "42P01", "schema_not_applied"],
    ["missing", "42703", "schema_not_applied"],
    ["Relation DOES NOT EXIST", undefined, "schema_not_applied"],
    ["SCHEMA CACHE outdated", undefined, "schema_not_applied"],
    ["timeout", "57014", "read_failed"],
  ] as const
) {
  for (const stage of ["notifications", "deliveries"]) {
    Deno.test(`story rows ${stage} error ${message}/${code} retains precedence`, async () => {
      const responses = stage === "notifications" ? [] : [ok([notification()])];
      const h = harness([...responses, fail(message, code)]);
      const error = await errorCode(
        () => h.repo.listPendingDeliveries(listInput),
        `player_story_delivery_${expected}`,
      );
      equal(error.message, "Story deliveries could not be loaded.");
      equal(h.consumed(), responses.length + 1);
    });
  }
}

for (
  const [field, value] of [["game_session_id", PLAYER], [
    "game_session_id",
    null,
  ], ["id", "bad"]] as const
) {
  Deno.test(`story rows invalid notification ${field}/${value} fails before delivery read`, async () => {
    const h = harness([ok([notification({ [field]: value })])]);
    await errorCode(
      () => h.repo.listPendingDeliveries(listInput),
      "player_story_delivery_read_failed",
    );
    equal(h.consumed(), 1);
  });
}

for (
  const [field, value] of [
    ["game_session_id", PLAYER],
    ["player_id", GAME],
    ["id", "bad"],
    ["public_delivery_id", "ndl_invalid"],
    ["notification_id", GAME],
    ["delivered_at", "not a date"],
    ["seen_at", false],
    ["dismissed_at", "bad"],
    ["acknowledged_at", 12],
  ] as const
) {
  Deno.test(`story rows invalid delivery ${field} fails closed`, async () => {
    const h = harness([
      ok([notification()]),
      ok([delivery({ [field]: value })]),
    ]);
    await errorCode(
      () => h.repo.listPendingDeliveries(listInput),
      "player_story_delivery_read_failed",
    );
  });
}

for (
  const [field, value] of [
    ["public_notification_id", "ntf_invalid"],
    ["title", "  "],
    ["summary", false],
    ["priority", "not valid"],
    ["display_mode", "other"],
    ["published_at", "bad"],
  ] as const
) {
  Deno.test(`story rows invalid projection ${field} fails closed`, async () => {
    const h = harness([
      ok([notification({ [field]: value })]),
      ok([delivery()]),
    ]);
    await errorCode(
      () => h.repo.listPendingDeliveries(listInput),
      "player_story_delivery_read_failed",
    );
  });
}

for (const payload of [null, [], false, "payload"]) {
  Deno.test(`story rows invalid payload container ${JSON.stringify(payload)}`, async () => {
    const h = harness([ok([notification({ payload })]), ok([delivery()])]);
    await errorCode(
      () => h.repo.listPendingDeliveries(listInput),
      "player_story_delivery_payload_invalid",
    );
  });
}

const invalidPayloadFields: readonly [string, unknown][] = [
  ["videoAssetKey", undefined],
  ["videoAssetKey", ""],
  ["videoAssetKey", "  "],
  ["videoAssetKey", "../secret"],
  ["videoAssetKey", "a".repeat(161)],
  ["posterAssetKey", 123],
  ["tone", false],
  ["tone", " "],
  ["tone", "bad token"],
  ["act", -1],
  ["act", 1001],
  ["act", 1.5],
  ["sequence", 100001],
  ["sequence", "no"],
  ["requiresAcknowledgement", "true"],
];
for (const [field, value] of invalidPayloadFields) {
  Deno.test(`story rows invalid content ${field}/${JSON.stringify(value)}`, async () => {
    const h = harness([
      ok([
        notification({ payload: { videoAssetKey: "good", [field]: value } }),
      ]),
      ok([delivery()]),
    ]);
    await errorCode(
      () => h.repo.listPendingDeliveries(listInput),
      "player_story_delivery_payload_invalid",
    );
  });
}

Deno.test("story rows preserve normalization, bounded content, coercion and input immutability", async () => {
  const row = notification({
    public_notification_id: " NTF_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ",
    title: ` ${"t".repeat(181)} `,
    summary: ` ${"s".repeat(1201)} `,
    priority: " MAJOR ",
    display_mode: " MODAL_IMMEDIATE ",
    published_at: "2026-07-20",
    payload: {
      videoAssetKey: " VIDEO.1 ",
      posterAssetKey: null,
      tone: ` ${"T".repeat(65)} `,
      act: "1000",
      sequence: true,
      requiresAcknowledgement: null,
      private: "never",
    },
  });
  const del = delivery({
    public_delivery_id: " NDL_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ",
    seen_at: "",
    acknowledged_at: undefined,
  });
  const before = JSON.stringify([row, del]);
  const h = harness([ok([row]), ok([del])]);
  const [record] = await h.repo.listPendingDeliveries(listInput);
  equal(record.title, "t".repeat(180));
  equal(record.summary, "s".repeat(1200));
  equal(record.priority, "major");
  equal(record.displayMode, "modal_immediate");
  equal(record.publishedAt, "2026-07-20");
  equal(record.requiresAcknowledgement, false);
  equal(record.publicDeliveryId, "ndl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  equal(record.publicNotificationId, "ntf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  equal(record.content, {
    videoAssetKey: "video.1",
    posterAssetKey: null,
    tone: "t".repeat(64),
    act: 1000,
    sequence: 1,
  });
  equal([record.seenAt, record.acknowledgedAt], [null, null]);
  equal(JSON.stringify([row, del]), before);
  equal(Object.isFrozen(record), false);
});

for (const value of [null, undefined, ""]) {
  Deno.test(`story rows optional content defaults ${JSON.stringify(value)}`, async () => {
    const h = harness([
      ok([
        notification({
          payload: {
            videoAssetKey: "video",
            posterAssetKey: value,
            tone: value,
            act: value,
            sequence: value,
          },
        }),
      ]),
      ok([delivery()]),
    ]);
    const [record] = await h.repo.listPendingDeliveries(listInput);
    equal(record.content, {
      videoAssetKey: "video",
      posterAssetKey: null,
      tone: null,
      act: null,
      sequence: null,
    });
    equal(record.requiresAcknowledgement, false);
  });
}

Deno.test("story rows preserve pending filter and priority/date/public-id ordering", async () => {
  const levels = [
    "minor",
    "normal",
    "major",
    "critical",
    "major",
    "major",
    "custom",
  ];
  const notifications = levels.map((priority, index) =>
    notification({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      priority,
      published_at: index >= 4 ? LATER : NOW,
    })
  );
  const deliveries = notifications.map((n, index) =>
    delivery({
      notification_id: n.id,
      public_delivery_id: `ndl_${String(index + 1).padStart(32, "0")}`,
    })
  );
  deliveries.push(
    delivery({ dismissed_at: NOW }),
    delivery({ acknowledged_at: NOW }),
  );
  const h = harness([ok([...notifications, notification()]), ok(deliveries)]);
  const records = await h.repo.listPendingDeliveries(listInput);
  equal(records.map((r) => Number(r.publicDeliveryId.slice(4))), [
    4,
    6,
    5,
    3,
    2,
    7,
    1,
  ]);
});

for (
  const [limit, count] of [[0, 1], [-3, 1], [1.9, 1], [3, 3], [20, 10], [
    NaN,
    0,
  ], [Infinity, 10]]
) {
  Deno.test(`story rows preserve caller limit slicing ${limit}`, async () => {
    const h = harness([
      ok([notification()]),
      ok(Array.from({ length: 12 }, () => delivery())),
    ]);
    equal(
      (await h.repo.listPendingDeliveries({ ...listInput, limit })).length,
      count,
    );
  });
}

Deno.test("story rows duplicate notification keys retain the final row and do not deduplicate delivery records", async () => {
  const h = harness([
    ok([notification({ title: "first" }), notification({ title: "last" })]),
    ok([delivery(), delivery()]),
  ]);
  const records = await h.repo.listPendingDeliveries(listInput);
  equal(records.map((r) => [r.publicDeliveryId, r.title]), [
    [DELIVERY, "last"],
    [DELIVERY, "last"],
  ]);
});
