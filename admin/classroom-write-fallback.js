(function initEconovariaAdminWriteLifecycleAdapter() {
  "use strict";

  if (!window.EconovariaRuntimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }

  const LOCAL_API_PREFIX = "/api/admin";
  const LIFECYCLE_EVENT = "econovaria:admin-request-lifecycle";
  const delegatedFetch = window.fetch.bind(window);
  const eventTarget = window.document || null;
  const cryptoRuntime = window.crypto || globalThis.crypto || null;
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
      if (
        source[key] !== undefined &&
        source[key] !== null &&
        source[key] !== ""
      ) {
        return source[key];
      }
    }
    return undefined;
  }

  async function requestJson(request) {
    if (["GET", "HEAD"].includes(request.method)) return {};
    const contentType = text(request.headers.get("content-type")).toLowerCase();
    try {
      if (contentType.includes("application/json")) {
        return record(await request.clone().json());
      }
      if (contentType.includes("application/x-www-form-urlencoded")) {
        return Object.fromEntries(
          new URLSearchParams(await request.clone().text()),
        );
      }
      if (contentType.includes("multipart/form-data")) {
        const result = {};
        for (const [key, value] of (await request.clone().formData()).entries()) {
          if (typeof value === "string") result[key] = value;
        }
        return result;
      }
      const raw = await request.clone().text();
      if (!raw) return {};
      try {
        return record(JSON.parse(raw));
      } catch (_) {
        return Object.fromEntries(new URLSearchParams(raw));
      }
    } catch (_) {
      return {};
    }
  }

  function isAdminRequest(url) {
    return url.origin === window.location.origin &&
      url.pathname.startsWith(LOCAL_API_PREFIX);
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
    if (typeof cryptoRuntime?.randomUUID === "function") {
      return cryptoRuntime.randomUUID();
    }
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

  function isLedgerMutationPath(pathname) {
    return /\/attendance\/reward-adjustments$/.test(pathname) ||
      /\/players\/[^/]+\/ledger-adjustments$/.test(pathname);
  }

  function normalizedLedgerMutation(source, pathname) {
    const normalized = { ...source };
    const amount = first(source, [
      "amount",
      "value",
      "delta",
      "adjustmentAmount",
      "ledgerAmount",
      "balanceAdjustment",
      "rewardAdjustment",
    ]);
    if (amount !== undefined) normalized.amount = amount;

    const adjustmentType = first(source, [
      "adjustmentType",
      "entryType",
      "direction",
      "transactionType",
    ]);
    if (adjustmentType !== undefined) normalized.adjustmentType = adjustmentType;

    const reason = first(source, ["reason", "note", "ledgerNote", "memo"]);
    if (reason !== undefined) normalized.reason = reason;
    normalized.accountType = text(first(source, ["accountType", "account"])) || "cash";
    normalized.currencyCode = (
      text(first(source, ["currencyCode", "currency"])) || "ECO"
    ).toUpperCase();

    if (/\/attendance\/reward-adjustments$/.test(pathname)) {
      const playerId = first(source, ["playerId", "studentId", "id"]);
      if (playerId !== undefined) normalized.playerId = playerId;
      const attendanceDate = first(source, [
        "attendanceDate",
        "date",
        "recordDate",
      ]);
      if (attendanceDate !== undefined) normalized.attendanceDate = attendanceDate;
    }
    return normalized;
  }

  async function withEconomicIdempotency(request, url, lifecycle) {
    if (
      request.method !== "POST" ||
      !lifecycle?.requestId ||
      !isLedgerMutationPath(url.pathname)
    ) {
      return request;
    }
    const source = flattened(await requestJson(request));
    const normalized = normalizedLedgerMutation(source, url.pathname);
    const idempotencyKey = text(
      normalized.idempotencyKey ||
      request.headers.get("x-idempotency-key") ||
      request.headers.get("x-request-id") ||
      lifecycle.requestId,
    );
    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");
    headers.set("X-Idempotency-Key", idempotencyKey);
    headers.delete("Content-Length");
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify({ ...normalized, idempotencyKey }),
      credentials: request.credentials,
      cache: request.cache,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      integrity: request.integrity,
      keepalive: request.keepalive,
      mode: request.mode,
      signal: request.signal,
    });
  }

  function beginLifecycle(lifecycle) {
    if (lifecycle) emitLifecycle({ ...lifecycle, phase: "started" });
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
    if (request.method !== "POST" || !isAdminRequest(url)) return null;

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

  window.fetch = async function econovariaAdminWriteLifecycle(input, init) {
    const rawUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const initialRequest = input instanceof Request
      ? new Request(input, init)
      : new Request(rawUrl, init);
    const url = new URL(initialRequest.url, window.location.href);
    const lifecycle = await createLifecycle(initialRequest, url);
    const request = await withEconomicIdempotency(initialRequest, url, lifecycle);
    beginLifecycle(lifecycle);

    try {
      const response = await delegatedFetch(request);
      await finishLifecycle(lifecycle, response);
      return response;
    } catch (error) {
      failLifecycle(lifecycle, error);
      throw error;
    }
  };

  window.EconovariaClassroomWriteFallback = Object.freeze({
    canonicalWrite,
    unwrapAdminTerminalResponsePayload: unwrapResponsePayload,
    lifecycleEvent: LIFECYCLE_EVENT,
    legacyClassroomFallbackRetired: true,
  });
})();
