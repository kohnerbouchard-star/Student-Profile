(function initEconovariaPlayerAccessCodeBridge() {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
  const SUPABASE_URL = runtimeConfig.supabaseUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const CLASSROOM_API_BASE = runtimeConfig.classroomApiUrl;
  const LOCAL_API_PREFIX = "/api/admin";
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const delegatedFetch = window.fetch.bind(window);

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function storedSession() {
    try {
      return record(JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null"));
    } catch (_) {
      return {};
    }
  }

  async function responseJson(response) {
    try {
      return record(await response.clone().json());
    } catch (_) {
      return {};
    }
  }

  async function requestJson(request) {
    try {
      return record(await request.clone().json());
    } catch (_) {
      return {};
    }
  }

  function flattenedResponse(value) {
    const source = record(value);
    const data = record(source.data);
    const payload = record(source.payload);
    return { ...source, ...data, ...payload };
  }

  function playerFrom(value) {
    const source = flattenedResponse(value);
    return record(source.player || source.createdPlayer);
  }

  function accessCodeFrom(value) {
    const source = flattenedResponse(value);
    const accessCode = source.accessCode;
    if (typeof accessCode === "string") return text(accessCode);
    const codeRecord = record(accessCode);
    return text(
      codeRecord.studentCode ||
      codeRecord.accessCode ||
      codeRecord.code ||
      source.studentCode ||
      source.generatedAccessCode,
    );
  }

  function playerIdentifierFrom(value) {
    const source = flattenedResponse(value);
    const player = playerFrom(value);
    return text(
      player.playerIdentifier ||
      player.player_identifier ||
      source.playerIdentifier ||
      source.playerId ||
      source.rfidCardId ||
      source.rfidId ||
      source.cardId,
    );
  }

  function createContext(request, url) {
    if (request.method !== "POST" || !url.pathname.startsWith(LOCAL_API_PREFIX)) {
      return null;
    }
    const match = url.pathname.match(/^\/api\/admin\/games\/([^/]+)\/players$/);
    if (!match) return null;
    return { gameId: decodeURIComponent(match[1]) };
  }

  function classroomHeaders(request, accessToken, gameId) {
    const headers = new Headers(request?.headers || {});
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("X-Econovaria-Game-Id", gameId);
    headers.delete("Content-Length");
    headers.delete("X-CSRF-Token");
    headers.delete("X-Econovaria-CSRF");
    headers.delete("X-Econovaria-Admin-Read");
    return headers;
  }

  function dispatchCredentialEvent(name, detail) {
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  function emitAccessCode(detail) {
    // Presentation belongs to the accepted Admin modal controller. This bridge
    // emits credential state only and never creates a second dialog.
    dispatchCredentialEvent("econovaria:player-access-code-issued", detail);
  }

  function mergedResponse(primary, primaryBody, resetBody) {
    const source = flattenedResponse(primaryBody);
    const reset = flattenedResponse(resetBody);
    const player = playerFrom(resetBody);
    const accessCode = record(reset.accessCode);
    const body = {
      ...source,
      ok: true,
      player: Object.keys(player).length ? player : playerFrom(primaryBody),
      accessCode,
      data: {
        ...record(source.data),
        player: Object.keys(player).length ? player : playerFrom(primaryBody),
        accessCode,
      },
    };
    const headers = new Headers(primary.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(body), {
      status: primary.status,
      statusText: primary.statusText,
      headers,
    });
  }

  async function updatePlayerIdentity(input) {
    const gameId = text(input?.gameId);
    const playerId = text(input?.playerId);
    const playerIdentifier = text(input?.playerIdentifier);
    const accessCode = text(input?.accessCode);
    const session = storedSession();
    const accessToken = text(session.accessToken);
    const selectedGameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));

    if (!gameId || !playerId || !playerIdentifier) {
      throw new Error("Player and Player ID / RFID card are required.");
    }
    if (!accessToken || (selectedGameId && selectedGameId !== gameId)) {
      throw new Error("Sign in again before changing player credentials.");
    }

    const payload = { playerIdentifier };
    if (accessCode) payload.accessCode = accessCode;

    const response = await delegatedFetch(
      `${LOCAL_API_PREFIX}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/access-code/reset`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        cache: "no-store",
      },
    );
    const body = await responseJson(response);
    if (!response.ok || body.ok === false) {
      const error = record(body.error);
      throw new Error(text(error.message || body.message) || "Player credentials could not be updated.");
    }

    const player = playerFrom(body);
    const studentCode = accessCodeFrom(body) || accessCode;
    const savedIdentifier = playerIdentifierFrom(body) || playerIdentifier;
    const detail = {
      playerId,
      displayName: text(player.displayName || player.name || input?.displayName),
      playerIdentifier: savedIdentifier,
      studentCode,
    };

    dispatchCredentialEvent("econovaria:player-identity-updated", detail);
    if (studentCode) emitAccessCode(detail);
    return body;
  }

  window.fetch = async function econovariaPlayerAccessCodeFetch(input, init) {
    const rawUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(rawUrl, init);
    const url = new URL(request.url, window.location.href);
    const context = createContext(request, url);

    if (!context) return delegatedFetch(request);

    const requestedBody = flattenedResponse(await requestJson(request));
    const requestedIdentifier = playerIdentifierFrom(requestedBody);
    const requestedAccessCode = accessCodeFrom(requestedBody);
    const primary = await delegatedFetch(request);
    if (!primary.ok) return primary;

    const primaryBody = await responseJson(primary);
    const primaryPlayer = playerFrom(primaryBody);
    const existingCode = accessCodeFrom(primaryBody);
    const existingIdentifier = playerIdentifierFrom(primaryBody) || requestedIdentifier;

    if (existingCode) {
      emitAccessCode({
        playerId: text(primaryPlayer.id || primaryPlayer.playerId),
        displayName: text(primaryPlayer.displayName || primaryPlayer.name),
        playerIdentifier: existingIdentifier,
        studentCode: existingCode,
      });
      return primary;
    }

    const playerId = text(primaryPlayer.id || primaryPlayer.playerId);
    const session = storedSession();
    const accessToken = text(session.accessToken);
    const selectedGameId = text(window.sessionStorage.getItem(SELECTED_GAME_KEY));

    if (
      !playerId ||
      !requestedIdentifier ||
      !requestedAccessCode ||
      !accessToken ||
      (selectedGameId && selectedGameId !== context.gameId)
    ) {
      return primary;
    }

    const resetResponse = await delegatedFetch(
      `${CLASSROOM_API_BASE}/games/${encodeURIComponent(context.gameId)}/players/${encodeURIComponent(playerId)}/access-code/reset`,
      {
        method: "POST",
        headers: classroomHeaders(request, accessToken, context.gameId),
        body: JSON.stringify({
          playerIdentifier: requestedIdentifier,
          accessCode: requestedAccessCode,
          reason: "player_created_without_identity_credentials",
        }),
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        referrerPolicy: "no-referrer",
      },
    );

    if (!resetResponse.ok) return primary;

    const resetBody = await responseJson(resetResponse);
    const studentCode = accessCodeFrom(resetBody);
    const resetPlayer = playerFrom(resetBody);

    if (!studentCode) return primary;

    emitAccessCode({
      playerId,
      displayName: text(
        resetPlayer.displayName ||
        resetPlayer.name ||
        primaryPlayer.displayName ||
        primaryPlayer.name,
      ),
      playerIdentifier: playerIdentifierFrom(resetBody) || requestedIdentifier,
      studentCode,
    });

    return mergedResponse(primary, primaryBody, resetBody);
  };

  window.EconovariaPlayerAccessCodeBridge = {
    accessCodeFrom,
    playerFrom,
    playerIdentifierFrom,
    updatePlayerIdentity,
  };
})();
