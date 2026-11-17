window.createGameSessionShareSurface = function createGameSessionShareSurface(ownerScope) {
  "use strict";

  const { playerAppUrl, text } = ownerScope;


  function setShareContext(modal, context) {
    if (!(modal instanceof Element)) return;
    modal.classList.add("econovaria-admin-share-game-access");
    modal.dataset.gameId = context.gameId;
    modal.dataset.gameCode = context.gameCode;

    const dialog = modal.querySelector('[role="dialog"]') || modal;
    if (!dialog.querySelector("[data-econovaria-share-game-context]")) {
      const note = document.createElement("p");
      note.dataset.econovariaShareGameContext = "true";
      note.className = "econovaria-admin-share-game-context";
      const heading = dialog.querySelector("h1, h2, h3, header");
      if (heading?.parentElement) heading.insertAdjacentElement("afterend", note);
      else dialog.prepend(note);
    }
    const note = dialog.querySelector("[data-econovaria-share-game-context]");
    if (note) {
      note.textContent = context.gameCode
        ? `Players using ${context.gameCode} will join ${context.gameName}.`
        : `Loading the current Game Code for ${context.gameName}.`;
    }

    dialog.querySelectorAll("input[id*='share-admin-link']").forEach((input) => {
      const field = input.closest("label, .admin-terminal-field, .admin-terminal-share-field");
      if (field) field.hidden = true;
    });

    const playerLink = playerAppUrl(context.gameCode);
    dialog.querySelectorAll(
      "input[id*='share-student-link'], input[id*='share-player-link'], [data-econovaria-player-link]",
    ).forEach((input) => {
      if (playerLink && "value" in input) input.value = playerLink;
    });
    dialog.querySelectorAll(
      "textarea[id*='share-invite'], [data-econovaria-invite]",
    ).forEach((invite) => {
      if (!("value" in invite)) return;
      invite.value = context.gameCode
        ? `Join ${context.gameName}\n\nGame Code: ${context.gameCode}\nPlayer login: ${playerLink || "Open Econovaria Player Login"}`
        : `Join ${context.gameName}\n\nOpen the Share panel to load the current Game Code.`;
    });
    const codeNode = dialog.querySelector(".admin-terminal-share-modal-code strong");
    if (codeNode) codeNode.textContent = context.gameCode || "Loading…";
  }

  function visibleShareModal() {
    return [...document.querySelectorAll('[data-modal-id="share-game-access"]')]
      .reverse()
      .find((node) => {
        if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
      }) || null;
  }

  async function copyText(value, button) {
    const copy = text(value);
    if (!copy) return false;
    try {
      await navigator.clipboard.writeText(copy);
    } catch (_) {
      const helper = document.createElement("textarea");
      helper.value = copy;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (!copied) return false;
    }
    if (button instanceof HTMLButtonElement) {
      const prior = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = prior;
      }, 1200);
    }
    return true;
  }

  return { setShareContext, visibleShareModal, copyText };
};
