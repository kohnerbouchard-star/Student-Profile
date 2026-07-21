import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";
import { renderMessagesPage } from "../src/pages/messages-page.js";

const THREAD = `thr_${"a".repeat(32)}`;
const MESSAGE = `msg_${"b".repeat(32)}`;
const requests = [];
const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    requests.push(request);
    if (request.method === "POST" && request.path === "/players/me/messages/threads") {
      return {
        ok: true,
        data: {
          outcome: "applied",
          threadId: THREAD,
          messageId: MESSAGE,
          title: "Trade coordination",
          recipientPlayerId: "PLAYER-002",
          createdAt: "2026-07-21T03:30:00.000Z",
        },
      };
    }
    if (request.method === "GET" && request.path.startsWith("/players/me/messages")) {
      throw Object.assign(new Error("authoritative Messaging refresh failed"), {
        status: 503,
        code: "MESSAGING_REFRESH_UNAVAILABLE",
      });
    }
    throw new Error(`Unexpected connected request ${request.method} ${request.path}`);
  },
});

const api = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "player-token",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall,
});
api.readCache.set("GET:messages:cached", { unread: 0, threads: [] });
api.readCacheUpdatedAt.set("GET:messages:cached", Date.now());

const committed = await api.execute("messageThreadCreate", {
  recipientPlayerId: "PLAYER-002",
  title: "Trade coordination",
  body: "Can we coordinate after class?",
  gameSessionId: "must-not-cross-boundary",
  playerUuid: "must-not-cross-boundary",
});
assert.equal(committed.result.outcome, "applied");
assert.equal(committed.result.threadId, THREAD);
assert.equal(committed.result.messageId, MESSAGE);
assert.equal(committed.invalidatedResources.includes("messages"), true);
assert.equal(committed.invalidatedResources.includes("notifications"), true);
assert.equal(api.readCache.has("GET:messages:cached"), false);

const write = requests[0];
assert.equal(write.method, "POST");
assert.equal(write.path, "/players/me/messages/threads");
assert.deepEqual(Object.keys(write.payload).sort(), ["body", "idempotencyKey", "recipientPlayerId", "title"]);
assert.equal(typeof write.payload.idempotencyKey, "string");
assert.equal(write.payload.idempotencyKey.length > 0, true);
assert.equal("gameSessionId" in write.payload, false);
assert.equal("playerId" in write.payload, false);
assert.equal("playerUuid" in write.payload, false);

const refresh = await api.refreshResources(["messages"]);
assert.equal(Boolean(refresh.errors.messages), true);
assert.equal(committed.result.outcome, "applied", "A failed refresh must not reverse a committed thread creation.");
assert.equal(committed.result.threadId, THREAD);

const html = renderMessagesPage({
  messages: {
    unread: 1,
    threads: [{
      id: THREAD,
      type: "player",
      title: "<script>Trade</script>",
      preview: "Safe preview",
      time: "Now",
      unread: 1,
      tone: "cyan",
      initials: "TP",
      rawStatus: "active",
      allowPlayerReplies: true,
      members: "2 participants",
      status: "Active",
      messages: [{
        id: MESSAGE,
        self: false,
        initials: "P2",
        sender: "Player Two",
        time: "Now",
        body: "<img src=x onerror=alert(1)>",
      }],
    }],
  },
}, { messageThreadId: THREAD });
assert.match(html, /data-endpoint="messageThreadCreate"/);
assert.match(html, /data-endpoint="messageSend"/);
assert.match(html, /Attachments are disabled/);
assert.doesNotMatch(html, /<script>|<img src=/);
assert.match(html, /&lt;script&gt;Trade&lt;\/script&gt;/);
assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

console.log("Connected Messaging lifecycle and committed-success boundary passed.");
