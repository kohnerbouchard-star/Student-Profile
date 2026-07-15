(function initEconovariaPlayerCreateLifecycle() {
  "use strict";

  const CREATE_FORM_BY_ACTION = new Map([
    ["create-contract", "[data-admin-terminal-contract-form]"],
    ["create-player", "[data-admin-terminal-player-form]"],
    ["save-store-item", "[data-admin-terminal-store-form]"],
  ]);

  function closeOpenPlayerCreateModal() {
    const form = document.querySelector("[data-admin-terminal-player-form]");
    if (!form) return false;

    const backdrop = form.closest("[data-admin-terminal-modal-backdrop]");
    const closeButton = backdrop?.querySelector("[data-admin-terminal-modal-close]");
    if (closeButton instanceof HTMLElement) {
      closeButton.click();
      return true;
    }

    if (backdrop instanceof HTMLElement) {
      backdrop.remove();
      return true;
    }

    return false;
  }

  function decoratePlayerCreateForm() {
    const wiring = window.EconovariaPlayerIdentityWiring;
    if (!wiring || typeof wiring.decorateCreateForm !== "function") return false;

    const form = document.querySelector("[data-admin-terminal-player-form]");
    if (!form) return false;
    wiring.decorateCreateForm(form);
    return Boolean(
      form.querySelector('[name="playerIdentifier"]') &&
      form.querySelector('[name="accessCode"]'),
    );
  }

  function scheduleCreateFormDecoration() {
    window.requestAnimationFrame(() => {
      if (decoratePlayerCreateForm()) return;
      window.setTimeout(decoratePlayerCreateForm, 80);
    });
  }

  function guardDelegatedCreateAction(event, target) {
    const button = target?.closest("button[data-admin-terminal-action]");
    if (!(button instanceof HTMLButtonElement)) return;

    const action = String(button.dataset.adminTerminalAction || "").trim();
    const selector = CREATE_FORM_BY_ACTION.get(action);
    if (!selector) return;

    const form = button.closest(selector) || document.querySelector(selector);
    const validator = window.EconovariaAdminInteractionQuality?.validateForm;
    if (!(form instanceof HTMLFormElement) || typeof validator !== "function") return;
    if (validator(form)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  window.addEventListener("econovaria:player-access-code-issued", () => {
    closeOpenPlayerCreateModal();
  });

  if (document.body && typeof MutationObserver === "function") {
    const observer = new MutationObserver((mutations) => {
      const playerFormAdded = mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) =>
          node instanceof Element && (
            node.matches?.("[data-admin-terminal-player-form]") ||
            node.querySelector?.("[data-admin-terminal-player-form]")
          )
        )
      );
      if (playerFormAdded) scheduleCreateFormDecoration();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    guardDelegatedCreateAction(event, target);
    if (target?.closest('[data-admin-terminal-action="add-player"]')) {
      scheduleCreateFormDecoration();
    }
  }, true);

  window.EconovariaPlayerCreateLifecycle = {
    closeOpenPlayerCreateModal,
    decoratePlayerCreateForm,
    guardDelegatedCreateAction,
  };
})();
