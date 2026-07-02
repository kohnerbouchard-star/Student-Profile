// Boot sequence and public API export.
  function startClock() {
    if (window.Econovaria.features.adminOverviewTerminal.clockTimer) return;

    window.Econovaria.features.adminOverviewTerminal.clockTimer = window.setInterval(() => {
      document.querySelectorAll("[data-admin-terminal-clock]").forEach((node) => {
        node.textContent = new Date().toLocaleTimeString([], { hour12: false });
      });
    }, 1000);
  }

  injectStyles();
  bindTerminalOverviewEvents();
  bindScannerModeHardSwitch();
  bindTerminalScannerInputCapture();
  bindTerminalClickableKeyboard();
  bindSciIdAvatarInput();
  bindTerminalModalKeyboard();
  startClock();

  window.requestAnimationFrame(syncInitialMenuStates);

  Object.assign(window.Econovaria.features.adminOverviewTerminal, {
    render,
    renderShell,
    renderLeftMenu,
    renderModalShell,
    renderAttendanceScannerModal,
    renderAddContractModal,
    renderAddPlayerModal,
    renderAddStoreItemModal,
    renderDashboardPlayerProfileModal,
    renderDashboardContractProfileModal,
    openTerminalModal,
    closeTerminalModal,
    closeAllTerminalModals,
    setScannerMode,
    addStagedContractReward,
    updateContractPreview,
    updatePlayerPreview,
    updateStoreItemPreview,
    openTerminalPreviewOverlay,
    closeTerminalPreviewOverlay,
    injectStyles
  });
})();
