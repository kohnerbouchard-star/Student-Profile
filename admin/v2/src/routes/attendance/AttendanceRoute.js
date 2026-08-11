import {
  AdminConfirmDialog,
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

function displaySigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const formatted = Math.abs(number).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatted}`;
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
            createElement("p", { text: model.lock.locked ? "Attendance is locked for today." : "Scan or enter the student's existing credential. Enter submits from the keyboard." }),
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
        label: "Student",
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
      { key: "note", label: "Note", render: (value) => value || "—" },
    ],
    emptyState: AdminEmptyState({
      title: "No attendance roster yet",
      message: "There are no active students or attendance records for this simulation today.",
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

function selectedStudentLabel(select, fallback = "Student") {
  return select.options?.[select.selectedIndex]?.textContent?.trim() || fallback;
}

function playerActions({ model, onCorrect, onSaveNote, onAdjustReward }) {
  const selectable = model.rows.map((row) => ({
    value: row.rowKey,
    label: `${row.displayName}${row.rosterLabel ? ` · ${row.rosterLabel}` : ""}`,
  }));
  const firstKey = selectable[0]?.value || "";
  const player = field({ label: "Student", name: "player", value: firstKey, options: selectable });
  const correction = field({
    label: "Attendance status",
    name: "status",
    value: "present",
    options: CORRECTION_OPTIONS.map((value) => ({ value, label: titleCase(value) })),
  });
  const note = field({ label: "Teacher note", name: "note", placeholder: "Optional note" });
  const amount = field({
    label: "Reward correction · local currency → Checking",
    name: "amount",
    type: "number",
    step: "0.01",
    placeholder: "e.g. 1 or -1",
  });
  const status = createElement("div", {
    className: "admin-attendance-route__action-status",
    attrs: { role: "status", "aria-live": "polite" },
  });

  async function run(action, successMessage) {
    status.textContent = "Saving…";
    const result = await action();
    status.textContent = result?.ok === true ? successMessage : result?.error?.userMessage || "The action could not be completed.";
    return result;
  }

  const correctionButton = button({
    label: "Save attendance status",
    action: "correct",
    disabled: !firstKey || model.lock.locked,
    onClick: () => run(
      () => onCorrect(player.control.value, correction.control.value, note.control.value),
      "Attendance status saved.",
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
    label: "Review reward correction",
    quiet: true,
    action: "reward",
    disabled: !firstKey || model.lock.locked,
    onClick: () => {
      const numericAmount = Number(amount.control.value);
      if (!Number.isFinite(numericAmount) || numericAmount === 0) {
        status.textContent = "Enter a non-zero reward correction first.";
        amount.control.focus();
        return;
      }
      const student = selectedStudentLabel(player.control);
      const confirm = AdminConfirmDialog({
        title: "Confirm attendance reward correction",
        message: `Apply ${displaySigned(numericAmount)} to ${student}'s Checking account?`,
        detail: "The amount is posted in the student's active-country currency and recorded in Activity History.",
        confirmLabel: "Apply reward correction",
        tone: "danger",
        failureMessage: "The reward correction could not be applied.",
        async onConfirm() {
          const result = await run(() => onAdjustReward(player.control.value, {
            amount: amount.control.value,
            note: note.control.value,
          }), "Reward correction saved.");
          return result?.ok === true;
        },
      });
      void confirm.open(rewardButton).finally(() => confirm.destroy());
    },
  });

  return createElement("section", {
    className: "admin-attendance-route__actions-panel",
    attrs: { "aria-label": "Attendance record actions" },
    children: [
      createElement("div", {
        className: "admin-attendance-route__section-heading",
        children: [createElement("div", { children: [
          createElement("h2", { text: "Attendance tools" }),
          createElement("p", { text: "Update attendance, add a teacher note, or correct an attendance reward." }),
        ] })],
      }),
      createElement("div", {
        className: "admin-attendance-route__action-grid",
        children: [player.element, correction.element, note.element, amount.element],
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
  const reason = field({
    label: model.lock.locked ? "Unlock note" : "Lock reason",
    name: "lockReason",
    placeholder: "Optional teacher note",
  });
  const status = createElement("div", {
    className: "admin-attendance-route__action-status",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const toggle = button({
    label: model.lock.locked ? "Unlock attendance" : "Lock attendance for today",
    icon: model.lock.locked ? "refresh" : "warning",
    tone: model.lock.locked ? null : "danger",
    action: model.lock.locked ? "unlock-day" : "lock-day",
    onClick: () => {
      const locking = !model.lock.locked;
      const note = reason.control.value.trim();
      const confirm = AdminConfirmDialog({
        title: locking ? "Lock attendance for today?" : "Unlock attendance?",
        message: locking
          ? "Locking prevents further attendance changes until a teacher unlocks the day."
          : "Unlocking allows attendance changes again.",
        detail: note || "No teacher note entered.",
        confirmLabel: locking ? "Lock attendance" : "Unlock attendance",
        tone: locking ? "danger" : null,
        failureMessage: "The attendance lock could not be changed.",
        async onConfirm() {
          status.textContent = locking ? "Locking…" : "Unlocking…";
          const result = await onSetLocked(locking, note);
          status.textContent = result?.ok === true ? "Attendance lock updated." : result?.error?.userMessage || "The attendance lock could not be changed.";
          return result?.ok === true;
        },
      });
      void confirm.open(toggle).finally(() => confirm.destroy());
    },
  });
  return createElement("section", {
    className: "admin-attendance-route__lock-panel",
    attrs: { "aria-label": "Attendance day lock" },
    children: [
      createElement("div", { children: [
        createElement("strong", { text: model.lock.locked ? "Attendance locked" : "Attendance open" }),
        createElement("p", { text: model.lock.reason || (model.lock.locked ? "Attendance changes are paused until a teacher unlocks the day." : "Attendance changes are currently available.") }),
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
      message: "Attendance will appear here when the current simulation has active students or records for the day.",
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
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing attendance data…"],
        }));
      }
      route.append(content);
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Classroom",
    title: "Attendance",
    description: "Take attendance, correct attendance records, add teacher notes, and review attendance reward corrections for the current simulation.",
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
