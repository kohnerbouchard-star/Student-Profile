(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  function renderEmptyState(message) {
    return `<div class="empty">${message || "Nothing to show yet."}</div>`;
  }

  app.modules.emptyState = {
    status: "inert",
    renderEmptyState
  };
})(window);
