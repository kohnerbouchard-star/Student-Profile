import { AdminDialog } from "./AdminDialog.js";
import { AdminIcon } from "./AdminIcon.js";
import { createElement, setText } from "./dom.js";

const CONFIRM_TONES = new Set(["neutral", "success", "danger"]);

function normalizeTone(value) {
  return CONFIRM_TONES.has(value) ? value : "neutral";
}

function actionIcon(tone) {
  if (tone === "danger") return AdminIcon({ name: "warning", size: 17 });
  if (tone === "success") return AdminIcon({ name: "success", size: 17 });
  return null;
}

export function AdminConfirmDialog({
  title = "Confirm action",
  message = "Are you sure you want to continue?",
  detail,
  changes = [],
  content = null,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  failureMessage = "The action could not be completed. Try again.",
  onConfirm,
  container,
} = {}) {
  let currentTone = normalizeTone(tone);
  const messageElement = createElement("p", { className: "admin-confirm-dialog__message", text: message });
  const detailElement = createElement("p", { className: "admin-confirm-dialog__detail", text: detail || "" });
  detailElement.hidden = !detail;
  const changesElement = createElement("dl", {
    className: "admin-confirm-dialog__changes",
    attrs: { "aria-label": "Proposed changes" },
  });
  const extraContent = createElement("div", { className: "admin-confirm-dialog__content" });
  extraContent.hidden = !content;
  if (content) {
    const values = Array.isArray(content) ? content : [content];
    extraContent.replaceChildren(...values.filter(Boolean));
  }
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
    dataset: { tone: currentTone },
    attrs: { type: "button", "data-dialog-action": "confirm" },
  });
  const footer = createElement("div", {
    className: "admin-confirm-dialog__actions",
    children: [cancelButton, confirmButton],
  });
  let resolveResult = null;

  function renderConfirmButton() {
    confirmButton.dataset.tone = currentTone;
    const icon = actionIcon(currentTone);
    confirmButton.replaceChildren(...[icon, document.createTextNode(confirmLabel)].filter(Boolean));
  }

  function setChanges(nextChanges = []) {
    const normalized = Array.isArray(nextChanges)
      ? nextChanges.filter((entry) => entry && (entry.label || entry.before !== undefined || entry.after !== undefined))
      : [];
    changesElement.replaceChildren(...normalized.map((entry) => createElement("div", {
      className: "admin-confirm-dialog__change",
      children: [
        createElement("dt", { text: entry.label || "Change" }),
        createElement("dd", {
          children: [
            entry.before !== undefined
              ? createElement("span", { className: "admin-confirm-dialog__before", text: String(entry.before) })
              : null,
            entry.before !== undefined && entry.after !== undefined
              ? createElement("span", { className: "admin-confirm-dialog__arrow", attrs: { "aria-hidden": "true" }, text: "→" })
              : null,
            entry.after !== undefined
              ? createElement("strong", { className: "admin-confirm-dialog__after", text: String(entry.after) })
              : null,
          ],
        }),
      ],
    })));
    changesElement.hidden = normalized.length === 0;
  }

  renderConfirmButton();
  setChanges(changes);

  const dialog = AdminDialog({
    title,
    role: "alertdialog",
    size: "small",
    className: "admin-confirm-dialog",
    content: [messageElement, detailElement, changesElement, extraContent, errorElement],
    footer,
    container,
    initialFocus: () => currentTone === "danger" ? cancelButton : confirmButton,
    closeOnBackdrop: false,
    protectUnsavedChanges: false,
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
      if (dialog.isOpen()) dialog.setBusy(false);
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
    setChanges,
    setContent(nextContent) {
      const values = Array.isArray(nextContent) ? nextContent : [nextContent];
      extraContent.replaceChildren(...values.filter(Boolean));
      extraContent.hidden = !nextContent || values.filter(Boolean).length === 0;
    },
    setConfirmLabel(nextLabel) {
      confirmLabel = String(nextLabel || "Confirm");
      renderConfirmButton();
    },
    setTone(nextTone) {
      currentTone = normalizeTone(nextTone);
      renderConfirmButton();
    },
  };
}
