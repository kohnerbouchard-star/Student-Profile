(function initEconovariaAdminModalLifecycleBridge() {
  "use strict";

  const BACKDROP_SELECTOR = ".admin-terminal-modal-backdrop, [data-admin-terminal-modal-backdrop]";
  const DIALOG_SELECTOR = ".admin-terminal-modal, [role='dialog']";
  const CLOSE_SELECTOR = [
    "[data-admin-terminal-modal-close]",
    "[data-admin-modal-close]",
    "[aria-label^='Close']",
    "[data-admin-terminal-action='close-modal']",
    "[data-admin-terminal-action='cancel-modal']",
  ].join(",");
  const ACKNOWLEDGEMENT_SELECTOR = "[data-admin-modal-requires-acknowledgement='true']";
  const bindings = new Set();
  let lastOpener = null;
  let queued = false;

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function liveBackdrop(dialog) {
    const backdrop = dialog.closest(BACKDROP_SELECTOR);
    return backdrop instanceof HTMLElement && visible(backdrop) ? backdrop : null;
  }

  function bindingFor(backdrop) {
    return [...bindings].find((binding) => binding.backdrop === backdrop) || null;
  }

  function pruneBindings() {
    for (const binding of [...bindings]) {
      if (binding.backdrop.isConnected && binding.dialog.isConnected) continue;
      bindings.delete(binding);
      binding.controller?.destroy?.({ remove: false, restoreFocus: true });
    }
  }

  function existingCloseControl(dialog) {
    return [...dialog.querySelectorAll(CLOSE_SELECTOR)].find((control) => {
      return control instanceof HTMLElement && visible(control) && !("disabled" in control && control.disabled);
    }) || null;
  }

  function bindDialog(dialog) {
    if (!(dialog instanceof HTMLElement) || !visible(dialog)) return null;
    const backdrop = liveBackdrop(dialog);
    if (!backdrop || bindingFor(backdrop)) return null;
    if (backdrop.matches("[data-admin-player-created-confirmation]")) return null;

    const accessibility = window.EconovariaAdminModalAccessibility;
    if (!accessibility || typeof accessibility.activate !== "function") return null;
    if (accessibility.getActiveController?.()?.backdrop === backdrop) return null;

    const acknowledgementRequired = Boolean(backdrop.closest(ACKNOWLEDGEMENT_SELECTOR) || backdrop.matches(ACKNOWLEDGEMENT_SELECTOR));
    const opener = lastOpener instanceof HTMLElement && lastOpener.isConnected ? lastOpener : null;
    const active = document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)
      ? document.activeElement
      : null;
    const binding = {
      backdrop,
      dialog,
      opener,
      controller: null,
      closingThroughBundle: false,
    };

    binding.controller = accessibility.activate({
      backdrop,
      dialog,
      opener,
      initialFocus: active,
      dismissOnEscape: !acknowledgementRequired,
      dismissOnBackdrop: !acknowledgementRequired,
      onClose(reason) {
        bindings.delete(binding);
        if (!backdrop.isConnected || reason === "close-button") return;
        const closeControl = existingCloseControl(dialog);
        if (closeControl) {
          binding.closingThroughBundle = true;
          closeControl.click();
          binding.closingThroughBundle = false;
        }
        if (backdrop.isConnected) backdrop.remove();
      },
    });

    backdrop.dataset.adminModalAccessibilityBound = "true";
    bindings.add(binding);
    backdrop.dispatchEvent(new CustomEvent("econovaria:admin-mounted-modal-bound", {
      bubbles: true,
      detail: {
        acknowledgementRequired,
        openerAction: opener?.getAttribute("data-admin-terminal-action") || "",
      },
    }));
    return binding;
  }

  function reconcile() {
    queued = false;
    pruneBindings();
    const dialogs = [...document.querySelectorAll(DIALOG_SELECTOR)].filter((dialog) => {
      return dialog instanceof HTMLElement && visible(dialog) && liveBackdrop(dialog);
    });
    dialogs.forEach(bindDialog);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => window.requestAnimationFrame(reconcile));
  }

  function scheduleSettledReconcile() {
    schedule();
    window.setTimeout(schedule, 0);
    window.setTimeout(schedule, 120);
    window.setTimeout(schedule, 360);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const backdrop = target.closest(BACKDROP_SELECTOR);
    const binding = backdrop instanceof HTMLElement ? bindingFor(backdrop) : null;
    const closeControl = target.closest(CLOSE_SELECTOR);
    if (binding && closeControl && !binding.closingThroughBundle) {
      binding.controller?.close?.("close-button");
      return;
    }

    const action = target.closest("[data-admin-terminal-action]");
    if (action instanceof HTMLElement && !action.closest(DIALOG_SELECTOR)) {
      lastOpener = action;
      scheduleSettledReconcile();
      return;
    }

    if (binding) scheduleSettledReconcile();
  }, true);

  for (const eventName of [
    "econovaria:admin-route-mounted",
    "econovaria:admin-request-lifecycle",
    "econovaria:admin-account-surface-ready",
  ]) {
    document.addEventListener(eventName, scheduleSettledReconcile);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleSettledReconcile, { once: true });
  } else {
    scheduleSettledReconcile();
  }
  window.addEventListener("load", scheduleSettledReconcile, { once: true });

  window.EconovariaAdminModalLifecycleBridge = Object.freeze({
    reconcile: scheduleSettledReconcile,
    getBindingCount: () => bindings.size,
  });
})();
