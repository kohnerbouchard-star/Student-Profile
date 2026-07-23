const BOOTSTRAP_PHASES = Object.freeze([
  {
    name: "session-safety",
    modules: ["./session-timeout-safe-exit.js"],
  },
  {
    name: "modal-accessibility",
    modules: ["./modal-lifecycle-bridge.js", "./keyboard-navigation.js"],
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
const HIDDEN_GAME_CODE_LABELS = new Set([
  "Generate Code",
  "Create Replacement Code",
]);

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

function installGameCodeResetSafety() {
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.(GAME_CODE_RESET_SELECTOR);
      if (!(button instanceof HTMLButtonElement)) return;

      const label = String(button.textContent || "").trim();
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

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(GAME_CODE_RESET_SELECTOR)) {
          enhanceHiddenGameCodeResetButton(node);
        }
        enhanceGameCodeResetButtons(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  enhanceGameCodeResetButtons();
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
