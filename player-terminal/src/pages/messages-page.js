import { escapeHtml } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function conversationRow(thread, selected) {
  return `<button class="player-terminal-thread-row${selected ? " active" : ""}" type="button" data-player-message-thread="${escapeHtml(thread.id)}"${selected ? ' aria-current="true"' : ""} aria-label="Open conversation with ${escapeHtml(thread.title)}"><span class="player-terminal-thread-avatar is-${escapeHtml(thread.tone)}">${escapeHtml(thread.initials)}</span><div><strong>${escapeHtml(thread.title)}</strong><small>${escapeHtml(thread.preview)}</small><em>${escapeHtml(thread.time)}</em></div>${thread.unread ? `<i>${escapeHtml(thread.unread)}</i>` : ""}</button>`;
}

export function renderMessagesPage(data, ui) {
  const messages = data.messages;
  const threads = Array.isArray(messages.threads) ? messages.threads : [];
  const thread = threads.find((item) => item.id === ui.messageThreadId) || threads[0];
  if (!thread) {
    return `<section class="player-terminal-page player-terminal-messages-page">
      <div class="player-terminal-page-heading"><div><small>PLAYER COMMUNICATIONS</small><h2>Messages</h2><p>Auditable player, contract, and administrator communication.</p></div></div>
      <section class="player-terminal-panel">${renderEmptyState({ title: "No conversations yet", detail: "Player, contract, and administrator messages will appear here when available.", iconName: "messages" })}</section>
    </section>`;
  }
  return `<section class="player-terminal-page player-terminal-messages-page">
    <div class="player-terminal-page-heading"><div><small>PLAYER COMMUNICATIONS</small><h2>Messages</h2><p>Auditable player, contract, and administrator communication in a compact two-pane workspace.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`${messages.unread} UNREAD`, messages.unread ? "amber" : "green")}</div></div>

    <div class="player-terminal-messages-layout">
      <section class="player-terminal-panel player-terminal-thread-list">
        <header class="player-terminal-panel-header"><div><span>CONVERSATIONS</span><strong>${escapeHtml(threads.length)} threads</strong></div><button class="player-terminal-icon-button" type="button" data-player-local-action="message-search" aria-label="Search messages">${icon("search")}</button></header>
        <div>${threads.map((item) => conversationRow(item, item.id === thread.id)).join("")}</div>
      </section>

      <section class="player-terminal-panel player-terminal-message-thread">
        <header class="player-terminal-message-thread-head"><div><span class="player-terminal-thread-avatar is-${escapeHtml(thread.tone)}">${escapeHtml(thread.initials)}</span><div><small>${escapeHtml(thread.type)}</small><strong>${escapeHtml(thread.title)}</strong><span>${escapeHtml(thread.members)} · ${escapeHtml(thread.status)}</span></div></div>${renderStatusPill(thread.status, thread.status === "Online" ? "green" : "cyan")}</header>
        <div class="player-terminal-message-log">${thread.messages.map((message) => `<article class="${message.self ? "is-self" : ""}"><span>${escapeHtml(message.initials)}</span><div><header><strong>${escapeHtml(message.sender)}</strong><small>${escapeHtml(message.time)}</small></header><p>${escapeHtml(message.body)}</p>${message.attachment ? `<button type="button" data-player-local-action="message-attachment">${icon("paperclip")} ${escapeHtml(message.attachment)}</button>` : ""}</div></article>`).join("")}</div>
        <form class="player-terminal-message-compose" data-player-form="message-send" data-endpoint="messageSend" data-thread-id="${escapeHtml(thread.id)}">
          <label><span>MESSAGE</span><textarea name="body" rows="3" maxlength="1000" required placeholder="Write a message…"></textarea></label>
          <div><button class="player-terminal-icon-button" type="button" data-player-local-action="message-attachment" aria-label="Attach file">${icon("paperclip")}</button><small>Messages remain visible to game administrators.</small><button class="player-terminal-primary-button" type="submit">${icon("send")} Send</button></div>
        </form>
      </section>
    </div>
  </section>`;
}
