import assert from "node:assert/strict";

// The sole approved source-level exception to the immutable v606 terminal.
// Reconstruct the exact original bytes, then keep checking the historical hash.
// Neither arbitrary scanner edits nor unrelated terminal drift are permitted.
export const originalScannerFocus = `  function getActiveScannerInput() {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleRoot) return null;
    const isManual = consoleRoot.dataset.scanMode === "manual";
    return isManual
      ? consoleRoot.querySelector("[data-admin-terminal-manual-scan-input]")
      : consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
  }
  function focusActiveScannerInput() {
    const input = getActiveScannerInput();
    window.requestAnimationFrame(() => input?.focus?.());
  }
  function setScannerMode(mode) {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleRoot) return;
    const nextMode = mode === "manual" ? "manual" : "auto";
    const autoPanel = consoleRoot.querySelector("[data-admin-terminal-auto-panel]");
    const manualPanel = consoleRoot.querySelector("[data-admin-terminal-manual-panel]");
    const modeLabel = consoleRoot.querySelector("[data-admin-terminal-mode-label]");
    const state = consoleRoot.querySelector("[data-admin-terminal-scanner-state]");
    const autoInput = consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
    const manualInput = consoleRoot.querySelector("[data-admin-terminal-manual-scan-input]");
    const autoButton = consoleRoot.querySelector('[data-admin-terminal-set-mode="auto"]');
    const manualButton = consoleRoot.querySelector('[data-admin-terminal-set-mode="manual"]');
    consoleRoot.dataset.scanMode = nextMode;
    if (autoButton) autoButton.setAttribute("aria-pressed", nextMode === "auto" ? "true" : "false");
    if (manualButton) manualButton.setAttribute("aria-pressed", nextMode === "manual" ? "true" : "false");
    if (autoPanel) {
      autoPanel.hidden = nextMode !== "auto";
      autoPanel.style.display = nextMode === "auto" ? "grid" : "none";
      autoPanel.setAttribute("aria-hidden", nextMode === "auto" ? "false" : "true");
    }
    if (manualPanel) {
      manualPanel.hidden = nextMode !== "manual";
      manualPanel.style.display = nextMode === "manual" ? "grid" : "none";
      manualPanel.setAttribute("aria-hidden", nextMode === "manual" ? "false" : "true");
    }
    if (modeLabel) modeLabel.textContent = nextMode === "manual" ? "Manual" : "Auto";
    if (state) {
      state.textContent = nextMode === "manual" ? "Manual input ready" : "Armed";
      state.classList.remove("is-captured");
    }
    window.clearTimeout(window.Econovaria.features.adminOverviewTerminal.scannerAutoSubmitTimer);
    window.requestAnimationFrame(() => {
      if (nextMode === "manual") manualInput?.focus?.();
      else autoInput?.focus?.();
    });
  }
`;

