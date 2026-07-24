(function installEconovariaLogoutAccountTriggerBridge() {
  "use strict";

  const CONTROL_SELECTOR = "button, [role='button'], a, [data-admin-terminal-action]";
  const LOGOUT_PATTERN = /(?:^|[\s_-])(?:sign[\s_-]*out|log[\s_-]*out|logout)(?:$|[\s_-])/i;

  function normalized(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function logoutSignals(control) {
    return [
      control?.getAttribute?.("data-admin-terminal-action"),
      control?.getAttribute?.("data-action"),
      control?.getAttribute?.("data-econovaria-admin-logout"),
      control?.id,
      control?.getAttribute?.("aria-label"),
      control?.getAttribute?.("title"),
      control?.textContent,
    ].map(normalized).filter(Boolean);
  }

  function isLogoutControl(control) {
    if (!(control instanceof Element)) return false;
    if (control.closest("[data-econovaria-admin-logout-confirmation]")) return false;
    if (control.hasAttribute("data-econovaria-admin-logout")) return true;
    return logoutSignals(control).some((signal) =>
      LOGOUT_PATTERN.test(` ${signal.toLowerCase()} `),
    );
  }

  function openConfirmation(control) {
    const confirmation = window.EconovariaAdminLogoutConfirmation;
    if (typeof confirmation?.open !== "function") return false;
    confirmation.open(control);
    return true;
  }

  function interceptPointer(event) {
    const control = event.target?.closest?.(CONTROL_SELECTOR);
    if (!isLogoutControl(control)) return;
    if (!openConfirmation(control)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function interceptKeyboard(event) {
    if (!["Enter", " "].includes(event.key)) return;
    const control = event.target?.closest?.(CONTROL_SELECTOR);
    if (control instanceof HTMLButtonElement) return;
    if (!isLogoutControl(control)) return;
    if (!openConfirmation(control)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  window.addEventListener("click", interceptPointer, true);
  window.addEventListener("keydown", interceptKeyboard, true);

  window.EconovariaAdminLogoutAccountTriggerBridge = Object.freeze({
    isLogoutControl,
  });
})();
