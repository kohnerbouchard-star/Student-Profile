import {
  AdminConfirmDialog,
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
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

function button({ label, icon = null, quiet = false, disabled = false, disabledReason = "", tone = null, onClick, action }) {
  const element = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: {
      type: "button",
      disabled,
      title: disabled && disabledReason ? disabledReason : null,
      "aria-describedby": disabled && disabledReason ? `${action}-disabled-reason` : null,
    },
    dataset: { attendanceAction: action, tone },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  if (typeof onClick === "function") element.addEventListener("click", onClick);
  if (!disabledReason) return element;
  return createElement("span", {
    className: "admin-action-with-reason",
    children: [
      element,
      createElement("small", {
        className: "admin-action-with-reason__message",
        attrs: { id: `${action}-disabled-reason` },
        text: disabledReason,
      }),
    ],
  });
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
    submit.disabled = true;
    input.disabled = true;
    try {
      await onScan(value);
    } finally {
      if (input.isConnected) input.disabled = !scanner.accepting || model.lock.locked;
      if (submit.isConnected) submit.disabled = !scanner.accepting || model.lock.locked;
    }
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
            createElement("p", { text: model.lock.locked ? "This attendance day is locked." : "Scan or enter an existing player credential. Enter submits from the keyboard." }),
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

function selectedPlayerCard(row) {
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

function playerActions({ model, onCorrect, onSaveNote, onAdjustReward }) {
  const player = AdminField({
    name: "attendance-player",
    label: "Player",
    type: "select",
    value: "",
    options: [
      { value: "", label: "Select a player", disabled: true },
      ...model.rows.map((row) => ({
        value: row.rowKey,
        label: `${row.displayName}${row.rosterLabel ? ` · ${row.rosterLabel}` : ""}`,
      })),
    ],
    hint: "Player selection is required. No roster entry is preselected.",
  });
  const correction = AdminField({
    name: "attendance-correction",
    label: "Correction",
    type: "select",
    value: "present",
    options: CORRECTION_OPTIONS.map((value) => ({ value, label: titleCase(value) })),
  });
  const correctionNote = AdminField({
    name: "attendance-correction-note",
    label: "Correction reason",
    type: "textarea",
    rows: 3,
    maxLength: 1000,
    placeholder: "Why is this attendance state being corrected?",
  });
  const adminNote = AdminField({
    name: "attendance-admin-note",
    label: "Administrative note",
    type: "textarea",
    rows: 3,
    maxLength: 1000,
    placeholder: "Note stored with this attendance record",
  });
  const amount = AdminField({
    name: "attendance-reward-amount",
    label: "Reward adjustment",
    type: "number",
    step: 0.01,
    placeholder: "e.g. 1 or -1",
    hint: "Positive adds; negative subtracts.",
  });
  const rewardNote = AdminField({
    name: "attendance-reward-note",
    label: "Reward reason",
    type: "textarea",
    rows: 3,
    maxLength: 1000,
    placeholder: "Why is this reward being adjusted?",
  });
  const selectedHost = createElement("div");
  const status = createElement("div", {
    className: "admin-attendance-route__action-status",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const controls = [player, correction, correctionNote, adminNote, amount, rewardNote];
  let busy = false;

  const actionButtons = [];
  function selectedRow() {
    return model.rows.find((row) => row.rowKey === player.getValue()) || null;
  }
  function refreshSelection() {
    selectedHost.replaceChildren(selectedPlayerCard(selectedRow()));
    updateButtons();
  }
  function updateButtons() {
    const selected = Boolean(selectedRow());
    const unavailable = busy || model.lock.locked || !selected;
    actionButtons.forEach((entry) => {
      entry.element.disabled = unavailable;
      entry.element.title = !selected
        ? "Select a player first."
        : model.lock.locked ? "Unlock the attendance day before making changes." : "";
    });
  }
  function setBusy(next) {
    busy = Boolean(next);
    controls.forEach((field) => field.setDisabled(busy));
    updateButtons();
  }
  async function run(action, successMessage) {
    if (busy || !selectedRow()) return;
    status.dataset.tone = "neutral";
    status.textContent = "Saving…";
    setBusy(true);
    try {
      const result = await action();
      const ok = result?.ok === true;
      status.dataset.tone = ok ? "success" : "error";
      status.textContent = ok ? successMessage : result?.error?.userMessage || "The action could not be completed.";
    } finally {
      setBusy(false);
    }
  }

  function actionButton(label, action, handler, quiet = false) {
    const element = createElement("button", {
      className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
      attrs: { type: "button", disabled: true },
      dataset: { attendanceAction: action },
      text: label,
    });
    element.addEventListener("click", handler);
    actionButtons.push({ element });
    return element;
  }

  const correctionButton = actionButton("Apply correction", "correct", () => run(
    () => onCorrect(player.getValue(), correction.getValue(), correctionNote.getValue()),
    "Attendance correction saved.",
  ));
  const noteButton = actionButton("Save note", "note", () => run(
    () => onSaveNote(player.getValue(), adminNote.getValue()),
    "Administrative note saved.",
  ), true);
  const rewardButton = actionButton("Adjust reward", "reward", () => {
    const numericAmount = Number(amount.getValue());
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
      amount.setError("Enter a non-zero reward adjustment.");
      amount.focus();
      return;
    }
    amount.setError("");
    void run(
      () => onAdjustReward(player.getValue(), { amount: amount.getValue(), note: rewardNote.getValue() }),
      "Reward adjustment saved.",
    );
  }, true);

  player.control.addEventListener("change", refreshSelection);
  refreshSelection();

  return createElement("section", {
    className: "admin-attendance-route__actions-panel",
    attrs: { "aria-label": "Attendance record actions" },
    children: [
      createElement("div", {
        className: "admin-attendance-route__section-heading",
        children: [createElement("div", { children: [
          createElement("h2", { text: "Record actions" }),
          createElement("p", { text: "Choose the player first, then use the action-specific fields below. No player is selected automatically." }),
        ] })],
      }),
      player.element,
      selectedHost,
      createElement("div", {
        className: "admin-attendance-route__action-workflows",
        children: [
          createElement("fieldset", { className: "admin-attendance-route__action-workflow", children: [
            createElement("legend", { text: "Correct attendance" }),
            correction.element,
            correctionNote.element,
            correctionButton,
          ] }),
          createElement("fieldset", { className: "admin-attendance-route__action-workflow", children: [
            createElement("legend", { text: "Record note" }),
            adminNote.element,
            noteButton,
          ] }),
          createElement("fieldset", { className: "admin-attendance-route__action-workflow", children: [
            createElement("legend", { text: "Adjust reward" }),
            amount.element,
            rewardNote.element,
            rewardButton,
          ] }),
        ],
      }),
      status,
    ],
  });
}

function lockPanel({ model, onSetLocked }) {
  const reason = AdminField({
    name: "attendance-lock-reason",
    label: model.lock.locked ? "Unlock note" : "Lock reason",
    type: "textarea",
    rows: 2,
    maxLength: 1000,
    placeholder: "Optional reason",
  });
  const status = createElement("div", {
    className: "admin-attendance-route__action-status",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const confirm = AdminConfirmDialog({
    title: "Lock attendance day?",
    message: `Lock attendance for ${model.attendanceDate}?`,
    detail: "New scans and record mutations will be blocked until the day is unlocked.",
    confirmLabel: "Lock day",
    tone: "danger",
    async onConfirm() {
      const result = await onSetLocked(true, reason.getValue());
      if (result?.ok !== true) throw new Error("ATTENDANCE_LOCK_FAILED");
      return true;
    },
  });
  const toggle = createElement("button", {
    className: "admin-button",
    dataset: { tone: model.lock.locked ? "neutral" : "danger", attendanceAction: model.lock.locked ? "unlock-day" : "lock-day" },
    attrs: { type: "button" },
    children: [AdminIcon({ name: model.lock.locked ? "refresh" : "warning", size: 17 }), model.lock.locked ? "Unlock day" : "Lock day"],
  });
  toggle.addEventListener("click", async (event) => {
    status.textContent = "";
    if (!model.lock.locked) {
      confirm.setDetail([
        "New scans and record mutations will be blocked until the day is unlocked.",
        reason.getValue().trim() ? `Reason: ${reason.getValue().trim()}` : null,
      ].filter(Boolean).join(" "));
      const accepted = await confirm.open(event.currentTarget);
      if (!accepted) return;
      status.textContent = "Attendance day locked.";
      return;
    }
    toggle.disabled = true;
    status.textContent = "Unlocking…";
    try {
      const result = await onSetLocked(false, reason.getValue());
      status.textContent = result?.ok === true ? "Attendance day unlocked." : result?.error?.userMessage || "The day could not be unlocked.";
    } finally {
      if (toggle.isConnected) toggle.disabled = false;
    }
  });
  const root = createElement("section", {
    className: "admin-attendance-route__lock-panel",
    attrs: { "aria-label": "Attendance day lock" },
    children: [
      createElement("div", { children: [
        createElement("strong", { text: model.lock.locked ? "Day locked" : "Day open" }),
        createElement("p", { text: model.lock.reason || (model.lock.locked ? "Attendance changes are blocked until the day is unlocked." : "Attendance changes are currently available.") }),
      ] }),
      reason.element,
      toggle,
      status,
    ],
  });
  root._destroy = () => confirm.destroy();
  return root;
}

function resolvedContent({ model, scanner, onScan, onCorrect, onSaveNote, onAdjustReward, onSetLocked }) {
  const lock = lockPanel({ model, onSetLocked });
  const root = createElement("div", {
    className: "admin-attendance-route__resolved",
    children: [summary(model), scannerPanel({ model, scanner, onScan }), lock],
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
  root._destroy = () => lock._destroy?.();
  return root;
}

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
  let resolved = null;
  const refreshButton = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled: state.status === ADMIN_DATA_STATES.REFRESHING },
    children: [AdminIcon({ name: "refresh", size: 17 }), state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh"],
  });
  refreshButton.addEventListener("click", onRefresh);
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
    resolved = resolvedContent({ model: state.data, scanner, onScan, onCorrect, onSaveNote, onAdjustReward, onSetLocked });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({
        message: state.error?.userMessage || "Showing the last successful attendance roster. Refresh before making a correction.",
        retry: { label: "Retry", onClick: onRefresh },
        content: resolved,
      }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", {
          className: "admin-attendance-route__refresh-state",
          attrs: { role: "status" },
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing attendance data…"],
        }));
      }
      route.append(resolved);
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Game administration",
    title: "Attendance",
    description: "Manage today’s attendance scans, corrections, notes, rewards, and day lock for the current game.",
    actions: [refreshButton],
    content: route,
  });
  pageFrame.element.addEventListener("admin-route-intent", (event) => {
    if (event.detail?.intent === "focus-scanner") {
      queueMicrotask(() => pageFrame.element.querySelector("#adminAttendanceScannerInput:not(:disabled)")?.focus({ preventScroll: false }));
    }
  });
  return {
    ...pageFrame,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resolved?._destroy?.();
    },
  };
}
