import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { appendContent, createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { OverviewSkeleton } from "./OverviewSkeleton.js";

function present(value, fallback = "Not available") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function displayNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-US") : "—";
}

function displayAmount(value, currencyCode) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const suffix = String(currencyCode || "").trim();
  return `${numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix ? ` ${suffix}` : ""}`;
}

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function count(value, collection) {
  if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return Array.isArray(collection) ? collection.length : null;
}

function panelError(result, title, retry) {
  const error = result?.status === "rejected" ? result.reason : null;
  return AdminErrorState({
    title,
    message: error?.userMessage,
    requestId: error?.requestId,
    retryAfterSeconds: error?.retryAfterSeconds,
    compact: true,
    retry: error?.retryable ? { label: "Retry Overview", onClick: retry } : null,
  });
}

function panel({ eyebrow, title, action, content, label = title }) {
  const heading = createElement("div", {
    children: [
      createElement("span", { className: "admin-overview__panel-kicker", text: eyebrow }),
      createElement("h2", { text: title }),
    ],
  });
  const header = createElement("header", {
    className: "admin-overview-route__panel-head",
    children: [heading, action],
  });
  const root = createElement("section", {
    className: "admin-overview-route__panel",
    attrs: { "aria-label": label },
  });
  root.append(header);
  appendContent(root, content);
  return root;
}

function gameHero(model) {
  const game = model.game || {};
  const status = String(game.status || "").toLowerCase();
  return createElement("section", {
    className: "admin-overview__hero",
    attrs: { "aria-label": "Current game" },
    children: [
      createElement("div", {
        className: "admin-overview__game-copy",
        children: [
          createElement("span", { className: "admin-overview__game-kicker", text: "Current game" }),
          createElement("h2", { className: "admin-overview__game-name", text: present(game.name, "Game name unavailable") }),
          createElement("div", {
            className: "admin-overview__game-meta",
            children: [
              createElement("span", {
                className: "admin-overview__status",
                dataset: { status: status || "unknown" },
                text: titleCase(status),
              }),
              game.updatedAt ? createElement("span", { text: `Updated ${present(game.updatedAt)}` }) : null,
            ],
          }),
        ],
      }),
      game.gameCode || game.joinCode
        ? createElement("code", {
          className: "admin-overview__game-code",
          attrs: { "aria-label": `Game code ${game.gameCode || game.joinCode}` },
          text: game.gameCode || game.joinCode,
        })
        : null,
    ],
  });
}

const QUICK_ACTIONS = Object.freeze([
  Object.freeze({ routeId: "attendance", intent: "focus-scanner", label: "Scan Attendance", description: "Open Attendance and focus the scanner", icon: "attendance", permission: "attendance.manage" }),
  Object.freeze({ routeId: "contracts", intent: "create", label: "Add Contract", description: "Open the contract creation form", icon: "contracts", permission: "contracts.manage" }),
  Object.freeze({ routeId: "players", intent: "create", label: "Add Player", description: "Open the player creation form", icon: "players", permission: "players.manage" }),
]);

function quickActions({ hasPermission, onOpenLegacy }) {
  const actions = QUICK_ACTIONS.filter((action) => hasPermission(action.permission));
  const grid = createElement("div", { className: "admin-overview-route__action-grid" });
  actions.forEach((action) => {
    const button = createElement("button", {
      className: "admin-overview-route__action",
      attrs: { type: "button" },
      children: [
        AdminIcon({ name: action.icon, size: 24 }),
        createElement("span", {
          className: "admin-overview__quick-action-copy",
          children: [
            createElement("strong", { text: action.label }),
            createElement("small", { text: action.description }),
          ],
        }),
      ],
    });
    button.addEventListener("click", () => onOpenLegacy(action.routeId, action.intent));
    grid.append(button);
  });

  return createElement("section", {
    className: "admin-overview-route__quick-actions",
    attrs: { "aria-label": "Quick actions" },
    children: [
      createElement("span", { className: "admin-overview__panel-kicker", text: "Quick actions" }),
      actions.length
        ? grid
        : AdminEmptyState({
          title: "No quick actions available",
          message: "Your current permissions provide read-only Overview access.",
          compact: true,
        }),
    ],
  });
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-overview-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: displayNumber(value) }),
      createElement("small", { text: detail }),
    ],
  });
}

