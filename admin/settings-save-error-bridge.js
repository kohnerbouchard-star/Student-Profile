(function initEconovariaSettingsSaveErrorBridge() {
  "use strict";

  // Preserve this synchronous entrypoint for standalone and older clients.
  const settings = window.EconovariaSimplifiedSettings;
  if (typeof settings?.ensureFinalPolishStylesheet === "function") {
    settings.ensureFinalPolishStylesheet();
    return;
  }
  const STYLE_ID = "econovaria-settings-final-polish-style";
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "./css/settings-final-polish.css";
  document.head.append(link);
})();
