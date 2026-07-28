(function installAdminGameSessionCompactLayering() {
  "use strict";

  const STYLE_ID = "econovaria-admin-game-session-compact-layering";
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @media (max-width: 1180px) {
      .econovaria-admin-game-session-controls-host {
        z-index: auto !important;
      }

      .econovaria-admin-game-session-controls-host .econovaria-admin-logout-button,
      .econovaria-admin-game-session-controls-host [data-econovaria-admin-logout="true"] {
        z-index: auto !important;
      }
    }
  `;
  document.head.append(style);
})();
