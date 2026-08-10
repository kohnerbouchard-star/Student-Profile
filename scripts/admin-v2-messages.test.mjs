import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createMessagesAdminClient } from "../admin/v2/src/routes/messages/MessagesApi.js";
import {
  createMessagesController,
  normalizeMessagesReadModel,
} from "../admin/v2/src/routes/messages/MessagesController.js";
import { isAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_UUID = "40000000-0000-4000-8000-000000000004";
const THREAD_ID = `thr_${"a".repeat(32)}`;
const MESSAGE_ID = `msg_${"b".repeat(32)}`;
const V4_UUID = "20000000-0000-4000-8000-000000000002";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function message(index = 0, overrides = {}) {
  return {
    id: `msg_${index.toString(16).padStart(32, "0")}`,
    senderType: index % 2 ? "player" : "admin",
    senderName: index % 2 ? "김민준" : "Administrator",
    body: `메시지 ${index} — long content stays presentation-safe.`,
    hidden: false,
    hiddenReason: "",
    createdAt: `2026-08-07T0${index % 9}:15:00.000Z`,
    ...overrides,
  };
}

function thread(index = 0, overrides = {}) {
  return {
    id: `thr_${(index + 1).toString(16).padStart(32, "0")}`,
    type: index % 3 === 0 ? "player" : index % 3 === 1 ? "contract" : "announcement",
    title: `대화 ${index} — 국제 시장 토론`,
    contractKey: index % 3 === 1 ? `contract-${index}` : "",
    allowPlayerReplies: true,
    status: index % 3 === 0 ? "active" : index % 3 === 1 ? "disabled" : "closed",
    moderationReason: index % 3 === 1 ? "Classroom moderation review." : "",
    retentionUntil: "2026-08-31T23:59:59.999Z",
    expired: false,
    createdAt: "2026-08-07T01:00:00.000Z",
    updatedAt: "2026-08-07T02:00:00.000Z",
    participants: [
      { reference: `PLAYER-${String(index + 1).padStart(3, "0")}`, displayName: "박서연", rosterLabel: "Y10", lastReadAt: "2026-08-07T02:10:00.000Z" },
      { reference: `PLAYER-${String(index + 2).padStart(3, "0")}`, displayName: "Jordan Lee", rosterLabel: "Y10", lastReadAt: null },
    ],
    messages: [message(index)],
    ...overrides,
  };
}

function readPayload(threads = [thread()], { limit = 25, offset = 0, hasMore = false } = {}) {
  return {
    data: {
      threads,
      summary: { returned: threads.length },
      pagination: { limit, offset, returned: threads.length, hasMore },
      filters: { status: "all", query: "" },
    },
  };
}

test("Messages client uses only the authoritative moderation read contract", async () => {
  const calls = [];
  const client = createMessagesAdminClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(readPayload([]));
    },
    timeoutMs: 1_000,
  });

  const result = await client.readMessages({
    gameId: GAME_ID,
    query: "김민준",
    status: "disabled",
    limit: 50,
    offset: 100,
  });

  assert.deepEqual(result.data.threads, []);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `/api/admin/games/${GAME_ID}/messages?status=disabled&limit=50&offset=100&q=${encodeURIComponent("김민준")}`,
  );
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal("body" in calls[0].init, false);
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(client.createThread, undefined);
  assert.equal(client.sendMessage, undefined);
  assert.equal(client.updatePolicy, undefined);
});

test("Messages client maps only authoritative moderation mutations", async () => {
  const calls = [];
  const client = createMessagesAdminClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ data: { outcome: "applied" } });
    },
    timeoutMs: 1_000,
  });
  const key = `admin.messages.test.${V4_UUID}`;

  await client.moderateThread({ gameId: GAME_ID, threadId: THREAD_ID, action: "disable", reason: "Review", idempotencyKey: key });
  await client.moderateThread({ gameId: GAME_ID, threadId: THREAD_ID, action: "enable", idempotencyKey: `${key}.enable` });
  await client.moderateMessage({ gameId: GAME_ID, threadId: THREAD_ID, messageId: MESSAGE_ID, action: "hide", reason: "Unsafe", idempotencyKey: `${key}.hide` });
  await client.moderateMessage({ gameId: GAME_ID, threadId: THREAD_ID, messageId: MESSAGE_ID, action: "unhide", idempotencyKey: `${key}.unhide` });
  await client.deleteExpiredThread({ gameId: GAME_ID, threadId: THREAD_ID, reason: "Retention expired", idempotencyKey: `${key}.delete` });

  assert.deepEqual(calls.map(({ url }) => url), [
    `/api/admin/games/${GAME_ID}/messages/threads/${THREAD_ID}/disable`,
    `/api/admin/games/${GAME_ID}/messages/threads/${THREAD_ID}/enable`,
    `/api/admin/games/${GAME_ID}/messages/threads/${THREAD_ID}/messages/${MESSAGE_ID}/hide`,
    `/api/admin/games/${GAME_ID}/messages/threads/${THREAD_ID}/messages/${MESSAGE_ID}/unhide`,
    `/api/admin/games/${GAME_ID}/messages/threads/${THREAD_ID}/delete`,
  ]);
  calls.forEach(({ init }) => {
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "include");
    assert.match(init.headers["Idempotency-Key"], /^admin\.messages\./);
    assert.equal(init.headers["X-Request-Id"], init.headers["Idempotency-Key"]);
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(JSON.parse(init.body).idempotencyKey, init.headers["Idempotency-Key"]);
  });
});

