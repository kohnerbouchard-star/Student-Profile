import assert from "node:assert/strict";
import test from "node:test";
import { renderMessagesPage } from "../src/pages/messages-page.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { PLAYER_ENDPOINTS, resolveEndpoint } from "../src/api/endpoints.js";
import { resolveMessagingBackendRequest } from "../src/api/messaging-backend-routes.js";
test("Story interaction renders choices only while open", () => {
  const data = { capabilities: { actions: { storyChoiceSelect: true } }, messages: { unread: 1, threads: [{
    id: `thr_${"a".repeat(32)}`, title: "Jonis Hale", type: "Character conversation", tone: "amber", initials: "JH",
    preview: "I can introduce you.", time: "Now", status: "Online", rawStatus: "active", allowPlayerReplies: false,
    members: "1 participant", unread: 1, messages: [{ id: `msg_${"b".repeat(32)}`, sender: "Jonis Hale", initials: "JH",
      body: "I can introduce you.", time: "Now", self: false, interaction: { interactionKey: "jonis.arrival.offer",
      prompt: "How do you respond?", status: "open", options: [{ choiceKey: "accept", label: "Accept.", description: "" },
      { choiceKey: "decline", label: "Decline.", description: "Not yet." }] } }] }] } };
  const html = renderMessagesPage(data, { messageThreadId: "" });
  assert.match(html, /data-player-story-choice/);
  data.messages.threads[0].messages[0].interaction.status = "selected";
  data.messages.threads[0].messages[0].interaction.selectedChoiceKey = "accept";
  const resolved = renderMessagesPage(data, { messageThreadId: "" });
  assert.doesNotMatch(resolved, /data-player-story-choice/);
  assert.match(resolved, /Response recorded/);
});
test("Story choice endpoint and payload are bounded", () => {
  const threadId = `thr_${"a".repeat(32)}`;
  const interactionKey = "jonis.arrival.offer";
  assert.equal(
    resolveEndpoint(PLAYER_ENDPOINTS.messageStoryChoice, { threadId, interactionKey }),
    `/messages/threads/${threadId}/story-interactions/jonis.arrival.offer/select`,
  );
  assert.deepEqual(normalizeWritePayload("messageStoryChoice", { choiceKey: "accept" }), { choiceKey: "accept" });
  assert.deepEqual(
    resolveMessagingBackendRequest({
      endpointKey: "messageStoryChoice",
      payload: { choiceKey: "accept", idempotencyKey: "story-choice:1" },
      params: { threadId, interactionKey },
    }),
    {
      method: "POST",
      path: `/players/me/messages/threads/${threadId}/story-interactions/jonis.arrival.offer/select`,
      payload: { choiceKey: "accept", idempotencyKey: "story-choice:1" },
    },
  );
});
