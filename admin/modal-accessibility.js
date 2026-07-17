(function initEconovariaAdminModalAccessibility() {
  "use strict";

  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  let activeController = null;

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function focusableElements(dialog) {
    if (!(dialog instanceof HTMLElement)) return [];
    return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
      return visible(element) && element.tabIndex >= 0;
    });
  }

  function stableFocusTarget(preferred) {
    if (preferred instanceof HTMLElement && preferred.isConnected && visible(preferred)) return preferred;
    return [
      document.querySelector('[data-admin-terminal-action="add-player"]'),
      document.querySelector('[data-admin-section][aria-current="page"]'),
      document.querySelector('[data-admin-section].active, [data-admin-section].is-active'),
      document.querySelector("#adminPreview"),
    ].find((element) => element instanceof HTMLElement && element.isConnected && visible(element)) || null;
  }

  function activate(options = {}) {
    const backdrop = options.backdrop;
    const dialog = options.dialog;
    if (!(backdrop instanceof HTMLElement) || !(dialog instanceof HTMLElement)) {
      throw new TypeError("Admin modal accessibility requires a connected backdrop and dialog.");
    }

    activeController?.destroy?.({ restoreFocus: false });

    const opener = stableFocusTarget(options.opener || document.activeElement);
    const dismissOnEscape = options.dismissOnEscape !== false;
    const dismissOnBackdrop = options.dismissOnBackdrop !== false;
    let closed = false;

    function restoreFocus() {
      const target = stableFocusTarget(opener);
      if (!target) return;
      window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }

    function cleanup() {
      document.removeEventListener("keydown", onKeyDown, true);
      backdrop.removeEventListener("click", onBackdropClick, true);
      if (activeController === controller) activeController = null;
    }

    function close(reason = "closed", closeOptions = {}) {
      if (closed) return;
      closed = true;
      cleanup();
      if (typeof options.onClose === "function") options.onClose(reason);
      else backdrop.remove();
      if (closeOptions.restoreFocus !== false) restoreFocus();
    }

    function destroy(destroyOptions = {}) {
      if (closed) return;
      closed = true;
      cleanup();
      if (destroyOptions.remove !== false) backdrop.remove();
      if (destroyOptions.restoreFocus !== false) restoreFocus();
    }

    function keepFocusInside() {
      const controls = focusableElements(dialog);
      const target = controls[0] || dialog;
      if (target === dialog && !dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      target.focus({ preventScroll: true });
    }

    function onKeyDown(event) {
      if (!backdrop.isConnected || closed) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (dismissOnEscape) close("escape");
        else {
          keepFocusInside();
          backdrop.dispatchEvent(new CustomEvent("econovaria:admin-modal-dismiss-blocked", {
            bubbles: true,
            detail: { reason: "escape" },
          }));
        }
        return;
      }

      const isTab = event.key === "Tab";
      if (!isTab) return;
      const controls = focusableElements(dialog);
      if (!controls.length) {
        event.preventDefault();
        keepFocusInside();
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      const current = document.activeElement;
      if (!dialog.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    }

    function onBackdropClick(event) {
      if (event.target !== backdrop) return;
      if (dismissOnBackdrop) {
        close("backdrop");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      keepFocusInside();
    }

    const controller = Object.freeze({ close, destroy, focusFirst: keepFocusInside });
    activeController = controller;
    document.addEventListener("keydown", onKeyDown, true);
    backdrop.addEventListener("click", onBackdropClick, true);

    const initial = options.initialFocus instanceof HTMLElement && dialog.contains(options.initialFocus)
      ? options.initialFocus
      : focusableElements(dialog)[0] || dialog;
    if (initial === dialog && !dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
    window.requestAnimationFrame(() => {
      if (!closed && backdrop.isConnected) initial.focus({ preventScroll: true });
    });

    return controller;
  }

  window.EconovariaAdminModalAccessibility = Object.freeze({
    activate,
    focusableElements,
  });
})();
