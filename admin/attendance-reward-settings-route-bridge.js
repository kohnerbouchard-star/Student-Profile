(function initEconovariaAttendanceRewardSettingsRouteBridge() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);

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

  function currentAttendanceWindow() {
    const presentRewardAmount = Math.max(0, number(field("presentRewardAmount")?.value, 1));
    const lateRewardAmount = Math.max(0, number(field("lateRewardAmount")?.value, 0));
    const currencyMode = field("currencyMode")?.value === "fixed" ? "fixed" : "player_country";
    const applyDifficultyIncomeModifier = field("applyDifficultyIncomeModifier")?.value !== "false";
    const fixedOption = field("currencyMode")?.querySelector('option[value="fixed"]')?.textContent || "";
    const currencyCode = (text(fixedOption).match(/\b[A-Z]{3,8}\b/)?.[0] || "ECO").toUpperCase();

    return {
      presentRewardAmount,
      lateRewardAmount,
      currencyMode,
      applyDifficultyIncomeModifier,
      currencyCode,
    };
  }

  function isSettingsWrite(request) {
    try {
      const url = new URL(request.url, window.location.href);
      return ["POST", "PUT", "PATCH"].includes(request.method.toUpperCase()) &&
        /\/api\/admin\/games\/[^/]+\/settings(?:\/difficulty)?$/.test(url.pathname);
    } catch (_) {
      return false;
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

  window.fetch = async function econovariaAttendanceRewardSettingsRouteFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    if (!isSettingsWrite(request) || !document.querySelector("[data-admin-attendance-reward-settings]")) {
      return delegatedFetch(input, init);
    }
    return delegatedFetch(await augment(request));
  };
})();
