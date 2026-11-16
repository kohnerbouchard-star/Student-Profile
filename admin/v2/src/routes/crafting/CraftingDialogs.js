import { AdminConfirmDialog, AdminDialog, AdminField } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { fromAdminDateTimeLocalValue, toAdminDateTimeLocalValue } from "../../core/date-time.js";
import { displayDate, displayDecimal, displayNumber, numericInputValue, routeButton, titleCase } from "./CraftingViewHelpers.js";

export function recoveryDialog({ job, outcome, opener, onRecover, onDestroyed }) {
  const form = createElement("form", {
    className: "admin-crafting-form",
    attrs: { novalidate: true },
  });
  const reason = AdminField({
    name: "reason",
    label: "Recovery reason",
    type: "textarea",
    required: true,
    hint: "3–1000 characters. The server records this administrator recovery reason.",
    value: "",
  });
  const status = createElement("p", {
    className: "admin-crafting-form__status",
    attrs: { role: "alert" },
  });
  form.append(
    createElement("dl", {
      className: "admin-crafting-form__context",
      children: [
        createElement("div", {
          children: [
            createElement("dt", { text: "Recipe" }),
            createElement("dd", { text: job.recipeName }),
          ],
        }),
        createElement("div", {
          children: [
            createElement("dt", { text: "Player" }),
            createElement("dd", { text: job.playerLabel }),
          ],
        }),
        createElement("div", {
          children: [
            createElement("dt", { text: "Action" }),
            createElement("dd", { text: outcome === "requeue" ? "Requeue failed job" : "Release reservations and fail job" }),
          ],
        }),
      ],
    }),
    reason.element,
    status,
  );

  const cancel = routeButton({
    label: "Cancel",
    quiet: true,
    action: "cancel-recovery",
    onClick() { dialog.close("cancelled"); },
  });
  cancel.dataset.dialogAction = "cancel";
  const submit = routeButton({
    label: outcome === "requeue" ? "Requeue job" : "Release & fail",
    icon: outcome === "requeue" ? "refresh" : "warning",
    tone: outcome === "requeue" ? "" : "danger",
    action: "commit-recovery",
    onClick() { form.requestSubmit(); },
  });
  submit.dataset.dialogAction = "save";
  const footer = createElement("div", {
    className: "admin-crafting-form__actions",
    children: [cancel, submit],
  });

  const dialog = AdminDialog({
    title: outcome === "requeue" ? "Requeue Crafting job" : "Release and fail Crafting job",
    description: outcome === "requeue"
      ? "Requeue is committed only when the existing server-side reservation state is safe."
      : "The existing recovery contract releases active Crafting input reservations and fails the job only when server invariants permit it.",
    content: form,
    footer,
    className: "admin-crafting-dialog",
    initialFocus: () => reason.control,
    onClose() {
      queueMicrotask(() => {
        dialog.destroy();
        onDestroyed(dialog);
      });
    },
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const recoveryReason = reason.getValue().trim();
    reason.setError("");
    status.textContent = "";
    if (recoveryReason.length < 3 || recoveryReason.length > 1_000) {
      reason.setError("Enter a recovery reason from 3 through 1000 characters.");
      reason.focus();
      return;
    }
    dialog.setBusy(true);
    try {
      const result = await onRecover(job, { outcome, reason: recoveryReason });
      if (result?.ok === true) {
        dialog.close("committed");
      } else {
        status.textContent = result?.error?.userMessage || "The recovery operation could not be committed.";
      }
    } catch (_error) {
      status.textContent = "The recovery operation could not be committed.";
    } finally {
      if (dialog.isOpen()) dialog.setBusy(false);
    }
  });

  dialog.open(opener);
  return dialog;
}

