import { AdminDataTable, AdminEmptyState, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function titleCase(value) {
  const text = String(value || "").trim();
  return text ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "—";
}

function displayTime(value, timezone) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Asia/Seoul",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  } catch (_error) {
    return "—";
  }
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-attendance-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: Number(value || 0).toLocaleString("en-US") }),
      createElement("small", { text: detail }),
    ],
  });
}

export function summary(model) {
  return createElement("section", {
    className: "admin-attendance-route__summary",
    attrs: { "aria-label": "Attendance summary" },
    children: [
      metric("Present", model.summary.presentCount, "Checked in on time"),
      metric("Late", model.summary.lateCount, "Checked in after cutoff"),
      metric("Absent", model.summary.absentCount, "Recorded absent"),
      metric("Excused", model.summary.excusedCount, "Recorded excused"),
      metric("Missing", model.summary.missingCount, `Roster ${model.summary.activePlayerCount}`),
    ],
  });
}

export function rosterTable(model) {
  return AdminDataTable({
    caption: `Attendance roster for ${model.attendanceDate}`,
    rowKey: (row) => row.rowKey,
    rows: model.rows,
    columns: [
      {
        key: "displayName",
        label: "Player",
        rowHeader: true,
        render: (_value, row) => createElement("div", {
          className: "admin-attendance-route__player",
          children: [
            createElement("strong", { text: row.displayName }),
            row.rosterLabel ? createElement("small", { text: row.rosterLabel }) : null,
          ],
        }),
      },
      {
        key: "attendanceStatus",
        label: "Status",
        render: (value) => createElement("span", {
          className: "admin-attendance-route__status",
          dataset: { status: value },
          text: titleCase(value),
        }),
      },
      { key: "clockedInAt", label: "Check-in", sortValue: (row) => Date.parse(row.clockedInAt || "") || 0, render: (value) => displayTime(value, model.timezone) },
      { key: "source", label: "Source", render: (value) => titleCase(value) },
      { key: "note", label: "Note", render: (value) => value || "—" },
    ],
    emptyState: AdminEmptyState({
      title: "No attendance roster yet",
      message: "There are no active players or attendance records for this game today.",
      compact: true,
    }),
  }).element;
}

export function selectedPlayerCard(row) {
  if (!row) {
    return createElement("div", {
      className: "admin-attendance-route__selected-player",
      dataset: { selected: "false" },
      children: [
        AdminIcon({ name: "players", size: 20 }),
        createElement("div", { children: [
          createElement("strong", { text: "No player selected" }),
          createElement("span", { text: "Choose a player before preparing a correction, note, or reward adjustment." }),
        ] }),
      ],
    });
  }
  return createElement("div", {
    className: "admin-attendance-route__selected-player",
    dataset: { selected: "true" },
    children: [
      AdminIcon({ name: "players", size: 20 }),
      createElement("div", { children: [
        createElement("strong", { text: row.displayName }),
        createElement("span", { text: [row.rosterLabel, titleCase(row.attendanceStatus)].filter(Boolean).join(" · ") }),
      ] }),
    ],
  });
}
