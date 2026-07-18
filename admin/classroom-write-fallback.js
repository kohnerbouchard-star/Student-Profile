(function initEconovariaClassroomWriteFallback() {
  "use strict";

  const SUPABASE_URL = "https://cgiukdjwicykrmtkhudh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
  const CLASSROOM_API_BASE = `${SUPABASE_URL}/functions/v1/classroom-api`;
  const LOCAL_API_PREFIX = "/api/admin";
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const LIFECYCLE_EVENT = "econovaria:admin-request-lifecycle";
  const retryStatuses = new Set([400, 404, 501]);
  const delegatedFetch = window.fetch.bind(window);
  const eventTarget = window.document || null;
  let requestSequence = 0;

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function unwrapResponsePayload(value) {
    let current = record(value);
    for (let depth = 0; depth < 4; depth += 1) {
      const next = ["data", "payload", "result", "response"]
        .map((key) => record(current[key]))
        .find((candidate) => Object.keys(candidate).length > 0);
      if (!next) break;
      current = next;
    }
    return current;
  }

  if (typeof window.unwrapAdminTerminalResponsePayload !== "function") {
    window.unwrapAdminTerminalResponsePayload = unwrapResponsePayload;
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

  function isAdminRequest(url) {
    return url.pathname.startsWith(LOCAL_API_PREFIX) ||
      url.pathname.includes("/functions/v1/admin-api/") ||
      url.pathname.includes("/functions/v1/classroom-api/");
  }

  function inferLifecycleAction(source, url, method) {
    const direct = text(source.action || source.adminOperation || source.operation);
    if (direct) return direct;
    const pathname = url.pathname;
    if (["GET", "HEAD"].includes(method)) return "admin-read";
    if (/\/attendance\/(?:scan|scans)$/.test(pathname)) return "submit-attendance-scan";
    if (/\/contracts$/.test(pathname) && method === "POST") return "create-contract";
    if (/\/players$/.test(pathname) && method === "POST") return "create-player";
    if (/\/store\/items$/.test(pathname) && method === "POST") return "save-store-item";
    if (/\/review$/.test(pathname)) return "review-contract-submission";
    if (/\/logs\/export/.test(pathname)) return "export-logs";
    return "admin-write";
  }

  function newRequestId() {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    requestSequence += 1;
    return `admin-request-${Date.now()}-${requestSequence}`;
  }

  function emitLifecycle(detail) {
    const EventConstructor = window.CustomEvent || globalThis.CustomEvent;
    if (
      typeof eventTarget?.dispatchEvent !== "function" ||
      typeof EventConstructor !== "function"
    ) {
      return;
    }
    eventTarget.dispatchEvent(new EventConstructor(LIFECYCLE_EVENT, { detail }));
  }

  async function responseMessage(response, fallback) {
    try {
      const payload = await response.clone().json();
      return text(
        payload?.message ||
        payload?.error?.message ||
        payload?.error ||
        payload?.detail ||
        payload?.data?.message ||
        payload?.data?.error?.message ||
        fallback,
      );
    } catch (_) {
      return fallback;
    }
  }

  async function createLifecycle(request, url) {
    if (!isAdminRequest(url)) return null;
    const method = text(request.method).toUpperCase() || "GET";
    const source = ["GET", "HEAD"].includes(method)
      ? {}
      : await requestJson(request);
    return {
      requestId: newRequestId(),
      action: inferLifecycleAction(source, url, method),
      method,
      pathname: url.pathname,
      pageRead: ["GET", "HEAD"].includes(method),
      startedAt: Date.now(),
    };
  }

  function beginLifecycle(lifecycle) {
    if (!lifecycle) return;
    emitLifecycle({ ...lifecycle, phase: "started" });
  }

  async function finishLifecycle(lifecycle, response) {
    if (!lifecycle) return;
    const committed = response.ok;
    emitLifecycle({
      ...lifecycle,
      phase: committed ? "committed" : "failed",
      status: response.status,
      message: await responseMessage(
        response,
        committed ? "Completed" : "Action failed",
      ),
      completedAt: Date.now(),
    });
  }

  function failLifecycle(lifecycle, error) {
    if (!lifecycle) return;
    emitLifecycle({
      ...lifecycle,
      phase: "failed",
      status: 0,
      message: text(error?.message) || "Administrator request failed.",
      completedAt: Date.now(),
    });
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
      const rosterLabel = text(first(source, [
        "rosterLabel",
        "roster",
        "label",
        "studentLabel",
        "classLabel",
      ]));
      const playerIdentifier = text(first(source, [
        "playerIdentifier",
        "playerId",
        "rfidCardId",
        "rfidId",
        "cardId",
        "externalPlayerId",
      ]));
      const accessCode = text(first(source, [
        "accessCode",
        "studentCode",
        "playerAccessCode",
        "pin",
      ]));
      if (!displayName || !playerIdentifier || !accessCode) return null;
      const gameId = decodeURIComponent(playerMatch[1]);
      return {
        gameId,
        path: `/games/${encodeURIComponent(gameId)}/players`,
        body: {
          displayName,
          rosterLabel: rosterLabel || null,
          playerIdentifier,
          accessCode,
        },
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
    const lifecycle = await createLifecycle(request, url);
    beginLifecycle(lifecycle);

    try {
      const canonical = await canonicalWrite(request, url);
      if (!canonical) {
        const response = await delegatedFetch(request);
        await finishLifecycle(lifecycle, response);
        return response;
      }

      const primary = await delegatedFetch(request);
      if (primary.ok || !retryStatuses.has(primary.status)) {
        await finishLifecycle(lifecycle, primary);
        return primary;
      }

      const session = storedSession();
      const accessToken = text(session.accessToken);
      const selectedGameId = text(
        window.sessionStorage.getItem(SELECTED_GAME_KEY),
      );
      if (!accessToken || (selectedGameId && selectedGameId !== canonical.gameId)) {
        await finishLifecycle(lifecycle, primary);
        return primary;
      }

      const headers = new Headers(request.headers);
      headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set("Content-Type", "application/json");
      headers.set("X-Econovaria-Game-Id", canonical.gameId);
      headers.delete("Content-Length");
      headers.delete("X-CSRF-Token");
      headers.delete("X-Econovaria-CSRF");
      headers.delete("X-Econovaria-Admin-Read");

      const response = await delegatedFetch(`${CLASSROOM_API_BASE}${canonical.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(canonical.body),
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        referrerPolicy: "no-referrer",
      });
      await finishLifecycle(lifecycle, response);
      return response;
    } catch (error) {
      failLifecycle(lifecycle, error);
      throw error;
    }
  };

  window.EconovariaClassroomWriteFallback = {
    canonicalWrite,
    unwrapResponsePayload,
    lifecycleEvent: LIFECYCLE_EVENT,
  };
})();
