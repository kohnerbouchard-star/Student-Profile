(function initEconovariaClassroomWriteFallback() {
  "use strict";

  const SUPABASE_URL = "https://cgiukdjwicykrmtkhudh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
  const CLASSROOM_API_BASE = `${SUPABASE_URL}/functions/v1/classroom-api`;
  const LOCAL_API_PREFIX = "/api/admin";
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const retryStatuses = new Set([400, 404, 501]);
  const delegatedFetch = window.fetch.bind(window);

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function flattened(value) {
    const source = record(value);
    for (const key of ["payload", "data", "player", "scan"]) {
      const nested = record(source[key]);
      if (Object.keys(nested).length) return { ...source, ...nested };
    }
    return source;
  }

  function first(source, keys) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) return source[key];
    }
    return undefined;
  }

  async function requestJson(request) {
    try {
      return record(await request.clone().json());
    } catch (_) {
      return {};
    }
  }

  async function canonicalWrite(request, url) {
    if (request.method !== "POST" || !url.pathname.startsWith(LOCAL_API_PREFIX)) {
      return null;
    }

    const playerMatch = url.pathname.match(
      /^\/api\/admin\/games\/([^/]+)\/players$/,
    );
    if (playerMatch) {
      const source = flattened(await requestJson(request));
      const displayName = text(first(source, [
        "displayName",
        "name",
        "playerName",
        "studentName",
        "fullName",
        "username",
      ]));
      if (!displayName) return null;
      const rosterLabel = text(first(source, [
        "rosterLabel",
        "roster",
        "label",
        "studentLabel",
        "classLabel",
      ]));
      const gameId = decodeURIComponent(playerMatch[1]);
      return {
        gameId,
        path: `/games/${encodeURIComponent(gameId)}/players`,
        body: { displayName, rosterLabel: rosterLabel || null },
      };
    }

    const attendanceMatch = url.pathname.match(
      /^\/api\/admin\/games\/([^/]+)\/attendance\/(?:scan|scans)$/,
    );
    if (attendanceMatch) {
      const source = flattened(await requestJson(request));
      const playerId = text(first(source, [
        "playerId",
        "studentCode",
        "accessCode",
        "playerCode",
        "scannedCode",
        "scanValue",
        "qrCode",
        "code",
        "value",
        "scan",
      ]));
      if (!playerId) return null;
      const deviceTimezone = text(first(source, [
        "deviceTimezone",
        "timezone",
        "timeZone",
      ]));
      const gameId = decodeURIComponent(attendanceMatch[1]);
      return {
        gameId,
        path: `/games/${encodeURIComponent(gameId)}/attendance/scan`,
        body: { playerId, deviceTimezone: deviceTimezone || null },
      };
    }

    return null;
  }

  function storedSession() {
    try {
      return record(JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null"));
    } catch (_) {
      return {};
    }
  }

  window.fetch = async function econovariaClassroomWriteFallback(input, init) {
    const rawUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(rawUrl, init);
    const url = new URL(request.url, window.location.href);
    const canonical = await canonicalWrite(request, url);

    if (!canonical) return delegatedFetch(input, init);

    const primary = await delegatedFetch(input, init);
    if (primary.ok || !retryStatuses.has(primary.status)) return primary;

    const session = storedSession();
    const accessToken = text(session.accessToken);
    const selectedGameId = text(
      window.sessionStorage.getItem(SELECTED_GAME_KEY),
    );
    if (!accessToken || (selectedGameId && selectedGameId !== canonical.gameId)) {
      return primary;
    }

    const headers = new Headers(request.headers);
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("X-Econovaria-Game-Id", canonical.gameId);
    headers.delete("Content-Length");

    return delegatedFetch(`${CLASSROOM_API_BASE}${canonical.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(canonical.body),
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "no-referrer",
    });
  };

  window.EconovariaClassroomWriteFallback = {
    canonicalWrite,
  };
})();
