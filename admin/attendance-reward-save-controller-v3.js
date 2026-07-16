(function initEconovariaAttendanceRewardSaveControllerV3() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);
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
    const button = document.querySelector('[data-admin-terminal-action="save-settings"]');
    return window.EconovariaAttendanceRewardSettings?.isDirty?.() === true ||
      card?.getAttribute("data-attendance-reward-dirty") === "true" ||
      button?.getAttribute("data-attendance-reward-dirty") === "true";
  }

  function combinedCoreSavePending(button) {
    return button instanceof HTMLButtonElement &&
      button.dataset.attendanceRewardCorePending === "true";
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
      keepDirtyButtonAvailable();
    });
  }

  async function saveAttendanceOnly(button) {
    if (saveFlight) return saveFlight;
    const gameId = selectedGameId();
    if (!gameId) throw new Error("active_game_required");

    setButtonState(button, "processing", "Saving game settings");
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
      button.removeAttribute("data-attendance-reward-dirty");
      button.removeAttribute("data-attendance-reward-core-pending");
      button.classList.remove("is-dirty");
      button.dataset.attendanceRewardDirectSave = "true";
      document.dispatchEvent(new CustomEvent("econovaria:attendance-reward-saved", {
        detail: {
          gameId: result.gameId,
          attendanceWindow: result.attendanceWindow,
        },
      }));
      setButtonState(button, "completed", "Game settings saved");
      window.setTimeout(() => {
        button.removeAttribute("data-admin-terminal-api-state");
        button.removeAttribute("data-attendance-reward-status");
        button.disabled = false;
      }, 900);
      return result;
    } catch (error) {
      button.dataset.attendanceRewardError = error instanceof Error ? error.message : String(error);
      setButtonState(button, "error", "Game settings not saved");
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
    if (!validateAttendance()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (combinedCoreSavePending(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.dataset.attendanceRewardDirectSave = "true";
    void saveAttendanceOnly(button).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, true);

  new MutationObserver(scheduleReconcile).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "disabled",
      "aria-disabled",
      "data-attendance-reward-dirty",
      "data-attendance-reward-loaded",
      "data-admin-terminal-api-state",
    ],
  });

  window.EconovariaAttendanceRewardSaveController = {
    attendanceDirty,
    readCoreSettings,
    combinedCoreSavePending,
  };
  scheduleReconcile();
})();
