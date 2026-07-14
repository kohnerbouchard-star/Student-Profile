(function initEconovariaPlayerCreateLifecycle() {
  "use strict";

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
    if (target?.closest('[data-admin-terminal-action="add-player"]')) {
      scheduleCreateFormDecoration();
    }
  }, true);

  window.EconovariaPlayerCreateLifecycle = {
    closeOpenPlayerCreateModal,
    decoratePlayerCreateForm,
  };
})();