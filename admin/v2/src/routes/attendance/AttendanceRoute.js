import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { AttendanceSkeleton } from "./AttendanceSkeleton.js";

const CORRECTION_OPTIONS = ["present", "late", "absent", "excused"];

function titleCase(value) {
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

function button({ label, icon = null, quiet = false, disabled = false, tone = null, onClick, action }) {
  const element = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { attendanceAction: action, tone },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  if (typeof onClick === "function") element.addEventListener("click", onClick);
  return element;
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

function summary(model) {
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

function scannerPanel({ model, scanner, onScan }) {
  const input = createElement("input", {
    className: "admin-attendance-route__scanner-input",
    attrs: {
      id: "adminAttendanceScannerInput",
      name: "attendanceScan",
      type: "text",
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      placeholder: "Scan RFID / player code",
      disabled: !scanner.accepting || model.lock.locked,
      "aria-describedby": "adminAttendanceScannerStatus",
    },
  });
  const submit = createElement("button", {
    className: "admin-button",
    attrs: { type: "submit", disabled: !scanner.accepting || model.lock.locked },
    children: [AdminIcon({ name: "attendance", size: 17 }), scanner.status === "submitting" ? "Checking…" : "Check In"],
  });
  const status = createElement("div", {
    className: "admin-attendance-route__scanner-status",
    dataset: { scannerStatus: scanner.status },
    attrs: { id: "adminAttendanceScannerStatus", role: "status", "aria-live": "polite" },
    children: [
      createElement("strong", { text: scanner.message }),
      scanner.detail ? createElement("span", { text: scanner.detail }) : null,
    ],
  });
  const form = createElement("form", {
    className: "admin-attendance-route__scanner-form",
    children: [
      createElement("label", { attrs: { for: input.id }, text: "RFID / scanner input" }),
      createElement("div", { className: "admin-attendance-route__scanner-controls", children: [input, submit] }),
    ],
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    await onScan(value);
  });

  if (scanner.accepting && !model.lock.locked) {
    queueMicrotask(() => input.isConnected && input.focus({ preventScroll: true }));
  }

  return createElement("section", {
    className: "admin-attendance-route__scanner",
    attrs: { "aria-label": "Attendance scanner" },
    children: [
      createElement("div", {
        className: "admin-attendance-route__section-heading",
        children: [
          createElement("div", { children: [
            createElement("h2", { text: "Scanner" }),
            createElement("p", { text: model.lock.locked ? "This attendance day is locked." : "Scan or enter the existing player credential. Enter submits from the keyboard." }),
          ] }),
          createElement("span", { className: "admin-attendance-route__date", text: `${model.attendanceDate} · ${model.timezone}` }),
        ],
      }),
      form,
      status,
    ],
  });
}

function rosterTable(model) {
  const table = AdminDataTable({
    caption: `Attendance roster for ${model.attendanceDate}`,
    rowKey: (row) => row.rowKey,
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
      { key: "clockedInAt", label: "Check-in", render: (value) => displayTime(value, model.timezone) },
      { key: "source", label: "Source", render: (value) => titleCase(value) },
      {
        key: "note",
        label: "Note",
        render: (value) => value || "—",
      },
    ],
    emptyState: AdminEmptyState({
      title: "No attendance roster yet",
      message: "There are no active players or attendance records for this game today.",
      compact: true,
    }),
  });
  table.setRows(model.rows);
  return table.element;
}

function field({ label, name, type = "text", value = "", options = null, placeholder = "", step = null }) {
  const control = options
    ? createElement("select", {
      className: "admin-attendance-route__control",
      attrs: { name },
      children: options.map((option) => createElement("option", {
        attrs: { value: option.value, selected: option.value === value },
        text: option.label,
      })),
    })
    : createElement("input", {
      className: "admin-attendance-route__control",
      attrs: { name, type, value, placeholder, step },
    });
  return {
    control,
    element: createElement("label", {
      className: "admin-attendance-route__field",
      children: [createElement("span", { text: label }), control],
    }),
  };
}

function playerActions({ model, onCorrect, onSaveNote, onAdjustReward }) {
  const selectable = model.rows.map((row) => ({
    value: row.rowKey,
    label: `${row.displayName}${row.rosterLabel ? ` · ${row.rosterLabel}` : ""}`,
  }));
  const firstKey = selectable[0]?.value || "";
  const player = field({ label: "Player", name: "player", value: firstKey, options: selectable });
  const correction = field({
    label: "Correction",
    name: "status",
    value: "present",
    options: CORRECTION_OPTIONS.map((value) => ({ value, label: titleCase(value) })),
  });
  const note = field({ label: "Note", name: "note", placeholder: "Optional correction note / note text" });
  const amount = field({ label: "Reward adjustment", name: "amount", type: "number", step: "0.01", placeholder: "e.g. 1 or -1" });
  const currency = field({ label: "Currency", name: "currency", value: "ECO", placeholder: "ECO" });
  const account = field({
    label: "Account",
    name: "account",
    value: "checking",
    options: [
      { value: "checking", label: "Checking" },
      { value: "savings", label: "Savings" },
    ],
  });
  const status = createElement("div", {
    className: "admin-attendance-route__action-status",
    attrs: { role: "status", "aria-live": "polite" },
  });

  async function run(action, successMessage) {
    status.textContent = "Saving…";
    const result = await action();
    status.textContent = result?.ok === true ? successMessage : result?.error?.userMessage || "The action could not be completed.";
  }

  const correctionButton = button({
    label: "Apply correction",
    action: "correct",
    disabled: !firstKey || model.lock.locked,
    onClick: () => run(
      () => onCorrect(player.control.value, correction.control.value, note.control.value),
      "Correction saved.",
    ),
  });
  const noteButton = button({
    label: "Save note",
    quiet: true,
    action: "note",
    disabled: !firstKey || model.lock.locked,
    onClick: () => run(() => onSaveNote(player.control.value, note.control.value), "Note saved."),
  });
  const rewardButton = button({
    label: "Adjust reward",
    quiet: true,
    action: "reward",
    disabled: !firstKey || model.lock.locked,
    onClick: () => run(() => onAdjustReward(player.control.value, {
      amount: amount.control.value,
      currencyCode: currency.control.value,
      accountType: account.control.value,
      note: note.control.value,
    }), "Reward adjustment saved."),
  });

  return createElement("section", {
    className: "admin-attendance-route__actions-panel",
    attrs: { "aria-label": "Attendance record actions" },
    children: [
      createElement("div", {
        className: "admin-attendance-route__section-heading",
        children: [createElement("div", { children: [
          createElement("h2", { text: "Record actions" }),
          createElement("p", { text: "Use only the existing correction, note, and server-ledger reward operations." }),
        ] })],
      }),
      createElement("div", {
        className: "admin-attendance-route__action-grid",
        children: [player.element, correction.element, note.element, amount.element, currency.element, account.element],
      }),
      createElement("div", {
        className: "admin-attendance-route__action-buttons",
        children: [correctionButton, noteButton, rewardButton],
      }),
      status,
    ],
  });
}

function lockPanel({ model, onSetLocked }) {
  const reason = field({ label: model.lock.locked ? "Unlock note" : "Lock reason", name: "lockReason", placeholder: "Optional reason" });
  const status = createElement("div", { className: "admin-attendance-route__action-status", attrs: { role: "status", "aria-live": "polite" } });
  const toggle = button({
    label: model.lock.locked ? "Unlock day" : "Lock day",
    icon: model.lock.locked ? "refresh" : "warning",
    tone: model.lock.locked ? null : "danger",
    action: model.lock.locked ? "unlock-day" : "lock-day",
    onClick: async () => {
      status.textContent = model.lock.locked ? "Unlocking…" : "Locking…";
      const result = await onSetLocked(!model.lock.locked, reason.control.value);
      status.textContent = result?.ok === true ? "Attendance day updated." : result?.error?.userMessage || "The day lock could not be changed.";
    },
  });
  return createElement("section", {
    className: "admin-attendance-route__lock-panel",
    attrs: { "aria-label": "Attendance day lock" },
    children: [
      createElement("div", { children: [
        createElement("strong", { text: model.lock.locked ? "Day locked" : "Day open" }),
        createElement("p", { text: model.lock.reason || (model.lock.locked ? "Mutations are blocked by the server until unlocked." : "Attendance changes are currently available.") }),
      ] }),
      reason.element,
      toggle,
      status,
    ],
  });
}

function resolvedContent({ model, scanner, onScan, onCorrect, onSaveNote, onAdjustReward, onSetLocked }) {
  const root = createElement("div", {
    className: "admin-attendance-route__resolved",
    children: [summary(model), scannerPanel({ model, scanner, onScan }), lockPanel({ model, onSetLocked })],
  });
  if (model.isEmpty) {
    root.append(AdminEmptyState({
      title: "No attendance records or active roster",
      message: "Attendance will appear here when the current game has active players or records for the day.",
    }));
  } else {
    root.append(
      createElement("section", {
        className: "admin-attendance-route__roster",
        attrs: { "aria-label": "Attendance roster" },
        children: [rosterTable(model)],
      }),
      playerActions({ model, onCorrect, onSaveNote, onAdjustReward }),
    );
  }
  return root;
}

/** Renders Attendance from the shared Admin v2 data-state contract. */
export function AttendanceRoute({
  state,
  scanner,
  onRefresh = async () => {},
  onScan = async () => ({ ok: false }),
  onCorrect = async () => ({ ok: false }),
  onSaveNote = async () => ({ ok: false }),
  onAdjustReward = async () => ({ ok: false }),
  onSetLocked = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  const refreshButton = button({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    action: "refresh",
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const route = createElement("div", {
    className: "admin-attendance-route",
    dataset: { adminV2State: state.status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status),
    },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(AttendanceSkeleton());
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "Attendance could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable ? { label: "Retry Attendance", onClick: onRefresh } : null,
    }));
  } else if (state.data) {
    const content = resolvedContent({
      model: state.data,
      scanner,
      onScan,
      onCorrect,
      onSaveNote,
      onAdjustReward,
      onSetLocked,
    });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({
        message: state.error?.userMessage || "Showing the last successful attendance roster while the service recovers.",
        retry: { label: "Retry", onClick: onRefresh },
        content,
      }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", {
          className: "admin-attendance-route__refresh-state",
          attrs: { role: "status" },
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing authoritative Attendance data…"],
        }));
      }
      route.append(content);
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Game administration",
    title: "Attendance",
    description: "Manage the current game's server-authoritative attendance records, scanner check-ins, corrections, notes, rewards, and day lock.",
    actions: [refreshButton],
    content: route,
  });
  return {
    ...pageFrame,
    destroy() {
      if (destroyed) return;
      destroyed = true;
    },
  };
}
