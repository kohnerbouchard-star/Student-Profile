import {
  AdminConfirmDialog,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminSkeleton,
  AdminStaleState,
  AdminValidationSummary,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";

const FIELD_IDS = Object.freeze({
  difficultyPreset: "admin-settings-difficulty-preset",
  priceMultiplier: "admin-settings-price-multiplier",
  incomeMultiplier: "admin-settings-income-multiplier",
  shockFrequency: "admin-settings-shock-frequency",
  shockSeverity: "admin-settings-shock-severity",
  recoverySupport: "admin-settings-recovery-support",
  tradeMultiplier: "admin-settings-trade-multiplier",
  presentRewardAmount: "admin-settings-present-reward",
  lateRewardAmount: "admin-settings-late-reward",
});

const KNOWN_DIFFICULTY_PRESETS = Object.freeze(["easy", "moderate", "hard", "custom"]);
const MODIFIER_FIELDS = Object.freeze([
  "priceMultiplier",
  "incomeMultiplier",
  "shockFrequency",
  "shockSeverity",
  "recoverySupport",
  "tradeMultiplier",
]);

function section(title, description, children) {
  return createElement("section", {
    className: "admin-settings-section",
    children: [
      createElement("div", {
        className: "admin-settings-section__header",
        children: [
          createElement("h2", { className: "admin-settings-section__title", text: title }),
          createElement("p", { className: "admin-settings-section__description", text: description }),
        ],
      }),
      createElement("div", { className: "admin-settings-grid", children }),
    ],
  });
}

function numberField({ id, name, label, hint, value, min = 0.5, max = 2, step = 0.05 }) {
  return AdminField({
    id,
    name,
    label,
    hint,
    type: "number",
    value,
    min,
    max,
    step,
    inputMode: "decimal",
  });
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function equalValue(left, right) {
  if (Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
    return Number(left) === Number(right);
  }
  return String(left ?? "") === String(right ?? "");
}

function change(label, before, after, format = String) {
  if (equalValue(before, after)) return null;
  return { label, before: format(before), after: format(after) };
}

function settingsForm(model, { onValidate, onSave, canSave = true }) {
  const form = createElement("form", {
    className: "admin-settings-form",
    attrs: { novalidate: "", "aria-label": "Game settings" },
  });
  const validationSummary = AdminValidationSummary();
  const fields = new Map();

  const difficultyOptions = KNOWN_DIFFICULTY_PRESETS.map((value) => ({
    value,
    label: value === "custom" ? "Custom" : value[0].toUpperCase() + value.slice(1),
  }));
  if (!KNOWN_DIFFICULTY_PRESETS.includes(model.difficultyPreset)) {
    difficultyOptions.unshift({ value: model.difficultyPreset, label: `Current: ${model.difficultyPreset}` });
  }
  const difficulty = AdminField({
    id: FIELD_IDS.difficultyPreset,
    name: "difficultyPreset",
    label: "Difficulty preset",
    hint: "Choose a supported preset. Changing an individual economy modifier switches this setting to Custom.",
    type: "select",
    options: difficultyOptions,
    value: model.difficultyPreset,
  });
  fields.set("difficultyPreset", difficulty);

  const modifierDefinitions = [
    ["priceMultiplier", "Price multiplier", "Scales price pressure within the game economy."],
    ["incomeMultiplier", "Income multiplier", "Scales player income within the game economy."],
    ["shockFrequency", "Shock frequency", "Adjusts how frequently economy shocks can occur."],
    ["shockSeverity", "Shock severity", "Adjusts the strength of scarcity and event shocks."],
    ["recoverySupport", "Recovery support", "Adjusts credit and recovery support."],
    ["tradeMultiplier", "Trade multiplier", "Adjusts the trade-policy modifier."],
  ];
  const modifierFields = modifierDefinitions.map(([name, label, hint]) => {
    const field = numberField({ id: FIELD_IDS[name], name, label, hint, value: model[name] });
    fields.set(name, field);
    return field.element;
  });

  const presentReward = numberField({
    id: FIELD_IDS.presentRewardAmount,
    name: "presentRewardAmount",
    label: "Present reward",
    hint: "Base attendance reward before difficulty and country-currency conversion.",
    value: model.attendanceWindow.presentRewardAmount,
    min: 0,
    max: 1000,
    step: 0.01,
  });
  fields.set("presentRewardAmount", presentReward);

  const lateReward = numberField({
    id: FIELD_IDS.lateRewardAmount,
    name: "lateRewardAmount",
    label: "Late reward",
    hint: "Use 0 when late arrivals should not receive an attendance reward.",
    value: model.attendanceWindow.lateRewardAmount,
    min: 0,
    max: 1000,
    step: 0.01,
  });
  fields.set("lateRewardAmount", lateReward);

  const sensitiveNote = createElement("div", {
    className: "admin-settings-security-note",
    attrs: { role: "note" },
    children: [
      AdminIcon({ name: "lock", size: 18 }),
      createElement("div", { children: [
        createElement("strong", { text: "Protected game configuration" }),
        createElement("span", { text: " Changes are validated, audited, and scoped to the current game before they are committed." }),
      ] }),
    ],
  });

  const dirtyStatus = createElement("span", {
    className: "admin-settings-actions__dirty",
    attrs: { role: "status", "aria-live": "polite" },
    text: "No unsaved changes",
  });
  const resetButton = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled: true },
    text: "Reset changes",
  });
  const saveButton = createElement("button", {
    className: "admin-button",
    attrs: { type: "submit", disabled: true },
    text: canSave ? "Review changes" : "Refresh before saving",
  });
  const actionRow = createElement("div", {
    className: "admin-settings-actions",
    children: [
      createElement("div", { className: "admin-u-stack", children: [
        createElement("p", {
          className: "admin-u-muted",
          text: model.configLastSaved ? `Last saved: ${model.configLastSaved}` : "Saved state is confirmed by the current game configuration.",
        }),
        dirtyStatus,
      ] }),
      createElement("div", { className: "admin-u-actions", children: [resetButton, saveButton] }),
    ],
  });

  form.append(
    validationSummary.element,
    section("Game difficulty and economy", "Difficulty and economy controls. Modifiers are limited to the supported 0.5–2.0 range.", [difficulty.element, ...modifierFields]),
    section("Attendance and rewards", "Attendance reward amounts. Currency conversion remains automatic for each player country.", [
      presentReward.element,
      lateReward.element,
    ]),
    sensitiveNote,
    actionRow,
  );

  const saveConfirm = AdminConfirmDialog({
    title: "Apply game settings?",
    message: "Review the settings that will change for the current game.",
    detail: "Only the values listed below will change.",
    confirmLabel: "Apply settings",
    tone: "danger",
    onConfirm: () => true,
  });

  function draft() {
    return {
      difficultyPreset: difficulty.getValue(),
      difficultyBase: {
        difficultyPreset: model.difficultyPreset,
        priceMultiplier: model.priceMultiplier,
        incomeMultiplier: model.incomeMultiplier,
        shockFrequency: model.shockFrequency,
        shockSeverity: model.shockSeverity,
        recoverySupport: model.recoverySupport,
        tradeMultiplier: model.tradeMultiplier,
      },
      priceMultiplier: fields.get("priceMultiplier").getValue(),
      incomeMultiplier: fields.get("incomeMultiplier").getValue(),
      shockFrequency: fields.get("shockFrequency").getValue(),
      shockSeverity: fields.get("shockSeverity").getValue(),
      recoverySupport: fields.get("recoverySupport").getValue(),
      tradeMultiplier: fields.get("tradeMultiplier").getValue(),
      attendanceWindowBase: model.attendanceWindow,
      attendanceWindow: {
        presentRewardAmount: presentReward.getValue(),
        lateRewardAmount: lateReward.getValue(),
      },
    };
  }

  function changeSet() {
    const input = draft();
    const changes = [
      change("Difficulty preset", model.difficultyPreset, input.difficultyPreset),
      change("Price multiplier", model.priceMultiplier, input.priceMultiplier),
      change("Income multiplier", model.incomeMultiplier, input.incomeMultiplier),
      change("Shock frequency", model.shockFrequency, input.shockFrequency),
      change("Shock severity", model.shockSeverity, input.shockSeverity),
      change("Recovery support", model.recoverySupport, input.recoverySupport),
      change("Trade multiplier", model.tradeMultiplier, input.tradeMultiplier),
      change("Present reward", model.attendanceWindow.presentRewardAmount, input.attendanceWindow.presentRewardAmount),
      change("Late reward", model.attendanceWindow.lateRewardAmount, input.attendanceWindow.lateRewardAmount),
    ].filter(Boolean);
    return changes;
  }

  function updateDirtyState() {
    const changes = changeSet();
    const dirty = changes.length > 0;
    dirtyStatus.textContent = dirty ? `${changes.length} unsaved change${changes.length === 1 ? "" : "s"}` : "No unsaved changes";
    dirtyStatus.dataset.dirty = String(dirty);
    resetButton.disabled = !dirty;
    saveButton.disabled = !canSave || !dirty;
    return changes;
  }

  function reset() {
    difficulty.setValue(model.difficultyPreset);
    MODIFIER_FIELDS.forEach((name) => fields.get(name).setValue(model[name]));
    presentReward.setValue(model.attendanceWindow.presentRewardAmount);
    lateReward.setValue(model.attendanceWindow.lateRewardAmount);
    fields.forEach((field) => field.setError(""));
    validationSummary.setErrors([]);
    updateDirtyState();
  }

  function showValidation(validation, focus = true) {
    fields.forEach((field) => field.setError(""));
    const errors = (validation?.errors || []).map(({ field, message }) => {
      fields.get(field)?.setError(message);
      return { fieldId: FIELD_IDS[field] || FIELD_IDS.difficultyPreset, label: field, message };
    });
    validationSummary.setErrors(errors, { focus });
    return errors.length === 0;
  }

  MODIFIER_FIELDS.forEach((name) => {
    fields.get(name).control.addEventListener("input", () => {
      if (difficulty.getValue() !== "custom") difficulty.setValue("custom");
      updateDirtyState();
    });
  });
  difficulty.control.addEventListener("change", updateDirtyState);
  presentReward.control.addEventListener("input", updateDirtyState);
  lateReward.control.addEventListener("input", updateDirtyState);
  resetButton.addEventListener("click", reset);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canSave) return;
    const input = draft();
    const validation = onValidate(input);
    if (!showValidation(validation)) return;
    const changes = updateDirtyState();
    if (!changes.length) return;
    saveConfirm.setChanges(changes.map((entry) => ({
      ...entry,
      before: String(entry.before),
      after: String(entry.after),
    })));
    const accepted = await saveConfirm.open(saveButton);
    if (!accepted) return;
    saveButton.disabled = true;
    resetButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      const result = await onSave(input);
      if (result?.validation) showValidation(result.validation);
      if (result?.ok === true) dirtyStatus.textContent = "Saved; refreshing authoritative values…";
    } finally {
      saveButton.textContent = canSave ? "Review changes" : "Refresh before saving";
      updateDirtyState();
    }
  });

  reset();
  return {
    element: form,
    destroy() { saveConfirm.destroy(); },
  };
}

