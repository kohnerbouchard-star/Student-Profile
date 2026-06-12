(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  function renderCard(content, className) {
    return `<div class="card ${className || ""}">${content || ""}</div>`;
  }

  app.modules.card = {
    status: "inert",
    renderCard
  };
})(window);
