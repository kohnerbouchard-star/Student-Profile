(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  function renderBadge(label, className) {
    return `<span class="badge ${className || ""}">${label || ""}</span>`;
  }

  app.modules.badge = {
    status: "inert",
    renderBadge
  };
})(window);
