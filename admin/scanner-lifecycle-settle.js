(function initEconovariaScannerLifecycleSettle() {
  "use strict";

  const SETTLE_MS = 80;
  let generation = 0;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function settle(detail) {
    if (detail?.action !== "submit-attendance-scan") return;
    if (!["committed", "failed", "cancelled"].includes(detail.phase)) return;

    const token = ++generation;
    window.setTimeout(() => {
      if (token !== generation) return;

      const quality = window.EconovariaAdminInteractionQuality;
      const scanner = window.EconovariaScannerAutoRefresh;
      if (detail.phase === "committed") {
        quality?.setScannerCompleted?.();
        scanner?.schedule?.("completed");
        return;
      }

      quality?.setScannerError?.(text(detail.message) || "Scan failed");
      scanner?.schedule?.("error");
    }, SETTLE_MS);
  }

  document.addEventListener("econovaria:admin-request-lifecycle", (event) => {
    settle(event.detail && typeof event.detail === "object" ? event.detail : {});
  });

  window.EconovariaScannerLifecycleSettle = Object.freeze({ settle });
})();