export function supplyDialog({ item = null, opener, onApplySupply, onDestroyed }) {
  const editing = Boolean(item?.itemKey);
  const form = createElement("form", {
    className: "admin-crafting-form",
    attrs: { novalidate: true },
  });
  const itemKey = AdminField({
    name: "itemKey",
    label: "Item key",
    required: true,
    hint: "Existing physical-economy item key; this does not create an item.",
    value: item?.itemKey || "",
    autocomplete: "off",
  });
  if (editing) itemKey.setReadOnly(true, "Item identity is immutable. Change the supply state below instead.");

  const countryCode = AdminField({
    name: "countryCode",
    label: "Country code",
    hint: "Optional three-letter scope. Leave blank for global supply.",
    value: item?.countryCode || "",
    autocomplete: "off",
  });
  const scarcityBand = AdminField({
    name: "scarcityBand",
    label: "Scarcity",
    type: "select",
    required: true,
    value: item?.scarcityBand || "available",
    options: [
      { value: "abundant", label: "Abundant" },
      { value: "available", label: "Available" },
      { value: "constrained", label: "Constrained" },
      { value: "scarce", label: "Scarce" },
      { value: "unavailable", label: "Unavailable" },
    ],
  });
  const availableQuantity = AdminField({
    name: "availableQuantity",
    label: "Available quantity",
    type: "number",
    hint: "Optional whole quantity. Leave blank when the supply quantity is not bounded.",
    value: numericInputValue(item?.availableQuantity),
  });
  availableQuantity.control.min = "0";
  availableQuantity.control.step = "1";

  const eventMultiplier = AdminField({
    name: "eventMultiplier",
    label: "Event multiplier",
    type: "number",
    required: true,
    value: numericInputValue(item?.eventMultiplier, 1),
  });
  eventMultiplier.control.min = "0.5";
  eventMultiplier.control.max = "4";
  eventMultiplier.control.step = "0.05";

  const routeMultiplier = AdminField({
    name: "routeMultiplier",
    label: "Route multiplier",
    type: "number",
    required: true,
    value: numericInputValue(item?.routeMultiplier, 1),
  });
  routeMultiplier.control.min = "0.5";
  routeMultiplier.control.max = "4";
  routeMultiplier.control.step = "0.05";

  const sourceEventKey = AdminField({
    name: "sourceEventKey",
    label: "Source event key",
    hint: "Optional existing event/reference key.",
    value: item?.sourceEventKey || "",
    autocomplete: "off",
  });
  const expiresAt = AdminField({
    name: "expiresAt",
    label: "Expires at",
    type: "datetime-local",
    hint: "Optional local expiration time. It is stored as an absolute timestamp.",
    value: toAdminDateTimeLocalValue(item?.expiresAt),
  });
  const status = createElement("p", {
    className: "admin-crafting-form__status",
    attrs: { role: "alert" },
  });

  const grid = createElement("div", {
    className: "admin-crafting-form__grid",
    children: [
      itemKey.element,
      countryCode.element,
      scarcityBand.element,
      availableQuantity.element,
      eventMultiplier.element,
      routeMultiplier.element,
      sourceEventKey.element,
      expiresAt.element,
    ],
  });
  form.append(grid, status);

  const cancel = routeButton({
    label: "Cancel",
    quiet: true,
    action: "cancel-supply",
    onClick() { dialog.close("cancelled"); },
  });
  cancel.dataset.dialogAction = "cancel";
  const submit = routeButton({
    label: "Apply supply state",
    icon: "settings",
    action: "commit-supply",
    onClick() { form.requestSubmit(); },
  });
  submit.dataset.dialogAction = "save";
  const footer = createElement("div", {
    className: "admin-crafting-form__actions",
    children: [cancel, submit],
  });

  const dialog = AdminDialog({
    title: editing ? `Adjust ${item.itemKey}` : "Apply Crafting supply state",
    description: "Uses the existing game-scoped physical-economy supply contract. It does not grant Inventory or alter recipe definitions.",
    content: form,
    footer,
    size: "large",
    className: "admin-crafting-dialog",
    initialFocus: () => editing ? scarcityBand.control : itemKey.control,
    onClose() {
      queueMicrotask(() => {
        dialog.destroy();
        onDestroyed(dialog);
      });
    },
  });

  function clearErrors() {
    [
      itemKey,
      countryCode,
      scarcityBand,
      availableQuantity,
      eventMultiplier,
      routeMultiplier,
      sourceEventKey,
      expiresAt,
    ].forEach((field) => field.setError(""));
    status.textContent = "";
  }

  function numberOrNull(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : Number.NaN;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    const key = itemKey.getValue().trim().toLowerCase();
    const country = countryCode.getValue().trim().toUpperCase();
    const available = numberOrNull(availableQuantity.getValue());
    const eventValue = numberOrNull(eventMultiplier.getValue());
    const routeValue = numberOrNull(routeMultiplier.getValue());
    const sourceEvent = sourceEventKey.getValue().trim();
    const expiryInput = expiresAt.getValue().trim();
    const expiry = expiryInput ? fromAdminDateTimeLocalValue(expiryInput) : "";
    let invalid = false;

    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) {
      itemKey.setError("Enter an existing item key using lowercase letters, numbers, underscores, or hyphens.");
      invalid = true;
    }
    if (country && !/^[A-Z]{3}$/.test(country)) {
      countryCode.setError("Use a three-letter country code or leave this field blank.");
      invalid = true;
    }
    if (available !== null && (!Number.isSafeInteger(available) || available < 0)) {
      availableQuantity.setError("Use a non-negative whole quantity or leave this field blank.");
      invalid = true;
    }
    if (!Number.isFinite(eventValue) || eventValue < 0.5 || eventValue > 4) {
      eventMultiplier.setError("Use an event multiplier from 0.5 through 4.");
      invalid = true;
    }
    if (!Number.isFinite(routeValue) || routeValue < 0.5 || routeValue > 4) {
      routeMultiplier.setError("Use a route multiplier from 0.5 through 4.");
      invalid = true;
    }
    if (sourceEvent && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sourceEvent)) {
      sourceEventKey.setError("Use an existing safe event/reference key.");
      invalid = true;
    }
    if (expiryInput && !expiry) {
      expiresAt.setError("Enter a valid expiration date and time or leave this field blank.");
      invalid = true;
    }
    if (invalid) {
      form.querySelector("[aria-invalid='true']")?.focus();
      return;
    }

    const proposed = {
      countryCode: country || null,
      scarcityBand: scarcityBand.getValue(),
      availableQuantity: available,
      eventMultiplier: eventValue,
      routeMultiplier: routeValue,
      sourceEventKey: sourceEvent || null,
      expiresAt: expiry || null,
    };
    const before = item ? [
      `Scarcity: ${titleCase(item.scarcityBand)}`,
      `Available: ${item.availableQuantity === null ? "unbounded" : displayNumber(item.availableQuantity)}`,
      `Event multiplier: ${displayDecimal(item.eventMultiplier)}`,
      `Route multiplier: ${displayDecimal(item.routeMultiplier)}`,
      `Expires: ${item.expiresAt ? displayDate(item.expiresAt) : "no expiry"}`,
    ].join(" · ") : "No existing override";
    const after = [
      `Scarcity: ${titleCase(proposed.scarcityBand)}`,
      `Available: ${proposed.availableQuantity === null ? "unbounded" : displayNumber(proposed.availableQuantity)}`,
      `Event multiplier: ${displayDecimal(proposed.eventMultiplier)}`,
      `Route multiplier: ${displayDecimal(proposed.routeMultiplier)}`,
      `Expires: ${proposed.expiresAt ? displayDate(proposed.expiresAt) : "no expiry"}`,
    ].join(" · ");
    const review = AdminConfirmDialog({
      title: editing ? "Review supply change" : "Review supply override",
      message: `Apply this ${country || "global"} supply state for ${key}?`,
      detail: "This changes availability used by the physical economy. It does not change player-owned Inventory.",
      changes: [{ label: "Supply state", before, after }],
      confirmLabel: "Apply supply state",
      tone: "neutral",
      failureMessage: "The supply operation could not be committed.",
      async onConfirm() {
        const result = await onApplySupply(key, proposed);
        if (result?.ok !== true) throw new Error("CRAFTING_SUPPLY_FAILED");
        return true;
      },
    });
    const accepted = await review.open(submit);
    review.destroy();
    if (accepted) dialog.close("committed");
  });

  dialog.open(opener);
  return dialog;
}
