import {
  AdminField,
  AdminValidationSummary,
} from "../../components/index.js";
import { createElement, createId } from "../../components/dom.js";

const PLAYER_IDENTIFIER_PATTERN = /^[A-Z0-9:_-]+$/;
const ACCESS_CODE_PATTERN = /^[A-Z0-9-]+$/;

function normalizedCredential(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function actionButton(label, { quiet = false, action = "submit" } = {}) {
  return createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: action === "submit" ? "submit" : "button" },
    dataset: { dialogAction: action },
    text: label,
  });
}

function createFormShell({ fields, submitLabel, onCancel, onSubmit, validate }) {
  const summary = AdminValidationSummary();
  const form = createElement("form", {
    className: "admin-players-form",
    attrs: { id: createId("admin-players-form"), novalidate: true },
  });
  const grid = createElement("div", {
    className: "admin-players-form__grid",
    children: fields.map((field) => field.element),
  });
  form.append(summary.element, grid);

  const cancel = actionButton("Cancel", { quiet: true, action: "cancel" });
  const submit = actionButton(submitLabel, { action: "submit" });
  submit.setAttribute("form", form.id);
  const footer = createElement("div", {
    className: "admin-players-form__actions",
    children: [cancel, submit],
  });

  let destroyed = false;
  let busy = false;

  function setBusy(nextBusy) {
    busy = Boolean(nextBusy);
    fields.forEach((field) => field.setDisabled(busy));
    cancel.disabled = busy;
    submit.disabled = busy;
    submit.textContent = busy ? "Saving…" : submitLabel;
    form.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function clearErrors() {
    fields.forEach((field) => field.setError(""));
    summary.setErrors([]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy || destroyed) return;
    clearErrors();
    const result = validate();
    if (result.errors.length) {
      result.errors.forEach(({ field, message }) => field.setError(message));
      summary.setErrors(result.errors.map(({ field, label, message }) => ({
        fieldId: field.control.id,
        label,
        message,
      })), { focus: true });
      return;
    }

    setBusy(true);
    try {
      const response = await onSubmit(result.value);
      if (response?.ok !== true) {
        setBusy(false);
      }
    } catch (_error) {
      setBusy(false);
    }
  }

  function handleCancel() {
    if (!busy && !destroyed) onCancel();
  }

  form.addEventListener("submit", handleSubmit);
  cancel.addEventListener("click", handleCancel);

  return {
    element: form,
    footer,
    fields,
    setBusy,
    destroy() {
      destroyed = true;
      form.removeEventListener("submit", handleSubmit);
      cancel.removeEventListener("click", handleCancel);
    },
  };
}

export function CreatePlayerForm({
  onCancel = () => {},
  onSubmit = async () => ({ ok: false }),
} = {}) {
  const displayName = AdminField({
    name: "displayName",
    label: "Player name",
    required: true,
    autocomplete: "off",
    hint: "Shown in the game roster and Player Terminal.",
  });
  const rosterLabel = AdminField({
    name: "rosterLabel",
    label: "Roster label",
    autocomplete: "off",
    hint: "Optional classroom-facing label.",
  });
  const playerIdentifier = AdminField({
    name: "playerIdentifier",
    label: "Player ID / RFID card",
    required: true,
    autocomplete: "off",
    hint: "Letters, numbers, colons, underscores, and hyphens. Internal ownership UUIDs are never used here.",
  });
  const accessCode = AdminField({
    name: "accessCode",
    label: "Access Code",
    type: "password",
    required: true,
    autocomplete: "new-password",
    hint: "Letters, numbers, and hyphens. The code is stored as secure credential material and cannot be displayed later.",
  });

  return createFormShell({
    fields: [displayName, rosterLabel, playerIdentifier, accessCode],
    submitLabel: "Create Player",
    onCancel,
    onSubmit,
    validate() {
      const errors = [];
      const name = displayName.getValue().trim();
      const identifier = normalizedCredential(playerIdentifier.getValue());
      const code = normalizedCredential(accessCode.getValue());
      if (!name) errors.push({ field: displayName, label: "Player name", message: "Enter the Player name." });
      if (!identifier) {
        errors.push({ field: playerIdentifier, label: "Player ID / RFID card", message: "Enter the Player ID or scan the RFID card." });
      } else if (identifier.length > 128 || !PLAYER_IDENTIFIER_PATTERN.test(identifier)) {
        errors.push({ field: playerIdentifier, label: "Player ID / RFID card", message: "Use up to 128 letters, numbers, colons, underscores, or hyphens." });
      }
      if (!code) {
        errors.push({ field: accessCode, label: "Access Code", message: "Enter an Access Code." });
      } else if (code.length > 128 || !ACCESS_CODE_PATTERN.test(code)) {
        errors.push({ field: accessCode, label: "Access Code", message: "Use up to 128 letters, numbers, or hyphens." });
      }
      return {
        errors,
        value: {
          displayName: name,
          rosterLabel: rosterLabel.getValue().trim() || null,
          playerIdentifier: identifier,
          accessCode: code,
        },
      };
    },
  });
}

export function PlayerProfileForm({
  player,
  onCancel = () => {},
  onSubmit = async () => ({ ok: false }),
} = {}) {
  const profile = player?.adminProfile || {};
  const displayName = AdminField({
    name: "displayName",
    label: "Admin display name",
    value: profile.displayName || player?.displayName || "",
    required: true,
    autocomplete: "off",
    hint: "Administrative profile metadata. This does not rename the Player Terminal account because no authoritative roster-name update route exists.",
  });
  const status = AdminField({
    name: "status",
    label: "Admin status label",
    value: profile.status || player?.status || "",
    autocomplete: "off",
    hint: "Administrative profile metadata; the authoritative Player account status is shown separately in the roster.",
  });
  const countryAssignment = AdminField({
    name: "countryAssignment",
    label: "Admin country assignment",
    value: profile.countryAssignment || player?.countryName || "",
    autocomplete: "off",
    hint: "Administrative profile metadata only. Country ownership remains controlled by the existing game assignment contract.",
  });
  const adminNote = AdminField({
    name: "adminNote",
    label: "Admin note",
    type: "textarea",
    value: profile.adminNote || "",
    autocomplete: "off",
    hint: "Visible only in the Admin profile settings contract.",
  });

  return createFormShell({
    fields: [displayName, status, countryAssignment, adminNote],
    submitLabel: "Save profile",
    onCancel,
    onSubmit,
    validate() {
      const name = displayName.getValue().trim();
      const errors = name
        ? []
        : [{ field: displayName, label: "Admin display name", message: "Enter a display name." }];
      return {
        errors,
        value: {
          displayName: name,
          status: status.getValue().trim().toLowerCase(),
          countryAssignment: countryAssignment.getValue().trim(),
          adminNote: adminNote.getValue().trim() || null,
        },
      };
    },
  });
}

export function PlayerCredentialForm({
  onCancel = () => {},
  onSubmit = async () => ({ ok: false }),
} = {}) {
  const playerIdentifier = AdminField({
    name: "playerIdentifier",
    label: "New Player ID / RFID card",
    autocomplete: "off",
    placeholder: "Leave blank to keep the current Player ID",
    hint: "The current identifier is intentionally not returned by the roster projection. Enter a value only when it should change.",
  });
  const accessCode = AdminField({
    name: "accessCode",
    label: "New Access Code",
    type: "password",
    autocomplete: "new-password",
    placeholder: "Leave blank to keep the current Access Code",
    hint: "Existing Access Codes cannot be displayed. Setting a new code revokes existing Player sessions under the authoritative credential contract.",
  });

  return createFormShell({
    fields: [playerIdentifier, accessCode],
    submitLabel: "Update credentials",
    onCancel,
    onSubmit,
    validate() {
      const errors = [];
      const identifier = normalizedCredential(playerIdentifier.getValue());
      const code = normalizedCredential(accessCode.getValue());
      if (!identifier && !code) {
        errors.push({ field: playerIdentifier, label: "Player credentials", message: "Enter a new Player ID or a new Access Code." });
      }
      if (identifier && (identifier.length > 128 || !PLAYER_IDENTIFIER_PATTERN.test(identifier))) {
        errors.push({ field: playerIdentifier, label: "New Player ID / RFID card", message: "Use up to 128 letters, numbers, colons, underscores, or hyphens." });
      }
      if (code && (code.length > 128 || !ACCESS_CODE_PATTERN.test(code))) {
        errors.push({ field: accessCode, label: "New Access Code", message: "Use up to 128 letters, numbers, or hyphens." });
      }
      return {
        errors,
        value: {
          ...(identifier ? { playerIdentifier: identifier } : {}),
          ...(code ? { accessCode: code } : {}),
        },
      };
    },
  });
}
