(function initEconovariaAdminInteractionQualityClickGuard() {
  "use strict";

  const CREATE_FORMS = new Map([
    ["create-contract", "[data-admin-terminal-contract-form]"],
    ["create-player", "[data-admin-terminal-player-form]"],
    ["save-store-item", "[data-admin-terminal-store-form]"],
  ]);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("button[data-admin-terminal-action]");
    if (!(button instanceof HTMLButtonElement)) return;

    const action = String(button.dataset.adminTerminalAction || "").trim();
    const selector = CREATE_FORMS.get(action);
    if (!selector) return;

    const form = button.closest(selector) || document.querySelector(selector);
    const validator = window.EconovariaAdminInteractionQuality?.validateForm;
    if (!(form instanceof HTMLFormElement) || typeof validator !== "function") return;

    if (validator(form)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
