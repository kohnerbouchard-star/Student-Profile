(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  function byId(id, root) {
    return (root || document).getElementById(id);
  }

  app.modules.dom = {
    status: "inert",
    byId
  };
})(window);
