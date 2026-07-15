(function initEconovariaAdminInteractionQualityControlReset() {
  "use strict";

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function restoreCompletedControl(button) {
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    const qualityState = text(button.dataset.adminQolState).toLowerCase();
    const apiState = text(button.dataset.adminTerminalApiState).toLowerCase();
    const completedState = ["success", "error"].includes(qualityState) ||
      ["ok", "error", "failed"].includes(apiState);
    if (!completedState) return;
    if (button.dataset.adminQolOriginalDisabled === "true") return;
    if (button.getAttribute("aria-disabled") === "true") {
      button.removeAttribute("aria-disabled");
    }
  }

  function scannerElements(root = document) {
    const consoleElement = root.querySelector?.("[data-admin-terminal-scanner-console]") ||
      document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleElement) return null;
    return {
      consoleElement,
      state: consoleElement.querySelector("[data-admin-terminal-scanner-state]"),
      empty: consoleElement.querySelector("[data-admin-terminal-last-scan-empty]"),
      result: consoleElement.querySelector("[data-admin-terminal-last-scan-result]"),
      player: consoleElement.querySelector("[data-admin-terminal-last-scan-player]"),
      autoPanel: consoleElement.querySelector("[data-admin-terminal-auto-panel]"),
      manualPanel: consoleElement.querySelector("[data-admin-terminal-manual-panel]"),
    };
  }

  function setPanel(panel, title, detail) {
    if (!panel) return;
    const strong = panel.querySelector("strong");
    const small = panel.querySelector("small");
    if (strong) strong.textContent = title;
    if (small) small.textContent = detail;
  }

  function setScannerReady(options = {}) {
    const elements = scannerElements();
    if (!elements) return;
    const currentState = text(elements.consoleElement.dataset.adminQolScannerState).toLowerCase();
    if (!options.force && ["processing", "completed", "error"].includes(currentState)) return;

    delete elements.consoleElement.dataset.adminQolScannerState;
    elements.consoleElement.removeAttribute("aria-busy");
    if (elements.state) elements.state.textContent = "Ready";
    setPanel(elements.autoPanel, "Listening", "Auto-submit is active.");
    setPanel(elements.manualPanel, "Manual entry", "Fallback mode");

    const playerName = text(elements.player?.textContent);
    const hasLastScan = Boolean(playerName && !["—", "-"].includes(playerName));
    if (hasLastScan) {
      if (elements.result) elements.result.hidden = false;
      if (elements.empty) elements.empty.hidden = true;
    } else if (elements.empty) {
      elements.empty.hidden = false;
      if (elements.result) elements.result.hidden = true;
      const strong = elements.empty.querySelector("strong");
      const small = elements.empty.querySelector("small");
      if (strong) strong.textContent = "Ready";
      if (small) small.textContent = "Scan a player code. The result appears here.";
    }
  }

  function reconcile(root = document) {
    root.querySelectorAll?.("button[data-admin-terminal-action]").forEach(restoreCompletedControl);
    const elements = scannerElements(root);
    if (!elements) return;
    if (text(elements.state?.textContent).toLowerCase() === "armed") {
      setScannerReady({ force: true });
    } else if (!text(elements.state?.textContent)) {
      setScannerReady();
    }
  }

  document.addEventListener("input", (event) => {
    const input = event.target instanceof Element
      ? event.target.closest("[data-admin-terminal-manual-scan-input], [data-admin-terminal-auto-scan-input]")
      : null;
    if (!input) return;
    const elements = scannerElements();
    if (text(elements?.consoleElement.dataset.adminQolScannerState).toLowerCase() === "error") {
      setScannerReady({ force: true });
    }
  }, true);

  if (document.body && typeof MutationObserver === "function") {
    const observer = new MutationObserver((mutations) => {
      const roots = new Set([document]);
      for (const mutation of mutations) {
        if (mutation.target instanceof Element) roots.add(mutation.target);
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) roots.add(node);
        }
      }
      window.requestAnimationFrame(() => roots.forEach((root) => reconcile(root)));
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled", "data-admin-qol-state", "data-admin-terminal-api-state"],
    });
  }

  document.addEventListener("DOMContentLoaded", () => reconcile(document), { once: true });
  reconcile(document);

  window.EconovariaAdminInteractionQualityControlReset = {
    restoreCompletedControl,
    setScannerReady,
    reconcile,
  };
})();