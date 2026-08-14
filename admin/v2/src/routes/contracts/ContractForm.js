import {
  AdminField,
  AdminValidationSummary,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import {
  fromAdminDateTimeLocalValue,
  toAdminDateTimeLocalValue,
} from "../../core/date-time.js";

const COUNTRY_CODE_PATTERN = /^[A-Z0-9_-]{2,24}$/;

function field(options) {
  return AdminField({ autocomplete: "off", ...options });
}

function countryCodes(value) {
  return [...new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  )];
}

function button(label, { quiet = false, onClick, action = "" } = {}) {
  const element = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button" },
    dataset: { dialogAction: action || label.toLowerCase().replace(/\s+/g, "-") },
    text: label,
  });
  element.addEventListener("click", onClick);
  return element;
}

export function ContractForm({
  mode = "create",
  contract = null,
  onCancel = () => {},
  onSubmit = async () => ({ ok: false }),
} = {}) {
  const editing = mode === "edit";
  const advancedTargeting = editing && contract?.targetingEditable === false;
  const initialStatus = editing && ["draft", "scheduled"].includes(contract?.status) ? contract.status : "draft";
  const initialVisibility = contract?.visibility || "public";
  const fields = {
    title: field({ name: "title", label: "Title", required: true, placeholder: "e.g. Market Evidence Review", value: contract?.title || "" }),
    description: field({ name: "description", label: "Objective", type: "textarea", rows: 4, required: true, hint: "What the player is expected to accomplish.", value: contract?.description || "" }),
    instructions: field({ name: "instructions", label: "Instructions", type: "textarea", rows: 5, required: true, hint: "What the player must do.", value: contract?.instructions || "" }),
    category: field({ name: "category", label: "Category", value: contract?.category || "general", placeholder: "general" }),
    status: field({
      name: "status",
      label: editing ? "Lifecycle state" : "Initial lifecycle state",
      type: "select",
      value: initialStatus,
      options: editing
        ? [{ value: "draft", label: "Draft" }, { value: "scheduled", label: "Scheduled" }]
        : [
          { value: "draft", label: "Draft" },
          { value: "active", label: "Publish now" },
          { value: "scheduled", label: "Scheduled" },
        ],
    }),
    scheduledAt: field({
      name: "scheduledAt",
      label: "Scheduled publish time",
      type: "datetime-local",
      value: initialStatus === "scheduled" ? toAdminDateTimeLocalValue(contract?.publishedAt) : "",
      hint: "Required only for a scheduled contract. Times are interpreted in the Admin game timezone.",
    }),
    visibility: field({
      name: "visibility",
      label: "Visibility",
      type: "select",
      value: initialVisibility,
      options: [
        { value: "public", label: "Public · all players" },
        { value: "targeted", label: "Targeted" },
        { value: "hidden", label: "Hidden" },
      ],
    }),
    countryCodes: field({
      name: "countryCodes",
      label: "Target country codes",
      value: (contract?.targetCountryCodes || []).join(", "),
      placeholder: "NORTHREACH, YRETHIA",
      hint: "For Targeted visibility. Separate country codes with commas.",
    }),
    completionMode: field({
      name: "completionMode",
      label: "Completion mode",
      type: "select",
      value: contract?.completionMode || "manual_review",
      options: [
        { value: "manual_review", label: "Manual review" },
        { value: "auto_check", label: "Automatic check" },
        { value: "attendance_scan", label: "Attendance scan" },
        { value: "purchase_check", label: "Purchase check" },
        { value: "stock_trade_check", label: "Stock trade check" },
        { value: "story_flag_check", label: "Story flag check" },
      ],
    }),
    deadlineAt: field({ name: "deadlineAt", label: "Due time", type: "datetime-local", value: toAdminDateTimeLocalValue(contract?.deadlineAt) }),
    expiresAt: field({ name: "expiresAt", label: "Expiration time", type: "datetime-local", value: toAdminDateTimeLocalValue(contract?.expiresAt), hint: "Optional hard expiration after the due time." }),
    requirementsText: field({ name: "requirementsText", label: "Evidence / submission requirements", type: "textarea", rows: 4, required: true, hint: "What evidence the player must submit or satisfy.", value: contract?.requirementsText || "" }),
    rewardAmount: field({ name: "rewardAmount", label: "Cash reward", type: "number", min: 0, step: 0.01, value: contract?.reward?.cashAmount ?? "", placeholder: "0" }),
    difficulty: field({
      name: "difficulty",
      label: "Difficulty metadata",
      type: "select",
      value: contract?.metadata?.difficulty || "",
      options: [
        { value: "", label: "Not specified" },
        { value: "Introductory", label: "Introductory" },
        { value: "Intermediate", label: "Intermediate" },
        { value: "Advanced", label: "Advanced" },
      ],
    }),
    reviewNote: field({ name: "reviewNote", label: "Reviewer note", type: "textarea", rows: 3, hint: "Staff-facing guidance stored with the contract.", value: contract?.metadata?.reviewNote || "" }),
  };

  const validation = AdminValidationSummary({ title: "Review the contract fields", errors: [] });
  validation.element.hidden = true;

  function clearErrors() {
    Object.values(fields).forEach((entry) => entry.setError(""));
    validation.setErrors([]);
    validation.element.hidden = true;
  }

  function validate() {
    clearErrors();
    const errors = [];
    const title = fields.title.getValue().trim();
    const objective = fields.description.getValue().trim();
    const instructions = fields.instructions.getValue().trim();
    const requirementsText = fields.requirementsText.getValue().trim();
    const status = fields.status.getValue();
    const scheduledAt = fromAdminDateTimeLocalValue(fields.scheduledAt.getValue());
    const visibility = fields.visibility.getValue();
    const codes = countryCodes(fields.countryCodes.getValue());
    const deadlineAt = fromAdminDateTimeLocalValue(fields.deadlineAt.getValue());
    const expiresAt = fromAdminDateTimeLocalValue(fields.expiresAt.getValue());
    const rewardText = fields.rewardAmount.getValue().trim();
    const rewardAmount = rewardText === "" ? 0 : Number(rewardText);

    const addError = (fieldName, label, message) => {
      fields[fieldName].setError(message);
      errors.push({ field: fieldName, fieldId: fields[fieldName].control.id, label, message });
    };
    if (!title) addError("title", "Title", "Contract title is required.");
    if (!objective) addError("description", "Objective", "Objective is required.");
    if (!instructions) addError("instructions", "Instructions", "Instructions are required.");
    if (!requirementsText) addError("requirementsText", "Evidence / submission requirements", "Evidence or submission requirements are required.");
    if (status === "scheduled" && !scheduledAt) addError("scheduledAt", "Scheduled publish time", "Scheduled contracts need a valid publish time.");
    if (!advancedTargeting && visibility === "targeted" && codes.length === 0) addError("countryCodes", "Target country codes", "Targeted contracts need at least one target country.");
    if (codes.some((code) => !COUNTRY_CODE_PATTERN.test(code))) addError("countryCodes", "Target country codes", "Use letters, numbers, underscores, or hyphens only.");
    if (fields.deadlineAt.getValue() && !deadlineAt) addError("deadlineAt", "Due time", "The due time is invalid.");
    if (fields.expiresAt.getValue() && !expiresAt) addError("expiresAt", "Expiration time", "The expiration time is invalid.");
    if (deadlineAt && expiresAt && Date.parse(expiresAt) < Date.parse(deadlineAt)) addError("expiresAt", "Expiration time", "Expiration must be at or after the due time.");
    if (!Number.isFinite(rewardAmount) || rewardAmount < 0) addError("rewardAmount", "Cash reward", "Cash reward must be zero or greater.");

    if (errors.length) {
      validation.setErrors(errors, { focus: true });
      validation.element.hidden = false;
      return null;
    }

    const difficulty = fields.difficulty.getValue();
    const reviewNote = fields.reviewNote.getValue().trim();
    return {
      ...(editing && contract?.contractKey ? { contractKey: contract.contractKey } : {}),
      title,
      description: objective,
      instructions,
      category: fields.category.getValue().trim() || "general",
      status,
      visibility,
      completionMode: fields.completionMode.getValue(),
      ...(!advancedTargeting ? {
        targetingPayload: visibility === "public"
          ? { allPlayers: true }
          : { allPlayers: false, ...(codes.length ? { countryCodes: codes } : {}) },
      } : {}),
      requirementsPayload: requirementsText ? { manualText: requirementsText } : {},
      rewardPayload: {
        cash: rewardAmount > 0 ? { amount: Math.round(rewardAmount * 100) / 100 } : null,
      },
      metadata: {
        difficulty: difficulty || null,
        reviewNote: reviewNote || null,
      },
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(deadlineAt ? { deadlineAt } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    };
  }

  function syncConditionalFields() {
    const scheduled = fields.status.getValue() === "scheduled";
    fields.scheduledAt.element.hidden = !scheduled;
    fields.scheduledAt.control.required = scheduled;
    if (!scheduled) fields.scheduledAt.setValue("");
    const targeted = fields.visibility.getValue() === "targeted";
    fields.countryCodes.element.hidden = !targeted;
    fields.countryCodes.control.required = targeted && !advancedTargeting;
    if (!targeted) fields.countryCodes.setValue("");
  }
  if (advancedTargeting) {
    fields.visibility.setReadOnly(true, "This contract includes player, roster, or story targeting that is not safely exposed by this editor. Duplicate the contract to define a new target set.");
    fields.countryCodes.setReadOnly(true, "Country codes are shown only as context; the full targeting rule remains unchanged.");
  }
  fields.status.control.addEventListener("change", syncConditionalFields);
  fields.visibility.control.addEventListener("change", syncConditionalFields);

  const groups = [
    ["Core", fields.title, fields.description, fields.instructions, fields.category],
    ["Lifecycle", fields.status, fields.scheduledAt, fields.visibility, fields.countryCodes, fields.completionMode, fields.deadlineAt, fields.expiresAt],
    ["Requirements & reward", fields.requirementsText, fields.rewardAmount],
    ["Metadata", fields.difficulty, fields.reviewNote],
  ].map(([legend, ...entries]) => createElement("fieldset", {
    className: "admin-contract-form__group",
    children: [
      createElement("legend", { text: legend }),
      createElement("div", { className: "admin-contract-form__grid", children: entries.map((entry) => entry.element) }),
    ],
  }));

  const element = createElement("form", {
    className: "admin-contract-form",
    attrs: { novalidate: true },
    children: [validation.element, ...groups],
  });

  const cancel = button("Cancel", { quiet: true, onClick: onCancel, action: "cancel" });
  const submit = button(editing ? "Save changes" : "Create Contract", {
    action: "submit",
    async onClick() {
      const payload = validate();
      if (!payload) return;
      const result = await onSubmit(payload);
      if (result?.ok !== true && result?.error?.fieldErrors) {
        const serverErrors = Object.entries(result.error.fieldErrors).map(([fieldName, message]) => ({
          field: fieldName,
          fieldId: fields[fieldName]?.control?.id,
          label: fields[fieldName]?.label?.textContent?.replace(/Required/g, "").trim() || fieldName,
          message,
        }));
        serverErrors.forEach(({ field: fieldName, message }) => fields[fieldName]?.setError(message));
        if (serverErrors.length) {
          validation.setErrors(serverErrors, { focus: true });
          validation.element.hidden = false;
        }
      }
    },
  });
  element.addEventListener("submit", (event) => {
    event.preventDefault();
    submit.click();
  });

  const footer = createElement("div", { className: "admin-contract-form__footer", children: [cancel, submit] });
  syncConditionalFields();
  return { element, footer, fields, validate, focus: () => fields.title.focus() };
}
