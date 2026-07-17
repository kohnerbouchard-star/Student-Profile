(function initEconovariaAttendanceRewardSaveControllerV3() {
  "use strict";

  const SAVE_SELECTOR = '[data-admin-terminal-action="save-settings"]';
  const delegatedFetch = window.fetch.bind(window);
  const coreDirtyKeys = new Set();
  let dirtyGameId = "";
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

  function saveButton() {
    return document.querySelector(SAVE_SELECTOR);
  }

  function clearAttendanceButtonState() {
    const button = saveButton();
    if (!(button instanceof HTMLButtonElement)) return;
    button.removeAttribute("data-attendance-reward-error");
    button.removeAttribute("data-attendance-reward-status");
    button.removeAttribute("data-attendance-reward-direct-save");
    button.removeAttribute("data-admin-terminal-api-state");
    button.removeAttribute("aria-busy");
    button.removeAttribute("aria-disabled");
    window.EconovariaSimplifiedSettings?.refresh?.();
  }

  function resetDirtyKeysForGame(gameId) {
    if (!gameId || dirtyGameId === gameId) return;
    if (dirtyGameId) clearAttendanceButtonState();
    dirtyGameId = gameId;
    coreDirtyKeys.clear();
  }

  function readCoreSettings() {
    return Object.fromEntries(
      [...document.querySelectorAll("[data-game-setting-key]")]
        .map((control) => {
          const key = control.getAttribute("data-game-setting-key");
          let value = "";
          if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
            value = control.checked;
          } else if (
            control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement ||
            control instanceof HTMLTextAreaElement
          ) {
            value = control.value;
          }
          return [key, value];
        })
        .filter(([key]) => Boolean(key)),
    );
  }

  function field(name) {
    return document.querySelector(`[data-attendance-reward-field="${name}"]`);
  }

  function attendanceDirty() {
    const card = document.querySelector("[data-admin-attendance-reward-settings]");
    return window.EconovariaAttendanceRewardSettings?.isDirty?.() === true ||
      card?.getAttribute("data-attendance-reward-dirty") === "true";
  }

  function combinedCoreSavePending() {
    resetDirtyKeysForGame(selectedGameId());
    return coreDirtyKeys.size > 0;
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
    const attendanceWindow = settings.attendanceWindow || settings.attendance_window ||
      object(settings.settings).attendanceWindow;
    return attendanceWindow && typeof attendanceWindow === "object" && !Array.isArray(attendanceWindow)
      ? object(attendanceWindow)
      : null;
  }

  function persistedAttendanceWindow() {
    const value = window.EconovariaAttendanceRewardSettings?.getPersistedWindow?.();
    return value && typeof value === "object" && !Array.isArray(value) ? object(value) : null;
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

  function setSaveState(button, state, label) {
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
    }
    window.EconovariaSimplifiedSettings?.refresh?.();
  }

  async function saveAttendanceOnly(button) {
    if (saveFlight) return saveFlight;
    const gameId = selectedGameId();
    if (!gameId) throw new Error("active_game_required");

    setSaveState(button, "processing", "Saving game settings");
    saveFlight = (async () => {
      const settingsResponse = await delegatedFetch(
        `/api/admin/games/${encodeURIComponent(gameId)}/settings`,
        { method: "GET", headers: { "Accept": "application/json" } },
      );
      if (!settingsResponse.ok) {
        throw new Error(`Game settings could not be read before saving (${settingsResponse.status}).`);
      }
      const settingsPayload = await settingsResponse.json();
      const existingAttendance = readAttendanceFromPayload(settingsPayload) || persistedAttendanceWindow();
      if (!existingAttendance) {
        throw new Error("Current attendance settings could not be verified before saving.");
      }
      const attendanceWindow = draftAttendanceWindow(existingAttendance);
      const body = { attendanceWindow };
      const response = await delegatedFetch(
        `/api/admin/games/${encodeURIComponent(gameId)}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const payload = await response.clone().json().catch(() => ({}));
        throw new Error(text(payload.message || payload.error?.message) || "Game settings could not be saved.");
      }
      return { response, attendanceWindow, body, gameId };
    })();

    try {
      const result = await saveFlight;
      document.querySelector("[data-admin-attendance-reward-settings]")
        ?.removeAttribute("data-attendance-reward-dirty");
      button.removeAttribute("data-attendance-reward-error");
      button.dataset.attendanceRewardDirectSave = "true";
      document.dispatchEvent(new CustomEvent("econovaria:attendance-reward-saved", {
        detail: {
          gameId: result.gameId,
          attendanceWindow: result.attendanceWindow,
          combined: false,
        },
      }));
      setSaveState(button, "completed", "Game settings saved");
      window.setTimeout(() => {
        if (attendanceDirty()) return;
        button.removeAttribute("data-admin-terminal-api-state");
        button.removeAttribute("data-attendance-reward-status");
        button.removeAttribute("data-attendance-reward-direct-save");
        window.EconovariaSimplifiedSettings?.refresh?.();
      }, 900);
      return result;
    } catch (error) {
      button.dataset.attendanceRewardError = error instanceof Error ? error.message : String(error);
      setSaveState(button, "error", "Game settings not saved");
      throw error;
    } finally {
      saveFlight = null;
    }
  }

  function markCoreEdit(event) {
    const control = event.target instanceof Element
      ? event.target.closest("[data-game-setting-key]")
      : null;
    const key = control?.getAttribute("data-game-setting-key");
    if (!key) return;
    resetDirtyKeysForGame(selectedGameId());
    coreDirtyKeys.add(key);
  }

  document.addEventListener("input", markCoreEdit, true);
  document.addEventListener("change", markCoreEdit, true);

  document.addEventListener("econovaria:attendance-reward-saved", (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (detail?.combined === true) coreDirtyKeys.clear();
  });

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest(SAVE_SELECTOR)
      : null;
    if (!(button instanceof HTMLButtonElement) || !attendanceDirty()) return;
    if (!validateAttendance()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (combinedCoreSavePending()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.dataset.attendanceRewardDirectSave = "true";
    void saveAttendanceOnly(button).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, true);

  window.EconovariaAttendanceRewardSaveController = {
    attendanceDirty,
    readCoreSettings,
    combinedCoreSavePending,
  };
})();
