import { createMessagingModerationClient } from "./messaging-moderation-client.js";

const ROOT_ID = "adminMessagingModerationRoot";
const ADMIN_MOUNTED_EVENT = "econovaria:admin-route-mounted";
let currentGameId = "";
let client = null;
let state = { loading: false, error: "", query: "", threads: [] };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function gameIdFromPage() {
  const preview = document.getElementById("adminPreview");
  const candidates = [
    preview?.dataset?.gameId,
    document.documentElement.dataset.gameId,
    document.body.dataset.gameId,
    window.__ADMIN_ACTIVE_GAME_ID__,
    window.adminRuntime?.activeGame?.id,
    window.adminRuntime?.game?.id,
    window.__ADMIN_BOOTSTRAP__?.activeGame?.id,
    window.sessionStorage?.getItem?.("econovaria.admin.selected-game.v1"),
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  const pathname = location.pathname.match(/\/games\/([^/]+)/)?.[1];
  return pathname ? decodeURIComponent(pathname) : "";
}

function findLogsSection() {
  const sections = [...document.querySelectorAll("#adminPreview section")];
  return sections.find((section) => {
    const heading = section.querySelector("h1, h2, h3, [data-page-title]")?.textContent || "";
    return /^(logs|audit logs?)$/i.test(heading.trim());
  }) || null;
}

function moderationInput(kind, identity, label = "Moderation reason") {
  return `<label class="admin-message-moderation-reason"><span>${escapeHtml(label)}</span><input maxlength="1000" data-${kind}-reason="${escapeHtml(identity)}" placeholder="Required for restrictive actions"></label>`;
}

function renderMessage(message, thread) {
  const action = message.hidden ? "unhide" : "hide";
  return `<article class="admin-message-moderation-message${message.hidden ? " is-hidden" : ""}" data-message-id="${escapeHtml(message.id)}">
    <header><strong>${escapeHtml(message.senderName)}</strong><time>${escapeHtml(new Date(message.createdAt).toLocaleString())}</time></header>
    <p>${escapeHtml(message.body)}</p>
    ${message.hiddenReason ? `<small>Moderation: ${escapeHtml(message.hiddenReason)}</small>` : ""}
    ${action === "hide" ? moderationInput("message", message.id) : ""}
    <button type="button" class="admin-message-secondary" data-message-action="${action}" data-thread-id="${escapeHtml(thread.id)}" data-message-id="${escapeHtml(message.id)}">${message.hidden ? "Restore message" : "Hide message"}</button>
  </article>`;
}

function renderThread(thread) {
  const participants = thread.participants.map((participant) => participant.displayName || participant.reference).filter(Boolean).join(", ");
  const statusAction = thread.status === "active" ? "disable" : thread.status === "disabled" ? "enable" : "";
  const restrictiveActionAvailable = statusAction === "disable" || thread.status !== "closed";
  return `<article class="admin-message-moderation-thread" data-thread-id="${escapeHtml(thread.id)}">
    <header>
      <div><small>${escapeHtml(thread.type.toUpperCase())}</small><h4>${escapeHtml(thread.title)}</h4><p>${escapeHtml(participants || "No visible participants")}</p></div>
      <span class="admin-message-status is-${escapeHtml(thread.status)}">${escapeHtml(thread.status)}</span>
    </header>
    ${thread.contractKey ? `<p class="admin-message-contract">Contract: ${escapeHtml(thread.contractKey)}</p>` : ""}
    ${thread.moderationReason ? `<p class="admin-message-reason">${escapeHtml(thread.moderationReason)}</p>` : ""}
    ${restrictiveActionAvailable ? moderationInput("thread", thread.id) : ""}
    ${thread.expired ? moderationInput("retention", thread.id, "Deletion reason") : ""}
    <div class="admin-message-moderation-actions">
      ${statusAction ? `<button type="button" class="admin-message-secondary" data-thread-action="${statusAction}" data-thread-id="${escapeHtml(thread.id)}">${statusAction === "disable" ? "Disable thread" : "Enable thread"}</button>` : ""}
      ${thread.status !== "closed" ? `<button type="button" class="admin-message-danger" data-thread-action="close" data-thread-id="${escapeHtml(thread.id)}">Close thread</button>` : ""}
      ${thread.expired ? `<button type="button" class="admin-message-danger" data-retention-delete data-thread-id="${escapeHtml(thread.id)}">Delete expired content</button>` : ""}
    </div>
    <details><summary>${thread.messages.length} messages</summary><div class="admin-message-moderation-log">${thread.messages.map((message) => renderMessage(message, thread)).join("") || "<p>No messages yet.</p>"}</div></details>
  </article>`;
}

function render(root) {
  root.innerHTML = `<section class="admin-message-moderation-panel" aria-labelledby="adminMessagingModerationTitle">
    <header class="admin-message-moderation-heading">
      <div><small>GAME COMMUNICATIONS</small><h3 id="adminMessagingModerationTitle">Messaging moderation</h3><p>Create announcements and review player or Contract-linked communication.</p></div>
      <button type="button" class="admin-message-secondary" data-message-refresh ${state.loading ? "disabled" : ""}>${state.loading ? "Refreshing…" : "Refresh"}</button>
    </header>
    <form class="admin-message-search-form" data-message-search>
      <label><span>Search communication</span><input name="query" maxlength="100" value="${escapeHtml(state.query)}" placeholder="Title, Player ID, sender, or message text"></label>
      <button type="submit" class="admin-message-secondary" ${state.loading ? "disabled" : ""}>Search</button>
      ${state.query ? `<button type="button" class="admin-message-secondary" data-message-search-clear ${state.loading ? "disabled" : ""}>Clear</button>` : ""}
    </form>
    <form class="admin-message-create-form" data-message-create novalidate>
      <label><span>Thread type</span><select name="type" required><option value="announcement">Administrator announcement</option><option value="system">System message</option><option value="player">Player thread</option><option value="contract">Contract thread</option></select></label>
      <label><span>Title</span><input name="title" maxlength="160" required></label>
      <label data-contract-key hidden><span>Contract key</span><input name="contractKey" maxlength="160"></label>
      <label class="admin-message-wide"><span>Initial message</span><textarea name="body" maxlength="1000" rows="3"></textarea></label>
      <label class="admin-message-wide"><span>Player IDs</span><input name="playerIds" placeholder="PLAYER-001, PLAYER-002"><small>Use public Player IDs only, separated by commas. Maximum 500.</small></label>
      <label class="admin-message-check"><input type="checkbox" name="targetAllPlayers"> <span>Send to all active players</span></label>
      <label class="admin-message-check"><input type="checkbox" name="allowPlayerReplies"> <span>Allow player replies</span></label>
      <label><span>Retain until</span><input type="date" name="retentionUntil"></label>
      <div class="admin-message-wide admin-message-create-actions"><p data-message-form-error role="alert"></p><button type="submit" class="admin-message-primary" ${state.loading ? "disabled" : ""}>Create thread</button></div>
    </form>
    ${state.error ? `<p class="admin-message-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
    <div class="admin-message-moderation-list" aria-live="polite">${state.loading && !state.threads.length ? "<p>Loading communication records…</p>" : state.threads.map(renderThread).join("") || "<p>No communication threads match the current filter.</p>"}</div>
  </section>`;
}

async function load(root) {
  if (!client || state.loading) return;
  state = { ...state, loading: true, error: "" };
  render(root);
  try {
    const result = await client.list({ query: state.query, status: "all", limit: 50 });
    state = { ...state, loading: false, error: "", threads: Array.isArray(result?.threads) ? result.threads : [] };
  } catch (error) {
    const retry = Number(error.retryAfterSeconds || 0);
    state = { ...state, loading: false, error: `${error.message || "Messages could not be loaded."}${retry ? ` Retry in ${retry} seconds.` : ""}` };
  }
  render(root);
}

function reasonSelector(kind, identity) {
  return `[data-${kind}-reason="${identity}"]`;
}

function readReason(root, button, action) {
  if (["enable", "unhide"].includes(action)) return "";
  const kind = button.dataset.retentionDelete !== undefined
    ? "retention"
    : button.dataset.threadAction
    ? "thread"
    : "message";
  const identity = kind === "message" ? button.dataset.messageId : button.dataset.threadId;
  const input = root.querySelector(reasonSelector(kind, identity));
  const reason = input?.value?.trim() || "";
  if (!reason) {
    state = { ...state, error: kind === "retention" ? "Enter a deletion reason before removing expired content." : "Enter a moderation reason before applying a restrictive action." };
    render(root);
    root.querySelector(reasonSelector(kind, identity))?.focus();
  }
  return reason;
}

async function act(root, button) {
  if (!client || state.loading) return;
  const threadId = button.dataset.threadId;
  const threadAction = button.dataset.threadAction;
  const messageAction = button.dataset.messageAction;
  const retentionDelete = button.dataset.retentionDelete !== undefined;
  const messageId = button.dataset.messageId;
  const action = retentionDelete ? "delete" : threadAction || messageAction;
  const reason = readReason(root, button, action);
  if (!action || (!['enable', 'unhide'].includes(action) && !reason)) return;
  state = { ...state, loading: true, error: "" };
  render(root);
  try {
    if (retentionDelete) await client.deleteExpiredThread(threadId, reason);
    else if (threadAction) await client.moderateThread(threadId, threadAction, reason);
    else await client.moderateMessage(threadId, messageId, messageAction, reason);
    state = { ...state, loading: false };
    await load(root);
  } catch (error) {
    const retry = Number(error.retryAfterSeconds || 0);
    state = { ...state, loading: false, error: `${error.message || "Moderation failed."}${retry ? ` Retry in ${retry} seconds.` : ""}` };
    render(root);
  }
}

async function create(root, form) {
  const formData = new FormData(form);
  const type = String(formData.get("type") || "announcement");
  const targetAllPlayers = formData.get("targetAllPlayers") === "on";
  const playerIds = String(formData.get("playerIds") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const retentionDate = String(formData.get("retentionUntil") || "");
  const retentionUntil = retentionDate ? new Date(`${retentionDate}T23:59:59.999Z`).toISOString() : null;
  const errorNode = form.querySelector("[data-message-form-error]");
  if (!form.checkValidity() || (!targetAllPlayers && !playerIds.length) || playerIds.length > 500) {
    if (errorNode) errorNode.textContent = playerIds.length > 500 ? "A thread may target at most 500 explicit players." : "Complete the required fields and choose recipients.";
    form.querySelector(":invalid")?.focus();
    return;
  }
  state = { ...state, loading: true, error: "" };
  render(root);
  try {
    await client.create({
      type,
      title: String(formData.get("title") || "").trim(),
      contractKey: type === "contract" ? String(formData.get("contractKey") || "").trim() : "",
      allowPlayerReplies: !["announcement", "system"].includes(type) && formData.get("allowPlayerReplies") === "on",
      playerIds,
      targetAllPlayers,
      body: String(formData.get("body") || "").trim(),
      retentionUntil,
    });
    state = { ...state, loading: false };
    await load(root);
  } catch (error) {
    state = { ...state, loading: false, error: error.message || "Thread creation failed." };
    render(root);
  }
}

function wire(root) {
  root.addEventListener("click", (event) => {
    const refresh = event.target.closest("[data-message-refresh]");
    if (refresh) void load(root);
    const clear = event.target.closest("[data-message-search-clear]");
    if (clear) {
      state = { ...state, query: "" };
      void load(root);
    }
    const action = event.target.closest("[data-thread-action], [data-message-action], [data-retention-delete]");
    if (action) void act(root, action);
  });
  root.addEventListener("submit", (event) => {
    const search = event.target.closest("[data-message-search]");
    if (search) {
      event.preventDefault();
      state = { ...state, query: String(new FormData(search).get("query") || "").trim().slice(0, 100) };
      void load(root);
      return;
    }
    const form = event.target.closest("[data-message-create]");
    if (!form) return;
    event.preventDefault();
    void create(root, form);
  });
  root.addEventListener("change", (event) => {
    if (event.target.name !== "type") return;
    const contract = root.querySelector("[data-contract-key]");
    const replies = root.querySelector('input[name="allowPlayerReplies"]');
    const readOnly = ["announcement", "system"].includes(event.target.value);
    contract.hidden = event.target.value !== "contract";
    contract.querySelector("input").required = event.target.value === "contract";
    replies.disabled = readOnly;
    if (readOnly) replies.checked = false;
  });
}

function mount() {
  const gameId = gameIdFromPage();
  const section = findLogsSection();
  if (!gameId || !section) return false;
  let root = document.getElementById(ROOT_ID);
  if (!root || !section.contains(root)) {
    root?.remove();
    root = document.createElement("div");
    root.id = ROOT_ID;
    section.append(root);
    wire(root);
  }
  if (gameId !== currentGameId) {
    currentGameId = gameId;
    client = createMessagingModerationClient(gameId);
    state = { loading: false, error: "", query: "", threads: [] };
  }
  render(root);
  if (!state.threads.length && !state.loading) void load(root);
  return true;
}

function handleMountedEvent(event) {
  const preview = document.getElementById("adminPreview");
  if (event.target !== preview) return;
  mount();
}

document.addEventListener(ADMIN_MOUNTED_EVENT, handleMountedEvent);
window.addEventListener("admin:game-changed", mount);
window.addEventListener("hashchange", mount);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
