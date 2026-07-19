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

  const controllerStack = [];

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function enabled(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (("disabled" in element && element.disabled === true) || element.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  function focusableElements(dialog) {
    if (!(dialog instanceof HTMLElement)) return [];
    return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
      return visible(element) && enabled(element) && element.tabIndex >= 0;
    });
  }

  function stableFocusTarget(preferred) {
    if (preferred instanceof HTMLElement && preferred.isConnected && visible(preferred) && enabled(preferred)) return preferred;
    return [
      document.querySelector('[data-admin-section][aria-current="page"]'),
      document.querySelector('[data-admin-section][aria-selected="true"]'),
      document.querySelector('[data-admin-section].active, [data-admin-section].is-active'),
      document.querySelector('[data-admin-section]'),
      document.querySelector('[data-admin-terminal-action="add-player"]'),
      document.querySelector(".admin-terminal-shell-main"),
      document.querySelector("#adminPreview"),
    ].find((element) => element instanceof HTMLElement && element.isConnected && visible(element) && enabled(element)) || null;
  }

  function focusStableTarget(target) {
    if (!(target instanceof HTMLElement) || !target.isConnected || !enabled(target)) return;
    const isAdminRoot = target.id === "adminPreview" || target.classList.contains("admin-terminal-shell-main");
    if (!isAdminRoot && !visible(target)) return;
    if (target.tabIndex < 0 && !target.matches(FOCUSABLE_SELECTOR)) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }

  function stackTop() {
    return controllerStack[controllerStack.length - 1] || null;
  }

  function removeFromStack(controller) {
    const index = controllerStack.lastIndexOf(controller);
    if (index >= 0) controllerStack.splice(index, 1);
  }

  function activate(options = {}) {
    const backdrop = options.backdrop;
    const dialog = options.dialog;
    if (!(backdrop instanceof HTMLElement) || !(dialog instanceof HTMLElement) || !backdrop.isConnected || !dialog.isConnected) {
      throw new TypeError("Admin modal accessibility requires a connected backdrop and dialog.");
    }
    if (!backdrop.contains(dialog)) {
      throw new TypeError("Admin modal accessibility requires the dialog to be contained by its backdrop.");
    }

    const parentController = stackTop();
    parentController?.suspend?.();

    const opener = stableFocusTarget(options.opener || document.activeElement);
    const dismissOnEscape = options.dismissOnEscape !== false;
    const dismissOnBackdrop = options.dismissOnBackdrop !== false;
    const trapFocus = options.trapFocus !== false;
    let closed = false;
    let listening = false;
    let redirectingFocus = false;
    let lastFocusedInside = null;

    if (!dialog.hasAttribute("role")) dialog.setAttribute("role", "dialog");
    if (trapFocus && !dialog.hasAttribute("aria-modal")) dialog.setAttribute("aria-modal", "true");

    function rememberInsideFocus() {
      const active = document.activeElement;
      if (active instanceof HTMLElement && dialog.contains(active) && visible(active) && enabled(active)) {
        lastFocusedInside = active;
      }
    }

    function focusInside(preferred = null, direction = "first") {
      if (closed || !backdrop.isConnected || !dialog.isConnected) return;
      const controls = focusableElements(dialog);
      const target = preferred instanceof HTMLElement && dialog.contains(preferred) && visible(preferred) && enabled(preferred)
        ? preferred
        : direction === "last"
          ? controls[controls.length - 1] || dialog
          : controls[0] || dialog;
      if (target === dialog && !dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      redirectingFocus = true;
      target.focus({ preventScroll: true });
      redirectingFocus = false;
      rememberInsideFocus();
    }

    function restoreFocus() {
      const target = stableFocusTarget(opener) || document.querySelector("#adminPreview");
      if (!(target instanceof HTMLElement)) return;
      window.requestAnimationFrame(() => focusStableTarget(target));
    }

    function addListeners() {
      if (listening || closed) return;
      listening = true;
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("focusin", onFocusIn, true);
      backdrop.addEventListener("click", onBackdropClick, true);
    }

    function removeListeners() {
      if (!listening) return;
      listening = false;
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      backdrop.removeEventListener("click", onBackdropClick, true);
    }

    function resume() {
      if (closed || !backdrop.isConnected || !dialog.isConnected) return;
      addListeners();
      if (!trapFocus) return;
      window.requestAnimationFrame(() => {
        if (!closed && stackTop() === controller && !dialog.contains(document.activeElement)) {
          focusInside(lastFocusedInside);
        }
      });
    }

    function suspend() {
      rememberInsideFocus();
      removeListeners();
    }

    function finish(reason, closeOptions = {}, removeBackdrop = true) {
      if (closed) return;
      closed = true;
      removeListeners();
      removeFromStack(controller);

      if (typeof options.onClose === "function") options.onClose(reason);
      else if (removeBackdrop) backdrop.remove();

      const parent = stackTop();
      parent?.resume?.();
      if (closeOptions.restoreFocus !== false) restoreFocus();

      backdrop.dispatchEvent(new CustomEvent("econovaria:admin-modal-closed", {
        bubbles: true,
        detail: { reason, stackDepth: controllerStack.length },
      }));
    }

    function close(reason = "closed", closeOptions = {}) {
      finish(reason, closeOptions, true);
    }

    function destroy(destroyOptions = {}) {
      if (closed) return;
      const removeBackdrop = destroyOptions.remove !== false;
      finish("destroyed", destroyOptions, removeBackdrop);
    }

    function onFocusIn(event) {
      if (!trapFocus || closed || stackTop() !== controller || redirectingFocus) return;
      if (event.target instanceof Node && dialog.contains(event.target)) {
        rememberInsideFocus();
        return;
      }
      focusInside(lastFocusedInside);
    }

    function onKeyDown(event) {
      if (!backdrop.isConnected || closed || stackTop() !== controller) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (dismissOnEscape) close("escape");
        else {
          focusInside(lastFocusedInside);
          backdrop.dispatchEvent(new CustomEvent("econovaria:admin-modal-dismiss-blocked", {
            bubbles: true,
            detail: { reason: "escape" },
          }));
        }
        return;
      }

      const isTab = event.key === "Tab";
      if (!trapFocus || !isTab) return;
      const controls = focusableElements(dialog);
      if (!controls.length) {
        event.preventDefault();
        focusInside();
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      const current = document.activeElement;
      if (!dialog.contains(current)) {
        event.preventDefault();
        focusInside(null, event.shiftKey ? "last" : "first");
        return;
      }
      if (!event.shiftKey && current === last) {
        event.preventDefault();
        focusInside(first);
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        focusInside(last);
      }
    }

    function onBackdropClick(event) {
      if (event.target !== backdrop || closed || stackTop() !== controller) return;
      if (dismissOnBackdrop) {
        close("backdrop");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      focusInside(lastFocusedInside);
      backdrop.dispatchEvent(new CustomEvent("econovaria:admin-modal-dismiss-blocked", {
        bubbles: true,
        detail: { reason: "backdrop" },
      }));
    }

    const controller = Object.freeze({
      close,
      destroy,
      focusFirst: () => focusInside(),
      resume,
      suspend,
      get dialog() { return dialog; },
      get backdrop() { return backdrop; },
      get closed() { return closed; },
    });

    controllerStack.push(controller);
    addListeners();

    const initial = options.initialFocus instanceof HTMLElement && dialog.contains(options.initialFocus) && visible(options.initialFocus) && enabled(options.initialFocus)
      ? options.initialFocus
      : focusableElements(dialog)[0] || dialog;
    window.requestAnimationFrame(() => focusInside(initial));

    backdrop.dispatchEvent(new CustomEvent("econovaria:admin-modal-activated", {
      bubbles: true,
      detail: { stackDepth: controllerStack.length, trapFocus },
    }));

    return controller;
  }

  window.EconovariaAdminModalAccessibility = Object.freeze({
    activate,
    focusableElements,
    getActiveController: stackTop,
    getStackDepth: () => controllerStack.length,
  });
})();
