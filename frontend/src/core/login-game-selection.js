window.createLoginGameSelection = function createLoginGameSelection(ownerScope) {
  "use strict";

  const {
    runtime, normalizedGameSession, GAME_PAGE_SIZE, clearMessage, showMessage, text, VALID_DIFFICULTIES,
    setFormBusy, api, errorMessage, persistSafeAdminStatus,
  } = ownerScope;


  function renderGameSelection(gameSessions, notice = "") {
    const loginStep = runtime.document.getElementById("adminLoginStep");
    const gamesStep = runtime.document.getElementById("adminGamesStep");
    const createStep = runtime.document.getElementById("adminCreateGameStep");
    const list = runtime.document.getElementById("adminGameList");
    const node = runtime.document.getElementById("selectedGameMessage");
    if (!loginStep || !gamesStep || !list) return;

    ownerScope.adminGames = Array.isArray(gameSessions)
      ? gameSessions.map(normalizedGameSession).filter((session) => session.id)
      : [];
    const pageCount = Math.max(1, Math.ceil(ownerScope.adminGames.length / GAME_PAGE_SIZE));
    ownerScope.adminGamePage = Math.min(ownerScope.adminGamePage, pageCount - 1);
    list.replaceChildren();
    clearMessage(node);

    if (!ownerScope.adminGames.length) {
      showMessage(node, "You do not have an active game yet. Create your first game to continue.");
    } else {
      const start = ownerScope.adminGamePage * GAME_PAGE_SIZE;
      ownerScope.adminGames.slice(start, start + GAME_PAGE_SIZE).forEach((session) => {
        const button = runtime.document.createElement("button");
        const name = runtime.document.createElement("strong");
        const detail = runtime.document.createElement("span");
        button.type = "button";
        button.className = "game-row";
        button.dataset.gameId = session.id;
        name.textContent = session.name;
        detail.textContent = `${session.status} session`;
        button.append(name, detail);
        button.addEventListener("click", () => openAdminTerminal(session.id));
        list.append(button);
      });
      if (notice) showMessage(node, notice);
    }

    const pagination = runtime.document.getElementById("adminGamePagination");
    const pageLabel = runtime.document.getElementById("adminGamePageLabel");
    const previous = runtime.document.getElementById("previousAdminGames");
    const next = runtime.document.getElementById("nextAdminGames");
    pagination?.classList.toggle("hidden", pageCount <= 1);
    if (pageLabel) pageLabel.textContent = `${ownerScope.adminGamePage + 1} / ${pageCount}`;
    if (previous) previous.disabled = ownerScope.adminGamePage <= 0;
    if (next) next.disabled = ownerScope.adminGamePage >= pageCount - 1;

    loginStep.classList.add("hidden");
    createStep?.classList.add("hidden");
    gamesStep.classList.remove("hidden");
  }

  function openAdminTerminal(gameSessionId) {
    const id = String(gameSessionId || "").trim();
    if (!id) return;
    const destination = new URL("admin/", runtime.document.baseURI).href;
    const scopedDestination = runtime.EconovariaAdminGameSelection?.urlFor?.(
      id,
      destination,
    );
    if (!scopedDestination) {
      throw new Error("The administrator game route could not be created.");
    }
    runtime.location.assign(scopedDestination);
  }

  function showAdminGameCreation() {
    runtime.document.getElementById("adminGamesStep")?.classList.add("hidden");
    runtime.document.getElementById("adminCreateGameStep")?.classList.remove("hidden");
    clearMessage(runtime.document.getElementById("adminNewGameMessage"));
    runtime.document.getElementById("adminNewLicenseCode")?.focus();
  }

  function cancelAdminGameCreation() {
    ownerScope.pendingGameIdempotencyKey = "";
    runtime.document.getElementById("adminCreateGameForm")?.reset();
    renderGameSelection(ownerScope.adminGames);
  }

  function newGameIdempotencyKey() {
    const uuid = String(runtime.crypto?.randomUUID?.() || "");
    if (!uuid) throw new Error("A secure game request identifier could not be generated.");
    return `game:${uuid}`;
  }

  async function handleAdminCreateGame(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const node = runtime.document.getElementById("adminNewGameMessage");
    const input = {
      licenseCode: text("adminNewLicenseCode"),
      sessionName: text("adminNewGameName"),
      timeZone: text("adminNewGameTimeZone"),
      difficulty: text("adminNewGameDifficulty")
    };
    clearMessage(node);
    if (!input.licenseCode || !input.sessionName || !input.timeZone || !VALID_DIFFICULTIES.has(input.difficulty)) {
      showMessage(node, "Complete every game field and select a valid difficulty.", "bad");
      return;
    }
    if (!ownerScope.pendingGameIdempotencyKey) ownerScope.pendingGameIdempotencyKey = newGameIdempotencyKey();
    setFormBusy(form, true, "Creating game...");
    try {
      const result = await api().callLicensingActivationApi?.(null, {
        ...input,
        idempotencyKey: ownerScope.pendingGameIdempotencyKey
      });
      if (!result?.ok) {
        showMessage(node, errorMessage(result, "The game could not be created."), "bad");
        if (result?.status && result.status < 500) ownerScope.pendingGameIdempotencyKey = "";
        return;
      }
      const createdId = String(
        result?.activation?.gameSessionId || result?.data?.game?.id || ""
      );
      ownerScope.pendingGameIdempotencyKey = "";
      form.reset();
      const status = await api().callAdminWebSessionStatus?.();
      if (!status?.ok || status.session?.authenticated !== true) {
        showMessage(node, "The game was created, but the game list could not be refreshed. Sign in again.", "bad");
        return;
      }
      persistSafeAdminStatus(status);
      ownerScope.adminGamePage = 0;
      renderGameSelection(
        status.activeGameSessions || [],
        createdId ? "Game created. Select it to open the Admin Console." : "Game created."
      );
    } catch (error) {
      showMessage(node, errorMessage(error, "The game could not be created."), "bad");
    } finally {
      setFormBusy(form, false);
    }
  }

  return {
    renderGameSelection, openAdminTerminal, showAdminGameCreation, cancelAdminGameCreation,
    newGameIdempotencyKey, handleAdminCreateGame,
  };
};
