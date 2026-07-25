(function installEconovariaGameCodeModalRepair() {
  "use strict";

  const MODAL_SELECTOR = '[data-modal-id="share-game-access"]';
  const CODE_SECTION_SELECTOR = ".admin-terminal-share-modal-code";
  const RESET_SELECTOR = '[data-admin-terminal-action="reset-game-code"]';
  const SHARE_SELECTOR = [
    '[data-admin-terminal-action="share-game-code"]',
    '[data-admin-terminal-action="share-current-game"]',
    "[data-admin-terminal-share-button]",
    "[data-econovaria-share-game]",
    'button[title="Share game code"]',
    'button[aria-label*="Share game code"]',
  ].join(",");
  const VALID_CODE = /^[A-Z0-9-]{4,64}$/;
  const RETRY_DELAYS = Object.freeze([0, 40, 120, 260, 520, 1000, 1800]);
  let timers = [];

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function visible(node) {
    if (!(node instanceof HTMLElement) || node.hidden || node.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function ensureGenerateControl() {
    const modal = document.querySelector(MODAL_SELECTOR);
    if (!visible(modal)) return false;

    const codeSection = modal.querySelector(CODE_SECTION_SELECTOR);
    if (!(codeSection instanceof HTMLElement)) return false;

    const codeLabel = codeSection.querySelector("strong");
    const code = text(codeLabel?.textContent).toUpperCase();
    const hasReadableCode = VALID_CODE.test(code);

    if (codeLabel && !hasReadableCode) codeLabel.textContent = "Not generated";

    const copyButton = codeSection.querySelector(
      '[data-admin-terminal-action="copy-game-code"]',
    );
    if (copyButton instanceof HTMLButtonElement && !hasReadableCode) {
      copyButton.disabled = true;
      copyButton.dataset.gameCode = "";
    }

    let resetButton = codeSection.querySelector(RESET_SELECTOR);
    if (!(resetButton instanceof HTMLButtonElement)) {
      resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.dataset.adminTerminalAction = "reset-game-code";
      resetButton.className = "econovaria-game-code-reset";
      codeSection.appendChild(resetButton);
    }

    if (!resetButton.disabled) {
      resetButton.textContent = hasReadableCode ? "Reset Code" : "Generate Code";
    }
    resetButton.title = hasReadableCode
      ? "Generate a replacement code. The current code will stop working immediately."
      : "Generate a new readable code for this game.";
    resetButton.setAttribute(
      "aria-label",
      hasReadableCode ? "Reset game code" : "Generate game code",
    );
    return true;
  }

  function scheduleRepair() {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = RETRY_DELAYS.map((delay) =>
      window.setTimeout(ensureGenerateControl, delay)
    );
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target?.closest?.(SHARE_SELECTOR);
    if (trigger) scheduleRepair();
  }, true);

  window.addEventListener("econovaria:admin-bootstrap-complete", scheduleRepair);
  window.addEventListener("econovaria:admin-session-refreshed", scheduleRepair);
  window.addEventListener("econovaria:admin-game-created", scheduleRepair);
  window.addEventListener("econovaria:admin-modal-opened", scheduleRepair);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRepair, { once: true });
  } else {
    scheduleRepair();
  }
})();
