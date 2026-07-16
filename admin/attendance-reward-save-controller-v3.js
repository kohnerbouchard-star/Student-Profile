(function initEconovariaAttendanceRewardSaveControllerV3() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);
  let coreSnapshot = null;
  let snapshotGameId = "";
  let saveFlight = null;
  let reconcileQueued = false;

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

  function hasCanonicalCoreControls(value = readCoreSettings()) {
    return Object.prototype.hasOwnProperty.call(value, "difficultyBasePreset") &&
      Object.prototype.hasOwnProperty.call(value, "incomeMultiplier") &&
      Object.keys(value).length >= 5;
  }

  function stable(value) {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
  }

  function field(name) {
    return document.querySelector(`[data-attendance-reward-field="${name}"]`);
  }

  function attendanceDirty() {
    const card = document.querySelector("[data-admin-attendance-reward-settings]");
    const button = document.querySelector('[data-admin-terminal-action="save-settings"]');
    return card?.getAttribute("data-attendance-reward-dirty") === "true" ||
      button?.getAttribute("data-attendance-reward-dirty") === "true";
  }

  function rememberCoreSnapshot() {
    const gameId = selectedGameId();
    if (!gameId || !document.querySelector(".admin-terminal-settings-main-panel")) return;
    const current = readCoreSettings();
    if (!hasCanonicalCoreControls(current)) return;
    if (attendanceDirty() && coreSnapshot && snapshotGameId === gameId) return;
    coreSnapshot = current;
    snapshotGameId = gameId;
  }

  function coreSettingsChanged() {
    const current = readCoreSettings();
    if (!hasCanonicalCoreControls(coreSnapshot || {})) {
      coreSnapshot = current;
      snapshotGameId = selectedGameId();
      return false;
    }
    return stable(current) !== stable(coreSnapshot || {});
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
    button.dataset.attendanceRewardStatus = label;
    if (state === "processing") {
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-disabled", "true");
      button.disabled = true;
    } else {
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-disabled");
      button.disabled = false;
    }
  }

  function keepDirtyButtonAvailable() {
    const button = document.querySelector('[data-admin-terminal-action="save-settings"]');
    if (!(button instanceof HTMLButtonElement) || !attendanceDirty() || saveFlight) return;
    button.disabled = false;
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    if (button.dataset.adminTerminalApiState === "error") {
      button.removeAttribute("data-admin-terminal-api-state");
    }
    button.classList.add("is-dirty");
  }

  function scheduleReconcile() {
    if (reconcileQueued) return;
    reconcileQueued = true;
    window.requestAnimationFrame(() => {
      reconcileQueued = false;
      rememberCoreSnapshot();
      keepDirtyButtonAvailable();
    });
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
      document.querySelector("[data-admin-attendance-reward-settings]")
        ?.removeAttribute("data-attendance-reward-dirty");
      button.removeAttribute("data-attendance-reward-dirty");
      setButtonState(button, "completed", "Attendance rewards saved");
      window.setTimeout(() => {
        button.removeAttribute("data-admin-terminal-api-state");
        button.removeAttribute("data-attendance-reward-status");
        button.disabled = false;
      }, 900);
      return result;
    } catch (error) {
      setButtonState(button, "error", "Attendance rewards not saved");
      throw error;
    } finally {
      saveFlight = null;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-admin-terminal-action="save-settings"]')
      : null;
    if (!(button instanceof HTMLButtonElement) || !attendanceDirty()) return;
    const coreChanged = coreSettingsChanged();
    button.dataset.attendanceRewardCoreChanged = String(coreChanged);
    if (coreChanged) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.dataset.attendanceRewardDirectSave = "true";
    if (!validateAttendance()) return;
    void saveAttendance(button).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, true);

  new MutationObserver(scheduleReconcile).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "data-attendance-reward-dirty", "data-admin-terminal-api-state"],
  });

  window.EconovariaAttendanceRewardSaveController = {
    attendanceDirty,
    coreSettingsChanged,
    rememberCoreSnapshot,
  };
  scheduleReconcile();
})();