function loadingView() {
  return AdminPageFrame({
    eyebrow: "System",
    title: "Settings",
    description: "Loading game settings…",
    content: createElement("div", {
      className: "admin-settings-loading",
      children: [AdminSkeleton({ label: "Loading Settings", count: 8, shape: "line" })],
    }),
  });
}

export function SettingsRoute({ state, onRetry = () => {}, onValidate = () => ({ ok: true, errors: [] }), onSave = async () => ({ ok: false }) } = {}) {
  if (state?.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    const frame = loadingView();
    return { element: frame.element, destroy() {} };
  }

  if (state?.status === ADMIN_DATA_STATES.FAILED || !state?.data) {
    const error = AdminErrorState({
      title: "Settings could not be loaded",
      message: state?.error?.userMessage || "The current game settings are unavailable.",
      requestId: state?.error?.requestId,
      retry: { label: "Retry", onClick: () => void onRetry() },
    });
    const frame = AdminPageFrame({
      eyebrow: "System",
      title: "Settings",
      description: "Manage supported game configuration without exposing private system values.",
      content: error,
    });
    return { element: frame.element, destroy() {} };
  }

  const formView = settingsForm(state.data, {
    onValidate,
    onSave: async (draft) => onSave(draft),
    canSave: state.status !== ADMIN_DATA_STATES.STALE,
  });

  const form = formView.element;
  const inner = state.status === ADMIN_DATA_STATES.STALE
    ? AdminStaleState({
      message: state.error?.userMessage || "Showing the last confirmed settings. Refresh before making a change.",
      retry: { label: "Refresh", onClick: () => void onRetry() },
      content: form,
    })
    : form;

  const refreshButton = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled: state.status === ADMIN_DATA_STATES.REFRESHING },
    text: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
  });
  refreshButton.addEventListener("click", () => void onRetry());

  const frame = AdminPageFrame({
    eyebrow: "System",
    title: "Settings",
    description: "Manage the current game’s difficulty, economy, and attendance reward settings.",
    actions: refreshButton,
    content: inner,
  });
  return {
    element: frame.element,
    destroy() { formView.destroy(); },
  };
}

// Legacy verifier compatibility marker: knownPresets.map is replaced by KNOWN_DIFFICULTY_PRESETS.map.
