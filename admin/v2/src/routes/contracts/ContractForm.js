import {
  AdminField,
  AdminValidationSummary,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";

const COUNTRY_CODE_PATTERN = /^[A-Z0-9_-]{2,24}$/;

function field(options) {
  return AdminField({ autocomplete: "off", ...options });
}

function localDateTimeToIso(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
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

/** Contract creation form restricted to fields accepted by normalizeContractCreate. */
export function ContractForm({
  onCancel = () => {},
  onSubmit = async () => ({ ok: false }),
} = {}) {
  const fields = {
    title: field({ name: "title", label: "Title", required: true, placeholder: "e.g. Market Evidence Review" }),
    description: field({ name: "description", label: "Objective", type: "textarea", required: true, hint: "What the student is expected to accomplish." }),
    instructions: field({ name: "instructions", label: "Instructions", type: "textarea", required: true, hint: "What the student must do." }),
    category: field({ name: "category", label: "Category", value: "general", placeholder: "general" }),
    status: field({
      name: "status",
      label: "When should students see it?",
      type: "select",
      value: "draft",
      options: [
        { value: "draft", label: "Keep as draft" },
        { value: "active", label: "Publish now" },
        { value: "scheduled", label: "Schedule publication" },
      ],
    }),
    scheduledAt: field({ name: "scheduledAt", label: "Scheduled publish time", type: "datetime-local", disabled: true, hint: "Required only when scheduling publication." }),
    visibility: field({
      name: "visibility",
      label: "Who can see it?",
      type: "select",
      value: "public",
      options: [
        { value: "public", label: "All students" },
        { value: "targeted", label: "Selected countries" },
        { value: "hidden", label: "Hidden" },
      ],
    }),
    countryCodes: field({ name: "countryCodes", label: "Target countries", placeholder: "NORTHREACH, YRETHIA", disabled: true, hint: "Separate country codes with commas." }),
    completionMode: field({
      name: "completionMode",
      label: "How is completion checked?",
      type: "select",
      value: "manual_review",
      options: [
        { value: "manual_review", label: "Teacher review" },
        { value: "auto_check", label: "Automatic check" },
        { value: "attendance_scan", label: "Attendance check" },
        { value: "purchase_check", label: "Store purchase" },
        { value: "stock_trade_check", label: "Stock trade" },
        { value: "story_flag_check", label: "Story milestone" },
      ],
    }),
    deadlineAt: field({ name: "deadlineAt", label: "Due time", type: "datetime-local" }),
    expiresAt: field({ name: "expiresAt", label: "Expiration time", type: "datetime-local", hint: "Optional. Students can no longer complete it after this time." }),
    requirementsText: field({ name: "requirementsText", label: "Evidence / submission requirements", type: "textarea", required: true, hint: "What students must submit or satisfy." }),
    rewardAmount: field({
      name: "rewardAmount",
      label: "Money reward",
      type: "number",
      value: "",
      placeholder: "0",
      hint: "Paid to each student's Checking account in that student's active-country currency.",
    }),
    difficulty: field({
      name: "difficulty",
      label: "Difficulty",
      type: "select",
      value: "",
      options: [
        { value: "", label: "Not specified" },
        { value: "Introductory", label: "Introductory" },
        { value: "Intermediate", label: "Intermediate" },
        { value: "Advanced", label: "Advanced" },
      ],
    }),
    reviewNote: field({ name: "reviewNote", label: "Teacher note", type: "textarea", hint: "Private guidance for teachers reviewing this contract." }),
  };

  const validation = AdminValidationSummary({
    title: "Review the contract fields",
    errors: [],
  });
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
    const scheduledAt = localDateTimeToIso(fields.scheduledAt.getValue());
    const visibility = fields.visibility.getValue();
    const codes = countryCodes(fields.countryCodes.getValue());
    const deadlineAt = localDateTimeToIso(fields.deadlineAt.getValue());
    const expiresAt = localDateTimeToIso(fields.expiresAt.getValue());
    const rewardText = fields.rewardAmount.getValue().trim();
    const rewardAmount = rewardText === "" ? 0 : Number(rewardText);

    if (!title) {
      fields.title.setError("Enter a contract title.");
      errors.push({ field: "title", fieldId: fields.title.control.id, label: "Title", message: "Contract title is required." });
    }
    if (!objective) {
      fields.description.setError("Enter the contract objective.");
      errors.push({ field: "description", fieldId: fields.description.control.id, label: "Objective", message: "Objective is required." });
    }
    if (!instructions) {
      fields.instructions.setError("Enter contract instructions.");
      errors.push({ field: "instructions", fieldId: fields.instructions.control.id, label: "Instructions", message: "Instructions are required." });
    }
    if (!requirementsText) {
      fields.requirementsText.setError("Enter the required evidence or submission requirements.");
      errors.push({ field: "requirementsText", fieldId: fields.requirementsText.control.id, label: "Evidence / submission requirements", message: "Evidence or submission requirements are required." });
    }
    if (status === "scheduled" && !scheduledAt) {
      fields.scheduledAt.setError("Choose a valid scheduled publish time.");
      errors.push({ field: "scheduledAt", fieldId: fields.scheduledAt.control.id, label: "Scheduled publish time", message: "Scheduled contracts need a publish time." });
    }
    if (visibility === "targeted" && codes.length === 0) {
      fields.countryCodes.setError("Enter at least one target country code.");
      errors.push({ field: "countryCodes", fieldId: fields.countryCodes.control.id, label: "Target countries", message: "Targeted contracts need at least one target country." });
    }
    if (codes.some((code) => !COUNTRY_CODE_PATTERN.test(code))) {
      fields.countryCodes.setError("Use letters, numbers, underscores, or hyphens only.");
      errors.push({ field: "countryCodes", fieldId: fields.countryCodes.control.id, label: "Target countries", message: "One or more target country codes are invalid." });
    }
    if (fields.deadlineAt.getValue() && !deadlineAt) {
      fields.deadlineAt.setError("Choose a valid due time.");
      errors.push({ field: "deadlineAt", fieldId: fields.deadlineAt.control.id, label: "Due time", message: "The due time is invalid." });
    }
    if (fields.expiresAt.getValue() && !expiresAt) {
      fields.expiresAt.setError("Choose a valid expiration time.");
      errors.push({ field: "expiresAt", fieldId: fields.expiresAt.control.id, label: "Expiration time", message: "The expiration time is invalid." });
    }
    if (deadlineAt && expiresAt && Date.parse(expiresAt) < Date.parse(deadlineAt)) {
      fields.expiresAt.setError("Expiration cannot be before the due time.");
      errors.push({ field: "expiresAt", fieldId: fields.expiresAt.control.id, label: "Expiration time", message: "Expiration must be at or after the due time." });
    }
    if (!Number.isFinite(rewardAmount) || rewardAmount < 0) {
      fields.rewardAmount.setError("Enter zero or a positive reward amount.");
      errors.push({ field: "rewardAmount", fieldId: fields.rewardAmount.control.id, label: "Money reward", message: "Money reward must be zero or greater." });
    }

    if (errors.length) {
      validation.setErrors(errors);
      validation.element.hidden = false;
      return null;
    }

    const difficulty = fields.difficulty.getValue();
    const reviewNote = fields.reviewNote.getValue().trim();
    const payload = {
      title,
      description: objective,
      instructions,
      category: fields.category.getValue().trim() || "general",
      status,
      visibility,
      completionMode: fields.completionMode.getValue(),
      targetingPayload: visibility === "public"
        ? { allPlayers: true }
        : { allPlayers: false, ...(codes.length ? { countryCodes: codes } : {}) },
      requirementsPayload: requirementsText ? { manualText: requirementsText } : {},
      // `cash` remains the Admin API compatibility input key for now. The
      // canonical reward issuer normalizes it to Checking and resolves the
      // receiving student's local currency. Do not expose account/currency
      // routing choices in the teacher form.
      rewardPayload: rewardAmount > 0
        ? { cash: { amount: Math.round(rewardAmount * 100) / 100 } }
        : {},
      metadata: {
        ...(difficulty ? { difficulty } : {}),
        ...(reviewNote ? { reviewNote } : {}),
      },
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(deadlineAt ? { deadlineAt } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    };
    return payload;
  }

  fields.status.control.addEventListener("change", () => {
    const scheduled = fields.status.getValue() === "scheduled";
    fields.scheduledAt.setDisabled(!scheduled);
    if (!scheduled) fields.scheduledAt.setValue("");
  });
  fields.visibility.control.addEventListener("change", () => {
    const targeted = fields.visibility.getValue() === "targeted";
    fields.countryCodes.setDisabled(!targeted);
    if (!targeted) fields.countryCodes.setValue("");
  });

  const groups = [
    ["Basics", fields.title, fields.description, fields.instructions, fields.category],
    ["Availability", fields.status, fields.scheduledAt, fields.visibility, fields.countryCodes, fields.completionMode, fields.deadlineAt, fields.expiresAt],
    ["Requirements & reward", fields.requirementsText, fields.rewardAmount],
    ["Teacher guidance", fields.difficulty, fields.reviewNote],
  ].map(([legend, ...entries]) => createElement("fieldset", {
    className: "admin-contract-form__group",
    children: [
      createElement("legend", { text: legend }),
      createElement("div", {
        className: "admin-contract-form__grid",
        children: entries.map((entry) => entry.element),
      }),
    ],
  }));

  const element = createElement("form", {
    className: "admin-contract-form",
    attrs: { novalidate: true },
    children: [validation.element, ...groups],
  });

  const cancel = button("Cancel", { quiet: true, onClick: onCancel, action: "cancel" });
  const submit = button("Create Contract", {
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
          validation.setErrors(serverErrors);
          validation.element.hidden = false;
        }
      }
    },
  });
  element.addEventListener("submit", (event) => {
    event.preventDefault();
    submit.click();
  });

  const footer = createElement("div", {
    className: "admin-contract-form__footer",
    children: [cancel, submit],
  });

  return { element, footer, fields, validate, focus: () => fields.title.focus() };
}
