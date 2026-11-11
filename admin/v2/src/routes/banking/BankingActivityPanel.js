import { AdminDataTable, AdminEmptyState, AdminErrorState, AdminIcon, AdminSkeleton, AdminStaleState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { button, displayAmount, displayDate, titleCase } from "./BankingViewHelpers.js";

function activityTable(history) {
  const table = AdminDataTable({
    caption: "Checking and Savings activity",
    rowKey: (entry) => entry.rowKey,
    rows: history.entries,
    columns: [
      { key: "createdAt", label: "Date", render: (value) => displayDate(value) },
      {
        key: "description",
        label: "Activity",
        rowHeader: true,
        render: (value, entry) => createElement("div", {
          className: "admin-banking-route__activity-copy",
          children: [
            createElement("strong", { text: value }),
            createElement("small", { text: entry.isTransfer ? "Account transfer" : entry.category }),
          ],
        }),
      },
      { key: "accountType", label: "Account", render: (value) => titleCase(value) },
      {
        key: "amount",
        label: "Amount",
        align: "end",
        render: (value, entry) => createElement("span", {
          className: "admin-banking-route__ledger-amount",
          dataset: { direction: Number(value) < 0 ? "debit" : Number(value) > 0 ? "credit" : "neutral" },
          text: displayAmount(value, entry.currencyCode, { signed: true }),
        }),
      },
      { key: "entryType", label: "Type", render: (value) => titleCase(value) },
    ],
    emptyState: AdminEmptyState({
      title: "No banking activity yet",
      message: "No Checking or Savings activity is available for this student.",
      compact: true,
    }),
  });
  return table.element;
}

export function activityPanel({ player, historyState, onClose, onRefresh }) {
  const actions = createElement("div", {
    className: "admin-banking-route__activity-actions",
    children: [
      button({
        label: historyState.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh activity",
        icon: "refresh",
        quiet: true,
        disabled: historyState.status === ADMIN_DATA_STATES.REFRESHING,
        action: "refresh-activity",
        onClick: onRefresh,
      }),
      button({ label: "Close", icon: "close", quiet: true, action: "close-activity", onClick: onClose }),
    ],
  });
  const body = createElement("div", { className: "admin-banking-route__activity-body" });

  if (historyState.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    body.append(AdminSkeleton({ label: `Loading ${player.displayName} banking activity`, count: 5, shape: "row" }));
  } else if (historyState.status === ADMIN_DATA_STATES.FAILED) {
    body.append(AdminErrorState({
      title: "Banking activity unavailable",
      message: historyState.error?.userMessage,
      requestId: historyState.error?.requestId,
      retryAfterSeconds: historyState.error?.retryAfterSeconds,
      retry: historyState.error?.retryable === false ? null : { label: "Try again", onClick: onRefresh },
      compact: true,
    }));
  } else if (historyState.status === ADMIN_DATA_STATES.EMPTY) {
    body.append(AdminEmptyState({
      title: "No banking activity yet",
      message: "No Checking or Savings activity is available for this student.",
      compact: true,
    }));
  } else {
    const table = activityTable(historyState.data);
    const content = historyState.status === ADMIN_DATA_STATES.REFRESHING
      ? createElement("div", {
        className: "admin-banking-route__activity-resolved",
        children: [
          createElement("div", {
            className: "admin-banking-route__refresh-state",
            attrs: { role: "status" },
            children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing activity…"],
          }),
          table,
        ],
      })
      : table;
    body.append(historyState.status === ADMIN_DATA_STATES.STALE
      ? AdminStaleState({
        message: "Showing the latest loaded banking activity while refresh is unavailable.",
        retry: { label: "Refresh", onClick: onRefresh },
        content,
      })
      : content);
  }

  return createElement("section", {
    className: "admin-banking-route__activity-panel",
    attrs: { "aria-label": `${player.displayName} banking activity` },
    children: [
      createElement("header", {
        className: "admin-banking-route__activity-header",
        children: [
          createElement("div", { children: [
            createElement("span", { text: "Account activity" }),
            createElement("h2", { text: player.displayName }),
            createElement("p", { text: "Checking and Savings entries for this student." }),
          ] }),
          actions,
        ],
      }),
      body,
    ],
  });
}
