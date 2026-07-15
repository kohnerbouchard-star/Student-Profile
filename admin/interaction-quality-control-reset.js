(function initEconovariaAdminInteractionQualityControlReset() {
  "use strict";

  function restoreCompletedControl(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    const state = String(button.dataset.adminQolState || "").trim();
    if (!["success", "error"].includes(state)) return;
    if (button.dataset.adminQolOriginalDisabled === "true") return;

    if (button.disabled || button.hasAttribute("disabled")) {
      button.disabled = false;
      button.removeAttribute("disabled");
    }
    if (button.getAttribute("aria-disabled") === "true") {
      button.setAttribute("aria-disabled", "false");
    }
  }

  function reconcile(root = document) {
    root.querySelectorAll?.('button[data-admin-qol-state="success"], button[data-admin-qol-state="error"]')
      .forEach(restoreCompletedControl);
  }

  if (document.body && typeof MutationObserver === "function") {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target instanceof HTMLButtonElement) {
          restoreCompletedControl(mutation.target);
        }
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.('button[data-admin-qol-state="success"], button[data-admin-qol-state="error"]')) {
            restoreCompletedControl(node);
          }
          reconcile(node);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled", "data-admin-qol-state"],
    });
  }

  document.addEventListener("DOMContentLoaded", () => reconcile(document), { once: true });
  reconcile(document);

  window.EconovariaAdminInteractionQualityControlReset = {
    restoreCompletedControl,
    reconcile,
  };
})();
