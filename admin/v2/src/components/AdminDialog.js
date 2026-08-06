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
    dataset: { adminV2Layer: "dialog", size, open: "false" },
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
  headingGroup.append(heading, descriptionElement);

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

  function resolveInitialFocus() {
    if (typeof initialFocus === "function") return initialFocus(panel);
    if (typeof initialFocus === "string") return panel.querySelector(initialFocus);
    if (initialFocus instanceof HTMLElement) return initialFocus;
    return null;
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
      const target = resolveInitialFocus();
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      else focusFirst(panel);
    });
    root.dispatchEvent(new CustomEvent("admin-dialog-open", { bubbles: true }));
    return controller;
  }

  function close(reason = "programmatic") {
    if (!open) return false;
    if (onBeforeClose?.(reason) === false) return false;

    open = false;
    panel.ownerDocument.removeEventListener("focusin", keepFocusInside, true);
    root.dataset.open = "false";
    root.setAttribute("aria-hidden", "true");
    root.hidden = true;
    releaseIsolation?.();
    releaseIsolation = null;

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
    if (open) close("destroyed");
    root.removeEventListener("keydown", handleKeydown);
    root.removeEventListener("click", handleBackdropClick);
    root.remove();
  }

  closeButton.addEventListener("click", () => close("close-button"));
  root.addEventListener("keydown", handleKeydown);
  root.addEventListener("click", handleBackdropClick);

  const controller = {
    element: root,
    panel,
    body,
    footer: footerElement,
    open: show,
    close,
    destroy,
    isOpen: () => open,
    setBusy,
    setTitle(nextTitle) { setText(heading, nextTitle, "Dialog"); },
    setDescription,
    setContent(nextContent) { replaceContent(body, nextContent); },
    setFooter(nextFooter) {
      replaceContent(footerElement, nextFooter);
      footerElement.hidden = !nextFooter;
    },
  };
  return controller;
}
