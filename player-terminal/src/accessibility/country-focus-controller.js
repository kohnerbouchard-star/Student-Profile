function countrySelector(countryId) {
  const value = String(countryId || "");
  if (!value) return "";
  return `.player-terminal-country-region[data-player-country="${CSS.escape(value)}"]`;
}

export function installCountryFocusController(mount) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };

  let restoreSelector = "";
  let countryDialogOpen = false;
  let focusQueued = false;

  function queueFocusRestore() {
    if (!restoreSelector || focusQueued) return;
    focusQueued = true;
    requestAnimationFrame(() => {
      focusQueued = false;
      const target = mount.querySelector(restoreSelector);
      if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
    });
  }

  function rememberCountry(event) {
    const country = event.target.closest?.(".player-terminal-country-region[data-player-country]");
    if (!country) return;
    restoreSelector = countrySelector(country.dataset.playerCountry);
  }

  const observer = new MutationObserver(() => {
    const isOpen = Boolean(mount.querySelector(".player-terminal-country-modal[role=\"dialog\"]"));
    if (countryDialogOpen && !isOpen) queueFocusRestore();
    countryDialogOpen = isOpen;
  });

  mount.addEventListener("click", rememberCountry, true);
  mount.addEventListener("keydown", rememberCountry, true);
  observer.observe(mount, { childList: true, subtree: true });

  return {
    destroy() {
      observer.disconnect();
      mount.removeEventListener("click", rememberCountry, true);
      mount.removeEventListener("keydown", rememberCountry, true);
      restoreSelector = "";
    }
  };
}