function overviewMetrics(model) {
  const attendance = model.attendance || {};
  const summary = attendance.summary || {};
  const totalPlayers = count(attendance.totalPlayers, attendance.rows);
  const presentCount = count(summary.presentCount, null);
  const contractCount = count(null, model.contracts);
  const notificationCount = count(model.notificationCount, model.notifications);
  return createElement("section", {
    className: "admin-overview-route__metrics",
    attrs: { "aria-label": "Overview metrics" },
    children: [
      metric("Total players", totalPlayers, "Active game roster"),
      metric("Present", presentCount, presentCount === null ? "Attendance unavailable" : "Today"),
      metric("Contracts", contractCount, contractCount === null ? "Contracts unavailable" : "Current dashboard view"),
      metric("Alerts", notificationCount, notificationCount === null ? "Notifications unavailable" : "Administrator notifications"),
    ],
  });
}

function attendancePanel(model, dashboardResult, onRefresh) {
  if (dashboardResult?.status === "rejected") {
    return panel({
      eyebrow: "Attendance",
      title: "Status overview",
      content: panelError(dashboardResult, "Attendance is unavailable", onRefresh),
    });
  }
  const attendance = model.attendance;
  const rows = attendance?.rows;
  if (Array.isArray(rows) && rows.length === 0) {
    return panel({
      eyebrow: "Attendance",
      title: "Status overview",
      content: AdminEmptyState({
        title: "No attendance records",
        message: "No attendance scans are available for the current game and date.",
        compact: true,
      }),
    });
  }

  const summary = attendance?.summary || {};
  const latest = attendance?.latestScan;
  const total = count(attendance?.totalPlayers, rows);
  const presentCount = count(summary.presentCount, null);
  const rate = total && presentCount !== null ? Math.round((presentCount / total) * 100) : null;
  const stats = createElement("div", {
    className: "admin-overview-route__attendance-grid",
    children: [
      metric("Present", summary.presentCount, "Checked in"),
      metric("Late", summary.lateCount, "Checked in late"),
      metric("Absent", summary.absentCount, "Not checked in"),
    ],
  });
  const details = createElement("div", {
    className: "admin-overview-route__contract-list",
    children: [
      createElement("p", {
        className: "admin-overview-route__contract",
        children: [
          createElement("strong", { text: rate === null ? "Present rate unavailable" : `${rate}% present` }),
          createElement("small", {
            text: latest
              ? `Latest scan: ${present(latest.displayName || latest.name)} · ${titleCase(latest.status)}`
              : "No latest scan is available.",
          }),
        ],
      }),
      createElement("p", {
        className: "admin-overview-route__contract",
        children: [
          createElement("strong", { text: displayAmount(summary.rewardsIssuedTotal, attendance?.latestScan?.rewardCurrencyCode) }),
          createElement("small", { text: "Attendance rewards issued today" }),
        ],
      }),
    ],
  });
  return panel({ eyebrow: "Attendance", title: "Status overview", content: [stats, details] });
}

