window.createGameCodeSharePresentation = function createGameCodeSharePresentation(ownerScope) {
  "use strict";

  const { normalizeCode, selectedGameId, feature } = ownerScope;


  function playerAppUrl(code, mode) {
    const configured = String(
      window.ECONOVARIA_PLAYER_APP_URL ||
        document.querySelector(
          'meta[name="econovaria-player-app-url"]',
        )?.content ||
        "/play",
    ).trim();

    try {
      const url = new URL(configured || "/play", window.location.origin);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(
        url.hostname,
      );
      if (
        url.protocol !== "https:" &&
        !(url.protocol === "http:" && local)
      ) return "";
      url.search = "";
      url.hash = "";
      url.searchParams.set("gameCode", code);
      url.searchParams.set("mode", mode);
      return url.toString();
    } catch (_) {
      return "";
    }
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function applyCodeToRenderedShareSurface(code) {
    const normalized = normalizeCode(code);
    if (!normalized) return;
    const gameId = selectedGameId();

    document
      .querySelectorAll(".admin-terminal-side-code-expanded strong")
      .forEach((node) => setText(node, normalized));
    document
      .querySelectorAll("[data-admin-terminal-share-button]")
      .forEach((button) => {
        button.dataset.gameCode = normalized;
        button.setAttribute(
          "aria-label",
          `Share game code ${normalized}`,
        );
      });
    document.querySelectorAll("[data-game-id]").forEach((node) => {
      if (String(node.dataset.gameId || "") === gameId) {
        node.dataset.gameCode = normalized;
      }
    });

    const modal = document.querySelector(
      '[data-modal-id="share-game-access"]',
    );
    if (!modal) return;

    setText(
      modal.querySelector(".admin-terminal-share-modal-code strong"),
      normalized,
    );
    const copyButton = modal.querySelector(
      '[data-admin-terminal-action="copy-game-code"]',
    );
    if (copyButton) {
      copyButton.disabled = false;
      copyButton.dataset.gameCode = normalized;
    }

    const studentLink = playerAppUrl(normalized, "student");
    const adminLink = playerAppUrl(normalized, "admin");
    const studentInput = modal.querySelector(
      'input[id*="share-student-link"]',
    );
    const adminInput = modal.querySelector(
      'input[id*="share-admin-link"]',
    );
    const invite = modal.querySelector('textarea[id*="share-invite"]');
    const gameName = String(
      feature()?.currentModel?.gameName || "Eco Novaria",
    ).trim() || "Eco Novaria";

    if (studentInput && studentLink) studentInput.value = studentLink;
    if (adminInput && adminLink) adminInput.value = adminLink;
    if (invite) {
      invite.value =
        `Join ${gameName}\n\nGame code: ${normalized}\nPlayer login: ${studentLink || "Player login"}`;
    }
  }

  function setInlineMessage(modal, message, tone = "") {
    if (!modal) return;
    let node = modal.querySelector(
      "[data-econovaria-game-code-message]",
    );
    if (!node) {
      node = document.createElement("small");
      node.dataset.econovariaGameCodeMessage = "true";
      node.className = "econovaria-game-code-message";
      modal
        .querySelector(".admin-terminal-share-modal-code")
        ?.appendChild(node);
    }
    node.dataset.tone = tone;
    node.textContent = message;
  }

  function extractCode(data) {
    return normalizeCode(
      data?.joinCode?.gameJoinCode ||
        data?.data?.joinCode?.gameJoinCode ||
        data?.gameJoinCode ||
        data?.data?.gameJoinCode ||
        "",
    );
  }

  return { playerAppUrl, setText, applyCodeToRenderedShareSurface, setInlineMessage, extractCode };
};
