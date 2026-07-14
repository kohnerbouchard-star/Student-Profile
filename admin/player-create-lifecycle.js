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

  window.addEventListener("econovaria:player-access-code-issued", () => {
    closeOpenPlayerCreateModal();
  });

  window.EconovariaPlayerCreateLifecycle = {
    closeOpenPlayerCreateModal,
  };
})();
