(function retireEconovariaShareGameCodeRuntimeStyle() {
  "use strict";

  // Share-game layout is owned by admin/css/game-session-controls.css.
  // Remove a legacy injected tag if an older cached bootstrap created one,
  // but never create runtime CSS from JavaScript.
  document.getElementById("econovaria-share-game-code-layout-fix")?.remove();
})();
