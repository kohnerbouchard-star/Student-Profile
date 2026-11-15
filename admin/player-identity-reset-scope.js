window.createPlayerIdentityResetScope = function createPlayerIdentityResetScope(ownerScope) {
  "use strict";

  const {
    PLAYER_RESET_CONTEXT_STALE, currentGameId, text, LOCAL_API_PREFIX, responseJson, object,
    responsePlayer, responsePlayerIdentifier, responseAccessCode,
  } = ownerScope;


  function staleResetError() {
    const error = new Error("Player selection changed. Reopen Player Settings before saving.");
    error.code = PLAYER_RESET_CONTEXT_STALE;
    return error;
  }

  function modalResetContextMatches(modal, gameId, playerId) {
    return Boolean(
      modal?.isConnected &&
      currentGameId() === gameId &&
      text(modal.getAttribute?.("data-player-id")) === playerId
    );
  }

  function disposeActiveResetScope() {
    ownerScope.activeResetScope?.scope?.dispose?.();
    ownerScope.activeResetScope = null;
  }

  function disposeDetachedResetScope() {
    if (ownerScope.activeResetScope && !ownerScope.activeResetScope.modal?.isConnected) {
      disposeActiveResetScope();
    }
  }

  function resetScopeFor(modal, gameId, playerId) {
    if (
      ownerScope.activeResetScope?.modal === modal &&
      ownerScope.activeResetScope.gameId === gameId &&
      ownerScope.activeResetScope.playerId === playerId &&
      ownerScope.activeResetScope.scope?.isCurrent?.()
    ) {
      return ownerScope.activeResetScope.scope;
    }

    disposeActiveResetScope();

    let disposed = false;
    let requestGeneration = 0;
    const scope = Object.freeze({
      isCurrent() {
        return !disposed && modalResetContextMatches(modal, gameId, playerId);
      },
      async updatePlayerIdentity(input = {}) {
        if (!scope.isCurrent()) throw staleResetError();

        const requestedGameId = text(input.gameId || gameId);
        const requestedPlayerId = text(input.playerId || playerId);
        const requestedIdentifier = text(input.playerIdentifier);
        const requestedAccessCode = text(input.accessCode);

        if (
          requestedGameId !== gameId ||
          requestedPlayerId !== playerId ||
          !requestedIdentifier
        ) {
          throw staleResetError();
        }

        const authenticatedTransport = window.EconovariaAdminAuth?.request;
        if (typeof authenticatedTransport !== "function") {
          throw new Error("Player credential service is not available.");
        }

        const generation = ++requestGeneration;
        const payload = { playerIdentifier: requestedIdentifier };
        if (requestedAccessCode) payload.accessCode = requestedAccessCode;

        const response = await authenticatedTransport(
          `${LOCAL_API_PREFIX}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/access-code/reset`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            cache: "no-store",
            redirect: "error",
            referrerPolicy: "no-referrer",
          },
        );
        const body = await responseJson(response);

        if (!scope.isCurrent() || generation !== requestGeneration) {
          throw staleResetError();
        }
        if (!response.ok || body.ok === false) {
          const error = object(body.error);
          throw new Error(
            text(error.message || body.message) ||
              "Player credentials could not be updated.",
          );
        }

        const player = responsePlayer(body);
        return Object.freeze({
          body,
          player,
          playerIdentifier:
            responsePlayerIdentifier(body) || requestedIdentifier,
          studentCode: responseAccessCode(body) || requestedAccessCode,
          displayName: text(
            player.displayName || player.name || input.displayName,
          ),
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        requestGeneration += 1;
      },
    });

    ownerScope.activeResetScope = { modal, gameId, playerId, scope };
    return scope;
  }

  return {
    staleResetError, modalResetContextMatches, disposeActiveResetScope, disposeDetachedResetScope,
    resetScopeFor,
  };
};
