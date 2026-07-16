(function initEconovariaAttendanceRewardSettingsRouteBridgeV2() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);
  let cachedAttendanceWindow = {};

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

  function absoluteUrl(input) {
    return input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
  }

  function requestMethod(input, init) {
    return text(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() || "GET";
  }

  function settingsUrl(input) {
    try {
      return /\/api\/admin\/games\/[^/]+\/settings(?:\/difficulty)?$/.test(
        new URL(absoluteUrl(input)).pathname,
      );
    } catch (_) {
      return false;
    }
  }

  function requestFrom(input, init) {
    if (input instanceof Request) return input;
    return new Request(absoluteUrl(input), init);
  }

  function currentAttendanceWindow() {
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

  function rememberSettings(payload) {
    const root = object(payload);
    const data = object(root.data);
    const settings = object(root.settings || data.settings || data);
    const attendanceWindow = settings.attendanceWindow || settings.attendance_window ||
      object(settings.settings).attendanceWindow;
    if (attendanceWindow && typeof attendanceWindow === "object" && !Array.isArray(attendanceWindow)) {
      cachedAttendanceWindow = { ...object(attendanceWindow) };
    }
  }

  async function augment(request) {
    const source = object(await request.clone().json());
    const attendanceWindow = currentAttendanceWindow();
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
    return new Request(request, { headers, body: JSON.stringify(body) });
  }

  function markSettingsDirty() {
    const button = document.querySelector('[data-admin-terminal-action="save-settings"]');
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = false;
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.removeAttribute("data-admin-terminal-api-state");
    button.dataset.attendanceRewardDirty = "true";
    button.classList.add("is-dirty");
  }

  window.fetch = async function econovariaAttendanceRewardSettingsRouteFetch(input, init) {
    if (!settingsUrl(input)) return delegatedFetch(input, init);

    const method = requestMethod(input, init);
    const request = requestFrom(input, init);

    if (["GET", "HEAD"].includes(method)) {
      const response = await delegatedFetch(request);
      if (response.ok) response.clone().json().then(rememberSettings).catch(() => {});
      return response;
    }

    if (
      ["POST", "PUT", "PATCH"].includes(method) &&
      document.querySelector("[data-admin-attendance-reward-settings]")
    ) {
      const response = await delegatedFetch(await augment(request));
      if (response.ok) cachedAttendanceWindow = currentAttendanceWindow();
      return response;
    }

    return delegatedFetch(request);
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
