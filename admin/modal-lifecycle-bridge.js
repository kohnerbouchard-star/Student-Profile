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
  const delegatedBundleCloseControls = new WeakSet();
  let lastOpener = null;
  let queued = false;

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function enabled(element) {
    if (!(element instanceof HTMLElement)) return false;
    return !("disabled" in element && element.disabled === true) && element.getAttribute("aria-disabled") !== "true";
  }

  function semanticOpenerTarget(opener) {
    if (!(opener instanceof HTMLElement)) return null;
    if (opener.isConnected && visible(opener) && enabled(opener)) return opener;
    const selectors = [];
    const action = opener.getAttribute("data-admin-terminal-action");
    const section = opener.getAttribute("data-admin-section");
    if (action) selectors.push(`[data-admin-terminal-action="${CSS.escape(action)}"]`);
    if (section) selectors.push(`[data-admin-section="${CSS.escape(section)}"]`);
    if (opener.id) selectors.push(`#${CSS.escape(opener.id)}`);
    for (const selector of selectors) {
      const candidate = [...document.querySelectorAll(selector)].find((element) => {
        return element instanceof HTMLElement && element.isConnected && visible(element) && enabled(element);
      });
      if (candidate) return candidate;
    }
    return null;
  }

  function restoreOpenerAfterBundleClose(opener) {
    function focusResolvedOpener() {
      const target = semanticOpenerTarget(opener);
      if (!(target instanceof HTMLElement)) return;
      const activeController = window.EconovariaAdminModalAccessibility?.getActiveController?.();
      if (activeController?.dialog instanceof HTMLElement && !activeController.dialog.contains(target)) return;
      target.focus({ preventScroll: true });
    }

    window.requestAnimationFrame(focusResolvedOpener);
    window.setTimeout(focusResolvedOpener, 0);
    window.setTimeout(focusResolvedOpener, 80);
    window.setTimeout(focusResolvedOpener, 120);
    window.setTimeout(focusResolvedOpener, 360);
  }

  function liveBackdrop(dialog) {
    const backdrop = dialog.closest(BACKDROP_SELECTOR);
    return backdrop instanceof HTMLElement && visible(backdrop) ? backdrop : null;
  }

  function bindingForDialog(dialog) {
    return [...bindings].find((binding) => binding.dialog === dialog) || null;
  }

  function bindingForTarget(target) {
    if (!(target instanceof Node)) return null;
    let selected = null;
    for (const binding of bindings) {
      if (!binding.dialog.contains(target)) continue;
      if (!selected || selected.dialog.contains(binding.dialog)) selected = binding;
    }
    return selected;
  }

  function pruneBindings() {
    for (const binding of [...bindings]) {
      if (binding.backdrop.isConnected && binding.dialog.isConnected && visible(binding.dialog)) continue;
      bindings.delete(binding);
      binding.controller?.destroy?.({ remove: false, restoreFocus: true });
    }
  }

  function existingCloseControl(dialog) {
    return [...dialog.querySelectorAll(CLOSE_SELECTOR)].find((control) => {
      return control instanceof HTMLElement && visible(control) && enabled(control);
    }) || null;
  }

  function bindDialog(dialog) {
    if (!(dialog instanceof HTMLElement) || !visible(dialog)) return null;
    const backdrop = liveBackdrop(dialog);
    if (!backdrop || bindingForDialog(dialog)) return null;
    if (backdrop.matches("[data-admin-player-created-confirmation]")) return null;

    const accessibility = window.EconovariaAdminModalAccessibility;
    if (!accessibility || typeof accessibility.activate !== "function") return null;
    if (accessibility.getActiveController?.()?.dialog === dialog) return null;

    const acknowledgementRequired = Boolean(backdrop.closest(ACKNOWLEDGEMENT_SELECTOR) || backdrop.matches(ACKNOWLEDGEMENT_SELECTOR));
    const opener = lastOpener instanceof HTMLElement ? lastOpener : null;
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
        const backdropSharedByParent = [...bindings].some((candidate) => candidate.backdrop === backdrop);
        if (backdrop.isConnected && reason !== "close-button" && reason !== "destroyed") {
          const closeControl = existingCloseControl(dialog);
          if (closeControl) {
            binding.closingThroughBundle = true;
            delegatedBundleCloseControls.add(closeControl);
            closeControl.click();
            delegatedBundleCloseControls.delete(closeControl);
            binding.closingThroughBundle = false;
          }
          if (!backdropSharedByParent && backdrop.isConnected) backdrop.remove();
        }
        restoreOpenerAfterBundleClose(binding.opener);
      },
    });

    if (!(active instanceof HTMLElement)) binding.controller.focusFirst();
    backdrop.dataset.adminModalAccessibilityBound = "true";
    bindings.add(binding);
    backdrop.dispatchEvent(new CustomEvent("econovaria:admin-mounted-modal-bound", {
      bubbles: true,
      detail: {
        acknowledgementRequired,
        openerAction: opener?.getAttribute("data-admin-terminal-action") || "",
        sharedBackdrop: [...bindings].some((candidate) => candidate !== binding && candidate.backdrop === backdrop),
      },
    }));
    return binding;
  }

  function reconcile() {
    queued = false;
    pruneBindings();
    const dialogs = [...document.querySelectorAll(DIALOG_SELECTOR)].filter((dialog) => {
      return dialog instanceof HTMLElement && visible(dialog) && liveBackdrop(dialog);
    }).sort((left, right) => {
      if (left.contains(right)) return -1;
      if (right.contains(left)) return 1;
      return 0;
    });
    dialogs.forEach(bindDialog);
  }

  function reconcileAfterCurrentEvent() {
    if (typeof window.queueMicrotask === "function") {
      window.queueMicrotask(reconcile);
      return;
    }
    Promise.resolve().then(reconcile);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => window.requestAnimationFrame(reconcile));
  }

  function scheduleSettledReconcile() {
    schedule();
    window.setTimeout(reconcile, 0);
    window.setTimeout(schedule, 120);
    window.setTimeout(schedule, 360);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const closeControl = target.closest(CLOSE_SELECTOR);
    if (closeControl && delegatedBundleCloseControls.has(closeControl)) return;
    const binding = bindingForTarget(target);
    if (binding && closeControl && !binding.closingThroughBundle) {
      binding.controller?.close?.("close-button");
      return;
    }

    const action = target.closest("[data-admin-terminal-action]");
    if (action instanceof HTMLElement && !closeControl) {
      lastOpener = action;
      scheduleSettledReconcile();
      return;
    }

    if (binding) scheduleSettledReconcile();
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const closeControl = target?.closest(CLOSE_SELECTOR);
    const action = target?.closest("[data-admin-terminal-action]");
    if (action instanceof HTMLElement && !closeControl) reconcileAfterCurrentEvent();
  });

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

  void import("./player-drawer-accessibility.js");
})();