test("Messages model preserves Korean and long text while redacting private UUID-shaped presentation data", () => {
  const longKorean = "경제 토론 ".repeat(80);
  const input = thread(0, {
    title: `개인 식별자 ${PRIVATE_UUID} 토론`,
    ownerUuid: PRIVATE_UUID,
    rawToken: "super-secret-token",
    serviceRole: "service_role",
    participants: [{
      reference: "PLAYER-777",
      displayName: `김민준 ${PRIVATE_UUID}`,
      rosterLabel: "Y10 경제학",
      internalOwnerUuid: PRIVATE_UUID,
    }],
    messages: [message(1, {
      body: `${longKorean}${PRIVATE_UUID}`,
      hidden: true,
      hiddenReason: `검토 사유 ${PRIVATE_UUID}`,
      privateMetadata: { rawToken: "do-not-render" },
    })],
  });

  const model = normalizeMessagesReadModel(readPayload([input]));
  const serialized = JSON.stringify(model);

  assert.match(model.threads[0].title, /개인 식별자/);
  assert.match(model.threads[0].participants[0].displayName, /김민준/);
  assert.match(model.threads[0].messages[0].body, /경제 토론/);
  assert.equal(model.threads[0].messages[0].body.length <= 1000, true);
  assert.equal(serialized.includes(PRIVATE_UUID), false);
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal(serialized.includes("service_role"), false);
  assert.equal(serialized.includes("do-not-render"), false);
  assert.match(serialized, /private identifier hidden/);
});



test("Messages model preserves story character and provenance metadata", () => {
  const model = normalizeMessagesReadModel(readPayload([thread(0, {
    type: "story",
    title: "Jonis Hale",
    allowPlayerReplies: false,
    storyCharacterKey: "character.northreach.jonis-hale.v1",
    storyCharacterName: "Jonis Hale",
    messages: [message(0, {
      senderType: "system",
      senderName: "Jonis Hale",
      senderCharacterKey: "character.northreach.jonis-hale.v1",
      storylineKey: "econovaria_meridian_v1",
      storyEventKey: "northreach_production_pressure",
      interactionKey: "interaction.jonis.production-pressure.v1",
      messagePurpose: "warning",
    })],
  })]));
  const story = model.threads[0];
  assert.equal(story.type, "story");
  assert.equal(story.storyCharacterName, "Jonis Hale");
  assert.equal(story.allowPlayerReplies, false);
  assert.equal(story.messages[0].storyEventKey, "northreach_production_pressure");
  assert.equal(story.messages[0].messagePurpose, "warning");
});

test("Messages model preserves read-only Story response state", () => {
  const input = thread(0, {
    type: "story",
    title: "Jonis Hale",
    storyCharacterKey: "character.northreach.jonis-hale.v1",
    storyCharacterName: "Jonis Hale",
    allowPlayerReplies: false,
    messages: [message(0, {
      senderType: "system",
      senderName: "Jonis Hale",
      interaction: {
        interactionKey: "interaction.jonis.offer.v1",
        prompt: "How do you answer?",
        status: "selected",
        opensAt: "2026-08-07T01:00:00.000Z",
        closesAt: "2026-08-07T03:00:00.000Z",
        selectedChoiceKey: "decline",
        effectiveChoiceKey: "decline",
        selectedAt: "2026-08-07T02:00:00.000Z",
        options: [
          { choiceKey: "accept", label: "Accept his help", description: "Owe a favor." },
          { choiceKey: "decline", label: "Decline", description: "Stay independent." },
        ],
      },
    })],
  });
  const model = normalizeMessagesReadModel(readPayload([input]));
  assert.equal(model.threads[0].messages[0].interaction.status, "selected");
  assert.equal(model.threads[0].messages[0].interaction.effectiveChoiceKey, "decline");
});

