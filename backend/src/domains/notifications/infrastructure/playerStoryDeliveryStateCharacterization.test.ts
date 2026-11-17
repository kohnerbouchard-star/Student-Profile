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
  NOTIFICATION,
  notification,
  NOTIFICATION_SELECT,
  NOTIFICATION_UUID,
  NOW,
  ok,
  PLAYER,
  stateInput,
} from "./playerStoryDeliveryCharacterizationSupport.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const readTrace = [
  ["from", "notification_deliveries"],
  ["select", DELIVERY_SELECT],
  ["eq", "public_delivery_id", DELIVERY],
  ["eq", "game_session_id", GAME],
  ["eq", "player_id", PLAYER],
  ["maybeSingle"],
  ["from", "notifications"],
  ["select", NOTIFICATION_SELECT],
  ["eq", "id", NOTIFICATION_UUID],
  ["eq", "game_session_id", GAME],
  ["eq", "notification_type", "story_cutscene"],
  ["in", "display_mode", ["modal_immediate", "modal_on_next_login"]],
  ["maybeSingle"],
];
const columns = {
  seen: "seen_at",
  dismissed: "dismissed_at",
  acknowledged: "acknowledged_at",
} as const;
const fields = {
  seen: "seenAt",
  dismissed: "dismissedAt",
  acknowledged: "acknowledgedAt",
} as const;
for (const action of ["seen", "dismissed", "acknowledged"] as const) {
  Deno.test(`story state ${action} preserves the exact scoped guarded write and public projection`, async () => {
    const values = action === "seen"
      ? { seen_at: LATER }
      : { [columns[action]]: LATER, seen_at: LATER };
    const h = harness([
      ok(delivery()),
      ok(notification()),
      ok(delivery(values)),
    ]);
    const result = await h.repo.updateDeliveryState({ ...stateInput, action });
    const guards = [["is", columns[action], null]];
    if (action !== "seen") {
      guards.push([
        "is",
        columns[action === "dismissed" ? "acknowledged" : "dismissed"],
        null,
      ]);
    }
    equal(h.trace, [
      ...readTrace,
      ["from", "notification_deliveries"],
      ["update", values],
      ["eq", "public_delivery_id", DELIVERY],
      ["eq", "game_session_id", GAME],
      ["eq", "player_id", PLAYER],
      ...guards,
      ["select", DELIVERY_SELECT],
      ["maybeSingle"],
    ]);
    equal(result, {
      publicDeliveryId: DELIVERY,
      publicNotificationId: NOTIFICATION,
      deliveredAt: NOW,
      seenAt: LATER,
      dismissedAt: action === "dismissed" ? LATER : null,
      acknowledgedAt: action === "acknowledged" ? LATER : null,
      requiresAcknowledgement: false,
    });
    equal(Object.isFrozen(result), false);
  });

  Deno.test(`story state existing ${action} is replayed without a second write`, async () => {
    const h = harness([
      ok(delivery({ [columns[action]]: NOW })),
      ok(notification()),
    ]);
    const result = await h.repo.updateDeliveryState({ ...stateInput, action });
    equal(result[fields[action]], NOW);
    equal(h.trace, readTrace);
  });
}

for (const action of ["dismissed", "acknowledged"] as const) {
  Deno.test(`story state ${action} preserves an earlier seen timestamp`, async () => {
    const h = harness([
      ok(delivery({ seen_at: NOW })),
      ok(notification()),
      ok(delivery({ seen_at: NOW, [columns[action]]: LATER })),
    ]);
    await h.repo.updateDeliveryState({ ...stateInput, action });
    equal(h.trace.find((call) => call[0] === "update"), ["update", {
      [columns[action]]: LATER,
      seen_at: NOW,
    }]);
  });
}

for (const terminal of ["dismissed", "acknowledged"] as const) {
  for (const action of ["seen", "dismissed", "acknowledged"] as const) {
    if (terminal === action) continue;
    Deno.test(`story state ${terminal} rejects later ${action} without writing`, async () => {
      const h = harness([
        ok(delivery({ [columns[terminal]]: NOW })),
        ok(notification()),
      ]);
      const error = await errorCode(
        () => h.repo.updateDeliveryState({ ...stateInput, action }),
        "player_story_delivery_conflict",
      );
      equal(error.message, "Story delivery is no longer active.");
      equal(error.retryable, false);
      equal(h.trace, readTrace);
    });
  }
}

Deno.test("story state dismissed precedence is retained if both terminal fields exist", async () => {
  const h = harness([
    ok(delivery({ dismissed_at: NOW, acknowledged_at: NOW })),
    ok(notification()),
  ]);
  const error = await errorCode(
    () => h.repo.updateDeliveryState({ ...stateInput, action: "acknowledged" }),
    "player_story_delivery_conflict",
  );
  equal(error.retryable, false);
  equal(h.consumed(), 2);
});

Deno.test("story state acknowledgement requirement is checked before write", async () => {
  const h = harness([
    ok(delivery()),
    ok(
      notification({
        payload: { videoAssetKey: "video", requiresAcknowledgement: true },
      }),
    ),
  ]);
  const error = await errorCode(
    () => h.repo.updateDeliveryState({ ...stateInput, action: "dismissed" }),
    "player_story_delivery_acknowledgement_required",
  );
  equal(error.retryable, false);
  equal(h.trace, readTrace);
});