export const guardedScannerFocus = `  function getActiveScannerInput() {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleRoot) return null;
    const isManual = consoleRoot.dataset.scanMode === "manual";
    return isManual
      ? consoleRoot.querySelector("[data-admin-terminal-manual-scan-input]")
      : consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
  }
  let scannerFocusRequest = 0;
  function queueScannerInputFocus(consoleRoot, input, { preserveFocus = false, focusOrigin = document.activeElement } = {}) {
    const request = ++scannerFocusRequest;
    if (!consoleRoot || !input) return;
    const mode = consoleRoot.dataset.scanMode;
    const dialog = consoleRoot.closest(".admin-terminal-modal");
    window.requestAnimationFrame(() => {
      if (request !== scannerFocusRequest || !consoleRoot.isConnected || !input.isConnected) return;
      if (document.querySelector("[data-admin-terminal-scanner-console]") !== consoleRoot) return;
      if (consoleRoot.dataset.scanMode !== mode || getActiveScannerInput() !== input) return;
      if (input.disabled || input.closest('[hidden], [inert], [aria-hidden="true"]')) return;
      const owner = window.EconovariaAdminModalAccessibility?.getActiveController?.();
      if (owner?.dialog && owner.dialog !== dialog) return;
      const active = document.activeElement;
      const hiddenInputBlur = active === document.body && focusOrigin !== input &&
        consoleRoot.contains(focusOrigin) &&
        focusOrigin?.matches?.("[data-admin-terminal-auto-scan-input], [data-admin-terminal-manual-scan-input]") &&
        Boolean(focusOrigin.closest('[hidden], [aria-hidden="true"]'));
      if (active !== focusOrigin && active !== input && !hiddenInputBlur) return;
      if (preserveFocus && dialog?.contains(active) && active !== input && active !== dialog) return;
      input.focus();
    });
  }
  function focusActiveScannerInput() {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    queueScannerInputFocus(consoleRoot, getActiveScannerInput());
  }
  function setScannerMode(mode, { preserveFocus = false } = {}) {
    const consoleRoot = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleRoot) return;
    const focusOrigin = document.activeElement;
    const nextMode = mode === "manual" ? "manual" : "auto";
    const autoPanel = consoleRoot.querySelector("[data-admin-terminal-auto-panel]");
    const manualPanel = consoleRoot.querySelector("[data-admin-terminal-manual-panel]");
    const modeLabel = consoleRoot.querySelector("[data-admin-terminal-mode-label]");
    const state = consoleRoot.querySelector("[data-admin-terminal-scanner-state]");
    const autoInput = consoleRoot.querySelector("[data-admin-terminal-auto-scan-input]");
    const manualInput = consoleRoot.querySelector("[data-admin-terminal-manual-scan-input]");
    const autoButton = consoleRoot.querySelector('[data-admin-terminal-set-mode="auto"]');
    const manualButton = consoleRoot.querySelector('[data-admin-terminal-set-mode="manual"]');
    consoleRoot.dataset.scanMode = nextMode;
    if (autoButton) autoButton.setAttribute("aria-pressed", nextMode === "auto" ? "true" : "false");
    if (manualButton) manualButton.setAttribute("aria-pressed", nextMode === "manual" ? "true" : "false");
    if (autoPanel) {
      autoPanel.hidden = nextMode !== "auto";
      autoPanel.style.display = nextMode === "auto" ? "grid" : "none";
      autoPanel.setAttribute("aria-hidden", nextMode === "auto" ? "false" : "true");
    }
    if (manualPanel) {
      manualPanel.hidden = nextMode !== "manual";
      manualPanel.style.display = nextMode === "manual" ? "grid" : "none";
      manualPanel.setAttribute("aria-hidden", nextMode === "manual" ? "false" : "true");
    }
    if (modeLabel) modeLabel.textContent = nextMode === "manual" ? "Manual" : "Auto";
    if (state) {
      state.textContent = nextMode === "manual" ? "Manual input ready" : "Armed";
      state.classList.remove("is-captured");
    }
    window.clearTimeout(window.Econovaria.features.adminOverviewTerminal.scannerAutoSubmitTimer);
    queueScannerInputFocus(consoleRoot, nextMode === "manual" ? manualInput : autoInput, { preserveFocus, focusOrigin });
  }
`;

export const originalScannerBinding = `    setScannerMode(scanner.dataset.scanMode === "manual" ? "manual" : "auto");`;

export const guardedScannerBinding = `    setScannerMode(scanner.dataset.scanMode === "manual" ? "manual" : "auto", { preserveFocus: true });`;

export function normalizeScannerFocusSource(source) {
  let normalized = source;
  for (const [guarded, original] of [
    [guardedScannerFocus, originalScannerFocus],
    [guardedScannerBinding, originalScannerBinding],
  ]) {
    assert.equal(normalized.split(guarded).length - 1, 1,
      "The terminal must contain exactly one reviewed scanner focus correction.");
    normalized = normalized.replace(guarded, original);
  }
  return normalized;
}