test("Messages model handles zero threads and high-volume authoritative pages", () => {
  const empty = normalizeMessagesReadModel(readPayload([]));
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.summary.returned, 0);

  const threads = Array.from({ length: 50 }, (_, threadIndex) => thread(threadIndex, {
    messages: Array.from({ length: 100 }, (_, messageIndex) => message(messageIndex)),
  }));
  const highVolume = normalizeMessagesReadModel(readPayload(threads, { limit: 50, hasMore: true }));
  assert.equal(highVolume.threads.length, 50);
  assert.equal(highVolume.threads.every((item) => item.messages.length === 100), true);
  assert.equal(highVolume.pagination.limit, 50);
  assert.equal(highVolume.pagination.hasMore, true);
});

test("Messages controller fails closed on permission and owns ready, empty, stale, and mutation validation", async () => {
  let allowed = false;
  let reads = 0;
  let next = readPayload([thread()]);
  const calls = [];
  const api = {
    async readMessages() {
      reads += 1;
      if (next instanceof Error) throw next;
      return next;
    },
    cancelMessagesRequest() { return false; },
    async moderateThread(input) { calls.push(["thread", input]); return { data: { outcome: "applied" } }; },
    async moderateMessage(input) { calls.push(["message", input]); return { data: { outcome: "applied" } }; },
    async deleteExpiredThread(input) { calls.push(["retention", input]); return { data: { outcome: "applied" } }; },
  };
  const controller = createMessagesController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => allowed,
    cryptoObject: { randomUUID: () => V4_UUID },
  });

  await controller.load();
  assert.equal(reads, 0);
  assert.equal(controller.getState().hasResolved, false);

  allowed = true;
  await controller.load();
  assert.equal(controller.getState().status, "ready");
  const currentThread = controller.getState().data.threads[0];
  const currentMessage = currentThread.messages[0];

  const missingReason = await controller.moderateThread(currentThread, "disable", "");
  assert.equal(missingReason.ok, false);
  assert.equal(missingReason.error.code, "VALIDATION_FAILED");
  assert.equal(calls.length, 0);

  assert.equal((await controller.moderateThread(currentThread, "disable", "Policy review")).ok, true);
  assert.equal((await controller.moderateMessage(currentThread, currentMessage, "hide", "Safety review")).ok, true);
  assert.equal(calls.length, 2);

  next = readPayload([]);
  await controller.load();
  assert.equal(controller.getState().status, "empty");

  next = Object.assign(new Error("private SQL trace service_role"), { status: 503, code: "messaging_failed" });
  await controller.load();
  assert.equal(controller.getState().status, "stale");
  assert.equal(isAdminErrorEnvelope(controller.getState().error), true);
  assert.equal(JSON.stringify(controller.getState()).includes("private SQL trace"), false);
  controller.destroy();
});

test("Messages route registration is V2-owned and presentation source excludes private identifiers and chat creation", () => {
  const nav = readFileSync("admin/v2/src/core/navigation-registry.js", "utf8");
  const app = readFileSync("admin/v2/src/app.js", "utf8");
  const html = readFileSync("admin/v2.html", "utf8");
  const route = readFileSync("admin/v2/src/routes/messages/MessagesRoute.js", "utf8");
  const controller = readFileSync("admin/v2/src/routes/messages/MessagesController.js", "utf8");
  const css = readFileSync("admin/v2/styles/routes/messages.css", "utf8");

  assert.match(nav, /id:\s*"messages"[\s\S]*permission:\s*"messaging\.moderate"[\s\S]*migration:\s*"v2"/);
  assert.match(app, /createMessagesController/);
  assert.match(app, /messages:\s*Object\.freeze/);
  assert.match(html, /styles\/routes\/messages\.css/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(route, /Messages Moderation/);
  assert.match(route, /senderName/);
  assert.match(route, /participants/);
  assert.match(route, /moderationReason/);
  assert.match(route, /hiddenReason/);
  assert.match(route, /Story response window/);
  assert.match(route, /Story character/);
  assert.match(route, /Story provenance/);
  assert.doesNotMatch(route, /text:\s*(?:thread|message)\.id/);
  assert.doesNotMatch(`${route}\n${controller}`, /playerUuid|ownerUuid|rawToken|serviceRole|authorization|Bearer/i);
  assert.doesNotMatch(route, /Create thread|New message|Send message|targetAllPlayers|allowPlayerReplies.*checkbox/i);
  assert.doesNotMatch(route, /data-player-story-choice|Select Story choice|Choose for Player/i);
});
