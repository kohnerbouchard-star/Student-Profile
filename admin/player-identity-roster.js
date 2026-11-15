window.createPlayerIdentityRoster = function createPlayerIdentityRoster(ownerScope) {
  "use strict";

  const { playerUuid, text, playerCacheByGame, terminalFeature, object, LOCAL_API_PREFIX, currentGameId } = ownerScope;


  function uniquePlayers(players) {
    const seen = new Set();
    return (Array.isArray(players) ? players : []).filter((player) => {
      const id = playerUuid(player);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function playerCache(gameId, create = true) {
    const key = text(gameId);
    if (!key) return null;
    let cache = playerCacheByGame.get(key) || null;
    if (!cache && create) {
      cache = new Map();
      playerCacheByGame.set(key, cache);
    }
    return cache;
  }

  function cachePlayers(gameId, players) {
    const cache = playerCache(gameId);
    if (!cache) return;
    for (const player of uniquePlayers(players)) {
      cache.set(playerUuid(player), player);
    }
  }

  function modelPlayers() {
    const model = terminalFeature()?.currentModel || {};
    const arrays = [model.players, model.roster, model.playerRoster].filter(Array.isArray);
    return uniquePlayers(arrays.flat());
  }

  function responsePlayers(value) {
    const source = object(value);
    const data = object(source.data);
    const payload = object(source.payload);
    const nested = object(data.data);
    const arrays = [
      source.players,
      source.roster,
      source.playerRoster,
      data.players,
      data.roster,
      data.playerRoster,
      payload.players,
      payload.roster,
      payload.playerRoster,
      nested.players,
      nested.roster,
      nested.playerRoster,
    ].filter(Array.isArray);
    return uniquePlayers(arrays.flat());
  }

  function allPlayers(gameId) {
    const key = text(gameId);
    if (!key) return [];
    cachePlayers(key, modelPlayers());
    return [...(playerCache(key, false)?.values() || [])];
  }

  async function loadPlayers(gameId) {
    const key = text(gameId);
    if (!key) return [];
    try {
      const response = await window.fetch(
        `${LOCAL_API_PREFIX}/games/${encodeURIComponent(key)}/players`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) return allPlayers(key);
      const players = responsePlayers(await response.json());
      cachePlayers(key, players);
      return players.length ? players : allPlayers(key);
    } catch (_) {
      return allPlayers(key);
    }
  }

  function updateCachedPlayer(gameId, playerId, values) {
    const updates = object(values);
    const cache = playerCache(gameId, false);
    const cached = cache?.get(playerId);
    if (cached) {
      cache.set(playerId, {
        ...cached,
        ...(updates.displayName ? {
          displayName: updates.displayName,
          display_name: updates.displayName,
          name: updates.displayName,
        } : {}),
        ...(updates.playerIdentifier ? {
          playerIdentifier: updates.playerIdentifier,
          player_identifier: updates.playerIdentifier,
        } : {}),
        ...(updates.status ? { status: updates.status } : {}),
        ...(updates.countryAssignment ? {
          countryName: updates.countryAssignment,
          location: updates.countryAssignment,
        } : {}),
      });
    }

    if (gameId !== currentGameId()) return;
    const model = terminalFeature()?.currentModel;
    if (!model) return;
    for (const key of ["players", "roster", "playerRoster"]) {
      if (!Array.isArray(model[key])) continue;
      model[key] = model[key].map((player) => {
        if (playerUuid(player) !== playerId) return player;
        return {
          ...player,
          ...(updates.displayName ? {
            displayName: updates.displayName,
            display_name: updates.displayName,
            name: updates.displayName,
          } : {}),
          ...(updates.playerIdentifier ? {
            playerIdentifier: updates.playerIdentifier,
            player_identifier: updates.playerIdentifier,
          } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(updates.countryAssignment ? {
            countryName: updates.countryAssignment,
            location: updates.countryAssignment,
          } : {}),
        };
      });
    }
  }

  return {
    uniquePlayers, playerCache, cachePlayers, modelPlayers, responsePlayers, allPlayers, loadPlayers,
    updateCachedPlayer,
  };
};
