(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  function renderStatusBox(message) {
    return `<div class="status-box">${message || ""}</div>`;
  }

  app.modules.statusBox = {
    status: "inert",
    renderStatusBox
  };
})(window);
