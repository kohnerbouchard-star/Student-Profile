const BOOTSTRAP_PHASES = Object.freeze([
  {
    name: "session-safety",
    modules: ["./session-timeout-safe-exit.js"],
  },
  {
    name: "game-session-access",
    modules: [
      "./logout-account-trigger-bridge.js",
      "./admin-logout-controller.js",
      "./game-session-share-link-contract.js",
    ],
  },
  {
    name: "modal-accessibility",
    modules: [
      "./modal-lifecycle-bridge.js",
      "./keyboard-navigation.js",
      "./export-history-modal-accessibility.js",
    ],
  },
  {
    name: "game-creation",
    modules: [
      "./game-creation-runtime-bridge.js",
      "./game-creation-style-loader.js",
      "./game-creation-controls.js",
    ],
  },
  {
    name: "player-accessibility",
    modules: ["./player-drawer-accessibility.js"],
  },
  {
    name: "overview-actions",
    modules: ["./overview-quick-actions.js"],
  },
  {
    name: "attendance-settings",
    modules: [
      "./scanner-auto-refresh.js",
      "./scanner-lifecycle-settle.js",
      "./scanner-reward-localization.js",
      "./attendance-reward-settings-route-bridge-v2.js",
      "./attendance-reward-save-controller-v3.js",
      "./attendance-reward-settings-v4.js",
      "./settings-simplified.js",
      "./settings-lifecycle-bridge.js",
      "./settings-save-error-bridge.js",
    ],
  },
  {
    name: "operational-surfaces",
    modules: [
      "./shape-accurate-skeleton-lifecycle.js",
      "./inventory-redemption-queue-loader.js",
      "./game-lifecycle-controls.js",
      "./world-runtime-console-loader.js",
      "./marketplace-lifecycle-loader.js",
      "./messaging-moderation-loader.js",
      "./progression-review-loader.js",
    ],
  },
]);

const GAME_CODE_RESET_SELECTOR =
  '[data-admin-terminal-action="reset-game-code"]';
const GAME_CODE_SHARE_ACTIONS = new Set([
  "share-game-code",
  "share-current-game",
]);
const GAME_CODE_SHARE_SELECTOR = [
  '[data-admin-terminal-action="share-game-code"]',
  '[data-admin-terminal-action="share-current-game"]',
  "[data-admin-terminal-share-button]",
  "[data-econovaria-share-game]",
  'button[title="Share game code"]',
  'button[aria-label*="Share game code"]',
].join(",");
const HIDDEN_GAME_CODE_LABELS = new Set([
  "Generate Code",
  "Create Replacement Code",
]);
const GAME_CODE_REPAIR_DELAYS_MS = Object.freeze([
  0,
  40,
  120,
  260,
  520,
  1000,
  1800,
]);
let gameCodeRepairTimers = [];

function reportBootstrapFailure(phase, modulePath, error) {
  console.error(`[Econovaria Admin] ${phase} bootstrap failed for ${modulePath}.`, error);
  const gate = document.getElementById("adminSessionGate");
  gate?.setAttribute("data-admin-bootstrap-error", "true");
  const status = gate?.querySelector(".admin-qol-sr-only");
  if (status) status.textContent = "Administrator controls loaded with a recoverable module error.";
  window.dispatchEvent(new CustomEvent("econovaria:admin-bootstrap-error", {
    detail: Object.freeze({ phase, modulePath }),
  }));
}

function enhanceHiddenGameCodeResetButton(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (String(button.textContent || "").trim() !== "Generate Code") return;

  button.textContent = "Create Replacement Code";
  button.title =
    "The readable code is unavailable in this browser session. Creating a replacement invalidates any active code and shared link.";

  const message = button
    .closest(".admin-terminal-share-modal-code")
    ?.querySelector("[data-econovaria-game-code-message]");
  if (message) {
    message.textContent =
      "A server-side code may already be active. Create a replacement only when you intentionally want to invalidate the existing code.";
  }
}

function enhanceGameCodeResetButtons(root = document) {
  root
    .querySelectorAll(GAME_CODE_RESET_SELECTOR)
    .forEach(enhanceHiddenGameCodeResetButton);
}

function visibleShareModal() {
  return [...document.querySelectorAll('[data-modal-id="share-game-access"]')]
    .reverse()
    .find((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    }) || null;
}

function ensureGameCodeResetButton() {
  const modal = visibleShareModal();
  if (!(modal instanceof HTMLElement)) return false;
  const codeSection = modal.querySelector(".admin-terminal-share-modal-code");
  if (!(codeSection instanceof HTMLElement)) return false;

  let button = codeSection.querySelector(GAME_CODE_RESET_SELECTOR);
  if (!(button instanceof HTMLButtonElement)) {
    button = document.createElement("button");
    button.type = "button";
    button.dataset.adminTerminalAction = "reset-game-code";
    button.className = "econovaria-game-code-reset";
    button.textContent = "Generate Code";
    codeSection.appendChild(button);
  }

  const code = String(codeSection.querySelector("strong")?.textContent || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9-]{4,64}$/.test(code)) {
    const label = codeSection.querySelector("strong");
    if (label) label.textContent = "Not generated";
    const copyButton = codeSection.querySelector(
      '[data-admin-terminal-action="copy-game-code"]',
    );
    if (copyButton instanceof HTMLButtonElement) {
      copyButton.disabled = true;
      copyButton.dataset.gameCode = "";
    }
  }

  enhanceHiddenGameCodeResetButton(button);
  return true;
}

function scheduleGameCodeResetEnhancement() {
  gameCodeRepairTimers.forEach((timer) => window.clearTimeout(timer));
  gameCodeRepairTimers = GAME_CODE_REPAIR_DELAYS_MS.map((delay) =>
    window.setTimeout(() => {
      ensureGameCodeResetButton();
      enhanceGameCodeResetButtons();
    }, delay)
  );
}

function installGameCodeResetSafety() {
  document.addEventListener(
    "click",
    (event) => {
      const shareTrigger = event.target?.closest?.(GAME_CODE_SHARE_SELECTOR);
      const action = event.target?.closest?.("[data-admin-terminal-action]");
      const actionName = String(
        action?.dataset?.adminTerminalAction || "",
      ).trim();

      if (shareTrigger || GAME_CODE_SHARE_ACTIONS.has(actionName)) {
        scheduleGameCodeResetEnhancement();
        return;
      }

      if (!(action instanceof HTMLButtonElement)) return;
      if (!action.matches(GAME_CODE_RESET_SELECTOR)) return;

      const label = String(action.textContent || "").trim();
      if (!HIDDEN_GAME_CODE_LABELS.has(label)) return;

      const confirmed = window.confirm(
        "Create a replacement game code? A code may already be active but hidden because this browser session does not retain its readable value. Continuing immediately invalidates the current code and all previously shared links.",
      );

      if (confirmed) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  scheduleGameCodeResetEnhancement();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installGameCodeResetSafety, {
    once: true,
  });
} else {
  installGameCodeResetSafety();
}

void (async function bootstrapAdminCompatibilityModules() {
  for (const phase of BOOTSTRAP_PHASES) {
    for (const modulePath of phase.modules) {
      try {
        await import(modulePath);
      } catch (error) {
        reportBootstrapFailure(phase.name, modulePath, error);
      }
    }
  }

  window.dispatchEvent(new CustomEvent("econovaria:admin-bootstrap-complete"));
})();
