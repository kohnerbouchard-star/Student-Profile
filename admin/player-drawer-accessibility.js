(function initEconovariaPlayerDrawerAccessibility() {
  "use strict";

  const DRAWER_SELECTOR = "[data-admin-terminal-player-drawer]";
  const DOSSIER_SELECTOR = ".admin-terminal-player-dossier-v296";
  const OPENER_SELECTOR = '[data-admin-terminal-action="select-player-panel"]';
  const CLOSE_SELECTOR = [
    "[data-admin-player-drawer-close]",
    "[data-admin-terminal-action*='close-player']",
    "[data-admin-terminal-action*='dismiss-player']",
    "[aria-label^='Close player']",
    "[aria-label='Close']",
  ].join(",");

  const bindings = new Set();
  let lastOpener = null;
  let scheduled = false;

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
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

  function semanticOpener(opener) {
    if (!(opener instanceof HTMLElement)) return null;
    if (opener.isConnected && visible(opener) && enabled(opener)) return opener;
    const playerId = opener.getAttribute("data-player-id");
    const selectors = [];
    if (playerId) selectors.push(`${OPENER_SELECTOR}[data-player-id="${CSS.escape(playerId)}"]`);
    if (opener.id) selectors.push(`#${CSS.escape(opener.id)}`);
    selectors.push(OPENER_SELECTOR);
    for (const selector of selectors) {
      const candidate = [...document.querySelectorAll(selector)].find((element) => {
        return element instanceof HTMLElement && visible(element) && enabled(element);
      });
      if (candidate) return candidate;
    }
    return null;
  }

  function closeThroughRenderer(binding) {
    const { dossier, drawer, opener } = binding;
    const closeControl = [...dossier.querySelectorAll(CLOSE_SELECTOR)].find((element) => {
      return element instanceof HTMLElement && visible(element) && enabled(element) && !drawer.contains(element);
    }) || null;
    if (closeControl) closeControl.click();
    else semanticOpener(opener)?.click();
    if (dossier.isConnected) dossier.remove();
  }

  function bindingFor(drawer) {
    return [...bindings].find((binding) => binding.drawer === drawer) || null;
  }

  function prune() {
    for (const binding of [...bindings]) {
      if (binding.drawer.isConnected && binding.dossier.isConnected) continue;
      bindings.delete(binding);
      binding.controller?.destroy?.({ remove: false, restoreFocus: true });
    }
  }

  function bind(drawer) {
    if (!(drawer instanceof HTMLElement) || !visible(drawer) || bindingFor(drawer)) return null;
    const dossier = drawer.closest(DOSSIER_SELECTOR);
    if (!(dossier instanceof HTMLElement)) return null;
    const accessibility = window.EconovariaAdminModalAccessibility;
    if (!accessibility || typeof accessibility.activate !== "function") return null;

    const opener = lastOpener instanceof HTMLElement ? lastOpener : null;
    const binding = { drawer, dossier, opener, controller: null };
    binding.controller = accessibility.activate({
      backdrop: dossier,
      dialog: drawer,
      opener,
      initialFocus: drawer.querySelector('[role="tab"][aria-selected="true"]'),
      dismissOnEscape: true,
      dismissOnBackdrop: false,
      trapFocus: true,
      applyDialogSemantics: false,
      onClose() {
        bindings.delete(binding);
        closeThroughRenderer(binding);
      },
    });
    drawer.dataset.adminPlayerDrawerAccessibilityBound = "true";
    bindings.add(binding);
    binding.controller.focusFirst();
    drawer.dispatchEvent(new CustomEvent("econovaria:admin-player-drawer-accessibility-bound", {
      bubbles: true,
      detail: { playerId: opener?.getAttribute("data-player-id") || "" },
    }));
    return binding;
  }

  function reconcile() {
    scheduled = false;
    prune();
    [...document.querySelectorAll(DRAWER_SELECTOR)].forEach(bind);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(reconcile);
    window.setTimeout(reconcile, 0);
    window.setTimeout(reconcile, 120);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const opener = target?.closest(OPENER_SELECTOR);
    if (!(opener instanceof HTMLElement)) return;
    lastOpener = opener;
    schedule();
  }, true);

  document.addEventListener("econovaria:admin-route-mounted", schedule);
  window.addEventListener("load", schedule, { once: true });
  schedule();

  window.EconovariaPlayerDrawerAccessibility = Object.freeze({
    reconcile: schedule,
    getBindingCount: () => bindings.size,
  });
})();