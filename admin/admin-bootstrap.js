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
    ],
  },
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
