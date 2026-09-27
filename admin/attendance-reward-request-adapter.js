(function initEconovariaAttendanceRewardRequestAdapter() {
  "use strict";

  const cachedAttendanceWindows = new Map();

  function text(value) {
    return String(value ?? "").trim();
  }

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function field(name) {
    return document.querySelector(`[data-attendance-reward-field="${name}"]`);
  }

  function settingsGameId(request) {
    try {
      const match = new URL(request.url).pathname.match(
        /\/api\/admin\/games\/([^/]+)\/settings(?:\/difficulty)?$/,
      );
      return match ? decodeURIComponent(match[1]) : "";
    } catch (_) {
      return "";
    }
  }

  function activeSettingsGameId() {
    const moduleGameId = text(window.EconovariaAttendanceRewardSettings?.getGameId?.());
    if (moduleGameId) return moduleGameId;
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    return text(
      model.gameId || model.activeGameId || model.selectedGameSessionId ||
      model.activeGame?.id || model.selectedGame?.id ||
      window.sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    );
  }

  function currentAttendanceWindow(gameId) {
    const cachedAttendanceWindow = object(cachedAttendanceWindows.get(gameId));
    const draftAttendanceWindow = object(
      window.EconovariaAttendanceRewardSettings?.getDraftWindow?.(),
    );
    const currencyCode = (
      text(draftAttendanceWindow.currencyCode) ||
      text(cachedAttendanceWindow.currencyCode) ||
      "ECO"
    ).toUpperCase();

    return {
      ...cachedAttendanceWindow,
      timezone: text(cachedAttendanceWindow.timezone) || "Asia/Seoul",
      presentRewardAmount: Math.max(0, number(
        field("presentRewardAmount")?.value,
        number(cachedAttendanceWindow.presentRewardAmount, 1),
      )),
      lateRewardAmount: Math.max(0, number(
        field("lateRewardAmount")?.value,
        number(cachedAttendanceWindow.lateRewardAmount, 0),
      )),
      currencyMode: field("currencyMode")?.value === "fixed" ? "fixed" : "player_country",
      applyDifficultyIncomeModifier: field("applyDifficultyIncomeModifier")?.value !== "false",
      currencyCode,
    };
  }

  function rememberSettings(payload, gameId) {
    const root = object(payload);
    const data = object(root.data);
    const settings = object(root.settings || data.settings || data);
    const attendanceWindow = settings.attendanceWindow || settings.attendance_window ||
      object(settings.settings).attendanceWindow;
    if (attendanceWindow && typeof attendanceWindow === "object" && !Array.isArray(attendanceWindow)) {
      cachedAttendanceWindows.set(gameId, { ...object(attendanceWindow) });
    }
  }

  async function requestJson(request) {
    try {
      return object(await request.clone().json());
    } catch (_) {
      return {};
    }
  }

  function acknowledgeCombinedSave(gameId, attendanceWindow) {
    const controller = window.EconovariaAttendanceRewardSaveController;
    if (controller?.combinedCoreSavePending?.() !== true) return;
    document.dispatchEvent(new CustomEvent("econovaria:attendance-reward-saved", {
      detail: { gameId, attendanceWindow, combined: true },
    }));
  }

  async function prepareRequest(request) {
    if (!(request instanceof Request)) return { request, metadata: null };
    const gameId = settingsGameId(request);
    if (!gameId) return { request, metadata: null };

    const method = text(request.method).toUpperCase() || "GET";
    if (["GET", "HEAD"].includes(method)) {
      return { request, metadata: { gameId, method, attendanceWindow: null } };
    }

    if (
      !["POST", "PUT", "PATCH"].includes(method) ||
      !document.querySelector("[data-admin-attendance-reward-settings]")
    ) {
      return { request, metadata: null };
    }

    const activeGameId = activeSettingsGameId();
    if (activeGameId && activeGameId !== gameId) return { request, metadata: null };

    const source = await requestJson(request);
    const suppliedAttendanceWindow = object(
      object(source.settings).attendanceWindow ||
      object(source.payload).attendanceWindow ||
      source.attendanceWindow,
    );
    const attendanceWindow = Object.keys(suppliedAttendanceWindow).length
      ? suppliedAttendanceWindow
      : currentAttendanceWindow(gameId);

    let body;
    if (source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)) {
      body = { ...source, settings: { ...object(source.settings), attendanceWindow } };
    } else if (source.payload && typeof source.payload === "object" && !Array.isArray(source.payload)) {
      body = { ...source, payload: { ...object(source.payload), attendanceWindow } };
    } else {
      body = { ...source, attendanceWindow };
    }

    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");
    return {
      request: new Request(request, { headers, body: JSON.stringify(body) }),
      metadata: { gameId, method, attendanceWindow },
    };
  }

  async function observeResponse(response, metadata) {
    if (!metadata?.gameId || !(response instanceof Response)) return response;
    if (["GET", "HEAD"].includes(metadata.method)) {
      if (response.ok) {
        response.clone().json()
          .then((payload) => rememberSettings(payload, metadata.gameId))
          .catch(() => {});
      }
      return response;
    }
    if (response.ok && metadata.attendanceWindow) {
      cachedAttendanceWindows.set(metadata.gameId, { ...metadata.attendanceWindow });
      acknowledgeCombinedSave(metadata.gameId, metadata.attendanceWindow);
    }
    return response;
  }

  async function request(input, init) {
    const authenticatedTransport = window.EconovariaAdminAuth?.request;
    return typeof authenticatedTransport === "function"
      ? authenticatedTransport(input, init)
      : window.fetch(input, init);
  }

  const adapter = Object.freeze({
    prepareRequest,
    observeResponse,
    request,
    getCurrentAttendanceWindow(gameId) {
      const resolvedGameId = text(gameId) || activeSettingsGameId();
      return resolvedGameId ? { ...currentAttendanceWindow(resolvedGameId) } : null;
    },
  });
  window.EconovariaAttendanceRewardRequestAdapter = adapter;
  // The retained generated terminal reads this narrow retained read name only
  // when deriving the effective Settings idempotency payload. It is not a
  // transport hook and delegates to the same source-owned adapter.
  window.EconovariaAttendanceRewardSettingsRouteBridge = Object.freeze({
    getCurrentAttendanceWindow: adapter.getCurrentAttendanceWindow,
  });
})();