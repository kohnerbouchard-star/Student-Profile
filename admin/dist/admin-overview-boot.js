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

  const renderShell = feature.renderShell;
  feature.renderShell = function renderShellWithBootstrapLifecycle(...args) {
    const html = renderShell.apply(this, args);
    const model = feature.currentModel;

    if (
      feature.authState?.state === "loading" &&
      model?.__sessionBootstrapPending === true
    ) {
      feature.currentModel = {
        ...model,
        __sessionBootstrapPending: false
      };
    }

    return html;
  };

  if (auth && typeof auth.attachTerminal === "function") {
    auth.attachTerminal({ mount, feature });
    return;
  }

  mount.hidden = false;
  mount.innerHTML = feature.renderShell();
})();
