(function initEconovariaAdminModalFocusOrderGuard() {
  "use strict";

  if (window.EconovariaAdminModalFocusOrderGuard) return;

  const BACKDROP_SELECTOR = [
    ".admin-terminal-modal-backdrop",
    "[data-admin-terminal-modal-backdrop]",
    "[data-admin-player-created-confirmation]",
  ].join(",");
  const DIALOG_SELECTOR = [
    "dialog[open]",
    "[role='dialog']",
    ".admin-terminal-modal",
    "[data-admin-terminal-player-drawer]",
  ].join(",");
  const FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[contenteditable='true']",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      rect.width > 0 && rect.height > 0;
  }

  function enabled(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.getAttribute("aria-disabled") === "true") return false;
    return !("disabled" in element && element.disabled === true);
  }

  function topmostExternalDialog(background) {
    const backdrops = [...document.querySelectorAll(BACKDROP_SELECTOR)]
      .filter((element) => {
        return element instanceof HTMLElement &&
          !background.contains(element) && visible(element);
      });
    const backdrop = backdrops.at(-1);
    if (!(backdrop instanceof HTMLElement)) return null;
    if (backdrop.matches(DIALOG_SELECTOR)) return backdrop;
    const dialog = backdrop.querySelector(DIALOG_SELECTOR);
    return dialog instanceof HTMLElement && visible(dialog) ? dialog : null;
  }

  function focusDialogBeforeBackgroundInert(background) {
    if (!(background instanceof HTMLElement)) return false;
    const active = document.activeElement;
    if (!(active instanceof Node) || !background.contains(active)) return false;

    const dialog = topmostExternalDialog(background);
    if (!dialog) return false;
    const target = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
      .find((element) => visible(element) && enabled(element)) || dialog;
    if (!(target instanceof HTMLElement)) return false;
    if (target === dialog && !dialog.hasAttribute("tabindex")) {
      dialog.tabIndex = -1;
    }
    target.focus({ preventScroll: true });
    return dialog.contains(document.activeElement);
  }

  function descriptorOwner(prototype, property) {
    let current = prototype;
    while (current) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (descriptor) return { owner: current, descriptor };
      current = Object.getPrototypeOf(current);
    }
    return null;
  }

  const inertProperty = descriptorOwner(HTMLElement.prototype, "inert");
  let inertPatched = false;
  if (
    inertProperty?.descriptor?.get &&
    inertProperty?.descriptor?.set &&
    inertProperty.descriptor.configurable !== false
  ) {
    const { owner, descriptor } = inertProperty;
    Object.defineProperty(owner, "inert", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        if (Boolean(value) && this instanceof HTMLElement) {
          focusDialogBeforeBackgroundInert(this);
        }
        descriptor.set.call(this, value);
      },
    });
    inertPatched = true;
  }

  window.EconovariaAdminModalFocusOrderGuard = Object.freeze({
    focusDialogBeforeBackgroundInert,
    inertPatched,
  });
})();
