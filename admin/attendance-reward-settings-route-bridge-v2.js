(async function initEconovariaAttendanceRewardSettingsRouteBridgeCompatibility() {
  "use strict";

  // Compatibility-only source path retained for historical/direct consumers.
  // The active bootstrap loads attendance-reward-request-adapter.js directly.
  if (!window.EconovariaAttendanceRewardRequestAdapter) {
    await import("./attendance-reward-request-adapter.js");
  }
  const adapter = window.EconovariaAttendanceRewardRequestAdapter;
  if (!adapter) throw new Error("ECONOVARIA_ATTENDANCE_REQUEST_ADAPTER_UNAVAILABLE");
  window.EconovariaAttendanceRewardSettingsRouteBridge = Object.freeze({
    getCurrentAttendanceWindow: adapter.getCurrentAttendanceWindow,
  });
})();