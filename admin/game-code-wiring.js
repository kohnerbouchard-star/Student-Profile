(function initEconovariaGameCodeWiring() {
  "use strict";

  const GAME_CODE_CACHE_PREFIX = "econovaria.admin.game-code.v1:";
  const CSRF_TOKEN_KEY = "econovaria.admin.csrf.v1";
  const RESET_ACTION_SELECTOR = "[data-econovaria-game-code-reset]";
  const EMPTY_CODES = new Set(["", "—", "-", "undefined", "null"]);
  let resetInFlight = false;
  let observer = null;

  function selectedGameId() {
    return String(
      window.EconovariaAdminAuth?.getSelectedGameId?.() ||
      window.sessionStorage.getItem("econovaria.admin.selected-game.v1") ||
      ""
    ).trim();
  }

  function normalizeCode(value) {
    const code = String(value || "").trim().toUpperCase();
    if (EMPTY_CODES.has(code.toLowerCase())) return "";
    if (!/^[A-Z0-9-]{4,64}$/.test(code)) return "";
    return code;
  }

  function cacheKey(gameId) {
    return `${GAME_CODE_CACHE_PREFIX}${String(gameId || "").trim()}`;
  }

  function readCachedCode(gameId = selectedGameId()) {
    if (!gameId) return "";
    try {
      return normalizeCode(window.sessionStorage.getItem(cacheKey(gameId)) || "");
    } catch (_) {
      return "";
    }
  }

  function writeCachedCode(gameId, code) {
    const normalized = normalizeCode(code);
    if (!gameId || !normalized) return "";
    try {
      window.sessionStorage.setItem(cacheKey(gameId), normalized);
    } catch (_) {}
    return normalized;
  }

  function randomToken() {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function ensureActionIntegrityToken() {
    let token = "";
    try {
      token = String(window.sessionStorage.getItem(CSRF_TOKEN_KEY) || "").trim();
      if (!token) {
        token = randomToken();
        window.sessionStorage.setItem(CSRF_TOKEN_KEY, token);
      }
    } catch (_) {
      token = randomToken();
    }

    window.ECONOVARIA_CSRF_TOKEN = token;
    const meta = document.querySelector('meta[name="econovaria-csrf-token"]');
    if (meta) meta.content = token;
    return token;
  }

  function feature() {
    return window.Econovaria?.features?.adminOverviewTerminal || null;
  }

  function currentModelCode() {
    const model = feature()?.currentModel || {};
    return normalizeCode(
      model.gameCode ||
      model.joinCode ||
      model.selectedGame?.joinCode ||
      model.selectedGame?.gameCode ||
      model.activeGame?.joinCode ||
      model.activeGame?.gameCode ||
      ""
    );
  }

  function currentCode() {
    const gameId = selectedGameId();
    const modelCode = currentModelCode();
    if (modelCode) {
      writeCachedCode(gameId, modelCode);
      return modelCode;
    }
    return readCachedCode(gameId);
  }

  function patchGameRecord(record, gameId, code) {
    if (!record || typeof record !== "object") return record;
    const recordId = String(record.id || record.gameId || "").trim();
    if (recordId && recordId !== gameId) return record;
    return { ...record, joinCode: code, gameCode: code };
  }

  function syncModelCode(code) {
    const adminFeature = feature();
    const gameId = selectedGameId();
    const normalized = writeCachedCode(gameId, code);
    if (!adminFeature || !gameId || !normalized) return normalized;

    const model = adminFeature.currentModel || {};
    const nextModel = {
      ...model,
      gameCode: normalized,
      joinCode: normalized,
      selectedGame: patchGameRecord(model.selectedGame || { id: gameId, gameId }, gameId, normalized),
      activeGame: patchGameRecord(model.activeGame || { id: gameId, gameId }, gameId, normalized)
    };

    if (Array.isArray(model.games)) {
      nextModel.games = model.games.map((game) => patchGameRecord(game, gameId, normalized));
    }
    if (Array.isArray(model.activeGameSessions)) {
      nextModel.activeGameSessions = model.activeGameSessions.map((game) => patchGameRecord(game, gameId, normalized));
    }

    adminFeature.currentModel = nextModel;
    return normalized;
  }

  function playerAppUrl(code, mode) {
    const configured = String(
      window.ECONOVARIA_PLAYER_APP_URL ||
      document.querySelector('meta[name="econovaria-player-app-url"]')?.content ||
      "/play"
    ).trim();

    try {
      const url = new URL(configured || "/play", window.location.origin);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return "";
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

  function applyCodeToDom(code) {
    const normalized = normalizeCode(code);
    if (!normalized) return;
    const gameId = selectedGameId();

    document.querySelectorAll(".admin-terminal-side-code-expanded strong").forEach((node) => setText(node, normalized));
    document.querySelectorAll("[data-admin-terminal-share-button]").forEach((button) => {
      button.dataset.gameCode = normalized;
      button.setAttribute("aria-label", `Share game code ${normalized}`);
    });
    document.querySelectorAll("[data-game-id]").forEach((node) => {
      if (String(node.dataset.gameId || "") === gameId) node.dataset.gameCode = normalized;
    });

    const modal = document.querySelector('[data-modal-id="share-game-access"]');
    if (!modal) return;

    setText(modal.querySelector(".admin-terminal-share-modal-code strong"), normalized);
    const copyButton = modal.querySelector('[data-admin-terminal-action="copy-game-code"]');
    if (copyButton) {
      copyButton.disabled = false;
      copyButton.dataset.gameCode = normalized;
    }

    const studentLink = playerAppUrl(normalized, "student");
    const adminLink = playerAppUrl(normalized, "admin");
    const studentInput = modal.querySelector('input[id*="share-student-link"]');
    const adminInput = modal.querySelector('input[id*="share-admin-link"]');
    const invite = modal.querySelector('textarea[id*="share-invite"]');
    const gameName = String(feature()?.currentModel?.gameName || "Eco Novaria").trim() || "Eco Novaria";

    if (studentInput && studentLink) studentInput.value = studentLink;
    if (adminInput && adminLink) adminInput.value = adminLink;
    if (invite) invite.value = `Join ${gameName}\n\nGame code: ${normalized}\nPlayer login: ${studentLink || "Player login"}`;
  }

  function setInlineMessage(modal, message, tone = "") {
    if (!modal) return;
    let node = modal.querySelector("[data-econovaria-game-code-message]");
    if (!node) {
      node = document.createElement("small");
      node.dataset.econovariaGameCodeMessage = "true";
      node.className = "econovaria-game-code-message";
      modal.querySelector(".admin-terminal-share-modal-code")?.appendChild(node);
    }
    node.dataset.tone = tone;
    node.textContent = message;
  }

  function decorateShareModal() {
    const modal = document.querySelector('[data-modal-id="share-game-access"]');
    if (!modal) return;

    const codeSection = modal.querySelector(".admin-terminal-share-modal-code");
    if (!codeSection) return;

    const code = currentCode();
    if (code) applyCodeToDom(code);

    const codeLabel = codeSection.querySelector("strong");
    const copyButton = codeSection.querySelector('[data-admin-terminal-action="copy-game-code"]');
    if (!code) {
      setText(codeLabel, "Not generated");
      if (copyButton) {
        copyButton.disabled = true;
        copyButton.dataset.gameCode = "";
      }
    }

    let resetButton = codeSection.querySelector(RESET_ACTION_SELECTOR);
    if (!resetButton) {
      resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.dataset.econovariaGameCodeReset = "true";
      resetButton.className = "econovaria-game-code-reset";
      codeSection.appendChild(resetButton);
    }
    resetButton.textContent = code ? "Reset Code" : "Generate Code";
    resetButton.title = code
      ? "Generate a replacement code. The current code will stop working immediately."
      : "Generate a new code for this game.";

    setInlineMessage(
      modal,
      code
        ? "This code is cached only in this browser tab. Resetting it invalidates the previous code."
        : "The stored code is hash-only. Generate a new readable code to share with players."
    );
  }

  function extractResetCode(data) {
    return normalizeCode(
      data?.joinCode?.gameJoinCode ||
      data?.data?.joinCode?.gameJoinCode ||
      data?.gameJoinCode ||
      data?.data?.gameJoinCode ||
      ""
    );
  }

  async function resetGameCode(button) {
    if (resetInFlight) return;
    const gameId = selectedGameId();
    const existing = currentCode();
    const modal = button.closest('[data-modal-id="share-game-access"]');

    if (!gameId) {
      setInlineMessage(modal, "Select a game before generating a code.", "error");
      return;
    }

    if (existing) {
      const confirmed = window.confirm(
        "Reset this game code? The current code and existing shared links will stop working immediately."
      );
      if (!confirmed) return;
    }

    resetInFlight = true;
    button.disabled = true;
    button.textContent = existing ? "Resetting…" : "Generating…";
    setInlineMessage(modal, "Requesting a new code…", "pending");

    try {
      const response = await window.fetch(
        `/api/admin/games/${encodeURIComponent(gameId)}/join-code/reset`,
        {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ source: "admin_share_panel" })
        }
      );

      let data = null;
      try {
        data = await response.json();
      } catch (_) {}

      if (!response.ok) {
        const message = data?.error?.message || data?.message || `Game code reset failed (${response.status}).`;
        throw new Error(message);
      }

      const nextCode = extractResetCode(data);
      if (!nextCode) throw new Error("The backend did not return the new game code.");

      syncModelCode(nextCode);
      applyCodeToDom(nextCode);
      decorateShareModal();
      setInlineMessage(modal, "New code generated. Copy it now or reopen this panel during this browser session.", "success");
    } catch (error) {
      setInlineMessage(modal, String(error?.message || "Game code could not be reset."), "error");
    } finally {
      resetInFlight = false;
      button.disabled = false;
      button.textContent = currentCode() ? "Reset Code" : "Generate Code";
    }
  }

  function synchronizeCachedCode() {
    const code = currentCode();
    if (!code) return;
    syncModelCode(code);
    applyCodeToDom(code);
  }

  function installStyles() {
    if (document.querySelector("style[data-econovaria-game-code-wiring]")) return;
    const style = document.createElement("style");
    style.dataset.econovariaGameCodeWiring = "true";
    style.textContent = `
      .admin-terminal-share-modal-code .econovaria-game-code-reset {
        border-color: rgba(255, 103, 0, 0.58);
      }
      .admin-terminal-share-modal-code .econovaria-game-code-reset:hover,
      .admin-terminal-share-modal-code .econovaria-game-code-reset:focus-visible {
        border-color: #ff6700;
      }
      .admin-terminal-share-modal-code .econovaria-game-code-message {
        flex-basis: 100%;
        color: rgba(210, 247, 255, 0.64);
        font-size: 10px;
        line-height: 1.5;
      }
      .admin-terminal-share-modal-code .econovaria-game-code-message[data-tone="error"] { color: #ff6976; }
      .admin-terminal-share-modal-code .econovaria-game-code-message[data-tone="success"] { color: #62e6a7; }
      .admin-terminal-share-modal-code .econovaria-game-code-message[data-tone="pending"] { color: #ffbf69; }
    `;
    document.head.appendChild(style);
  }

  function startObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => {
      synchronizeCachedCode();
      decorateShareModal();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.(RESET_ACTION_SELECTOR);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void resetGameCode(button);
  }, true);

  function init() {
    ensureActionIntegrityToken();
    installStyles();
    startObserver();
    synchronizeCachedCode();
    decorateShareModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
