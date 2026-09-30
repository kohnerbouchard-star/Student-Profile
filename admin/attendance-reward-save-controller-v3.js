(function initEconovariaAttendanceRewardSaveControllerV3() {
  "use strict";

  const previousController = window.EconovariaAttendanceRewardSaveController;
  previousController?.dispose?.();
  const previousGeneration = Number.parseInt(previousController?.getContextIdentity?.() || "-1", 10);
  const PAGE_SELECTOR = ".admin-terminal-settings-page";
  const SAVE_SELECTOR = '[data-admin-terminal-action="save-settings"]';
  const MUTATION_KEY_PREFIX = "econovaria.admin.attendance-settings-mutation.v1";
  const delegatedFetch = window.fetch.bind(window);
  function attendanceRequest(input, init) {
    const adapter = window.EconovariaAttendanceRewardRequestAdapter;
    return typeof adapter?.request === "function"
      ? adapter.request(input, init)
      : delegatedFetch(input, init);
  }
  const coreDirtyKeys = new Set();
  const mutationMemory = new Map();
  let dirtyGameId = "";
  let contextGeneration = Number.isFinite(previousGeneration) ? previousGeneration + 1 : 0;
  let saveFlight = null;
  let saveFlightGeneration = -1;
  let contextPage = document.querySelector(PAGE_SELECTOR);
  let routeActive = true;
  let disposed = false;
  let savedTimer = 0;

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

  function settingsMutation(gameId, body) {
    const storageKey = `${MUTATION_KEY_PREFIX}.${gameId}`;
    const payload = JSON.stringify(body);
    const memoryEntry = object(mutationMemory.get(storageKey));
    if (
      memoryEntry.payload === payload &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(text(memoryEntry.key))
    ) return { key: text(memoryEntry.key), storageKey };

    let existing = {};
    try {
      existing = object(JSON.parse(window.sessionStorage.getItem(storageKey) || "{}"));
    } catch (_) {}
    if (
      existing.payload === payload &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(text(existing.key))
    ) {
      mutationMemory.set(storageKey, existing);
      return { key: text(existing.key), storageKey };
    }

    const key = `admin.settings.attendance.${window.crypto.randomUUID()}`;
    const entry = { key, payload };
    mutationMemory.set(storageKey, entry);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ key, payload }));
    } catch (_) {}
    return { key, storageKey };
  }

  function completeSettingsMutation(storageKey, key) {
    if (!storageKey) return;
    if (mutationMemory.get(storageKey)?.key === key) mutationMemory.delete(storageKey);
    try {
      const entry = object(JSON.parse(window.sessionStorage.getItem(storageKey) || "{}"));
      if (entry.key === key) window.sessionStorage.removeItem(storageKey);
    } catch (_) {}
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

  function ownsButtonState(button) {
    return button instanceof HTMLButtonElement && (
      button.hasAttribute("data-attendance-reward-error") ||
      button.hasAttribute("data-attendance-reward-status") ||
      button.hasAttribute("data-attendance-reward-direct-save")
    );
  }

  function clearAttendanceButtonState() {
    const button = saveButton();
    if (!(button instanceof HTMLButtonElement)) return;
    const owned = ownsButtonState(button);
    button.removeAttribute("data-attendance-reward-error");
    button.removeAttribute("data-attendance-reward-status");
    button.removeAttribute("data-attendance-reward-direct-save");
    if (owned) {
      button.removeAttribute("data-admin-terminal-api-state");
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-disabled");
    }
    window.EconovariaSimplifiedSettings?.refresh?.();
  }

  function resetDirtyKeysForGame(gameId) {
    if (!gameId || dirtyGameId === gameId) return;
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
    const draft = object(window.EconovariaAttendanceRewardSettings?.getDraftWindow?.());
    const currencyCode = (
      text(draft.currencyCode) || text(existing.currencyCode) || "ECO"
    ).toUpperCase();
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

  function synchronizePageContext() {
    const page = document.querySelector(PAGE_SELECTOR);
    if (page !== contextPage) {
      contextPage = page;
      contextGeneration += 1;
      window.clearTimeout(savedTimer);
    }
  }

  function contextIsCurrent(gameId, generation) {
    synchronizePageContext();
    const selection = window.EconovariaAdminGameSelection;
    return !disposed && routeActive && contextPage?.isConnected === true &&
      generation === contextGeneration && selectedGameId() === gameId &&
      (typeof selection?.read !== "function" || selection.read() === gameId);
  }

  async function saveAttendanceOnly(button) {
    synchronizePageContext();
    if (saveFlight && saveFlightGeneration === contextGeneration) return saveFlight;
    const gameId = selectedGameId();
    if (!gameId) throw new Error("active_game_required");
    const generation = contextGeneration;
    if (!contextIsCurrent(gameId, generation) ||
        button.closest(PAGE_SELECTOR) !== contextPage) return null;

    window.clearTimeout(savedTimer);
    setSaveState(button, "processing", "Saving game settings");
    const flight = (async () => {
      const settingsResponse = await attendanceRequest(
        `/api/admin/games/${encodeURIComponent(gameId)}/settings`,
        { method: "GET", headers: { "Accept": "application/json" } },
      );
      if (!settingsResponse.ok) {
        throw new Error(`Game settings could not be read before saving (${settingsResponse.status}).`);
      }
      const settingsPayload = await settingsResponse.json();
      if (!contextIsCurrent(gameId, generation)) return null;
      const existingAttendance = readAttendanceFromPayload(settingsPayload) || persistedAttendanceWindow();
      if (!existingAttendance) {
        throw new Error("Current attendance settings could not be verified before saving.");
      }
      const attendanceWindow = draftAttendanceWindow(existingAttendance);
      const body = { attendanceWindow };
      const mutation = settingsMutation(gameId, body);
      const response = await attendanceRequest(
        `/api/admin/games/${encodeURIComponent(gameId)}/settings`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Idempotency-Key": mutation.key,
            "X-Request-Id": mutation.key,
          },
          body: JSON.stringify({ ...body, idempotencyKey: mutation.key }),
        },
      );
      if (!response.ok) {
        const payload = await response.clone().json().catch(() => ({}));
        throw new Error(text(payload.message || payload.error?.message) || "Game settings could not be saved.");
      }
      completeSettingsMutation(mutation.storageKey, mutation.key);
      return { response, attendanceWindow, body, gameId };
    })();
    saveFlight = flight;
    saveFlightGeneration = generation;

    try {
      const result = await flight;
      if (!contextIsCurrent(gameId, generation)) return result;
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
      window.clearTimeout(savedTimer);
      savedTimer = window.setTimeout(() => {
        if (!contextIsCurrent(gameId, generation) || attendanceDirty()) return;
        button.removeAttribute("data-admin-terminal-api-state");
        button.removeAttribute("data-attendance-reward-status");
        button.removeAttribute("data-attendance-reward-direct-save");
        window.EconovariaSimplifiedSettings?.refresh?.();
      }, 900);
      return result;
    } catch (error) {
      if (!contextIsCurrent(gameId, generation)) return null;
      button.dataset.attendanceRewardError = error instanceof Error ? error.message : String(error);
      setSaveState(button, "error", "Game settings not saved");
      throw error;
    } finally {
      if (saveFlight === flight) saveFlight = null;
    }
  }

  function markCoreEdit(event) {
    const control = event.target instanceof Element
      ? event.target.closest("[data-game-setting-key]")
      : null;
    const key = control?.getAttribute("data-game-setting-key");
    if (!key || disposed || !control.closest(PAGE_SELECTOR)) return;
    synchronizePageContext();
    resetDirtyKeysForGame(selectedGameId());
    coreDirtyKeys.add(key);
  }

  function contextChanged(event) {
    const detail = event instanceof CustomEvent ? event.detail : null;
    contextGeneration += 1;
    window.clearTimeout(savedTimer);
    synchronizePageContext();
    dirtyGameId = text(detail?.gameId) || selectedGameId();
    coreDirtyKeys.clear();
    clearAttendanceButtonState();
  }

  function attendanceSaved(event) {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (disposed || !routeActive || detail?.gameId !== selectedGameId()) return;
    if (detail?.combined === true) {
      coreDirtyKeys.clear();
      clearAttendanceButtonState();
    }
  }

  function settingsMounted(event) {
    const page = document.querySelector(PAGE_SELECTOR);
    if (event.target !== page || !page?.isConnected) return;
    synchronizePageContext();
    routeActive = true;
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const section = target?.closest("[data-admin-section]");
    if (section) {
      contextGeneration += 1;
      window.clearTimeout(savedTimer);
      routeActive = section.getAttribute("data-admin-section") === "Settings";
      if (!routeActive) coreDirtyKeys.clear();
    }
    const button = target?.closest(SAVE_SELECTOR);
    if (!(button instanceof HTMLButtonElement) ||
        !button.closest(PAGE_SELECTOR) || !attendanceDirty()) return;
    synchronizePageContext();
    if (!contextIsCurrent(selectedGameId(), contextGeneration)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (saveFlight && saveFlightGeneration === contextGeneration) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
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
  }

  const listeners = [
    ["input", markCoreEdit, true],
    ["change", markCoreEdit, true],
    ["econovaria:settings-context-changed", contextChanged, false],
    ["econovaria:attendance-reward-saved", attendanceSaved, false],
    ["econovaria:admin-settings-mounted", settingsMounted, false],
    ["click", handleClick, true],
  ];
  for (const args of listeners) document.addEventListener(...args);

  window.EconovariaAttendanceRewardSaveController = {
    attendanceDirty,
    getContextIdentity() {
      synchronizePageContext();
      return `${contextGeneration}:${selectedGameId()}`;
    },
    readCoreSettings,
    combinedCoreSavePending,
    dispose() {
      if (disposed) return;
      disposed = true;
      contextGeneration += 1;
      window.clearTimeout(savedTimer);
      for (const args of listeners) document.removeEventListener(...args);
    },
  };
})();
