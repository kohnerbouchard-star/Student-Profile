import {
  AdminConfirmDialog,
  AdminErrorState,
  AdminField,
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
  const field = AdminField({ id, name, label, hint, type: "number", value });
  field.control.setAttribute("min", String(min));
  field.control.setAttribute("max", String(max));
  field.control.setAttribute("step", String(step));
  field.control.setAttribute("inputmode", "decimal");
  return field;
}

function settingsForm(model, { onValidate, onSave, canSave = true }) {
  const form = createElement("form", {
    className: "admin-settings-form",
    attrs: { novalidate: "", "aria-label": "Game settings" },
  });
  const validationSummary = AdminValidationSummary();
  const fields = new Map();

  const knownPresets = ["easy", "moderate", "hard", "insane", "custom"];
  const difficultyOptions = knownDifficultyPresets.map((value) => ({
    value,
    label: value === "custom" ? "Custom" : value[0].toUpperCase() + value.slice(1),
  }));
  if (!knownDifficultyPresets.includes(model.difficultyPreset)) {
    difficultyOptions.unshift({ value: model.difficultyPreset, label: `Current: ${model.difficultyPreset}` });
  }
  const difficulty = AdminField({
    id: FIELD_IDS.difficultyPreset,
    name: "difficultyPreset",
    label: "Difficulty preset",
    hint: "Choose an existing authoritative preset. Editing any modifier below saves the policy as Custom.",
    type: "select",
    options: difficultyOptions,
    value: model.difficultyPreset,
  });
  fields.set("difficultyPreset", difficulty);

  const modifierDefinitions = [
    ["priceMultiplier", "Price multiplier", "Scales price pressure within the authoritative difficulty policy."],
    ["incomeMultiplier", "Income multiplier", "Scales income within the current difficulty policy."],
    ["shockFrequency", "Shock frequency", "Adjusts event-volatility frequency."],
    ["shockSeverity", "Shock severity", "Adjusts scarcity/event severity."],
    ["recoverySupport", "Recovery support", "Adjusts the current credit/recovery support modifier."],
    ["tradeMultiplier", "Trade multiplier", "Adjusts the current trade policy modifier."],
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
    hint: "Base amount awarded for an on-time attendance scan before difficulty and country conversion.",
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
    hint: "Set this to 0.00 when late arrivals should not receive a reward.",
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
      createElement("strong", { text: "Protected mutation" }),
      createElement("span", { text: " Saving uses the existing authenticated Admin BFF with MFA/AAL2, CSRF, game scope, permission, rate-limit, audit, and idempotency enforcement." }),
    ],
  });

  const saveButton = createElement("button", {
    className: "admin-button",
    attrs: { type: "submit", disabled: !canSave },
    text: canSave ? "Review and save" : "Refresh before saving",
  });
  const actionRow = createElement("div", {
    className: "admin-settings-actions",
    children: [
      createElement("p", {
        className: "admin-u-muted",
        text: model.configLastSaved ? `Last saved: ${model.configLastSaved}` : "Saved state is confirmed by the authoritative read path.",
      }),
      saveButton,
    ],
  });

  form.append(
    validationSummary.element,
    section("Game difficulty and economy", "Current authoritative difficulty-policy controls. Every modifier is limited to the server-supported 0.5–2.0 range.", [difficulty.element, ...modifierFields]),
    section("Attendance and rewards", "Supported reward amounts from the legacy Settings surface. Payout currency remains player-country based and difficulty-income adjustment remains automatic.", [
      presentReward.element,
      lateReward.element,
    ]),
    sensitiveNote,
    actionRow,
  );

  const saveConfirm = AdminConfirmDialog({
    title: "Apply game settings?",
    message: "This updates the authoritative settings for the current game.",
    detail: "Changes can affect prices, income, simulation shocks, trading, and attendance rewards.",
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

  function showValidation(validation, focus = true) {
    fields.forEach((field) => field.setError(""));
    const errors = (validation?.errors || []).map(({ field, message }) => {
      fields.get(field)?.setError(message);
      return { fieldId: FIELD_IDS[field] || FIELD_IDS.difficultyPreset, label: field, message };
    });
    validationSummary.setErrors(errors, { focus });
    return errors.length === 0;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canSave) return;
    const input = draft();
    const validation = onValidate(input);
    if (!showValidation(validation)) return;
    const accepted = await saveConfirm.open(saveButton);
    if (!accepted) return;
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      const result = await onSave(input);
      if (result?.validation) showValidation(result.validation);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = canSave ? "Review and save" : "Refresh before saving";
    }
  });

  return {
    element: form,
    destroy() { saveConfirm.destroy(); },
  };
}

function loadingView() {
  return AdminPageFrame({
    eyebrow: "System",
    title: "Settings",
    description: "Loading authoritative game settings…",
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
      message: state?.error?.userMessage || "The authoritative game settings are unavailable.",
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

  let inner;
  const formView = settingsForm(state.data, {
    onValidate,
    onSave: async (draft) => onSave(draft),
    canSave: state.status !== ADMIN_DATA_STATES.STALE,
  });

  const form = formView.element;
  inner = form;
  if (state.status === ADMIN_DATA_STATES.STALE) {
    inner = AdminStaleState({
      message: state.error?.userMessage || "Showing the last confirmed settings while refresh is unavailable.",
      retry: { label: "Refresh", onClick: () => void onRetry() },
      content: form,
    });
  }

  const refreshButton = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled: state.status === ADMIN_DATA_STATES.REFRESHING },
    text: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
  });
  refreshButton.addEventListener("click", () => void onRetry());

  const frame = AdminPageFrame({
    eyebrow: "System",
    title: "Settings",
    description: "Manage the current game’s supported difficulty, economy, and attendance reward settings.",
    actions: refreshButton,
    content: inner,
  });
  return {
    element: frame.element,
    destroy() { formView.destroy(); },
  };
}
