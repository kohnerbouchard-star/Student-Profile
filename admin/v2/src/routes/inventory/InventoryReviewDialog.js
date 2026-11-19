import { AdminDialog, AdminField } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function reviewDialog({ row, action, opener, onReview, onReviewCommitted, titleCase }) {
  const note = AdminField({
    name: "note",
    label: action === "reject" ? "Rejection reason" : "Administrative note",
    type: "textarea",
    required: action === "reject",
    hint: action === "reject"
      ? "Required. Explain why this redemption cannot proceed."
      : "Optional note for the authoritative redemption audit trail.",
  });
  note.control.maxLength = 1000;
  note.control.rows = 5;

  const status = createElement("p", {
    className: "admin-inventory-route__review-status",
    attrs: { role: "status", "aria-live": "polite" },
    text: `Confirm ${action} for this redemption.`,
  });
  const cancel = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button" },
    dataset: { dialogAction: "cancel" },
    text: "Cancel",
  });
  const submit = createElement("button", {
    className: "admin-button",
    attrs: { type: "submit" },
    dataset: { dialogAction: "submit", tone: action === "reject" ? "danger" : "neutral" },
    text: `${titleCase(action)} redemption`,
  });
  const form = createElement("form", {
    className: "admin-inventory-route__review-form",
    children: [
      createElement("dl", {
        className: "admin-inventory-route__review-summary",
        children: [
          createElement("div", { children: [createElement("dt", { text: "Player" }), createElement("dd", { text: row.player.displayName })] }),
          createElement("div", { children: [createElement("dt", { text: "Item" }), createElement("dd", { text: row.item.name })] }),
          createElement("div", { children: [createElement("dt", { text: "Requested quantity" }), createElement("dd", { text: row.quantity })] }),
          createElement("div", { children: [createElement("dt", { text: "Current state" }), createElement("dd", { text: titleCase(row.status) })] }),
        ],
      }),
      row.requestNote
        ? createElement("div", {
            className: "admin-inventory-route__request-note",
            children: [createElement("strong", { text: "Player note" }), createElement("p", { text: row.requestNote })],
          })
        : null,
      note.element,
      status,
      createElement("div", {
        className: "admin-inventory-route__review-actions",
        children: [cancel, submit],
      }),
    ],
  });

  let dialog = null;
  dialog = AdminDialog({
    title: `${titleCase(action)} inventory redemption`,
    description: "This action uses the existing canonical inventory redemption workflow.",
    content: form,
    size: "medium",
    closeOnBackdrop: false,
    initialFocus: () => note.control,
    onClose() {
      queueMicrotask(() => dialog?.destroy());
    },
  });

  cancel.addEventListener("click", () => dialog.close("cancelled"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reviewNote = note.getValue().trim();
    note.setError("");
    if (action === "reject" && !reviewNote) {
      note.setError("A rejection reason is required.");
      note.focus();
      return;
    }

    dialog.setBusy(true);
    note.setDisabled(true);
    status.dataset.tone = "neutral";
    status.textContent = `${titleCase(action)} is being committed…`;
    try {
      const result = await onReview({ rowKey: row.rowKey, action, note: reviewNote });
      dialog.close("committed");
      onReviewCommitted(result);
    } catch (error) {
      dialog.setBusy(false);
      note.setDisabled(false);
      status.dataset.tone = "error";
      status.textContent = error?.userMessage || "The inventory redemption action could not be completed.";
    }
  });

  dialog.open(opener);
  return dialog;
}
