(function initEconovariaAttendanceRewardSettingsRouteBridgeV2() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);
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

  function saveButton() {
    return document.querySelector('[data-admin-terminal-action="save-settings"]');
  }

  function absoluteUrl(input) {
    return input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
  }

  function requestMethod(input, init) {
    return text(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() || "GET";
  }

  function settingsGameId(input) {
    try {
      const match = new URL(absoluteUrl(input)).pathname.match(
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
    const fixedOption = field("currencyMode")?.querySelector('option[value="fixed"]')?.textContent || "";
    const currencyCode = (text(fixedOption).match(/\b[A-Z]{3,8}\b/)?.[0] ||
      text(cachedAttendanceWindow.currencyCode) || "ECO").toUpperCase();

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

  async function requestJson(input, init) {
    try {
      if (init?.body != null) {
        if (typeof init.body === "string") return object(JSON.parse(init.body));
        if (init.body instanceof URLSearchParams) return Object.fromEntries(init.body.entries());
        return object(init.body);
      }
      if (!(input instanceof Request)) return {};
      return object(await input.clone().json());
    } catch (_) {
      return {};
    }
  }

  async function augmentedFetchArguments(input, init, gameId) {
    const source = await requestJson(input, init);
    const attendanceWindow = currentAttendanceWindow(gameId);
    let body;

    if (source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)) {
      body = { ...source, settings: { ...object(source.settings), attendanceWindow } };
    } else if (source.payload && typeof source.payload === "object" && !Array.isArray(source.payload)) {
      body = { ...source, payload: { ...object(source.payload), attendanceWindow } };
    } else {
      body = { ...source, attendanceWindow };
    }

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("Content-Type", "application/json");

    return {
      attendanceWindow,
      url: absoluteUrl(input),
      init: {
        method: requestMethod(input, init),
        headers,
        body: JSON.stringify(body),
        credentials: init?.credentials || (input instanceof Request ? input.credentials : undefined),
        cache: init?.cache || (input instanceof Request ? input.cache : undefined),
        redirect: init?.redirect || (input instanceof Request ? input.redirect : undefined),
        referrer: init?.referrer || (input instanceof Request ? input.referrer : undefined),
        referrerPolicy: init?.referrerPolicy || (input instanceof Request ? input.referrerPolicy : undefined),
        mode: init?.mode || (input instanceof Request ? input.mode : undefined),
        signal: init?.signal || (input instanceof Request ? input.signal : undefined),
      },
    };
  }

  function markSettingsDirty() {
    const button = saveButton();
    if (!(button instanceof HTMLButtonElement)) return;
    if (!button.hasAttribute("data-attendance-reward-core-pending")) {
      const wasDisabled = button.disabled || button.getAttribute("aria-disabled") === "true";
      button.dataset.attendanceRewardWasDisabled = wasDisabled ? "true" : "false";
      button.dataset.attendanceRewardCorePending = wasDisabled ? "false" : "true";
    }
    button.disabled = false;
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.removeAttribute("data-admin-terminal-api-state");
    button.dataset.attendanceRewardDirty = "true";
    button.classList.add("is-dirty");
  }

  function acknowledgeCombinedSave(gameId, attendanceWindow) {
    const button = saveButton();
    if (!(button instanceof HTMLButtonElement) || button.dataset.attendanceRewardCorePending !== "true") return;
    button.removeAttribute("data-attendance-reward-core-pending");
    button.removeAttribute("data-attendance-reward-was-disabled");
    button.removeAttribute("data-attendance-reward-dirty");
    button.classList.remove("is-dirty");
    document.dispatchEvent(new CustomEvent("econovaria:attendance-reward-saved", {
      detail: { gameId, attendanceWindow },
    }));
  }

  window.fetch = async function econovariaAttendanceRewardSettingsRouteFetch(input, init) {
    const gameId = settingsGameId(input);
    if (!gameId) return delegatedFetch(input, init);

    const method = requestMethod(input, init);

    if (["GET", "HEAD"].includes(method)) {
      const response = await delegatedFetch(input, init);
      if (response.ok) response.clone().json().then((payload) => rememberSettings(payload, gameId)).catch(() => {});
      return response;
    }

    if (
      ["POST", "PUT", "PATCH"].includes(method) &&
      document.querySelector("[data-admin-attendance-reward-settings]")
    ) {
      const activeGameId = activeSettingsGameId();
      if (activeGameId && activeGameId !== gameId) return delegatedFetch(input, init);
      const augmented = await augmentedFetchArguments(input, init, gameId);
      const response = await delegatedFetch(augmented.url, augmented.init);
      if (response.ok) {
        cachedAttendanceWindows.set(gameId, { ...augmented.attendanceWindow });
        acknowledgeCombinedSave(gameId, augmented.attendanceWindow);
      }
      return response;
    }

    return delegatedFetch(input, init);
  };

  document.addEventListener("input", (event) => {
    if (event.target instanceof Element && event.target.matches("[data-attendance-reward-field]")) {
      markSettingsDirty();
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target instanceof Element && event.target.matches("[data-attendance-reward-field]")) {
      markSettingsDirty();
    }
  }, true);
})();
