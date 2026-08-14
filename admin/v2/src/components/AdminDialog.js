import { AdminIcon } from "./AdminIcon.js";
import {
  appendContent,
  createElement,
  createId,
  focusFirst,
  getFocusableElements,
  isolateModalLayer,
  replaceContent,
  setText,
} from "./dom.js";

const USER_DISMISS_REASONS = new Set([
  "escape",
  "backdrop",
  "close-button",
  "cancel",
  "cancelled",
]);

function controlFingerprint(control, index) {
  const type = String(control.type || control.tagName || "").toLowerCase();
  if (["button", "submit", "reset"].includes(type)) return null;
  const identity = control.name || control.id || `control-${index}`;
  if (type === "checkbox" || type === "radio") {
    return [identity, type, Boolean(control.checked), control.value];
  }
  if (type === "file") {
    return [identity, type, [...(control.files || [])].map((file) => `${file.name}:${file.size}:${file.lastModified}`)];
  }
  return [identity, type, control.value];
}

function formFingerprint(panel) {
  return JSON.stringify(
    [...panel.querySelectorAll("input, select, textarea")]
      .map(controlFingerprint)
      .filter(Boolean),
  );
}

export function AdminDialog({
  title = "Dialog",
  description,
  content,
  footer,
  role = "dialog",
  size = "medium",
  closeLabel = "Close dialog",
  closeOnEscape = true,
  closeOnBackdrop = true,
  initialFocus,
  returnFocus = true,
  protectUnsavedChanges = true,
  discardTitle = "Discard unsaved changes?",
  discardMessage = "You have changes that have not been saved.",
  className = "",
  panelClassName = "",
  container = document.body,
  onBeforeClose,
  onClose,
} = {}) {
  const titleId = createId("admin-dialog-title");
  const descriptionId = createId("admin-dialog-description");
  const root = createElement("div", {
    className: `admin-dialog${className ? ` ${className}` : ""}`,
    dataset: { adminV2Layer: "dialog", size, open: "false", dirty: "false" },
    attrs: { "aria-hidden": "true" },
  });
  const panel = createElement("section", {
    className: `admin-dialog__panel${panelClassName ? ` ${panelClassName}` : ""}`,
    attrs: {
      role,
      "aria-modal": "true",
      "aria-labelledby": titleId,
      "aria-describedby": description ? descriptionId : null,
      tabindex: "-1",
    },
  });
  const header = createElement("header", { className: "admin-dialog__header" });
  const headingGroup = createElement("div", { className: "admin-dialog__heading-group" });
  const heading = createElement("h2", {
    className: "admin-dialog__title",
    text: title,
    attrs: { id: titleId },
  });
  const descriptionElement = createElement("p", {
    className: "admin-dialog__description",
    text: description || "",
    attrs: { id: descriptionId },
  });
  descriptionElement.hidden = !description;
  const dirtyIndicator = createElement("span", {
    className: "admin-dialog__dirty-indicator",
    text: "Unsaved changes",
    attrs: { role: "status", "aria-live": "polite" },
  });
  dirtyIndicator.hidden = true;
  headingGroup.append(heading, descriptionElement, dirtyIndicator);

  const closeButton = createElement("button", {
    className: "admin-icon-button admin-dialog__close",
    attrs: { type: "button", "aria-label": closeLabel },
    children: AdminIcon({ name: "close", size: 20 }),
  });
  header.append(headingGroup, closeButton);

  const body = createElement("div", { className: "admin-dialog__body" });
  appendContent(body, content);
  const footerElement = createElement("footer", { className: "admin-dialog__footer" });
  appendContent(footerElement, footer);
  footerElement.hidden = !footer;
  panel.append(header, body, footerElement);
  root.append(panel);
  root.hidden = true;
  container.append(root);

  let open = false;
  let busy = false;
  let releaseIsolation = null;
  let previousFocus = null;
  let pristineFingerprint = "";
  let dirty = false;
  let bypassDirtyProtection = false;
  let discardDialog = null;

  function resolveInitialFocus() {
    if (typeof initialFocus === "function") return initialFocus(panel);
    if (typeof initialFocus === "string") return panel.querySelector(initialFocus);
    if (initialFocus instanceof HTMLElement) return initialFocus;
    return null;
  }

  function setDirty(nextDirty) {
    dirty = Boolean(nextDirty);
    root.dataset.dirty = dirty ? "true" : "false";
    dirtyIndicator.hidden = !dirty;
  }

  function capturePristine() {
    pristineFingerprint = formFingerprint(panel);
    setDirty(false);
  }

  function refreshDirtyState() {
    if (!protectUnsavedChanges || !open || busy) return;
    const hasEditableForm = Boolean(panel.querySelector("form"));
    if (!hasEditableForm) {
      setDirty(false);
      return;
    }
    setDirty(formFingerprint(panel) !== pristineFingerprint);
  }

  function keepFocusInside(event) {
    if (!open || root.inert || root.contains(event.target)) return;
    focusFirst(panel);
  }

  function handleKeydown(event) {
    if (!open || root.inert) return;

    if (event.key === "Escape" && closeOnEscape && !busy) {
      event.preventDefault();
      close("escape");
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = getFocusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    const active = panel.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function show(opener = panel.ownerDocument.activeElement) {
    if (open) return controller;
    open = true;
    previousFocus = opener instanceof HTMLElement ? opener : null;
    root.hidden = false;
    root.dataset.open = "true";
    root.setAttribute("aria-hidden", "false");
    releaseIsolation = isolateModalLayer(root);
    panel.ownerDocument.addEventListener("focusin", keepFocusInside, true);
    queueMicrotask(() => {
      if (!open) return;
      capturePristine();
      const target = resolveInitialFocus();
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      else focusFirst(panel);
    });
    root.dispatchEvent(new CustomEvent("admin-dialog-open", { bubbles: true }));
    return controller;
  }

  function openDiscardDialog() {
    if (discardDialog?.isOpen()) return;
    const keepEditing = createElement("button", {
      className: "admin-button admin-button--quiet",
      attrs: { type: "button", "data-dialog-action": "keep-editing" },
      text: "Keep editing",
    });
    const discard = createElement("button", {
      className: "admin-button",
      dataset: { tone: "danger" },
      attrs: { type: "button", "data-dialog-action": "discard" },
      children: [AdminIcon({ name: "warning", size: 17 }), "Discard changes"],
    });
    const actions = createElement("div", {
      className: "admin-confirm-dialog__actions",
      children: [keepEditing, discard],
    });
    discardDialog = AdminDialog({
      title: discardTitle,
      description: discardMessage,
      content: createElement("p", {
        className: "admin-confirm-dialog__detail",
        text: "Discarding closes this editor and returns to the last saved state.",
      }),
      footer: actions,
      role: "alertdialog",
      size: "small",
      closeOnBackdrop: false,
      initialFocus: keepEditing,
      protectUnsavedChanges: false,
      container,
      onClose() {
        queueMicrotask(() => {
          discardDialog?.destroy();
          discardDialog = null;
        });
      },
    });
    keepEditing.addEventListener("click", () => discardDialog?.close("keep-editing"));
    discard.addEventListener("click", () => {
      discardDialog?.close("discard-confirmed");
      bypassDirtyProtection = true;
      close("discarded");
      bypassDirtyProtection = false;
    });
    discardDialog.open(closeButton);
  }

  function close(reason = "programmatic") {
    if (!open) return false;
    if (onBeforeClose?.(reason) === false) return false;
    if (
      protectUnsavedChanges
      && !bypassDirtyProtection
      && dirty
      && USER_DISMISS_REASONS.has(reason)
    ) {
      openDiscardDialog();
      return false;
    }

    open = false;
    panel.ownerDocument.removeEventListener("focusin", keepFocusInside, true);
    root.dataset.open = "false";
    root.setAttribute("aria-hidden", "true");
    root.hidden = true;
    releaseIsolation?.();
    releaseIsolation = null;
    setDirty(false);

    if (returnFocus && previousFocus?.isConnected && !previousFocus.closest("[inert]")) {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
    root.dispatchEvent(new CustomEvent("admin-dialog-close", { bubbles: true, detail: { reason } }));
    onClose?.(reason);
    return true;
  }

  function handleBackdropClick(event) {
    if (event.target === root && closeOnBackdrop && !busy) close("backdrop");
  }

  function setBusy(nextBusy) {
    busy = Boolean(nextBusy);
    panel.setAttribute("aria-busy", busy ? "true" : "false");
    panel.querySelectorAll("[data-dialog-action]").forEach((button) => {
      button.disabled = busy;
    });
    closeButton.disabled = busy;
  }

  function setDescription(nextDescription) {
    setText(descriptionElement, nextDescription);
    descriptionElement.hidden = !nextDescription;
    if (nextDescription) panel.setAttribute("aria-describedby", descriptionId);
    else panel.removeAttribute("aria-describedby");
  }

  function destroy() {
    discardDialog?.destroy();
    discardDialog = null;
    if (open) {
      bypassDirtyProtection = true;
      close("destroyed");
      bypassDirtyProtection = false;
    }
    root.removeEventListener("keydown", handleKeydown);
    root.removeEventListener("click", handleBackdropClick);
    root.removeEventListener("input", refreshDirtyState, true);
    root.removeEventListener("change", refreshDirtyState, true);
    root.remove();
  }

  closeButton.addEventListener("click", () => close("close-button"));
  root.addEventListener("keydown", handleKeydown);
  root.addEventListener("click", handleBackdropClick);
  root.addEventListener("input", refreshDirtyState, true);
  root.addEventListener("change", refreshDirtyState, true);

  const controller = {
    element: root,
    panel,
    body,
    footer: footerElement,
    open: show,
    close,
    destroy,
    isOpen: () => open,
    isDirty: () => dirty,
    markPristine: capturePristine,
    setBusy,
    setTitle(nextTitle) { setText(heading, nextTitle, "Dialog"); },
    setDescription,
    setContent(nextContent) {
      replaceContent(body, nextContent);
      if (open && !dirty) queueMicrotask(capturePristine);
    },
    setFooter(nextFooter) {
      replaceContent(footerElement, nextFooter);
      footerElement.hidden = !nextFooter;
      if (open && !dirty) queueMicrotask(capturePristine);
    },
  };
  return controller;
}
