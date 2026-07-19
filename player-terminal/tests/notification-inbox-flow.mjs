import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeNotificationPage,
  resolvePlayerNotificationCategory,
} from "../src/features/notifications/notification-inbox-flow.js";

const DELIVERY_A = "ndl_00000000000000000000000000000001";
const DELIVERY_B = "ndl_00000000000000000000000000000002";

assert.deepEqual(
  resolvePlayerNotificationCategory({
    sourceType: "stock_market",
    notificationType: "trade_fill",
  }),
  { key: "market", label: "Market" },
);
assert.deepEqual(
  resolvePlayerNotificationCategory({
    sourceType: "internal_worker",
    notificationType: "opaque_value",
  }),
  { key: "general", label: "General" },
);

const first = normalizeNotificationPage({
  summary: { unreadCount: 27 },
  page: { returned: 1, hasMore: true, nextCursor: "cursor-1" },
  items: [{
    deliveryId: DELIVERY_A,
    notificationId: "ntf_00000000000000000000000000000001",
    sourceType: "story_runner",
    notificationType: "campaign_briefing",
    title: "Meridian briefing",
    summary: "Conditions changed.",
    priority: "high",
    status: "unread",
  }],
});
assert.equal(first.unreadCount, 27);
assert.equal(first.hasMore, true);
assert.equal(first.nextCursor, "cursor-1");
assert.equal(first.items[0].category.key, "story");
assert.equal(first.items[0].tone, "warn");

const second = normalizeNotificationPage({
  summary: { unreadCount: 27 },
  page: { returned: 2, hasMore: false, nextCursor: null },
  items: [
    {
      deliveryId: DELIVERY_A,
      title: "Duplicate",
      summary: "Ignored duplicate",
      status: "unread",
    },
    {
      deliveryId: DELIVERY_B,
      sourceType: "attendance",
      title: "Attendance reward",
      summary: "Reward posted",
      status: "unread",
    },
  ],
}, first.items);
assert.deepEqual(second.items.map((item) => item.id), [DELIVERY_A, DELIVERY_B]);
assert.equal(second.items[1].category.key, "attendance");

assert.throws(() =>
  normalizeNotificationPage({
    summary: { unreadCount: -1 },
    page: { returned: 0, hasMore: false, nextCursor: null },
    items: [],
  })
);
assert.throws(() =>
  normalizeNotificationPage({
    summary: { unreadCount: 1 },
    page: { returned: 1, hasMore: true, nextCursor: null },
    items: [],
  })
);

const source = fs.readFileSync(
  new URL(
    "../src/features/notifications/notification-inbox-flow.js",
    import.meta.url,
  ),
  "utf8",
);
assert.doesNotMatch(source, /\bfetch\s*\(/);
assert.doesNotMatch(source, /innerHTML\s*=\s*JSON\.stringify/);
assert.match(source, /api\.request\("notificationsPage"/);
assert.match(source, /api\.execute\("notificationsRead"/);
assert.match(
  source,
  /loading = false;\s*await loadPage\(\);\s*restore\("Completed"\)/,
);
console.log("notification inbox flow checks passed");
