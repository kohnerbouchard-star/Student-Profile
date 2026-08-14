import {
  AdminConfirmDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { MessagesSkeleton } from "./MessagesSkeleton.js";

function titleCase(value, fallback = "Not available") {
  const normalized = String(value || "").trim();
  return normalized
    ? normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function displayTime(value) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-messages-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: Number(value || 0).toLocaleString() }),
      createElement("small", { text: detail }),
    ],
  });
}

function summary(model) {
  return createElement("section", {
    className: "admin-messages-route__summary",
    attrs: { "aria-label": "Messages moderation summary" },
    children: [
      metric("Returned", model.summary.returned, "Current page"),
      metric("Active", model.summary.active, "Open conversations"),
      metric("Restricted", model.summary.restricted, "Disabled or closed"),
      metric("Hidden messages", model.summary.hiddenMessages, "Moderated on this page"),
    ],
  });
}

function button({ label, icon, quiet = false, tone = null, disabled = false, onClick }) {
  const element = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { tone },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  element.addEventListener("click", onClick);
  return element;
}

function statusBadge(status) {
  return createElement("span", {
    className: "admin-messages-route__status",
    dataset: { status: status || "unknown" },
    text: titleCase(status),
  });
}

function participantLabel(participant) {
  const secondary = participant.rosterLabel || participant.reference;
  return secondary && secondary !== participant.displayName
    ? `${participant.displayName} · ${secondary}`
    : participant.displayName;
}

function participantSummary(thread) {
  const labels = thread.participants.slice(0, 6).map(participantLabel).filter(Boolean);
  const remaining = Math.max(0, thread.participants.length - labels.length);
  return createElement("p", {
    className: "admin-messages-route__participants",
    children: [
      createElement("strong", { text: `${thread.participants.length.toLocaleString()} participant${thread.participants.length === 1 ? "" : "s"}` }),
      createElement("span", {
        text: labels.length
          ? `${labels.join(" · ")}${remaining ? ` · +${remaining.toLocaleString()} more` : ""}`
          : "No visible participant labels",
      }),
    ],
  });
}

function reasonField(label, hint) {
  const field = AdminField({
    name: "moderationReason",
    label,
    type: "textarea",
    hint,
    placeholder: "Document the moderation reason",
    autocomplete: "off",
  });
  field.control.maxLength = 1000;
  field.control.rows = 2;
  return field;
}

function messageCard({ thread, message, onRequestAction }) {
  const action = message.hidden ? "unhide" : "hide";
  const restrictive = action === "hide";
  const card = createElement("article", {
    className: "admin-messages-route__message",
    dataset: { hidden: message.hidden },
    children: [
      createElement("header", {
        className: "admin-messages-route__message-heading",
        children: [
          createElement("div", {
            children: [
              createElement("strong", { text: message.senderName }),
              message.senderType ? createElement("span", { text: titleCase(message.senderType) }) : null,
            ],
          }),
          createElement("time", {
            attrs: { datetime: message.createdAt || null },
            text: displayTime(message.createdAt),
          }),
        ],
      }),
      createElement("p", { className: "admin-messages-route__body", text: message.body || "Message body unavailable." }),
      message.hidden ? createElement("p", {
        className: "admin-messages-route__moderation-note",
        children: [
          AdminIcon({ name: "warning", size: 16 }),
          message.hiddenReason || "This message is hidden by moderation.",
        ],
      }) : null,
      createElement("div", {
        className: "admin-messages-route__message-actions",
        children: button({
          label: message.hidden ? "Restore message" : "Hide message",
          icon: message.hidden ? "success" : "warning",
          quiet: true,
          tone: restrictive ? "danger" : null,
          onClick(event) {
            onRequestAction({
              kind: "message",
              thread,
              message,
              action,
              requireReason: restrictive,
              reasonLabel: "Message moderation reason",
              opener: event.currentTarget,
            });
          },
        }),
      }),
    ],
  });
  return card;
}

function messageList({ thread, onRequestAction }) {
  const details = createElement("details", {
    className: "admin-messages-route__messages",
    children: [
      createElement("summary", {
        children: [
          createElement("strong", { text: `${thread.messages.length.toLocaleString()} message${thread.messages.length === 1 ? "" : "s"}` }),
          createElement("span", { text: "Review conversation" }),
        ],
      }),
    ],
  });
  const list = createElement("div", { className: "admin-messages-route__message-list" });
  if (!thread.messages.length) {
    list.append(AdminEmptyState({
      title: "No messages in this conversation",
      message: "The authoritative thread currently contains no message records.",
      compact: true,
    }));
  } else {
    thread.messages.forEach((message) => list.append(messageCard({ thread, message, onRequestAction })));
  }
  details.append(list);
  return details;
}

