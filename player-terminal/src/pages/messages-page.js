import { escapeHtml } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;

function conversationButton(thread, selected, type) {
  return `<button class="player-terminal-thread-row${selected ? " active" : ""}" type="${type}" data-player-message-thread="${escapeHtml(thread.id)}"${selected ? ' aria-current="true"' : ""} aria-label="Open conversation with ${escapeHtml(thread.title)}"><span class="player-terminal-thread-avatar is-${escapeHtml(thread.tone)}">${escapeHtml(thread.initials)}</span><div><strong>${escapeHtml(thread.title)}</strong><small>${escapeHtml(thread.preview)}</small><em>${escapeHtml(thread.time)}</em></div>${thread.unread ? `<i>${escapeHtml(thread.unread)}</i>` : ""}</button>`;
}

function conversationRow(thread, selected) {
  if (!thread.unread || !PUBLIC_THREAD_ID.test(String(thread.id || ""))) {
    return conversationButton(thread, selected, "button");
  }
  return `<form data-player-form="message-read" data-endpoint="messageRead"><input type="hidden" name="threadId" value="${escapeHtml(thread.id)}">${conversationButton(thread, selected, "submit")}</form>`;
}

function isWritableThread(thread) {
  if (thread.rawStatus !== undefined || thread.allowPlayerReplies !== undefined) {
    return thread.rawStatus === "active" && thread.allowPlayerReplies === true;
  }
  return /^thread-[0-9]+$/.test(String(thread.id || "")) &&
    /^(PLAYER DIRECT|CONTRACT CHANNEL)$/i.test(String(thread.type || ""));
}

function composer(thread) {
  if (!isWritableThread(thread)) {
    return `<div class="player-terminal-message-compose" role="status"><small>This thread is ${escapeHtml(thread.rawStatus || "read-only")} and does not accept Player replies. Attachments remain disabled.</small></div>`;
  }
  return `<form class="player-terminal-message-compose" data-player-form="message-send" data-endpoint="messageSend" data-thread-id="${escapeHtml(thread.id)}">
    <label><span>MESSAGE</span><textarea name="body" rows="3" maxlength="1000" required placeholder="Write a message…"></textarea></label>
    <div><button class="player-terminal-icon-button" type="button" disabled aria-disabled="true" aria-label="Attachments are unavailable">${icon("paperclip")}</button><small>Plain text and links only. Attachments are disabled. Messages remain visible to game administrators.</small><button class="player-terminal-primary-button" type="submit">${icon("send")} Send</button></div>
  </form>`;
}

function createThreadPanel() {
  return `<details class="player-terminal-disclosure player-terminal-message-create">
    <summary><span>${icon("messages")}</span><div><strong>Start a Player thread</strong><small>Same-game public Player IDs only</small></div>${icon("chevronRight")}</summary>
    <form data-player-form="message-thread-create" data-endpoint="messageThreadCreate">
      <label>RECIPIENT PLAYER ID<input name="recipientPlayerId" maxlength="160" autocomplete="off" required placeholder="Public Player ID"></label>
      <label>THREAD TITLE<input name="title" maxlength="160" required placeholder="Conversation title"></label>
      <label>FIRST MESSAGE<textarea name="body" rows="4" maxlength="1000" required placeholder="Write the first message…"></textarea></label>
      <p>Player UUIDs and attachments are never accepted. Administrators may moderate or retain this thread under the game policy.</p>
      <button class="player-terminal-secondary-button" type="submit">${icon("send")} Create thread</button>
    </form>
  </details>`;
}

export function renderMessagesPage(data, ui) {
  const messages = data.messages || { unread: 0, threads: [] };
  const threads = Array.isArray(messages.threads) ? messages.threads : [];
  const thread = threads.find((item) => item.id === ui.messageThreadId) || threads[0];
  const heading = `<div class="player-terminal-page-heading"><div><small>PLAYER COMMUNICATIONS</small><h2>Messages</h2><p>Auditable Player, Contract, system, and administrator communication.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`${Number(messages.unread || 0)} UNREAD`, messages.unread ? "amber" : "green")}</div></div>`;
  if (!thread) {
    return `<section class="player-terminal-page player-terminal-messages-page">
      ${heading}
      ${createThreadPanel()}
      <section class="player-terminal-panel">${renderEmptyState({ title: "No conversations yet", detail: "Start a same-game Player thread or wait for a Contract, system, or administrator message.", iconName: "messages" })}</section>
    </section>`;
  }
  return `<section class="player-terminal-page player-terminal-messages-page">
    ${heading}
    ${createThreadPanel()}
    <div class="player-terminal-messages-layout">
      <section class="player-terminal-panel player-terminal-thread-list">
        <header class="player-terminal-panel-header"><div><span>CONVERSATIONS</span><strong>${escapeHtml(threads.length)} threads</strong></div></header>
        <div>${threads.map((item) => conversationRow(item, item.id === thread.id)).join("")}</div>
      </section>
      <section class="player-terminal-panel player-terminal-message-thread">
        <header class="player-terminal-message-thread-head"><div><span class="player-terminal-thread-avatar is-${escapeHtml(thread.tone)}">${escapeHtml(thread.initials)}</span><div><small>${escapeHtml(thread.type)}</small><strong>${escapeHtml(thread.title)}</strong><span>${escapeHtml(thread.members)} · ${escapeHtml(thread.status)}</span></div></div>${renderStatusPill(thread.status, thread.status === "Online" ? "green" : "cyan")}</header>
        <div class="player-terminal-message-log">${thread.messages.map((message) => `<article class="${message.self ? "is-self" : ""}"><span>${escapeHtml(message.initials)}</span><div><header><strong>${escapeHtml(message.sender)}</strong><small>${escapeHtml(message.time)}</small></header><p>${escapeHtml(message.body)}</p></div></article>`).join("")}</div>
        ${composer(thread)}
      </section>
    </div>
  </section>`;
}
