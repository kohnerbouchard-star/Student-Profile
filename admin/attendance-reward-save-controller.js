(function initEconovariaAttendanceRewardSaveController() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);
  let coreSnapshot = null;
  let snapshotGameId = "";
  let saveFlight = null;

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

  function selectedGameId() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    return text(
      model.gameId || model.activeGameId || model.selectedGameSessionId ||
      model.activeGame?.id || model.selectedGame?.id ||
      window.sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    );
  }

  function controlValue(control) {
    if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
      return control.checked;
    }
    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ? control.value
      : "";
  }

  function readCoreSettings() {
    return Object.fromEntries(
      [...document.querySelectorAll("[data-game-setting-key]")]
        .map((control) => [control.getAttribute("data-game-setting-key"), controlValue(control)])
        .filter(([key]) => Boolean(key)),
    );
  }

  function stable(value) {
    return JSON.stringify(value, Object.keys(value).sort());
  }

  function rememberCoreSnapshot() {
    const gameId = selectedGameId();
    if (!gameId || !document.querySelector(".admin-terminal-settings-main-panel")) return;
    if (coreSnapshot && snapshotGameId === gameId) return;
    coreSnapshot = readCoreSettings();
    snapshotGameId = gameId;
  }

  function coreSettingsChanged() {
    rememberCoreSnapshot();
    return stable(readCoreSettings()) !== stable(coreSnapshot || {});
  }

  function field(name) {
    return document.querySelector(`[data-attendance-reward-field="${name}"]`);
  }

  function validateAttendance() {
    let valid = true;
    let first = null;
    for (const name of ["presentRewardAmount", "lateRewardAmount"]) {
      const input = field(name);
      if (!(input instanceof HTMLInputElement)) continue;
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0 || value > 1000) {
        valid = false;
        input.setAttribute("aria-invalid", "true");
        input.closest(".admin-terminal-settings-change-tile")?.classList.add("is-invalid");
        first ||= input;
      }
    }
    first?.focus({ preventScroll: false });
    return valid;
  }

  function readAttendanceFromPayload(payload) {
    const root = object(payload);
    const data = object(root.data);
    const settings = object(root.settings || data.settings || data);
    return object(
      settings.attendanceWindow || settings.attendance_window ||
      object(settings.settings).attendanceWindow,
    );
  }

  function draftAttendanceWindow(existing) {
    const fixedOption = field("currencyMode")?.querySelector('option[value="fixed"]')?.textContent || "";
    const currencyCode = (text(fixedOption).match(/\b[A-Z]{3,8}\b/)?.[0] ||
      text(existing.currencyCode) || "ECO").toUpperCase();
    return {
      ...existing,
      timezone: text(existing.timezone) || "Asia/Seoul",
      presentRewardAmount: Math.max(0, number(field("presentRewardAmount")?.value, 1)),
      lateRewardAmount: Math.max(0, number(field("lateRewardAmount")?.value, 0)),
      currencyMode: field("currencyMode")?.value === "fixed" ? "fixed" : "player_country",
      applyDifficultyIncomeModifier: field("applyDifficultyIncomeModifier")?.value !== "false",
      currencyCode,
    };
  }

  function setButtonState(button, state, label) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.dataset.adminTerminalApiState = state;
    button.setAttribute("aria-busy", state === "processing" ? "true" : "false");
    button.disabled = state === "processing";
    if (state === "processing") button.setAttribute("aria-disabled", "true");
    else button.removeAttribute("aria-disabled");
    button.dataset.attendanceRewardStatus = label;
  }

  async function saveAttendance(button) {
    if (saveFlight) return saveFlight;
    const gameId = selectedGameId();
    if (!gameId) throw new Error("active_game_required");

    setButtonState(button, "processing", "Saving attendance rewards");
    saveFlight = (async () => {
      const settingsResponse = await delegatedFetch(
        `/api/admin/games/${encodeURIComponent(gameId)}/settings`,
        { method: "GET", headers: { "Accept": "application/json" } },
      );
      const settingsPayload = settingsResponse.ok ? await settingsResponse.json() : {};
      const attendanceWindow = draftAttendanceWindow(readAttendanceFromPayload(settingsPayload));
      const response = await delegatedFetch(
        `/api/admin/games/${encodeURIComponent(gameId)}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ attendanceWindow }),
        },
      );
      if (!response.ok) {
        const payload = await response.clone().json().catch(() => ({}));
        throw new Error(text(payload.message || payload.error?.message) || "Attendance reward settings could not be saved.");
      }
      return { response, attendanceWindow };
    })();

    try {
      const result = await saveFlight;
      const card = document.querySelector("[data-admin-attendance-reward-settings]");
      card?.removeAttribute("data-attendance-reward-dirty");
      button.removeAttribute("data-attendance-reward-dirty");
      setButtonState(button, "completed", "Attendance rewards saved");
      window.setTimeout(() => {
        button.removeAttribute("data-admin-terminal-api-state");
        button.removeAttribute("data-attendance-reward-status");
        button.removeAttribute("aria-busy");
        button.disabled = false;
      }, 900);
      return result;
    } catch (error) {
      setButtonState(button, "error", "Attendance rewards not saved");
      button.disabled = false;
      throw error;
    } finally {
      saveFlight = null;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-admin-terminal-action="save-settings"]')
      : null;
    const card = document.querySelector("[data-admin-attendance-reward-settings]");
    const attendanceDirty = card?.getAttribute("data-attendance-reward-dirty") === "true" ||
      button?.getAttribute("data-attendance-reward-dirty") === "true";
    if (!(button instanceof HTMLButtonElement) || !attendanceDirty || coreSettingsChanged()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!validateAttendance()) return;
    void saveAttendance(button).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, true);

  new MutationObserver(rememberCoreSnapshot).observe(document.body, {
    subtree: true,
    childList: true,
  });

  rememberCoreSnapshot();
})();