function leaderboardPanel(model, dashboardResult, onRefresh) {
  if (dashboardResult?.status === "rejected") {
    return panel({
      eyebrow: "Leaderboard",
      title: "Player standing",
      content: panelError(dashboardResult, "Leaderboard is unavailable", onRefresh),
    });
  }

  const players = Array.isArray(model.leaderboard) ? model.leaderboard : [];
  const search = AdminField({
    name: "search",
    label: "Filter leaderboard",
    type: "search",
    placeholder: "Player name",
    autocomplete: "off",
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const table = AdminDataTable({
    caption: "Current player leaderboard",
    columns: [
      { key: "rank", label: "Rank" },
      { key: "displayName", label: "Player", rowHeader: true, render: (value, row) => present(value || row.name, "Unnamed player") },
      { key: "status", label: "Status", render: (value, row) => titleCase(value || row.sessionStatus || (row.online === true ? "online" : "")) },
      { key: "netWorth", label: "Net worth", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
    ],
    rows: players.slice(0, 10),
    emptyState: AdminEmptyState({
      title: "No leaderboard entries",
      message: "No ranked players are available for the current game.",
      compact: true,
    }),
  });
  search.control.addEventListener("input", () => {
    const query = search.getValue().trim().toLowerCase();
    const matches = players.filter((row) => String(row.displayName || row.name || "").toLowerCase().includes(query));
    table.setRows((query ? matches : players).slice(0, 10));
  });

  return panel({
    eyebrow: "Leaderboard",
    title: model.leaderboardBasis === "net_worth" ? "Net worth standing" : "Player standing",
    action: search.element,
    content: table.element,
  });
}

function contractsPanel(model, dashboardResult, onRefresh) {
  if (dashboardResult?.status === "rejected") {
    return panel({
      eyebrow: "Contracts",
      title: "Active contracts",
      content: panelError(dashboardResult, "Contracts are unavailable", onRefresh),
    });
  }
  if (Array.isArray(model.contracts) && model.contracts.length === 0) {
    return panel({
      eyebrow: "Contracts",
      title: "Active contracts",
      content: AdminEmptyState({
        title: "No contracts in this view",
        message: "The current game has no active, scheduled, or draft contracts.",
        compact: true,
      }),
    });
  }
  const list = createElement("div", { className: "admin-overview-route__contract-list" });
  (model.contracts || []).slice(0, 4).forEach((contract) => {
    list.append(createElement("article", {
      className: "admin-overview-route__contract",
      children: [
        createElement("strong", { text: present(contract.title, "Untitled contract") }),
        createElement("span", { text: `${titleCase(contract.status)}${contract.category ? ` · ${contract.category}` : ""}` }),
        contract.deadlineAt ? createElement("small", { text: `Deadline ${contract.deadlineAt}` }) : null,
      ],
    }));
  });
  return panel({ eyebrow: "Contracts", title: "Active contracts", content: list });
}

function notificationsPanel(model, result, onRefresh) {
  if (result?.status === "rejected") {
    return panel({
      eyebrow: "Alerts",
      title: "Administrator notifications",
      content: panelError(result, "Notifications are unavailable", onRefresh),
    });
  }
  if (Array.isArray(model.notifications) && model.notifications.length === 0) {
    return panel({
      eyebrow: "Alerts",
      title: "Administrator notifications",
      content: AdminEmptyState({
        title: "No administrator alerts",
        message: "There are no notifications for the current administrator scope.",
        compact: true,
      }),
    });
  }
  const list = createElement("div", { className: "admin-overview-route__notice-list" });
  (model.notifications || []).slice(0, 5).forEach((notice) => {
    list.append(createElement("article", {
      className: "admin-overview-route__notice",
      children: [
        createElement("strong", { text: present(notice.title || notice.label, "Administrator notice") }),
        notice.message || notice.description
          ? createElement("p", { text: notice.message || notice.description })
          : null,
        createElement("small", { text: [titleCase(notice.priority, "Normal priority"), notice.createdAt].filter(Boolean).join(" · ") }),
      ],
    }));
  });
  return panel({ eyebrow: "Alerts", title: "Administrator notifications", content: list });
}

function overviewContent({ data, hasPermission, onOpenLegacy, onRefresh }) {
  const model = data.model;
  const panels = data.panels || {};
  const root = createElement("div", {
    className: "admin-overview-route",
    children: [
      gameHero(model),
      quickActions({ hasPermission, onOpenLegacy }),
      overviewMetrics(model),
    ],
  });

  if (model.isEmpty) {
    root.append(AdminEmptyState({
      title: "No Overview activity yet",
      message: "The current game is available, but its Overview collections are empty.",
      compact: true,
    }));
  }

  const layout = createElement("div", { className: "admin-overview-route__layout" });
  const primary = createElement("div", {
    className: "admin-u-stack",
    children: [
      attendancePanel(model, panels.dashboard, onRefresh),
      leaderboardPanel(model, panels.dashboard, onRefresh),
    ],
  });
  const secondary = createElement("div", {
    className: "admin-u-stack",
    children: [
      contractsPanel(model, panels.dashboard, onRefresh),
      notificationsPanel(model, panels.notifications, onRefresh),
    ],
  });
  layout.append(primary, secondary);
  root.append(layout);
  return root;
}

function refreshButton(state, onRefresh) {
  const button = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: {
      type: "button",
      "aria-label": "Refresh overview",
      disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    },
    children: [
      AdminIcon({ name: "refresh", size: 17 }),
      state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    ],
  });
  button.addEventListener("click", onRefresh);
  return button;
}

/** Renders a complete Overview route from the shared six-state data contract. */
export function OverviewRoute({
  state,
  hasPermission = () => false,
  onOpenLegacy = () => {},
  onRefresh = () => {},
} = {}) {
  const route = createElement("div", {
    className: "admin-overview-route",
    dataset: { adminV2State: state.status },
    attrs: { "aria-busy": state.status === ADMIN_DATA_STATES.INITIAL_LOADING || state.status === ADMIN_DATA_STATES.REFRESHING },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(OverviewSkeleton());
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "Overview could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable
        ? { label: "Retry Overview", onClick: onRefresh }
        : null,
    }));
  } else if (state.data) {
    const content = overviewContent({ data: state.data, hasPermission, onOpenLegacy, onRefresh });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({
        message: state.error?.userMessage || "Showing the last successful Overview while the service recovers.",
        retry: { label: "Retry", onClick: onRefresh },
        content,
      }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", {
          className: "admin-overview-route__refresh-state",
          attrs: { role: "status" },
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing authoritative Overview data…"],
        }));
      }
      route.append(content);
    }
  }

  return AdminPageFrame({
    eyebrow: "Game administration",
    title: "Overview",
    description: "Current operational status from the authoritative administrator service.",
    actions: refreshButton(state, onRefresh),
    content: route,
  });
}
