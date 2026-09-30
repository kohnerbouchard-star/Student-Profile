(function initEconovariaSettingsSaveErrorBridge() {
  "use strict";

  // Retained bootstrap path owns only the final-polish stylesheet. Save errors
  // are published by the source save controller and read by Settings itself.
  const STYLE_ID = "econovaria-settings-final-polish-style";
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "./css/settings-final-polish.css";
  document.head.append(link);
})();
