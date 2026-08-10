#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path

def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")

def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--migration", required=True)
    parser.add_argument("--sql-body", required=True)
    args = parser.parse_args()
    repo = Path(args.repo)
    migration = Path(args.migration)
    sql_body = Path(args.sql_body)
    migration.write_text(sql_body.read_text(encoding="utf-8"), encoding="utf-8")

    path = repo / "backend/src/domains/storylines/contracts/storyEffectContracts.ts"
    replace_once(path,
'''  readOptionalEnum,
  readOptionalIsoDateTimeText,
  readOptionalPositiveInteger,
  readOptionalRecord,
''',
'''  readOptionalArray,
  readOptionalEnum,
  readOptionalIsoDateTimeText,
  readOptionalPositiveInteger,
  readOptionalRecord,
''')
    replace_once(path,
'''import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
''',
'''import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import { invalidStorylineContract } from "./storylineContractErrors.ts";
''')
    replace_once(path,
'''export type StoryCharacterMessagePurpose =
  typeof STORY_CHARACTER_MESSAGE_PURPOSES[number];

export type StoryEffect =
''',
'''export type StoryCharacterMessagePurpose =
  typeof STORY_CHARACTER_MESSAGE_PURPOSES[number];

export interface StoryCharacterResponseOption {
  readonly choiceKey: string;
  readonly label: string;
  readonly description: string | null;
}

export interface StoryCharacterResponseWindow {
  readonly prompt: string;
  readonly options: readonly StoryCharacterResponseOption[];
  readonly durationSeconds: number | null;
  readonly defaultChoiceKey: string | null;
}

export type StoryEffect =
''')
    replace_once(path,
'''  readonly interactionKey: string | null;
  readonly messagePurpose: StoryCharacterMessagePurpose;
  readonly body: string;
}
''',
'''  readonly interactionKey: string | null;
  readonly messagePurpose: StoryCharacterMessagePurpose;
  readonly body: string;
  readonly responseWindow: StoryCharacterResponseWindow | null;
}
''')
    replace_once(path,
'''  if (type === "character_message") {
    return {
      type,
      characterKey: readRequiredText(record.characterKey, "effect.characterKey"),
      characterName: readRequiredText(
        record.characterName,
        "effect.characterName",
      ),
      interactionKey: readOptionalText(
        record.interactionKey,
        "effect.interactionKey",
      ),
      messagePurpose: readOptionalEnum(
        record.messagePurpose,
        "effect.messagePurpose",
        STORY_CHARACTER_MESSAGE_PURPOSES,
        "relationship",
      ),
      body: readRequiredText(record.body, "effect.body"),
    };
  }
''',
'''  if (type === "character_message") {
    const interactionKey = readOptionalText(
      record.interactionKey,
      "effect.interactionKey",
    );
    const responseWindow = parseStoryCharacterResponseWindow(
      record.responseWindow,
    );
    if (responseWindow && !interactionKey) {
      throw invalidStorylineContract(
        "effect.interactionKey is required when effect.responseWindow is configured.",
      );
    }
    return {
      type,
      characterKey: readRequiredText(record.characterKey, "effect.characterKey"),
      characterName: readRequiredText(
        record.characterName,
        "effect.characterName",
      ),
      interactionKey,
      messagePurpose: readOptionalEnum(
        record.messagePurpose,
        "effect.messagePurpose",
        STORY_CHARACTER_MESSAGE_PURPOSES,
        "relationship",
      ),
      body: readRequiredText(record.body, "effect.body"),
      responseWindow,
    };
  }
''')
    replace_once(path,
'''export function parseStoryRevealPayload(
''',
'''export function parseStoryCharacterResponseWindow(
  value: unknown,
): StoryCharacterResponseWindow | null {
  const record = readOptionalRecord(value, "effect.responseWindow");
  if (record === null) return null;

  const prompt = readRequiredText(record.prompt, "effect.responseWindow.prompt");
  if (prompt.length > 1000) {
    throw invalidStorylineContract(
      "effect.responseWindow.prompt must be 1000 characters or fewer.",
    );
  }

  const optionValues = readOptionalArray(
    record.options,
    "effect.responseWindow.options",
  );
  if (optionValues.length < 2 || optionValues.length > 5) {
    throw invalidStorylineContract(
      "effect.responseWindow.options must contain 2 to 5 choices.",
    );
  }

  const seen = new Set<string>();
  const options = optionValues.map((optionValue, index) => {
    const option = readRecord(
      optionValue,
      `effect.responseWindow.options[${index}]`,
    );
    const choiceKey = readRequiredText(
      option.choiceKey,
      `effect.responseWindow.options[${index}].choiceKey`,
    );
    const label = readRequiredText(
      option.label,
      `effect.responseWindow.options[${index}].label`,
    );
    const description = readOptionalText(
      option.description,
      `effect.responseWindow.options[${index}].description`,
    );
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(choiceKey) ||
      label.length > 240 ||
      (description?.length ?? 0) > 500 ||
      seen.has(choiceKey)
    ) {
      throw invalidStorylineContract(
        "effect.responseWindow contains an invalid or duplicate choice.",
      );
    }
    seen.add(choiceKey);
    return { choiceKey, label, description };
  });

  const durationSeconds = readOptionalPositiveInteger(
    record.durationSeconds,
    "effect.responseWindow.durationSeconds",
  );
  const defaultChoiceKey = readOptionalText(
    record.defaultChoiceKey,
    "effect.responseWindow.defaultChoiceKey",
  );
  if (
    (durationSeconds !== null && durationSeconds > 31536000) ||
    (defaultChoiceKey !== null && !seen.has(defaultChoiceKey))
  ) {
    throw invalidStorylineContract(
      "effect.responseWindow default or duration is invalid.",
    );
  }

  return {
    prompt,
    options,
    durationSeconds,
    defaultChoiceKey,
  };
}

export function parseStoryRevealPayload(
''')

    path = repo / "backend/src/domains/storylines/contracts/storyEffectExecutionContracts.ts"
    replace_once(path,
'''  StoryCharacterMessagePurpose,
  StoryEffectType,
''',
'''  StoryCharacterMessagePurpose,
  StoryCharacterResponseWindow,
  StoryEffectType,
''')
    replace_once(path,
'''  readonly messagePurpose: StoryCharacterMessagePurpose;
  readonly body: string;
}
''',
'''  readonly messagePurpose: StoryCharacterMessagePurpose;
  readonly body: string;
  readonly responseWindow: StoryCharacterResponseWindow | null;
}
''')

    path = repo / "backend/src/domains/storylines/services/storyEffectEngine.ts"
    replace_once(path,
'''        messagePurpose: input.effect.messagePurpose,
        body: input.effect.body,
      });
''',
'''        messagePurpose: input.effect.messagePurpose,
        body: input.effect.body,
        responseWindow: input.effect.responseWindow,
      });
''')

    path = repo / "backend/src/domains/storylines/infrastructure/supabaseStoryMessageWriter.ts"
    replace_once(path, '"deliver_story_character_message_v1"', '"deliver_story_character_message_v2"')
    replace_once(path,
'''        p_message_purpose: input.messagePurpose,
        p_body: input.body,
      },
''',
'''        p_message_purpose: input.messagePurpose,
        p_body: input.body,
        p_response_window: input.responseWindow
          ? {
            prompt: input.responseWindow.prompt,
            options: input.responseWindow.options.map((option) => ({
              choiceKey: option.choiceKey,
              label: option.label,
              description: option.description,
            })),
            durationSeconds: input.responseWindow.durationSeconds,
            defaultChoiceKey: input.responseWindow.defaultChoiceKey,
          }
          : null,
      },
''')

    path = repo / "backend/src/domains/messaging/api/playerMessagingRoutePaths.ts"
    replace_once(path,
'''  | { readonly kind: "markRead"; readonly threadId: string }
  | { readonly kind: "malformed" };
''',
'''  | { readonly kind: "markRead"; readonly threadId: string }
  | {
    readonly kind: "selectStoryChoice";
    readonly threadId: string;
    readonly interactionKey: string;
  }
  | { readonly kind: "malformed" };
''')
    replace_once(path,
'''  const read = normalized.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/read$/,
  );
  if (read) return { kind: "markRead", threadId: read[1] };

  return { kind: "malformed" };
}
''',
'''  const read = normalized.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/read$/,
  );
  if (read) return { kind: "markRead", threadId: read[1] };

  const storyChoice = normalized.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/story-interactions\/([A-Za-z0-9][A-Za-z0-9._:-]{0,159})\/select$/,
  );
  if (storyChoice) {
    return {
      kind: "selectStoryChoice",
      threadId: storyChoice[1],
      interactionKey: storyChoice[2],
    };
  }

  return { kind: "malformed" };
}
''')

    path = repo / "backend/supabase/functions/classroom-api/messagingDispatch.ts"
    replace_once(path,
'''    case "markRead":
      return "messageRead";
''',
'''    case "markRead":
      return "messageRead";
    case "selectStoryChoice":
      return "messageStoryChoice";
''')

    path = repo / "backend/src/security/playerRateLimitDispatch.ts"
    replace_once(path,
'''  messageRead: byMethod({
    POST: operation("player.messages.receipt", "write"),
  }),
''',
'''  messageRead: byMethod({
    POST: operation("player.messages.receipt", "write"),
  }),
  messageStoryChoice: byMethod({
    POST: operation("player.messages.story.choice", "sensitive"),
  }),
''')
    replace_once(path,
'''    "messageThread",
    "messageSend",
    "messageRead",
''',
'''    "messageThread",
    "messageSend",
    "messageRead",
    "messageStoryChoice",
''')

    path = repo / "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts"
    replace_once(path, '  "messageSearch",\n  "messageSend",', '  "messageSearch",\n  "messageSend",\n  "storyChoiceSelect",')
    replace_once(path, '  "messageRead",\n  "progression",', '  "messageRead",\n  "messageStoryChoice",\n  "progression",')
    replace_once(path, 'export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-07-23.2" as const;', 'export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-08-10.1" as const;')
    replace_once(path,
'''  {
    key: "messageRead",
    operations: [
      { method: "POST", pathTemplate: "/players/me/messages/read" },
      {
        method: "POST",
        pathTemplate: "/players/me/messages/threads/:threadId/read",
      },
    ],
    routeCapabilities: ["messages"],
  },
''',
'''  {
    key: "messageRead",
    operations: [
      { method: "POST", pathTemplate: "/players/me/messages/read" },
      {
        method: "POST",
        pathTemplate: "/players/me/messages/threads/:threadId/read",
      },
    ],
    routeCapabilities: ["messages"],
  },
  {
    key: "messageStoryChoice",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/messages/threads/:threadId/story-interactions/:interactionKey/select",
    }],
    routeCapabilities: ["messages"],
    actionCapabilities: ["storyChoiceSelect"],
  },
''')

    path = repo / "player-terminal/src/api/messaging-backend-routes.js"
    replace_once(path, '  "messageRead"\n]);', '  "messageRead",\n  "messageStoryChoice"\n]);')
    replace_once(path,
'''  if (key === "messageRead") {
    return `/players/me/messages/threads/${requireThreadId(params.threadId)}/read`;
  }
''',
'''  if (key === "messageRead") {
    return `/players/me/messages/threads/${requireThreadId(params.threadId)}/read`;
  }
  if (key === "messageStoryChoice") {
    const interactionKey = String(params.interactionKey || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(interactionKey)) {
      throw new TypeError("messageStoryChoice requires a valid interactionKey.");
    }
    return `/players/me/messages/threads/${requireThreadId(params.threadId)}/story-interactions/${interactionKey}/select`;
  }
''')

    path = repo / "player-terminal/src/api/endpoints.js"
    replace_once(path,
'''  messageRead: Object.freeze({
    method: "POST",
    path: ({ threadId } = {}) => resolveMessagingBackendRoute("messageRead", { threadId }),
    contract: "Mark one Player Messaging thread read."
  }),
''',
'''  messageRead: Object.freeze({
    method: "POST",
    path: ({ threadId } = {}) => resolveMessagingBackendRoute("messageRead", { threadId }),
    contract: "Mark one Player Messaging thread read."
  }),
  messageStoryChoice: Object.freeze({
    method: "POST",
    path: ({ threadId, interactionKey } = {}) =>
      resolveMessagingBackendRoute("messageStoryChoice", { threadId, interactionKey }),
    contract: "Select one authored Story response choice in a private character conversation."
  }),
''')

    path = repo / "player-terminal/src/api/capabilities.js"
    replace_once(path, '  "messageSearch",\n  "messageSend",', '  "messageSearch",\n  "messageSend",\n  "storyChoiceSelect",')
    replace_once(path, '  messageSearch: "messageSearch",\n  messageSend: "messageSend",', '  messageSearch: "messageSearch",\n  messageSend: "messageSend",\n  storyChoiceSelect: "messageStoryChoice",')

    path = repo / "player-terminal/src/integrations/student-profile-capability-manifest.js"
    replace_once(path, '  messageSend: Object.freeze(["messageSend"]),\n  messageRead: Object.freeze(["messageRead"]),', '  messageSend: Object.freeze(["messageSend"]),\n  messageRead: Object.freeze(["messageRead"]),\n  messageStoryChoice: Object.freeze(["messageStoryChoice"]),')
    replace_once(path, '  messageSearch: "messageSearch",\n  messageSend: "messageSend",', '  messageSearch: "messageSearch",\n  messageSend: "messageSend",\n  storyChoiceSelect: "messageStoryChoice",')

    path = repo / "player-terminal/src/api/resource-plan.js"
    replace_once(path, '  messageRead: Object.freeze(["dashboard", "messages", "notifications"]),\n  progressionUnlock:', '  messageRead: Object.freeze(["dashboard", "messages", "notifications"]),\n  messageStoryChoice: Object.freeze(["dashboard", "messages", "notifications"]),\n  progressionUnlock:')

    path = repo / "player-terminal/src/api/payload-normalizer.js"
    replace_once(path,
'''  if (endpointKey === "messageRead") {
''',
'''  if (endpointKey === "messageStoryChoice") {
    const choiceKey = normalizeString("choiceKey", raw.choiceKey, endpointKey);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(choiceKey)) {
      throw invalidPayload(endpointKey, "choiceKey");
    }
    return { choiceKey };
  }
  if (endpointKey === "messageRead") {
''')

    path = repo / "player-terminal/src/app.js"
    replace_once(path,
'''    const messageThread = event.target.closest("[data-player-message-thread]");
''',
'''    const storyChoice = event.target.closest("[data-player-story-choice]");
    if (storyChoice) {
      await executeEndpoint(
        "messageStoryChoice",
        {
          choiceKey: storyChoice.dataset.choiceKey,
          gameSessionId: store.getState().data.session.gameSessionId,
        },
        {
          threadId: storyChoice.dataset.threadId,
          interactionKey: storyChoice.dataset.interactionKey,
        },
        storyChoice,
      );
      return;
    }

    const messageThread = event.target.closest("[data-player-message-thread]");
''')

    path = repo / "player-terminal/src/pages/messages-page.js"
    replace_once(path,
'''function createThreadPanel() {
''',
'''function storyInteraction(thread, message, data) {
  const interaction = message.interaction;
  if (!interaction) return "";
  const options = Array.isArray(interaction.options) ? interaction.options : [];
  const actionEnabled = data.capabilities?.actions?.storyChoiceSelect === true;
  const status = String(interaction.status || "open");
  const selected = String(interaction.selectedChoiceKey || interaction.effectiveChoiceKey || "");
  const optionMarkup = options.map((option) => {
    const chosen = selected && option.choiceKey === selected;
    if (status !== "open" || !actionEnabled) {
      return `<li${chosen ? ' data-selected="true"' : ""}><strong>${escapeHtml(option.label)}</strong>${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}${chosen ? "<em>Selected</em>" : ""}</li>`;
    }
    return `<li><button class="player-terminal-secondary-button" type="button" data-player-story-choice data-thread-id="${escapeHtml(thread.id)}" data-interaction-key="${escapeHtml(interaction.interactionKey)}" data-choice-key="${escapeHtml(option.choiceKey)}"><strong>${escapeHtml(option.label)}</strong>${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}</button></li>`;
  }).join("");
  const statusText = status === "selected"
    ? "Response recorded."
    : status === "expired"
    ? (interaction.effectiveChoiceKey ? "Response window expired; the authored default now applies." : "Response window expired.")
    : actionEnabled ? "Choose one response." : "Response selection is unavailable.";
  return `<section class="player-terminal-story-interaction" data-story-interaction-status="${escapeHtml(status)}"><header><strong>${escapeHtml(interaction.prompt)}</strong><small>${escapeHtml(statusText)}</small></header><ul>${optionMarkup}</ul></section>`;
}

function createThreadPanel() {
''')
    replace_once(path,
'''        <div class="player-terminal-message-log">${thread.messages.map((message) => `<article class="${message.self ? "is-self" : ""}"><span>${escapeHtml(message.initials)}</span><div><header><strong>${escapeHtml(message.sender)}</strong><small>${escapeHtml(message.time)}</small></header><p>${escapeHtml(message.body)}</p></div></article>`).join("")}</div>
''',
'''        <div class="player-terminal-message-log">${thread.messages.map((message) => `<article class="${message.self ? "is-self" : ""}"><span>${escapeHtml(message.initials)}</span><div><header><strong>${escapeHtml(message.sender)}</strong><small>${escapeHtml(message.time)}</small></header><p>${escapeHtml(message.body)}</p>${storyInteraction(thread, message, data)}</div></article>`).join("")}</div>
''')

    write(repo / "backend/src/domains/storylines/contracts/storyCharacterResponseWindowContract.test.ts", '''import { parseStoryEffect } from "./storyEffectContracts.ts";
declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
Deno.test("character_message accepts a bounded structured response window", () => {
  const effect = parseStoryEffect({
    type: "character_message", characterKey: "jonis_hale", characterName: "Jonis Hale",
    interactionKey: "jonis.arrival.offer", body: "Choose.",
    responseWindow: { prompt: "How do you respond?", durationSeconds: 3600, defaultChoiceKey: "decline",
      options: [{ choiceKey: "accept", label: "Accept." }, { choiceKey: "decline", label: "Decline.", description: "Not yet." }] },
  });
  if (effect.type !== "character_message" || !effect.responseWindow) throw new Error("expected response window");
  assertEquals(effect.responseWindow.options.length, 2);
  assertEquals(effect.responseWindow.defaultChoiceKey, "decline");
});
Deno.test("character_message rejects response windows without an interaction key", () => {
  let failed = false;
  try { parseStoryEffect({ type: "character_message", characterKey: "jonis_hale", characterName: "Jonis Hale", body: "Choose.",
    responseWindow: { prompt: "Choose.", options: [{ choiceKey: "a", label: "A" }, { choiceKey: "b", label: "B" }] } }); } catch { failed = true; }
  assertEquals(failed, true);
});
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
}
''')

    write(repo / "backend/src/domains/messaging/tests/storyResponseWindowMigrationContract.test.ts", f'''declare const Deno: {{ readTextFile(path: string): Promise<string>; test(name: string, run: () => void | Promise<void>): void }};
const migrationPath = "supabase/migrations/{migration.name}";
Deno.test("S2 Story response migration is private, immutable, and replay-safe", async () => {{
  const sql = await Deno.readTextFile(migrationPath);
  for (const required of ["create table public.story_message_interactions","create table public.story_message_interaction_selections","force row level security","deliver_story_character_message_v2","select_player_story_message_interaction_v1","read_player_story_message_interactions_v1","read_admin_story_message_interactions_v1","read_story_message_interaction_effective_choice_v1","PLAYER_STORY_CHOICE_IDEMPOTENCY_CONFLICT","PLAYER_STORY_CHOICE_EXPIRED"]) {{
    if (!sql.includes(required)) throw new Error(`missing ${{required}}`);
  }}
  if (/grant\\s+(?:select|insert|update|delete|all)[^;]+to\\s+(?:anon|authenticated)/i.test(sql)) throw new Error("browser table grants are not allowed");
}});
''')

    write(repo / "player-terminal/tests/story-message-choice-ui.mjs", '''import assert from "node:assert/strict";
import test from "node:test";
import { renderMessagesPage } from "../src/pages/messages-page.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { PLAYER_ENDPOINTS } from "../src/api/endpoints.js";
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
  assert.equal(PLAYER_ENDPOINTS.messageStoryChoice.path({ threadId: `thr_${"a".repeat(32)}`, interactionKey: "jonis.arrival.offer" }),
    `/players/me/messages/threads/thr_${"a".repeat(32)}/story-interactions/jonis.arrival.offer/select`);
  assert.deepEqual(normalizeWritePayload("messageStoryChoice", { choiceKey: "accept" }), { choiceKey: "accept" });
});
''')

    path = repo / "backend/package.json"
    text = path.read_text(encoding="utf-8")
    key = '"test:player-messaging": "'
    start = text.index(key)
    end = text.index('",\n', start)
    line = text[start:end+1]
    rel_migration = f"supabase/migrations/{migration.name}"
    if rel_migration not in line:
        line = line.replace(" --config", f",{rel_migration} --config", 1)
    for test_path in [
        "src/domains/storylines/contracts/storyCharacterResponseWindowContract.test.ts",
        "src/domains/messaging/tests/storyResponseWindowMigrationContract.test.ts",
    ]:
        if test_path not in line:
            line = line[:-1] + f" {test_path}" + '"'
    text = text[:start] + line + text[end+1:]
    path.write_text(text, encoding="utf-8")

if __name__ == "__main__":
    main()
