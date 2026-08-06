import { AdminDialog } from "./AdminDialog.js";
import { AdminIcon } from "./AdminIcon.js";
import { createElement, setText } from "./dom.js";

export function AdminConfirmDialog({
  title = "Confirm action",
  message = "Are you sure you want to continue?",
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  failureMessage = "The action could not be completed. Try again.",
  onConfirm,
  container,
} = {}) {
  const messageElement = createElement("p", { className: "admin-confirm-dialog__message", text: message });
  const detailElement = createElement("p", { className: "admin-confirm-dialog__detail", text: detail || "" });
  detailElement.hidden = !detail;
  const errorElement = createElement("p", {
    className: "admin-confirm-dialog__error",
    attrs: { role: "alert" },
  });
  errorElement.hidden = true;

  const cancelButton = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", "data-dialog-action": "cancel" },
    text: cancelLabel,
  });
  const confirmButton = createElement("button", {
    className: "admin-button",
    dataset: { tone },
    attrs: { type: "button", "data-dialog-action": "confirm", "data-autofocus": "" },
    children: [AdminIcon({ name: tone === "danger" ? "warning" : "success", size: 17 }), confirmLabel],
  });
  const footer = createElement("div", {
    className: "admin-confirm-dialog__actions",
    children: [cancelButton, confirmButton],
  });
  let resolveResult = null;

  const dialog = AdminDialog({
    title,
    role: "alertdialog",
    size: "small",
    className: "admin-confirm-dialog",
    content: [messageElement, detailElement, errorElement],
    footer,
    container,
    initialFocus: "[data-autofocus]",
    closeOnBackdrop: false,
    onClose(reason) {
      if (resolveResult) {
        resolveResult(reason === "confirmed");
        resolveResult = null;
      }
    },
  });

  cancelButton.addEventListener("click", () => dialog.close("cancelled"));
  confirmButton.addEventListener("click", async () => {
    errorElement.hidden = true;
    dialog.setBusy(true);
    try {
      const result = await onConfirm?.();
      if (result !== false) dialog.close("confirmed");
    } catch {
      setText(errorElement, failureMessage);
      errorElement.hidden = false;
    } finally {
      dialog.setBusy(false);
    }
  });

  function open(opener) {
    if (dialog.isOpen()) return Promise.resolve(false);
    errorElement.hidden = true;
    dialog.open(opener);
    return new Promise((resolve) => {
      resolveResult = resolve;
    });
  }

  return {
    ...dialog,
    open,
    setMessage(nextMessage) { setText(messageElement, nextMessage); },
    setDetail(nextDetail) {
      setText(detailElement, nextDetail);
      detailElement.hidden = !nextDetail;
    },
  };
}
