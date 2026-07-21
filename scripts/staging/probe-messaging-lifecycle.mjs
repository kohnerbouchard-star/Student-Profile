#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const EVIDENCE_PATH = process.env.MESSAGING_STAGING_EVIDENCE_PATH ||
  "/tmp/messaging-connected-staging-evidence.json";
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const PUBLIC_THREAD_PATTERN = /^thr_[0-9a-f]{32}$/;
const PUBLIC_MESSAGE_PATTERN = /^msg_[0-9a-f]{32}$/;
const KNOWN_PRODUCTION_PROJECT_REFS = new Set([
  "cgiukdjwicykrmtkhudh",
  ...String(process.env.MESSAGING_PRODUCTION_PROJECT_REFS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);

if (process.argv.includes("--plan")) {
  console.log(JSON.stringify({
    mode: "plan",
    connectedExecution: false,
    requiredEnvironment: [
      "SUPABASE_PROJECT_REF",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "MESSAGING_STAGING_PLAYER_A_SESSION_TOKEN",
      "MESSAGING_STAGING_PLAYER_B_SESSION_TOKEN",
      "MESSAGING_STAGING_STAFF_ACCESS_TOKEN",
      "MESSAGING_STAGING_GAME_SESSION_ID",
      "MESSAGING_STAGING_RECIPIENT_PLAYER_ID",
      "MESSAGING_STAGING_CROSS_GAME_PLAYER_ID",
    ],
    guards: [
      "manual dispatch from exact main only",
      "protected staging environment",
      "known production project refs rejected",
      "Supabase URL must match the declared project ref",
      "attachments remain disabled",
      "all returned application payloads remain UUID-private",
      "original Messaging policy restored",
    ],
    lifecycle: [
      "policy read and temporary enablement",
      "attachment and cross-game denial",
      "thread create and idempotent replay",
      "recipient inbox, thread read, and unread count",
      "message send and idempotent replay",
      "read receipt",
      "Admin search, hide, unhide, disable, enable, and close",
      "Player send denial while disabled and closed",
      "Player thread-creation disablement",
      "expired synthetic thread deletion and replay",
    ],
  }, null, 2));
  process.exit(0);
}

const config = readConfig();
const evidence = {
  schemaVersion: 1,
  executedAt: new Date().toISOString(),
  headSha: String(process.env.GITHUB_SHA || "local").slice(0, 64),
  project: {
    ref: config.projectRef,
    production: false,
  },
  credentialsRecorded: false,
  rawInternalIdentifiersRecorded: false,
  productionTouched: false,
  checks: {},
  finalState: {
    policyRestored: false,
    syntheticPlayerThreadClosed: false,
    expiredSyntheticThreadDeleted: false,
  },
};

let originalPolicy = null;
let failure = null;

try {
  originalPolicy = await readAdminPolicy();
  assertPolicy(originalPolicy);
  evidence.checks.adminPolicyRead = true;

  if (!originalPolicy.playerThreadsEnabled) {
    await updateAdminPolicy({
      playerThreadsEnabled: true,
      defaultRetentionDays: originalPolicy.defaultRetentionDays,
    });
  }

  const playerPolicy = dataOf(await playerRequest(
    config.playerAToken,
    "/players/me/messages/policy",
  )).policy;
  assertPolicy(playerPolicy);
  assert(playerPolicy.playerThreadsEnabled === true, "Player threads were not enabled for the staging lifecycle.");
  evidence.checks.playerPolicyPrivateAndAttachmentsDisabled = true;

  await playerRequest(
    config.playerAToken,
    "/players/me/messages/threads",
    {
      method: "POST",
      body: {
        recipientPlayerId: config.recipientPlayerId,
        title: "Messaging staging attachment rejection",
        body: "Attachments must remain disabled.",
        attachment: { name: "forbidden.txt" },
        idempotencyKey: key("attachment-denial"),
      },
      expectedStatuses: [400],
    },
  );
  evidence.checks.attachmentsRejected = true;

  await playerRequest(
    config.playerAToken,
    "/players/me/messages/threads",
    {
      method: "POST",
      body: {
        recipientPlayerId: config.crossGamePlayerId,
        title: "Messaging staging cross-game denial",
        body: "This recipient must remain unavailable.",
        idempotencyKey: key("cross-game-denial"),
      },
      expectedStatuses: [404],
    },
  );
  evidence.checks.crossGameRecipientDenied = true;

  const createKey = key("player-thread-create");
  const createCommand = {
    recipientPlayerId: config.recipientPlayerId,
    title: `Messaging staging ${Date.now()}`,
    body: "Connected staging lifecycle message.",
    idempotencyKey: createKey,
  };
  const created = dataOf(await playerRequest(
    config.playerAToken,
    "/players/me/messages/threads",
    { method: "POST", body: createCommand, expectedStatuses: [201] },
  ));
  assert(created.outcome === "applied", "Initial thread creation was not applied.");
  assert(PUBLIC_THREAD_PATTERN.test(created.threadId), "Thread creation returned an invalid public thread ID.");
  assert(PUBLIC_MESSAGE_PATTERN.test(created.messageId), "Thread creation returned an invalid public message ID.");
  const threadId = created.threadId;
  const initialMessageId = created.messageId;

  const replayedCreate = dataOf(await playerRequest(
    config.playerAToken,
    "/players/me/messages/threads",
    { method: "POST", body: createCommand, expectedStatuses: [200] },
  ));
  assert(replayedCreate.outcome === "replayed", "Thread creation replay was not reported as replayed.");
  assert(replayedCreate.threadId === threadId, "Thread creation replay changed the public thread ID.");
  evidence.checks.threadCreateReplaySafe = true;

  const recipientInbox = dataOf(await playerRequest(
    config.playerBToken,
    "/players/me/messages?threadLimit=50&messageLimit=100",
  ));
  const recipientThread = recipientInbox.threads?.find((thread) => thread.id === threadId);
  assert(recipientThread, "Recipient inbox did not include the connected staging thread.");
  assert(Number(recipientThread.unread) >= 1, "Recipient unread count was not incremented.");
  evidence.checks.recipientInboxAndUnread = true;

  const threadRead = dataOf(await playerRequest(
    config.playerBToken,
    `/players/me/messages/threads/${threadId}`,
  ));
  assert(threadRead.thread?.id === threadId, "Thread read did not return the requested public thread.");
  evidence.checks.threadRead = true;

  const sendKey = key("player-message-send");
  const sendCommand = {
    body: "Connected staging replay-safe follow-up.",
    idempotencyKey: sendKey,
  };
  const sent = dataOf(await playerRequest(
    config.playerAToken,
    `/players/me/messages/threads/${threadId}/messages`,
    { method: "POST", body: sendCommand, expectedStatuses: [201] },
  ));
  assert(sent.outcome === "applied", "Initial message send was not applied.");
  assert(PUBLIC_MESSAGE_PATTERN.test(sent.message?.id), "Message send returned an invalid public message ID.");
  const sentMessageId = sent.message.id;

  const replayedSend = dataOf(await playerRequest(
    config.playerAToken,
    `/players/me/messages/threads/${threadId}/messages`,
    { method: "POST", body: sendCommand, expectedStatuses: [200] },
  ));
  assert(replayedSend.outcome === "replayed", "Message replay was not reported as replayed.");
  assert(replayedSend.message?.id === sentMessageId, "Message replay changed the public message ID.");
  evidence.checks.messageSendReplaySafe = true;

  const receipt = dataOf(await playerRequest(
    config.playerBToken,
    `/players/me/messages/threads/${threadId}/read`,
    { method: "POST", body: {} },
  ));
  assert(receipt.threadId === threadId && receipt.unreadCount === 0, "Read receipt did not clear the thread unread count.");
  evidence.checks.readReceipt = true;

  const adminThreads = dataOf(await adminRequest(
    `/games/${encodeURIComponent(config.gameId)}/messages?status=all&limit=50&offset=0&q=${encodeURIComponent(createCommand.title)}`,
  ));
  assert(adminThreads.threads?.some((thread) => thread.id === threadId), "Admin search did not return the connected staging thread.");
  evidence.checks.adminSearch = true;

  const hidden = dataOf(await adminModerateMessage(
    threadId,
    sentMessageId,
    "hide",
    "Connected staging moderation verification.",
  ));
  assert(hidden.messageHidden === true, "Message hide did not report a hidden state.");
  const unhidden = dataOf(await adminModerateMessage(threadId, sentMessageId, "unhide"));
  assert(unhidden.messageHidden === false, "Message unhide did not restore visibility.");
  evidence.checks.messageHideAndUnhide = true;

  const disabled = dataOf(await adminModerateThread(
    threadId,
    "disable",
    "Connected staging disablement verification.",
  ));
  assert(disabled.threadStatus === "disabled", "Thread disablement did not report disabled status.");
  await playerRequest(
    config.playerAToken,
    `/players/me/messages/threads/${threadId}/messages`,
    {
      method: "POST",
      body: { body: "Must fail while disabled.", idempotencyKey: key("disabled-send") },
      expectedStatuses: [409, 423],
    },
  );
  const enabled = dataOf(await adminModerateThread(threadId, "enable"));
  assert(enabled.threadStatus === "active", "Thread enablement did not restore active status.");
  evidence.checks.disablementAndRecovery = true;

  await playerRequest(
    config.playerAToken,
    `/players/me/messages/threads/${threadId}/messages`,
    {
      method: "POST",
      body: { body: "Thread recovered after enablement.", idempotencyKey: key("enabled-send") },
      expectedStatuses: [201],
    },
  );

  const closed = dataOf(await adminModerateThread(
    threadId,
    "close",
    "Connected staging closure verification.",
  ));
  assert(closed.threadStatus === "closed", "Thread closure did not report closed status.");
  await playerRequest(
    config.playerAToken,
    `/players/me/messages/threads/${threadId}/messages`,
    {
      method: "POST",
      body: { body: "Must fail after closure.", idempotencyKey: key("closed-send") },
      expectedStatuses: [409, 423],
    },
  );
  evidence.checks.closedThreadRejectsSends = true;
  evidence.finalState.syntheticPlayerThreadClosed = true;

  await updateAdminPolicy({
    playerThreadsEnabled: false,
    defaultRetentionDays: originalPolicy.defaultRetentionDays,
  });
  await playerRequest(
    config.playerAToken,
    "/players/me/messages/threads",
    {
      method: "POST",
      body: {
        recipientPlayerId: config.recipientPlayerId,
        title: "Must fail while Player threads are disabled",
        body: "Policy disablement verification.",
        idempotencyKey: key("policy-disabled-create"),
      },
      expectedStatuses: [423],
    },
  );
  evidence.checks.playerThreadPolicyDisablement = true;

  await updateAdminPolicy({
    playerThreadsEnabled: true,
    defaultRetentionDays: originalPolicy.defaultRetentionDays,
  });

  const expiredCreateKey = key("expired-admin-thread");
  const expired = dataOf(await adminRequest(
    `/games/${encodeURIComponent(config.gameId)}/messages/threads`,
    {
      method: "POST",
      idempotencyKey: expiredCreateKey,
      body: {
        type: "system",
        title: "Messaging staging retention deletion",
        allowPlayerReplies: false,
        playerIds: [config.recipientPlayerId],
        targetAllPlayers: false,
        body: "Synthetic expired retention fixture.",
        retentionUntil: new Date(Date.now() - 60_000).toISOString(),
        idempotencyKey: expiredCreateKey,
      },
      expectedStatuses: [201],
    },
  ));
  assert(PUBLIC_THREAD_PATTERN.test(expired.threadId), "Retention fixture returned an invalid public thread ID.");
  const deletionKey = key("expired-admin-thread-delete");
  const deleted = dataOf(await adminRequest(
    `/games/${encodeURIComponent(config.gameId)}/messages/threads/${expired.threadId}/delete`,
    {
      method: "POST",
      idempotencyKey: deletionKey,
      body: {
        reason: "Connected staging retention deletion verification.",
        idempotencyKey: deletionKey,
      },
    },
  ));
  assert(deleted.outcome === "applied", "Expired thread deletion was not applied.");
  const replayedDeletion = dataOf(await adminRequest(
    `/games/${encodeURIComponent(config.gameId)}/messages/threads/${expired.threadId}/delete`,
    {
      method: "POST",
      idempotencyKey: deletionKey,
      body: {
        reason: "Connected staging retention deletion verification.",
        idempotencyKey: deletionKey,
      },
    },
  ));
  assert(replayedDeletion.outcome === "replayed", "Expired thread deletion replay was not reported as replayed.");
  evidence.checks.retentionDeletionReplaySafe = true;
  evidence.finalState.expiredSyntheticThreadDeleted = true;

  assert(initialMessageId !== sentMessageId, "Initial and sent messages unexpectedly shared a public ID.");
} catch (error) {
  failure = error;
  evidence.failure = {
    name: error instanceof Error ? error.name : "Error",
    code: safeFailureCode(error),
  };
} finally {
  if (originalPolicy) {
    try {
      await updateAdminPolicy({
        playerThreadsEnabled: originalPolicy.playerThreadsEnabled,
        defaultRetentionDays: originalPolicy.defaultRetentionDays,
      });
      const restored = await readAdminPolicy();
      evidence.finalState.policyRestored =
        restored.playerThreadsEnabled === originalPolicy.playerThreadsEnabled &&
        restored.defaultRetentionDays === originalPolicy.defaultRetentionDays &&
        restored.attachmentsEnabled === false;
    } catch (restoreError) {
      failure ??= restoreError;
      evidence.failure ??= {
        name: restoreError instanceof Error ? restoreError.name : "Error",
        code: "policy_restore_failed",
      };
    }
  }

  await writeEvidence(evidence);
}

if (failure) throw failure;
assert(evidence.finalState.policyRestored, "Original Messaging policy was not restored.");
console.log(JSON.stringify({
  connectedMessagingLifecycle: "passed",
  projectRef: config.projectRef,
  checks: Object.keys(evidence.checks).length,
  policyRestored: evidence.finalState.policyRestored,
  productionTouched: false,
}, null, 2));

function readConfig() {
  const projectRef = required("SUPABASE_PROJECT_REF");
  const supabaseUrl = new URL(required("SUPABASE_URL"));
  const expectedHost = `${projectRef}.supabase.co`;
  assert(/^[a-z0-9]{20}$/.test(projectRef), "Supabase project ref is invalid.");
  assert(!KNOWN_PRODUCTION_PROJECT_REFS.has(projectRef), "Known production project ref is prohibited.");
  assert(supabaseUrl.protocol === "https:" && supabaseUrl.hostname === expectedHost, "Supabase URL does not match the isolated project ref.");

  const recipientPlayerId = required("MESSAGING_STAGING_RECIPIENT_PLAYER_ID");
  const crossGamePlayerId = required("MESSAGING_STAGING_CROSS_GAME_PLAYER_ID");
  assert(recipientPlayerId !== crossGamePlayerId, "Cross-game Player ID must differ from the same-game recipient.");
  assert(!UUID_PATTERN.test(recipientPlayerId) && !UUID_PATTERN.test(crossGamePlayerId), "Staging recipients must use public Player IDs, not UUIDs.");

  return Object.freeze({
    projectRef,
    supabaseUrl: supabaseUrl.origin,
    anonKey: required("SUPABASE_ANON_KEY"),
    playerAToken: required("MESSAGING_STAGING_PLAYER_A_SESSION_TOKEN"),
    playerBToken: required("MESSAGING_STAGING_PLAYER_B_SESSION_TOKEN"),
    staffToken: required("MESSAGING_STAGING_STAFF_ACCESS_TOKEN"),
    gameId: required("MESSAGING_STAGING_GAME_SESSION_ID"),
    recipientPlayerId,
    crossGamePlayerId,
  });
}

async function readAdminPolicy() {
  return dataOf(await adminRequest(
    `/games/${encodeURIComponent(config.gameId)}/messages/policy`,
  )).policy;
}

async function updateAdminPolicy(policy) {
  const response = await adminRequest(
    `/games/${encodeURIComponent(config.gameId)}/messages/policy`,
    { method: "POST", body: policy },
  );
  const updated = dataOf(response).policy;
  assertPolicy(updated);
  return updated;
}

function adminModerateThread(threadId, action, reason = "") {
  const idempotencyKey = key(`admin-${action}-thread`);
  return adminRequest(
    `/games/${encodeURIComponent(config.gameId)}/messages/threads/${threadId}/${action}`,
    {
      method: "POST",
      idempotencyKey,
      body: { reason, idempotencyKey },
    },
  );
}

function adminModerateMessage(threadId, messageId, action, reason = "") {
  const idempotencyKey = key(`admin-${action}-message`);
  return adminRequest(
    `/games/${encodeURIComponent(config.gameId)}/messages/threads/${threadId}/messages/${messageId}/${action}`,
    {
      method: "POST",
      idempotencyKey,
      body: { reason, idempotencyKey },
    },
  );
}

function playerRequest(token, path, options = {}) {
  return request(`${config.supabaseUrl}/functions/v1/classroom-api${path}`, {
    ...options,
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
      "x-player-session-token": token,
      ...(options.headers || {}),
    },
  });
}

function adminRequest(path, options = {}) {
  return request(`${config.supabaseUrl}/functions/v1/admin-api${path}`, {
    ...options,
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${config.staffToken}`,
      ...(options.headers || {}),
    },
  });
}

async function request(url, {
  method = "GET",
  body,
  headers = {},
  idempotencyKey,
  expectedStatuses = [200],
} = {}) {
  const requestHeaders = {
    accept: "application/json",
    "content-type": "application/json",
    ...headers,
  };
  if (idempotencyKey) {
    requestHeaders["x-idempotency-key"] = idempotencyKey;
    requestHeaders["x-request-id"] = idempotencyKey;
  }
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
  });
  const payload = await response.json().catch(() => ({}));
  assertNoInternalUuid(payload);
  if (!expectedStatuses.includes(response.status)) {
    const code = payload?.error?.code || payload?.code || "unexpected_http_status";
    const error = new Error(`Messaging staging request failed with HTTP ${response.status} (${String(code).slice(0, 100)}).`);
    error.code = String(code).slice(0, 100);
    throw error;
  }
  return { status: response.status, body: payload };
}

function dataOf(response) {
  const value = response?.body?.data;
  assert(value && typeof value === "object" && !Array.isArray(value), "Messaging response did not contain a data object.");
  return value;
}

function assertPolicy(policy) {
  assert(policy && typeof policy === "object", "Messaging policy is missing.");
  assert(policy.attachmentsEnabled === false, "Messaging attachments were enabled.");
  assert(Number.isSafeInteger(Number(policy.defaultRetentionDays)), "Messaging retention policy is invalid.");
}

function assertNoInternalUuid(value) {
  const text = JSON.stringify(value);
  assert(!UUID_PATTERN.test(text), "Application response leaked an internal UUID.");
  const forbidden = /(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|service_role|authorization\s*[:=]\s*bearer)/i;
  assert(!forbidden.test(text), "Application response appears to contain a credential.");
}

async function writeEvidence(value) {
  const text = JSON.stringify(value, null, 2);
  assert(!UUID_PATTERN.test(text), "Evidence contains an internal UUID.");
  assert(!/(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|service_role|x-player-session-token|authorization)/i.test(text), "Evidence contains credential-shaped data.");
  await writeFile(EVIDENCE_PATH, `${text}\n`, { mode: 0o600 });
}

function key(prefix) {
  const suffix = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 32);
  return `${prefix}:${suffix}`.slice(0, 128);
}

function safeFailureCode(error) {
  const value = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "messaging_staging_probe_failed";
  return /^[A-Za-z0-9._:-]{1,100}$/.test(value)
    ? value
    : "messaging_staging_probe_failed";
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required staging setting: ${name}.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
