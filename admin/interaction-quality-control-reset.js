(function initEconovariaAdminInteractionQualityControlReset() {
  "use strict";

  const SCANNER_SUCCESS_RESET_MS = 1800;
  const SCANNER_ERROR_RESET_MS = 2600;
  const scannerResetTimers = new WeakMap();

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
      manualInput: consoleElement.querySelector("[data-admin-terminal-manual-scan-input]"),
      autoInput: consoleElement.querySelector("[data-admin-terminal-auto-scan-input]"),
    };
  }

  function setPanel(panel, title, detail) {
    if (!panel) return;
    const strong = panel.querySelector("strong");
    const small = panel.querySelector("small");
    if (strong) strong.textContent = title;
    if (small) small.textContent = detail;
  }

  function cancelScannerAutoReset(consoleElement) {
    if (!(consoleElement instanceof Element)) return;
    const timer = scannerResetTimers.get(consoleElement);
    if (timer) window.clearTimeout(timer);
    scannerResetTimers.delete(consoleElement);
  }

  function clearScannerFieldError(input) {
    if (!(input instanceof HTMLElement)) return;
    input.removeAttribute("aria-invalid");
    const errorId = input.dataset.adminQolErrorId;
    if (errorId) {
      document.getElementById(errorId)?.remove();
      delete input.dataset.adminQolErrorId;
    }
    input.closest(".admin-terminal-field, label")?.classList.remove("is-invalid");
    const describedBy = text(input.getAttribute("aria-describedby"))
      .split(" ")
      .filter((value) => value && value !== errorId)
      .join(" ");
    if (describedBy) input.setAttribute("aria-describedby", describedBy);
    else input.removeAttribute("aria-describedby");
  }

  function activeScannerInput(elements) {
    if (!elements) return null;
    const manualVisible = elements.manualPanel && !elements.manualPanel.hidden &&
      getComputedStyle(elements.manualPanel).display !== "none";
    return manualVisible ? elements.manualInput : (elements.autoInput || elements.manualInput);
  }

  function focusScannerInput(elements, forceFocus) {
    const current = elements || scannerElements();
    const input = activeScannerInput(current);
    if (!(input instanceof HTMLElement)) return;
    const active = document.activeElement;
    const activeInsideScanner = active instanceof HTMLElement &&
      current.consoleElement.contains(active);
    if (!forceFocus && activeInsideScanner && active !== input) return;
    input.focus({ preventScroll: true });
  }

  function clearScannerResult(elements) {
    if (!elements) return;
    for (const input of [elements.manualInput, elements.autoInput]) {
      if (!(input instanceof HTMLInputElement)) continue;
      input.value = "";
      clearScannerFieldError(input);
    }
    if (elements.player) elements.player.textContent = "—";
    if (elements.result) elements.result.hidden = true;
    if (elements.empty) {
      elements.empty.hidden = false;
      const strong = elements.empty.querySelector("strong");
      const small = elements.empty.querySelector("small");
      if (strong) strong.textContent = "Ready";
      if (small) small.textContent = "Scan a player code. The result appears here.";
    }
  }

  function setScannerReady(options = {}) {
    const elements = scannerElements();
    if (!elements) return;
    const currentState = text(elements.consoleElement.dataset.adminQolScannerState).toLowerCase();
    if (!options.force && ["processing", "completed", "error"].includes(currentState)) return;

    cancelScannerAutoReset(elements.consoleElement);
    delete elements.consoleElement.dataset.adminQolScannerState;
    elements.consoleElement.removeAttribute("aria-busy");
    if (elements.state) elements.state.textContent = "Ready";
    setPanel(elements.autoPanel, "Listening", "Auto-submit is active.");
    setPanel(elements.manualPanel, "Manual entry", "Fallback mode");

    if (options.clear === true) {
      clearScannerResult(elements);
    } else {
      const playerName = text(elements.player?.textContent);
      const hasLastScan = Boolean(playerName && !["—", "-"].includes(playerName));
      if (hasLastScan) {
        if (elements.result) elements.result.hidden = false;
        if (elements.empty) elements.empty.hidden = true;
      } else {
        clearScannerResult(elements);
      }
    }

    if (options.focus === true) {
      window.requestAnimationFrame(() => {
        focusScannerInput(scannerElements(), options.forceFocus === true);
      });
    }
  }

  function scheduleScannerAutoReset(state) {
    const elements = scannerElements();
    if (!elements || !["completed", "error"].includes(state)) return;
    cancelScannerAutoReset(elements.consoleElement);
    const delay = state === "completed" ? SCANNER_SUCCESS_RESET_MS : SCANNER_ERROR_RESET_MS;
    const timer = window.setTimeout(() => {
      const current = scannerElements();
      if (!current) return;
      const dataState = text(current.consoleElement.dataset.adminQolScannerState).toLowerCase();
      const visibleState = text(current.state?.textContent).toLowerCase();
      if (![state, "armed"].includes(dataState) && ![state, "armed"].includes(visibleState)) return;
      setScannerReady({ force: true, clear: true, focus: true, forceFocus: true });
    }, delay);
    scannerResetTimers.set(elements.consoleElement, timer);
  }

  function reconcile(root = document) {
    root.querySelectorAll?.("button[data-admin-terminal-action]").forEach(restoreCompletedControl);
    const elements = scannerElements(root);
    if (!elements) return;
    const dataState = text(elements.consoleElement.dataset.adminQolScannerState).toLowerCase();
    const visibleState = text(elements.state?.textContent).toLowerCase();

    if (dataState === "processing" || visibleState === "scanning") {
      cancelScannerAutoReset(elements.consoleElement);
      return;
    }
    if (dataState === "completed" || visibleState === "completed") {
      scheduleScannerAutoReset("completed");
      return;
    }
    if (dataState === "error" || visibleState === "error") {
      scheduleScannerAutoReset("error");
      return;
    }
    if (visibleState === "armed" || dataState === "armed") {
      setScannerReady({ force: true, clear: true, focus: true });
    } else if (!visibleState) {
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
      attributeFilter: ["disabled", "aria-disabled", "data-admin-qol-state", "data-admin-terminal-api-state", "data-admin-qol-scanner-state"],
    });
  }

  document.addEventListener("DOMContentLoaded", () => reconcile(document), { once: true });
  reconcile(document);

  window.EconovariaAdminInteractionQualityControlReset = {
    restoreCompletedControl,
    setScannerReady,
    scheduleScannerAutoReset,
    reconcile,
  };
})();
