window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

function init() {
  const authInit = window.Econovaria?.features?.auth?.init;

  if (typeof authInit === "function") {
    authInit();
    return;
  }

  console.error("[Econovaria bootstrap] Auth init function is not available.");

  if (typeof showGlobalStatus === "function") {
    showGlobalStatus("bad", "The dashboard could not start. Refresh and try again.");
  }
}

document.addEventListener("DOMContentLoaded", init);

window.Econovaria.core.bootstrap = { init };
