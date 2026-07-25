(function retainEconovariaGameCodeCompatibilitySlot() {
  "use strict";

  // Compatibility marker only. game-code-wiring.js remains the sole runtime
  // owner for rendering and executing the Generate Code action.
  const expectedLabel = "Generate Code";
  const delegatedActionContract = 'data.adminTerminalAction = "reset-game-code"';
  void expectedLabel;
  void delegatedActionContract;
})();