function threadCard({ thread, onRequestAction }) {
  const statusAction = thread.status === "active" ? "disable" : thread.status === "disabled" ? "enable" : "";

  const actions = createElement("div", { className: "admin-messages-route__thread-actions" });
  if (statusAction) {
    actions.append(button({
      label: statusAction === "enable" ? "Enable conversation" : "Disable conversation",
      icon: statusAction === "enable" ? "success" : "warning",
      quiet: true,
      tone: statusAction === "disable" ? "danger" : null,
      onClick(event) {
        onRequestAction({
          kind: "thread",
          thread,
          action: statusAction,
          requireReason: statusAction === "disable",
          reasonLabel: "Conversation moderation reason",
          opener: event.currentTarget,
        });
      },
    }));
  }
  if (thread.status !== "closed") {
    actions.append(button({
      label: "Close conversation",
      icon: "warning",
      quiet: true,
      tone: "danger",
      onClick(event) {
        onRequestAction({ kind: "thread", thread, action: "close", requireReason: true, reasonLabel: "Conversation close reason", opener: event.currentTarget });
      },
    }));
  }
  if (thread.expired) {
    actions.append(button({
      label: "Delete expired content",
      icon: "warning",
      quiet: true,
      tone: "danger",
      onClick(event) {
        onRequestAction({ kind: "retention", thread, action: "delete", requireReason: true, reasonLabel: "Retention deletion reason", opener: event.currentTarget });
      },
    }));
  }

  return createElement("article", {
    className: "admin-messages-route__thread",
    children: [
      createElement("header", {
        className: "admin-messages-route__thread-heading",
        children: [
          createElement("div", {
            children: [
              createElement("span", { className: "admin-messages-route__type", text: titleCase(thread.type) }),
              createElement("h2", { text: thread.title }),
            ],
          }),
          statusBadge(thread.status),
        ],
      }),
      participantSummary(thread),
      createElement("dl", {
        className: "admin-messages-route__metadata",
        children: [
          createElement("div", { children: [createElement("dt", { text: "Created" }), createElement("dd", { text: displayTime(thread.createdAt) })] }),
          createElement("div", { children: [createElement("dt", { text: "Updated" }), createElement("dd", { text: displayTime(thread.updatedAt) })] }),
          createElement("div", { children: [createElement("dt", { text: "Retention" }), createElement("dd", { text: `${displayTime(thread.retentionUntil)}${thread.expired ? " · expired" : ""}` })] }),
          createElement("div", { children: [createElement("dt", { text: "Replies" }), createElement("dd", { text: thread.allowPlayerReplies ? "Player replies allowed" : "Read-only for players" })] }),
        ],
      }),
      thread.contractKey ? createElement("p", {
        className: "admin-messages-route__contract",
        children: [createElement("strong", { text: "Contract context" }), thread.contractKey],
      }) : null,
      thread.moderationReason ? createElement("p", {
        className: "admin-messages-route__moderation-note",
        children: [AdminIcon({ name: "warning", size: 16 }), thread.moderationReason],
      }) : null,
      actions,
      messageList({ thread, onRequestAction }),
    ],
  });
}

function resolvedContent({ model, filters, onApplyFilters, onPage, onRequestAction }) {
  const search = AdminField({
    name: "messagesSearch",
    label: "Search messages",
    type: "search",
    value: filters.query,
    placeholder: "Title, Player ID, sender, or message text",
    autocomplete: "off",
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  search.control.maxLength = 100;
  const status = AdminField({
    name: "messagesStatus",
    label: "Conversation state",
    type: "select",
    value: filters.status,
    options: [
      { value: "all", label: "All states" },
      { value: "active", label: "Active" },
      { value: "disabled", label: "Disabled" },
      { value: "closed", label: "Closed" },
    ],
  });
  const filterButton = button({
    label: "Apply filters",
    icon: "search",
    onClick() {
      onApplyFilters({ query: search.getValue(), status: status.getValue() });
    },
  });
  search.control.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onApplyFilters({ query: search.getValue(), status: status.getValue() });
  });
  const clearFilters = button({
    label: "Clear filters",
    quiet: true,
    onClick() { onApplyFilters({ query: "", status: "all" }); },
  });

  const controls = createElement("section", {
    className: "admin-messages-route__controls",
    attrs: { "aria-label": "Messages moderation filters" },
    children: [search.element, status.element, filterButton, clearFilters],
  });
  const list = createElement("section", {
    className: "admin-messages-route__thread-list",
    attrs: { "aria-label": "Message conversations" },
  });
  if (model.isEmpty) {
    list.append(AdminEmptyState({
      title: filters.query || filters.status !== "all" ? "No conversations match" : "No messages yet",
      message: filters.query || filters.status !== "all"
        ? "Change the search or conversation-state filter."
        : "No authoritative messaging conversations are available for this game.",
    }));
  } else {
    model.threads.forEach((thread) => list.append(threadCard({ thread, onRequestAction })));
  }

  const previousOffset = Math.max(0, model.pagination.offset - model.pagination.limit);
  const nextOffset = model.pagination.offset + model.pagination.limit;
  const rangeStart = model.pagination.returned > 0 ? model.pagination.offset + 1 : model.pagination.offset;
  const rangeEnd = model.pagination.offset + model.pagination.returned;
  const pagination = createElement("nav", {
    className: "admin-messages-route__pagination",
    attrs: { "aria-label": "Messages pages" },
    children: [
      button({
        label: "Previous",
        icon: "chevronLeft",
        quiet: true,
        disabled: model.pagination.offset === 0,
        onClick: () => onPage(previousOffset),
      }),
      createElement("span", {
        text: `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()}`,
      }),
      button({
        label: "Next",
        icon: "chevronRight",
        quiet: true,
        disabled: !model.pagination.hasMore,
        onClick: () => onPage(nextOffset),
      }),
    ],
  });

  return createElement("div", {
    className: "admin-messages-route__resolved",
    children: [summary(model), controls, list, pagination],
  });
}