for (const stage of ["delivery", "notification"] as const) {
  Deno.test(`story state missing ${stage} is not found without a write`, async () => {
    const responses = stage === "delivery"
      ? [ok(null)]
      : [ok(delivery()), ok(null)];
    const h = harness(responses);
    const error = await errorCode(
      () => h.repo.updateDeliveryState(stateInput),
      "player_story_delivery_not_found",
    );
    equal(error.message, "Story delivery was not found.");
    equal(error.retryable, false);
    equal(h.consumed(), responses.length);
  });
  for (
    const [message, code, suffix] of [
      ["query failed", "XX000", "read_failed"],
      ["missing", "42P01", "schema_not_applied"],
    ] as const
  ) {
    Deno.test(`story state ${stage} ${code} keeps read error mapping`, async () => {
      const responses = stage === "delivery"
        ? [fail(message, code)]
        : [ok(delivery()), fail(message, code)];
      const h = harness(responses);
      await errorCode(
        () => h.repo.updateDeliveryState(stateInput),
        `player_story_delivery_${suffix}`,
      );
      equal(h.consumed(), responses.length);
    });
  }
}

for (
  const [message, code, suffix] of [["query failed", "XX000", "write_failed"], [
    "missing",
    "42703",
    "schema_not_applied",
  ], ["SCHEMA CACHE", undefined, "schema_not_applied"]] as const
) {
  Deno.test(`story state update ${message}/${code} keeps write error mapping`, async () => {
    const h = harness([
      ok(delivery()),
      ok(notification()),
      fail(message, code),
    ]);
    const error = await errorCode(
      () => h.repo.updateDeliveryState(stateInput),
      `player_story_delivery_${suffix}`,
    );
    equal(error.message, "Story delivery state could not be updated.");
    equal(h.consumed(), 3);
  });
}

for (
  const [field, value] of [["game_session_id", PLAYER], ["player_id", GAME], [
    "notification_id",
    "bad",
  ]] as const
) {
  Deno.test(`story state invalid initial ${field} fails before notification lookup`, async () => {
    const h = harness([ok(delivery({ [field]: value }))]);
    await errorCode(
      () => h.repo.updateDeliveryState(stateInput),
      "player_story_delivery_read_failed",
    );
    equal(h.consumed(), 1);
  });
}
Deno.test("story state rejects wrong-game notification before update", async () => {
  const h = harness([
    ok(delivery()),
    ok(notification({ game_session_id: PLAYER })),
  ]);
  await errorCode(
    () => h.repo.updateDeliveryState(stateInput),
    "player_story_delivery_read_failed",
  );
  equal(h.consumed(), 2);
});

for (
  const [field, value] of [
    ["game_session_id", PLAYER],
    ["player_id", GAME],
    ["seen_at", "bad"],
    ["dismissed_at", 9],
    ["acknowledged_at", "bad"],
  ] as const
) {
  Deno.test(`story state invalid update row ${field} is rejected`, async () => {
    const h = harness([
      ok(delivery()),
      ok(notification()),
      ok(delivery({ [field]: value })),
    ]);
    await errorCode(
      () => h.repo.updateDeliveryState(stateInput),
      "player_story_delivery_read_failed",
    );
    equal(h.consumed(), 3);
  });
}

Deno.test("story state successful update retains original public identity and excludes extra row data", async () => {
  const h = harness([
    ok(delivery()),
    ok(notification()),
    ok(delivery({
      public_delivery_id: "ignored",
      notification_id: "ignored",
      delivered_at: "ignored",
      private: "ignored",
      seen_at: LATER,
    })),
  ]);
  const result = await h.repo.updateDeliveryState(stateInput);
  equal(result, {
    publicDeliveryId: DELIVERY,
    publicNotificationId: NOTIFICATION,
    deliveredAt: NOW,
    seenAt: LATER,
    dismissedAt: null,
    acknowledgedAt: null,
    requiresAcknowledgement: false,
  });
});

for (const action of ["seen", "dismissed", "acknowledged"] as const) {
  Deno.test(`story state lost ${action} write race re-reads the committed result`, async () => {
    const h = harness([
      ok(delivery()),
      ok(notification()),
      ok(null),
      ok(delivery({ [columns[action]]: LATER })),
      ok(notification()),
    ]);
    const result = await h.repo.updateDeliveryState({ ...stateInput, action });
    equal(result[fields[action]], LATER);
    equal(h.trace.slice(-readTrace.length), readTrace);
    equal(h.trace.filter((c) => c[0] === "update").length, 1);
    equal(h.consumed(), 5);
  });
  Deno.test(`story state unresolved ${action} race returns retryable conflict`, async () => {
    const h = harness([
      ok(delivery()),
      ok(notification()),
      ok(null),
      ok(delivery()),
      ok(notification()),
    ]);
    const error = await errorCode(
      () => h.repo.updateDeliveryState({ ...stateInput, action }),
      "player_story_delivery_conflict",
    );
    equal(error.message, "Story delivery state changed concurrently.");
    equal(error.retryable, true);
    equal(h.consumed(), 5);
  });
}

Deno.test("story state opposing terminal write during race preserves retryable conflict", async () => {
  const h = harness([
    ok(delivery()),
    ok(notification()),
    ok(null),
    ok(delivery({ acknowledged_at: NOW })),
    ok(notification()),
  ]);
  const error = await errorCode(
    () => h.repo.updateDeliveryState({ ...stateInput, action: "dismissed" }),
    "player_story_delivery_conflict",
  );
  equal(error.retryable, true);
});
Deno.test("story state race disappearance retains not-found precedence", async () => {
  const h = harness([ok(delivery()), ok(notification()), ok(null), ok(null)]);
  await errorCode(
    () => h.repo.updateDeliveryState(stateInput),
    "player_story_delivery_not_found",
  );
  equal(h.consumed(), 4);
});
