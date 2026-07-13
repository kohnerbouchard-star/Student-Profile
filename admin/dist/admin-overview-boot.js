(function bootAdminOverview() {
  "use strict";
  window.ECONOVARIA_ADMIN_USE_DEMO_DATA = false;

  const mount = document.getElementById("adminPreview");
  const feature = window.Econovaria?.features?.adminOverviewTerminal;
  const auth = window.EconovariaAdminAuth;

  if (!mount || !feature || typeof feature.renderShell !== "function") {
    console.error("Eco Novaria admin overview failed to initialize.");
    return;
  }

  if (auth && typeof auth.attachTerminal === "function") {
    auth.attachTerminal({ mount, feature });
    return;
  }

  mount.hidden = false;
  mount.innerHTML = feature.renderShell();
})();