export function MessagesRoute({
  state,
  filters = { query: "", status: "all", limit: 25, offset: 0 },
  onApplyFilters = async () => {},
  onPage = async () => {},
  onRefresh = async () => {},
  onModerateThread = async () => ({ ok: false }),
  onModerateMessage = async () => ({ ok: false }),
  onDeleteExpiredThread = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  let pendingAction = null;
  let confirmDialog = null;
  let reason = null;

  function ensureConfirmDialog() {
    if (confirmDialog) return confirmDialog;
    confirmDialog = AdminConfirmDialog({
      title: "Confirm moderation action",
      message: "Apply this moderation action?",
      detail: "The authoritative messaging service will record this change for the current game.",
      confirmLabel: "Apply action",
      failureMessage: "The moderation action could not be completed. Review the current thread state and try again.",
      async onConfirm() {
        if (!pendingAction) return false;
        const moderationReason = reason?.getValue().trim() || "";
        if (pendingAction.requireReason && !moderationReason) {
          reason.setError("Enter a specific reason for this moderation action.");
          reason.focus();
          return false;
        }
        reason?.setError("");
        const { kind, thread, message, action } = pendingAction;
        const result = kind === "message"
          ? await onModerateMessage(thread, message, action, moderationReason)
          : kind === "retention"
            ? await onDeleteExpiredThread(thread, moderationReason)
            : await onModerateThread(thread, action, moderationReason);
        if (result?.ok !== true) throw new Error("MESSAGES_MODERATION_FAILED");
        return true;
      },
    });
    return confirmDialog;
  }

  function requestAction(action) {
    pendingAction = action;
    const dialog = ensureConfirmDialog();
    reason = action.requireReason ? reasonField(
      action.reasonLabel || "Moderation reason",
      "Required for this action and recorded in the moderation history.",
    ) : null;
    dialog.setContent(reason?.element || null);
    dialog.setTone(action.requireReason && !["unhide", "enable"].includes(action.action) ? "danger" : "neutral");
    const subject = action.kind === "message" ? "this message" : action.thread.title;
    const verb = action.kind === "retention"
      ? "delete expired retained content for"
      : action.action === "unhide"
        ? "restore"
        : action.action === "enable"
          ? "enable"
          : action.action;
    dialog.setMessage(`${titleCase(verb)} ${subject}?`);
    dialog.setDetail(action.requireReason
      ? "Enter the reason below, then review the action before applying it."
      : "This action will be recorded in the game moderation history.");
    void dialog.open(action.opener).then(() => {
      pendingAction = null;
      reason = null;
      dialog.setContent(null);
    });
  }

  const refreshButton = button({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const route = createElement("div", {
    className: "admin-messages-route",
    dataset: { adminV2State: state.status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status),
    },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(MessagesSkeleton());
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "Messages moderation could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable ? { label: "Retry Messages", onClick: onRefresh } : null,
    }));
  } else if (state.data) {
    const content = resolvedContent({
      model: state.data,
      filters,
      onApplyFilters,
      onPage,
      onRequestAction: requestAction,
    });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({
        message: state.error?.userMessage || "Showing the last successful messaging snapshot while the service recovers.",
        retry: { label: "Retry", onClick: onRefresh },
        content,
      }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", {
          className: "admin-messages-route__refresh-state",
          attrs: { role: "status" },
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing authoritative messaging data…"],
        }));
      }
      route.append(content);
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Game communications",
    title: "Messages Moderation",
    description: "Supervise current-game conversations and apply only the moderation actions already supported by the authoritative messaging service.",
    actions: [refreshButton],
    content: route,
  });

  return {
    ...pageFrame,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pendingAction = null;
      confirmDialog?.destroy();
      confirmDialog = null;
    },
  };
}
