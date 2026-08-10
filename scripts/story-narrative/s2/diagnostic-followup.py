from __future__ import annotations
import argparse
from pathlib import Path


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding='utf-8')


def replace_once(path: Path, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one anchor, found {count}: {old[:100]!r}')
    write(path, text.replace(old, new, 1))


def insert_before_once(path: Path, marker: str, addition: str) -> None:
    text = read(path)
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f'{path}: expected one marker, found {count}: {marker[:100]!r}')
    write(path, text.replace(marker, addition + marker, 1))


def main(repo: Path) -> None:
    # Player Messaging HTTP: hydrate response windows and select choices.
    path = repo / 'backend/src/domains/messaging/api/playerMessagingHttpHandler.ts'
    replace_once(path,
'''interface RawMessage {
  readonly id?: unknown;
  readonly senderType?: unknown;
''',
'''interface RawStoryInteractionOption {
  readonly choiceKey?: unknown;
  readonly label?: unknown;
  readonly description?: unknown;
}
interface RawStoryInteraction {
  readonly interactionKey?: unknown;
  readonly prompt?: unknown;
  readonly status?: unknown;
  readonly opensAt?: unknown;
  readonly closesAt?: unknown;
  readonly selectedChoiceKey?: unknown;
  readonly effectiveChoiceKey?: unknown;
  readonly selectedAt?: unknown;
  readonly options?: unknown;
}
interface RawMessage {
  readonly id?: unknown;
  readonly senderType?: unknown;
''')
    replace_once(path,
'''  readonly messagePurpose?: unknown;
  readonly body?: unknown;
''',
'''  readonly messagePurpose?: unknown;
  readonly interaction?: unknown;
  readonly body?: unknown;
''')
    replace_once(path,
'''interface ReadRow {
  readonly thread_id?: unknown;
  readonly read_at?: unknown;
  readonly unread_count?: unknown;
}
''',
'''interface ReadRow {
  readonly thread_id?: unknown;
  readonly read_at?: unknown;
  readonly unread_count?: unknown;
}
interface StoryChoiceRow {
  readonly selection_outcome?: unknown;
  readonly thread_id?: unknown;
  readonly interaction_key?: unknown;
  readonly choice_key?: unknown;
  readonly interaction_status?: unknown;
  readonly selected_at?: unknown;
  readonly effective_choice_key?: unknown;
}
''')
    replace_once(path,
'''      case "thread":
        return await handleRead(request, route, client, scope.gameId, scope.playerUuid);
      case "send":
        return await handleSend(request, route.threadId, client, scope.gameId, scope.playerUuid);
      case "markRead":
''',
'''      case "thread":
        return await handleRead(request, route, client, scope.gameId, scope.playerUuid, now);
      case "send":
        return await handleSend(request, route.threadId, client, scope.gameId, scope.playerUuid);
      case "selectStoryChoice":
        return await handleStoryChoice(
          request,
          route.threadId,
          route.interactionKey,
          client,
          scope.gameId,
          scope.playerUuid,
          now,
        );
      case "markRead":
''')
    replace_once(path,
'''  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
): Promise<Response> {
''',
'''  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
  now: Date,
): Promise<Response> {
''')
    replace_once(path,
'''    if (response.error) return mapRpcError(response.error);
    return privateJsonResponse(200, {
      ok: true,
      data: { thread: normalizeThread(response.data) },
    });
''',
'''    if (response.error) return mapRpcError(response.error);
    const hydration = await hydrateStoryThreadInteractions(
      client,
      gameId,
      playerId,
      response.data,
      now,
    );
    if (!hydration.ok) return mapRpcError(hydration.error);
    return privateJsonResponse(200, {
      ok: true,
      data: { thread: normalizeThread(hydration.thread) },
    });
''')
    replace_once(path,
'''  if (response.error) return mapRpcError(response.error);
  const inbox = normalizeInbox(response.data);

  if (route.kind === "search") {
''',
'''  if (response.error) return mapRpcError(response.error);
  const hydration = await hydrateStoryInboxInteractions(
    client,
    gameId,
    playerId,
    response.data,
    now,
  );
  if (!hydration.ok) return mapRpcError(hydration.error);
  const inbox = normalizeInbox(hydration.inbox);

  if (route.kind === "search") {
''')
    insert_before_once(path,
'''async function handleReadReceipt(
''',
'''async function handleStoryChoice(
  request: Request,
  threadId: string,
  interactionKey: string,
  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
  now: Date,
): Promise<Response> {
  if (new URL(request.url).searchParams.size) {
    return invalidResult("Story choice selection does not accept query parameters.").response;
  }
  const command = await parseStoryChoiceCommand(request);
  if (!command.ok) return command.response;
  const response = await client.rpc<readonly StoryChoiceRow[]>(
    "select_player_story_message_interaction_v1",
    {
      p_game_session_id: gameId,
      p_player_id: playerId,
      p_thread_public_id: threadId,
      p_interaction_key: interactionKey,
      p_choice_key: command.choiceKey,
      p_idempotency_key: command.idempotencyKey,
      p_selected_at: now.toISOString(),
    },
  );
  if (response.error) return mapRpcError(response.error);
  const result = normalizeStoryChoiceRow(
    response.data?.[0],
    threadId,
    interactionKey,
  );
  return privateJsonResponse(result.outcome === "applied" ? 201 : 200, {
    ok: true,
    data: result,
  });
}

''')
    replace_once(path,
'''  if ((kind === "send" || kind === "markRead") && method !== "POST") {
''',
'''  if ((kind === "send" || kind === "markRead" || kind === "selectStoryChoice") && method !== "POST") {
''')
    insert_before_once(path,
'''function normalizeInbox(value: RawInbox | null) {
''',
'''async function parseStoryChoiceCommand(request: Request): Promise<
  | { readonly ok: true; readonly choiceKey: string; readonly idempotencyKey: string }
  | { readonly ok: false; readonly response: Response }
> {
  const value = await request.clone().json().catch(() => null);
  if (!isRecord(value) || Object.keys(value).some((key) => !["choiceKey", "idempotencyKey"].includes(key))) {
    return invalidResult("Provide a valid Story choice JSON object.");
  }
  const choiceKey = typeof value.choiceKey === "string" ? value.choiceKey.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(choiceKey)) {
    return invalidResult("Story choiceKey is invalid.");
  }
  const bodyKey = typeof value.idempotencyKey === "string" ? value.idempotencyKey.trim() : "";
  const headerKey = request.headers.get("idempotency-key")?.trim() ??
    request.headers.get("x-idempotency-key")?.trim() ??
    request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) {
    return invalidResult("Request and header idempotency keys must match.");
  }
  const idempotencyKey = bodyKey || headerKey;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)) {
    return invalidResult("A safe idempotency key is required.");
  }
  return { ok: true, choiceKey, idempotencyKey };
}

async function hydrateStoryInboxInteractions(
  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
  inbox: RawInbox | null,
  now: Date,
): Promise<
  | { readonly ok: true; readonly inbox: RawInbox | null }
  | { readonly ok: false; readonly error: RpcError }
> {
  if (!isRecord(inbox) || !Array.isArray(inbox.threads)) {
    return { ok: true, inbox };
  }
  const threadIds = storyThreadPublicIds(inbox.threads);
  if (threadIds.length === 0) return { ok: true, inbox };
  const interactionRead = await readStoryInteractionMap(
    client,
    gameId,
    playerId,
    threadIds,
    now,
  );
  if (!interactionRead.ok) return interactionRead;
  return {
    ok: true,
    inbox: {
      ...inbox,
      threads: inbox.threads.map((thread) =>
        hydrateRawStoryThread(thread, interactionRead.interactions)
      ),
    },
  };
}

async function hydrateStoryThreadInteractions(
  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
  thread: RawThread | null,
  now: Date,
): Promise<
  | { readonly ok: true; readonly thread: RawThread | null }
  | { readonly ok: false; readonly error: RpcError }
> {
  if (!isRecord(thread) || String(thread.type || "").trim().toLowerCase() !== "story") {
    return { ok: true, thread };
  }
  const threadId = String(thread.id || "").trim();
  if (!/^thr_[0-9a-f]{32}$/.test(threadId)) {
    return { ok: true, thread };
  }
  const interactionRead = await readStoryInteractionMap(
    client,
    gameId,
    playerId,
    [threadId],
    now,
  );
  if (!interactionRead.ok) return interactionRead;
  return {
    ok: true,
    thread: hydrateRawStoryThread(thread, interactionRead.interactions) as RawThread,
  };
}

async function readStoryInteractionMap(
  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
  threadIds: readonly string[],
  now: Date,
): Promise<
  | { readonly ok: true; readonly interactions: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly error: RpcError }
> {
  const response = await client.rpc<Record<string, unknown>>(
    "read_player_story_message_interactions_v1",
    {
      p_game_session_id: gameId,
      p_player_id: playerId,
      p_thread_public_ids: [...threadIds],
      p_at: now.toISOString(),
    },
  );
  if (response.error) return { ok: false, error: response.error };
  return {
    ok: true,
    interactions: isRecord(response.data) ? response.data : Object.freeze({}),
  };
}

function storyThreadPublicIds(values: readonly unknown[]): readonly string[] {
  const ids = values.flatMap((value) => {
    if (!isRecord(value) || String(value.type || "").trim().toLowerCase() !== "story") {
      return [];
    }
    const id = String(value.id || "").trim();
    return /^thr_[0-9a-f]{32}$/.test(id) ? [id] : [];
  });
  return [...new Set(ids)].slice(0, 50);
}

function hydrateRawStoryThread(
  value: unknown,
  interactions: Readonly<Record<string, unknown>>,
): unknown {
  if (!isRecord(value) || String(value.type || "").trim().toLowerCase() !== "story") {
    return value;
  }
  const messages = Array.isArray(value.messages)
    ? value.messages.map((message) => {
      if (!isRecord(message)) return message;
      const messageId = String(message.id || "").trim();
      return Object.prototype.hasOwnProperty.call(interactions, messageId)
        ? { ...message, interaction: interactions[messageId] }
        : message;
    })
    : value.messages;
  return { ...value, messages };
}

''')
    replace_once(path,
'''    interactionKey: optionalText(value.interactionKey, 160),
    messagePurpose: optionalText(value.messagePurpose, 40),
    initials: initials(sender),
''',
'''    interactionKey: optionalText(value.interactionKey, 160),
    messagePurpose: optionalText(value.messagePurpose, 40),
    interaction: value.interaction === null || value.interaction === undefined
      ? null
      : normalizeStoryInteraction(value.interaction),
    initials: initials(sender),
''')
    insert_before_once(path,
'''function normalizeSendRow(value: SendRow | undefined, expectedThreadId: string) {
''',
'''function normalizeStoryInteraction(value: unknown) {
  if (!isRecord(value)) throw new Error("invalid story interaction");
  const interactionKey = storyPublicKey(value.interactionKey, 160);
  const prompt = requiredText(value.prompt, 1000);
  const status = enumText(value.status, ["open", "selected", "expired"]);
  const opensAt = isoTimestamp(value.opensAt);
  const closesAt = value.closesAt === null || value.closesAt === undefined
    ? ""
    : isoTimestamp(value.closesAt);
  const selectedChoiceKey = optionalStoryChoiceKey(value.selectedChoiceKey);
  const effectiveChoiceKey = optionalStoryChoiceKey(value.effectiveChoiceKey);
  const selectedAt = value.selectedAt === null || value.selectedAt === undefined
    ? ""
    : isoTimestamp(value.selectedAt);
  if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 5) {
    throw new Error("invalid story interaction options");
  }
  const options = value.options.map((option) => {
    if (!isRecord(option)) throw new Error("invalid story interaction option");
    return Object.freeze({
      choiceKey: storyChoiceKey(option.choiceKey),
      label: requiredText(option.label, 240),
      description: optionalText(option.description, 500),
    });
  });
  if (new Set(options.map((option) => option.choiceKey)).size !== options.length) {
    throw new Error("duplicate story interaction options");
  }
  return Object.freeze({
    interactionKey,
    prompt,
    status,
    opensAt,
    closesAt,
    selectedChoiceKey,
    effectiveChoiceKey,
    selectedAt,
    options: Object.freeze(options),
  });
}

function normalizeStoryChoiceRow(
  value: StoryChoiceRow | undefined,
  expectedThreadId: string,
  expectedInteractionKey: string,
) {
  if (!isRecord(value)) throw new Error("invalid story choice response");
  const outcome = enumText(value.selection_outcome, ["applied", "replayed"]);
  const threadId = publicId(value.thread_id, /^thr_[0-9a-f]{32}$/);
  const interactionKey = storyPublicKey(value.interaction_key, 160);
  const choiceKey = storyChoiceKey(value.choice_key);
  const status = enumText(value.interaction_status, ["selected"]);
  const effectiveChoiceKey = storyChoiceKey(value.effective_choice_key);
  if (threadId !== expectedThreadId || interactionKey !== expectedInteractionKey) {
    throw new Error("story choice identity mismatch");
  }
  return Object.freeze({
    outcome,
    threadId,
    interactionKey,
    choiceKey,
    status,
    selectedAt: isoTimestamp(value.selected_at),
    effectiveChoiceKey,
  });
}

function storyPublicKey(value: unknown, maximum: number): string {
  const result = requiredText(value, maximum);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result) || UUID_SHAPED.test(result)) {
    throw new Error("invalid story public key");
  }
  return result;
}

function storyChoiceKey(value: unknown): string {
  const result = storyPublicKey(value, 96);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(result)) {
    throw new Error("invalid story choice key");
  }
  return result;
}

function optionalStoryChoiceKey(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? ""
    : storyChoiceKey(value);
}

''')
    insert_before_once(path,
'''function requiredText(value: unknown, maximum: number): string {
''',
'''const UUID_SHAPED = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

''')
    replace_once(path,
'''  if (message.includes("PLAYER_MESSAGE_THREAD_NOT_FOUND") || message.includes("PLAYER_MESSAGES_SCOPE_FORBIDDEN")) {
''',
'''  if (message.includes("PLAYER_STORY_CHOICE_IDEMPOTENCY_CONFLICT")) {
    return messagingError(409, "player_story_choice_idempotency_conflict", "This idempotency key was already used for another Story choice.");
  }
  if (message.includes("PLAYER_STORY_CHOICE_EXPIRED")) {
    return messagingError(409, "player_story_choice_expired", "This Story response window is closed.");
  }
  if (message.includes("PLAYER_STORY_CHOICE_INVALID_OPTION")) {
    return messagingError(422, "player_story_choice_invalid_option", "That Story response option is not available.");
  }
  if (message.includes("PLAYER_STORY_CHOICE_GAME_NOT_ACTIVE")) {
    return messagingError(409, "game_not_active", "Story choices cannot be selected while the game is not active.");
  }
  if (message.includes("PLAYER_STORY_CHOICE_NOT_FOUND") || message.includes("PLAYER_STORY_CHOICE_SCOPE_FORBIDDEN")) {
    return messagingError(404, "player_story_choice_not_found", "Story response window was not found.");
  }
  if (message.includes("PLAYER_MESSAGE_THREAD_NOT_FOUND") || message.includes("PLAYER_MESSAGES_SCOPE_FORBIDDEN")) {
''')

    # Admin Messaging: hydrate read-only interaction state.
    path = repo / 'backend/supabase/functions/admin-api/messagingOperationsCore.ts'
    replace_once(path,
'''    const raw = normalizeThreadRead(response.data);
    const normalized = raw.threads.map(normalizeThread);
''',
'''    const raw = normalizeThreadRead(response.data);
    const hydration = await hydrateAdminStoryInteractions(service, input, raw.threads);
    if (!hydration.ok) return rpcError(hydration.error);
    const normalized = hydration.threads.map(normalizeThread);
''')
    insert_before_once(path,
'''function normalizeThreadRead(value: unknown): { readonly threads: readonly unknown[] } {
''',
'''async function hydrateAdminStoryInteractions(
  service: AdminService,
  input: Parameters<typeof handleMessagingOperation>[1],
  threads: readonly unknown[],
): Promise<
  | { readonly ok: true; readonly threads: readonly unknown[] }
  | { readonly ok: false; readonly error: RpcError }
> {
  const threadIds = threads.flatMap((thread) => {
    if (!isRecord(thread) || text(thread.type).toLowerCase() !== "story") return [];
    const id = text(thread.id);
    return THREAD_ID_PATTERN.test(id) ? [id] : [];
  });
  const uniqueThreadIds = [...new Set(threadIds)].slice(0, 51);
  if (uniqueThreadIds.length === 0) return { ok: true, threads };
  const response = await service.rpc<Record<string, unknown>>(
    "read_admin_story_message_interactions_v1",
    {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_thread_public_ids: uniqueThreadIds,
    },
  );
  if (response.error) return { ok: false, error: response.error };
  const interactions = isRecord(response.data) ? response.data : {};
  return {
    ok: true,
    threads: threads.map((thread) => hydrateAdminStoryThread(thread, interactions)),
  };
}

function hydrateAdminStoryThread(
  value: unknown,
  interactions: Readonly<Record<string, unknown>>,
): unknown {
  if (!isRecord(value) || text(value.type).toLowerCase() !== "story") return value;
  const messages = Array.isArray(value.messages)
    ? value.messages.map((message) => {
      if (!isRecord(message)) return message;
      const id = text(message.id);
      return Object.prototype.hasOwnProperty.call(interactions, id)
        ? { ...message, interaction: interactions[id] }
        : message;
    })
    : value.messages;
  return { ...value, messages };
}

''')
    replace_once(path,
'''      messagePurpose: optionalOutputText(item.messagePurpose, 40),
      body: outputText(item.body, 1000),
''',
'''      messagePurpose: optionalOutputText(item.messagePurpose, 40),
      interaction: item.interaction === null || item.interaction === undefined
        ? null
        : normalizeAdminStoryInteraction(item.interaction),
      body: outputText(item.body, 1000),
''')
    insert_before_once(path,
'''function normalizeCreateRow(value: CreateRow | undefined) {
''',
'''function normalizeAdminStoryInteraction(value: unknown) {
  if (!isRecord(value)) throw new Error("invalid story interaction");
  const interactionKey = outputStoryKey(value.interactionKey, 160);
  const prompt = outputText(value.prompt, 1000);
  const status = enumValue(value.status, ["open", "selected", "expired"]);
  const opensAt = timestamp(value.opensAt);
  const closesAt = optionalTimestamp(value.closesAt);
  const selectedChoiceKey = optionalStoryChoice(value.selectedChoiceKey);
  const effectiveChoiceKey = optionalStoryChoice(value.effectiveChoiceKey);
  const selectedAt = optionalTimestamp(value.selectedAt);
  if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 5) {
    throw new Error("invalid story interaction options");
  }
  const options = value.options.map((option) => {
    if (!isRecord(option)) throw new Error("invalid story interaction option");
    return Object.freeze({
      choiceKey: outputStoryChoice(option.choiceKey),
      label: outputText(option.label, 240),
      description: optionalOutputText(option.description, 500),
    });
  });
  return Object.freeze({
    interactionKey,
    prompt,
    status,
    opensAt,
    closesAt,
    selectedChoiceKey,
    effectiveChoiceKey,
    selectedAt,
    options: Object.freeze(options),
  });
}

function outputStoryKey(value: unknown, maximum: number): string {
  const result = outputText(value, maximum);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result) || UUID_OUTPUT_PATTERN.test(result)) {
    throw new Error("invalid story key");
  }
  return result;
}

function outputStoryChoice(value: unknown): string {
  const result = outputStoryKey(value, 96);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(result)) {
    throw new Error("invalid story choice");
  }
  return result;
}

function optionalStoryChoice(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? ""
    : outputStoryChoice(value);
}

''')
    insert_before_once(path,
'''function text(value: unknown): string {
''',
'''const UUID_OUTPUT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

''')

    # Admin V2 controller read-only normalization.
    path = repo / 'admin/v2/src/routes/messages/MessagesController.js'
    insert_before_once(path,
'''function normalizeMessage(value) {
''',
'''function normalizeStoryInteraction(value) {
  if (!isRecord(value)) return null;
  const interactionKey = cleanText(value.interactionKey, 160);
  const prompt = cleanText(value.prompt, 1000);
  const status = cleanText(value.status, 40);
  if (!interactionKey || !prompt || !["open", "selected", "expired"].includes(status)) return null;
  const options = Array.isArray(value.options)
    ? value.options.slice(0, 5).map((option) => {
      if (!isRecord(option)) return null;
      const choiceKey = cleanText(option.choiceKey, 96);
      const label = cleanText(option.label, 240);
      if (!choiceKey || !label) return null;
      return Object.freeze({
        choiceKey,
        label,
        description: cleanText(option.description, 500),
      });
    }).filter(Boolean)
    : [];
  if (options.length < 2) return null;
  return Object.freeze({
    interactionKey,
    prompt,
    status,
    opensAt: timestamp(value.opensAt),
    closesAt: timestamp(value.closesAt),
    selectedChoiceKey: cleanText(value.selectedChoiceKey, 96),
    effectiveChoiceKey: cleanText(value.effectiveChoiceKey, 96),
    selectedAt: timestamp(value.selectedAt),
    options: Object.freeze(options),
  });
}

''')
    replace_once(path,
'''    messagePurpose: cleanText(value.messagePurpose, 40),
    body: cleanText(value.body, 1000),
''',
'''    messagePurpose: cleanText(value.messagePurpose, 40),
    interaction: normalizeStoryInteraction(value.interaction),
    body: cleanText(value.body, 1000),
''')

    # Admin V2 route renders response window read-only.
    path = repo / 'admin/v2/src/routes/messages/MessagesRoute.js'
    insert_before_once(path,
'''function messageCard({ thread, message, onRequestAction }) {
''',
'''function storyInteractionSummary(message) {
  const interaction = message.interaction;
  if (!interaction) return null;
  const effective = interaction.effectiveChoiceKey
    ? interaction.options.find((option) => option.choiceKey === interaction.effectiveChoiceKey)?.label || interaction.effectiveChoiceKey
    : "No effective choice";
  return createElement("section", {
    className: "admin-messages-route__story-interaction",
    attrs: { "aria-label": "Structured Story response" },
    children: [
      createElement("strong", { text: "Story response window" }),
      createElement("p", { text: interaction.prompt }),
      createElement("small", { text: `${titleCase(interaction.status)} · ${effective}` }),
      createElement("ul", {
        children: interaction.options.map((option) => createElement("li", {
          text: `${option.label}${option.description ? ` — ${option.description}` : ""}`,
        })),
      }),
    ],
  });
}

''')
    replace_once(path,
'''      createElement("p", { className: "admin-messages-route__body", text: message.body || "Message body unavailable." }),
      message.hidden ? createElement("p", {
''',
'''      createElement("p", { className: "admin-messages-route__body", text: message.body || "Message body unavailable." }),
      storyInteractionSummary(message),
      message.hidden ? createElement("p", {
''')

    # S1 tests carried forward to V2 writer/responseWindow contract.
    path = repo / 'backend/src/domains/storylines/contracts/storyCharacterMessageContract.test.ts'
    replace_once(path,
'''  const effect = parseStoryEffect({
    type: "character_message",
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
  });
''',
'''  const effect = parseStoryEffect({
    type: "character_message",
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
  });
''')
    replace_once(path,
'''  assertEquals(effect, {
    type: "character_message",
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
  });
''',
'''  assertEquals(effect, {
    type: "character_message",
    characterKey: "character.northreach.jonis-hale.v1",
    characterName: "Jonis Hale",
    interactionKey: "interaction.jonis.production-pressure.v1",
    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
    responseWindow: null,
  });
''')
    replace_once(path,
'''  assertEquals(effect.interactionKey, null);

  assertThrows(() => parseStoryEffect({
''',
'''  assertEquals(effect.interactionKey, null);
  assertEquals(effect.responseWindow, null);

  assertThrows(() => parseStoryEffect({
''')

    path = repo / 'backend/src/domains/storylines/services/storyCharacterMessageEffect.test.ts'
    replace_once(path,
'''    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
  }]);
''',
'''    messagePurpose: "warning",
    body: "They are asking us to skip a second inspection cycle.",
    responseWindow: null,
  }]);
''')
    replace_once(path,
'''    messagePurpose: "warning" as const,
    body: "They are asking us to skip a second inspection cycle.",
  };
''',
'''    messagePurpose: "warning" as const,
    body: "They are asking us to skip a second inspection cycle.",
    responseWindow: null,
  };
''')

    path = repo / 'backend/src/domains/storylines/infrastructure/supabaseStoryMessageWriter.test.ts'
    replace_once(path, 'assertEquals(calls[0].name, "deliver_story_character_message_v1");', 'assertEquals(calls[0].name, "deliver_story_character_message_v2");')
    replace_once(path,
'''    body: "They are asking us to skip a second inspection cycle.",
  };
''',
'''    body: "They are asking us to skip a second inspection cycle.",
    responseWindow: null,
  };
''')
    replace_once(path,
'''    assertEquals((calls[0].args as any).p_effect_index, 4);
''',
'''    assertEquals((calls[0].args as any).p_effect_index, 4);
    assertEquals((calls[0].args as any).p_response_window, null);
''')

    # Route parser test.
    path = repo / 'backend/src/domains/messaging/api/playerMessagingRoutePaths.test.ts'
    replace_once(path,
'''  assertEquals(
    readPlayerMessagingRoutePath(`/players/me/messages/threads/${THREAD}/read`),
    { kind: "markRead", threadId: THREAD },
  );
});
''',
'''  assertEquals(
    readPlayerMessagingRoutePath(`/players/me/messages/threads/${THREAD}/read`),
    { kind: "markRead", threadId: THREAD },
  );
  assertEquals(
    readPlayerMessagingRoutePath(
      `/players/me/messages/threads/${THREAD}/story-interactions/interaction.jonis.offer.v1/select`,
    ),
    {
      kind: "selectStoryChoice",
      threadId: THREAD,
      interactionKey: "interaction.jonis.offer.v1",
    },
  );
});
''')

    # Handler tests: hydrate and select.
    path = repo / 'backend/src/domains/messaging/api/playerMessagingHttpHandler.test.ts'
    insert_before_once(path,
'''Deno.test("player messaging search filters private results and rejects unsafe or repeated queries", async () => {
''',
'''Deno.test("player messaging hydrates structured Story responses and selects one choice", async () => {
  const responses: Record<string, unknown> = {
    read_player_messages_v2: {
      unreadCount: 1,
      pageUnreadCount: 1,
      nextCursor: null,
      threads: [{
        id: THREAD,
        type: "story",
        title: "Jonis Hale",
        storyCharacterKey: "character.northreach.jonis-hale.v1",
        storyCharacterName: "Jonis Hale",
        status: "active",
        allowPlayerReplies: false,
        participantCount: 1,
        unreadCount: 1,
        updatedAt: NOW.toISOString(),
        retentionUntil: "2027-07-20T04:00:00.000Z",
        messages: [{
          id: MESSAGE,
          senderType: "system",
          senderName: "Jonis Hale",
          senderCharacterKey: "character.northreach.jonis-hale.v1",
          storylineKey: "econovaria_meridian_v1",
          storyEventKey: "northreach_production_pressure",
          interactionKey: "interaction.jonis.offer.v1",
          messagePurpose: "offer",
          body: "I can move your application to the top of the list.",
          moderated: false,
          self: false,
          createdAt: NOW.toISOString(),
        }],
      }],
    },
    read_player_story_message_interactions_v1: {
      [MESSAGE]: {
        interactionKey: "interaction.jonis.offer.v1",
        prompt: "How do you answer?",
        status: "open",
        opensAt: NOW.toISOString(),
        closesAt: "2026-07-20T05:00:00.000Z",
        selectedChoiceKey: null,
        effectiveChoiceKey: null,
        selectedAt: null,
        options: [
          { choiceKey: "accept", label: "Accept his help", description: "You owe Jonis a favor." },
          { choiceKey: "decline", label: "Decline", description: "Keep your independence." },
        ],
      },
    },
    select_player_story_message_interaction_v1: [{
      selection_outcome: "applied",
      thread_id: THREAD,
      interaction_key: "interaction.jonis.offer.v1",
      choice_key: "decline",
      interaction_status: "selected",
      selected_at: NOW.toISOString(),
      effective_choice_key: "decline",
    }],
  };
  const inboxResponse = await handlePlayerMessagingRequest(
    request("/players/me/messages"),
    { kind: "list" },
    dependencies(responses),
  );
  assertEquals(inboxResponse.status, 200);
  const inbox = await inboxResponse.json();
  assertEquals(inbox.data.threads[0].messages[0].interaction.status, "open");
  assertEquals(inbox.data.threads[0].messages[0].interaction.options[1].choiceKey, "decline");
  assertNoUuid(JSON.stringify(inbox));

  const selectionResponse = await handlePlayerMessagingRequest(
    request(`/players/me/messages/threads/${THREAD}/story-interactions/interaction.jonis.offer.v1/select`, {
      method: "POST",
      headers: { "idempotency-key": "story-choice:1" },
      body: { choiceKey: "decline", idempotencyKey: "story-choice:1" },
    }),
    { kind: "selectStoryChoice", threadId: THREAD, interactionKey: "interaction.jonis.offer.v1" },
    dependencies(responses),
  );
  assertEquals(selectionResponse.status, 201);
  const selection = await selectionResponse.json();
  assertEquals(selection.data.choiceKey, "decline");
  assertEquals(selection.data.effectiveChoiceKey, "decline");
  assertNoUuid(JSON.stringify(selection));
});

Deno.test("player Story choice maps expiry and invalid options without leaking interaction existence", async () => {
  for (const [message, status, code] of [
    ["PLAYER_STORY_CHOICE_EXPIRED", 409, "player_story_choice_expired"],
    ["PLAYER_STORY_CHOICE_INVALID_OPTION", 422, "player_story_choice_invalid_option"],
    ["PLAYER_STORY_CHOICE_NOT_FOUND", 404, "player_story_choice_not_found"],
  ] as const) {
    const response = await handlePlayerMessagingRequest(
      request(`/players/me/messages/threads/${THREAD}/story-interactions/interaction.jonis.offer.v1/select`, {
        method: "POST",
        headers: { "idempotency-key": `story-choice:${code}` },
        body: { choiceKey: "decline", idempotencyKey: `story-choice:${code}` },
      }),
      { kind: "selectStoryChoice", threadId: THREAD, interactionKey: "interaction.jonis.offer.v1" },
      dependencies({}, { message }),
    );
    assertEquals(response.status, status);
    assertEquals((await response.json()).error.code, code);
  }
});

''')
    # Extend test dependency helper with optional RPC error.
    replace_once(path,
'''function dependencies(responses: Record<string, unknown>) {
  return {
    createServiceClient: () => ({
      rpc: (name: string) => Promise.resolve({
        data: Object.hasOwn(responses, name) ? responses[name] : null,
        error: null,
      }),
''',
'''function dependencies(
  responses: Record<string, unknown>,
  rpcError: { readonly message: string; readonly code?: string } | null = null,
) {
  return {
    createServiceClient: () => ({
      rpc: (name: string) => Promise.resolve({
        data: rpcError ? null : Object.hasOwn(responses, name) ? responses[name] : null,
        error: rpcError,
      }),
''')

    # Rate-limit test.
    path = repo / 'backend/src/security/playerMessagingRateLimitDispatch.test.ts'
    replace_once(path,
'''    "messageRead:POST": ["player.messages.receipt", "write"],
''',
'''    "messageRead:POST": ["player.messages.receipt", "write"],
    "messageStoryChoice:POST": ["player.messages.story.choice", "sensitive"],
''')
    replace_once(path,
'''    ["POST", `/players/me/messages/threads/${THREAD}/read`, "messageRead", THREAD_ACTION],
''',
'''    ["POST", `/players/me/messages/threads/${THREAD}/read`, "messageRead", THREAD_ACTION],
    ["POST", `/players/me/messages/threads/${THREAD}/story-interactions/interaction.jonis.offer.v1/select`, "messageStoryChoice", THREAD_ACTION],
''')

    # Capability contract test.
    path = repo / 'backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts'
    replace_once(path,
'''    "messageSearch", "messageSend", "progressionUnlock", "progressionClaim",
''',
'''    "messageSearch", "messageSend", "storyChoiceSelect", "progressionUnlock", "progressionClaim",
''')
    replace_once(path,
'''    "messageRead", "progression", "progressionUnlock", "progressionClaim", ...BUSINESS_BANKING_ENDPOINTS,
''',
'''    "messageRead", "messageStoryChoice", "progression", "progressionUnlock", "progressionClaim", ...BUSINESS_BANKING_ENDPOINTS,
''')
    replace_once(path,
'''        .replace(":threadId", `thr_${"a".repeat(32)}`)
        .replace(":deliveryId", `ndl_${"a".repeat(32)}`)
''',
'''        .replace(":threadId", `thr_${"a".repeat(32)}`)
        .replace(":interactionKey", "interaction.jonis.offer.v1")
        .replace(":deliveryId", `ndl_${"a".repeat(32)}`)
''')
    replace_once(path,
'''          operation.key === "messageSearch" || operation.key === "messageSend" ||
          operation.key === "messageRead"
''',
'''          operation.key === "messageSearch" || operation.key === "messageSend" ||
          operation.key === "messageRead" || operation.key === "messageStoryChoice"
''')

    # Admin API test includes hydration but no choice mutation.
    path = repo / 'backend/supabase/functions/admin-api/messagingOperations.test.ts'
    insert_before_once(path,
'''Deno.test("Admin Messaging creates typed Contract threads with public Player IDs", async () => {
''',
'''Deno.test("Admin Messaging projects Story response windows read-only", async () => {
  const service = new FakeSequenceService([
    { data: { threads: [storyThread()], returned: 1 }, error: null },
    { data: {
      [MESSAGE]: {
        interactionKey: "interaction.jonis.offer.v1",
        prompt: "How do you answer?",
        status: "selected",
        opensAt: NOW,
        closesAt: "2026-07-21T05:00:00.000Z",
        selectedChoiceKey: "decline",
        effectiveChoiceKey: "decline",
        selectedAt: NOW,
        options: [
          { choiceKey: "accept", label: "Accept his help", description: "Owe a favor." },
          { choiceKey: "decline", label: "Decline", description: "Stay independent." },
        ],
      },
    }, error: null },
  ]);
  const result = await operation(service as never, { method: "GET" });
  assertEquals(result.status, 200);
  assertEquals(service.calls.map((call) => call.name), [
    "read_admin_message_threads_v1",
    "read_admin_story_message_interactions_v1",
  ]);
  assertEquals((result.body as any).data.threads[0].messages[0].interaction.effectiveChoiceKey, "decline");
  assertNoUuid(JSON.stringify(result.body));
});

''')
    insert_before_once(path,
'''class FakeService {
''',
'''class FakeSequenceService {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  constructor(private readonly responses: Array<{ data: unknown; error: { readonly message: string; readonly code?: string } | null }>) {}
  rpc<T>(name: string, args: unknown): Promise<{ data: T | null; error: { readonly message: string; readonly code?: string } | null }> {
    this.calls.push({ name, args: args as Record<string, unknown> });
    const response = this.responses.shift() ?? { data: null, error: null };
    return Promise.resolve({ data: response.data as T | null, error: response.error });
  }
}

''')
    insert_before_once(path,
'''function assertNoUuid(value: string): void {
''',
'''function storyThread() {
  return {
    id: THREAD,
    type: "story",
    title: "Jonis Hale",
    contractKey: null,
    storyCharacterKey: "character.northreach.jonis-hale.v1",
    storyCharacterName: "Jonis Hale",
    allowPlayerReplies: false,
    status: "active",
    moderationReason: null,
    retentionUntil: "2027-07-20T00:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
    participants: [{ reference: "PLAYER-001", displayName: "Student", rosterLabel: null, lastReadAt: null }],
    messages: [{
      id: MESSAGE,
      senderType: "system",
      senderName: "Jonis Hale",
      senderCharacterKey: "character.northreach.jonis-hale.v1",
      storylineKey: "econovaria_meridian_v1",
      storyEventKey: "northreach_production_pressure",
      interactionKey: "interaction.jonis.offer.v1",
      messagePurpose: "offer",
      body: "I can move your application to the top of the list.",
      hidden: false,
      hiddenReason: null,
      createdAt: NOW,
    }],
  };
}

''')

    # Admin V2 read-model test: interaction survives normalizer, no mutation surface.
    path = repo / 'scripts/admin-v2-messages.test.mjs'
    insert_before_once(path,
'''test("Messages model handles zero threads and high-volume authoritative pages", () => {
''',
'''test("Messages model preserves read-only Story response state", () => {
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

''')
    replace_once(path,
'''  assert.match(route, /hiddenReason/);
''',
'''  assert.match(route, /hiddenReason/);
  assert.match(route, /Story response window/);
''')
    replace_once(path,
'''  assert.doesNotMatch(route, /Create thread|New message|Send message|targetAllPlayers|allowPlayerReplies.*checkbox/i);
''',
'''  assert.doesNotMatch(route, /Create thread|New message|Send message|targetAllPlayers|allowPlayerReplies.*checkbox/i);
  assert.doesNotMatch(route, /data-player-story-choice|Select Story choice|Choose for Player/i);
''')

    print('S2 follow-up patches applied.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', required=True)
    args = parser.parse_args()
    main(Path(args.repo).resolve())
