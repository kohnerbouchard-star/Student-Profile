(function installEconovariaShareGameCodeLayoutFix() {
  "use strict";

  const STYLE_ID = "econovaria-share-game-code-layout-fix";
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [data-modal-id="share-game-access"] .admin-terminal-share-modal-code {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      grid-template-areas:
        "code copy"
        "reset reset"
        "message message" !important;
      align-items: center !important;
      gap: 10px !important;
      min-width: 0 !important;
    }

    [data-modal-id="share-game-access"] .admin-terminal-share-modal-code > div {
      grid-area: code;
      min-width: 0;
    }

    [data-modal-id="share-game-access"] .admin-terminal-share-modal-code
      > [data-admin-terminal-action="copy-game-code"],
    [data-modal-id="share-game-access"] .admin-terminal-share-modal-code
      > [data-econovaria-copy-code] {
      grid-area: copy;
      justify-self: end;
      min-width: max-content;
      white-space: nowrap;
    }

    [data-modal-id="share-game-access"] .admin-terminal-share-modal-code
      > .econovaria-game-code-reset {
      grid-area: reset;
      width: 100%;
      min-width: 0;
      min-height: 40px;
      height: auto;
      box-sizing: border-box;
      padding: 10px 14px;
      line-height: 1.25;
      text-align: center;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    [data-modal-id="share-game-access"] .admin-terminal-share-modal-code
      > [data-econovaria-game-code-message] {
      grid-area: message;
      display: block;
      width: 100%;
      min-width: 0;
      margin: 0;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    @media (max-width: 700px) {
      [data-modal-id="share-game-access"] .admin-terminal-share-modal-code {
        grid-template-columns: minmax(0, 1fr) !important;
        grid-template-areas:
          "code"
          "copy"
          "reset"
          "message" !important;
      }

      [data-modal-id="share-game-access"] .admin-terminal-share-modal-code
        > [data-admin-terminal-action="copy-game-code"],
      [data-modal-id="share-game-access"] .admin-terminal-share-modal-code
        > [data-econovaria-copy-code] {
        width: 100%;
        min-width: 0;
        justify-self: stretch;
      }
    }
  `;

  document.head.append(style);
})();
