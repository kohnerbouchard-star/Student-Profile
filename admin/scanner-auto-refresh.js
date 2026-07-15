(function initEconovariaScannerAutoRefresh() {
  "use strict";

  const REARM_MS = 250;
  const SUCCESS_RESET_MS = 1200;
  const ERROR_RESET_MS = 2000;
  const jobs = new WeakMap();
  const delegatedFetch = window.fetch.bind(window);

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function elements() {
    const consoleElement = document.querySelector("[data-admin-terminal-scanner-console]");
    if (!consoleElement) return null;
    return {
      consoleElement,
      state: consoleElement.querySelector("[data-admin-terminal-scanner-state]"),
      empty: consoleElement.querySelector("[data-admin-terminal-last-scan-empty]"),
      result: consoleElement.querySelector("[data-admin-terminal-last-scan-result]"),
      player: consoleElement.querySelector("[data-admin-terminal-last-scan-player]"),
      playerId: consoleElement.querySelector("[data-admin-terminal-last-scan-player-id]"),
      time: consoleElement.querySelector("[data-admin-terminal-last-scan-time]"),
      autoPanel: consoleElement.querySelector("[data-admin-terminal-auto-panel]"),
      manualPanel: consoleElement.querySelector("[data-admin-terminal-manual-panel]"),
      manualInput: consoleElement.querySelector("[data-admin-terminal-manual-scan-input]"),
      autoInput: consoleElement.querySelector("[data-admin-terminal-auto-scan-input]"),
      submit: consoleElement.querySelector('[data-admin-terminal-action="submit-attendance-scan"]'),
    };
  }

  function setPanel(panel, title, detail) {
    if (!panel) return;
    const strong = panel.querySelector("strong");
    const small = panel.querySelector("small");
    if (strong) strong.textContent = title;
    if (small) small.textContent = detail;
  }

  function clearJobs(consoleElement) {
    const job = jobs.get(consoleElement);
    if (job?.rearm) window.clearTimeout(job.rearm);
    if (job?.reset) window.clearTimeout(job.reset);
    jobs.delete(consoleElement);
  }

  function clearInputError(input) {
    if (!(input instanceof HTMLInputElement)) return;
    input.removeAttribute("aria-invalid");
    const errorId = input.dataset.adminQolErrorId;
    if (errorId) {
      document.getElementById(errorId)?.remove();
      const describedBy = text(input.getAttribute("aria-describedby"))
        .split(" ")
        .filter((value) => value && value !== errorId)
        .join(" ");
      if (describedBy) input.setAttribute("aria-describedby", describedBy);
      else input.removeAttribute("aria-describedby");
    }
    delete input.dataset.adminQolErrorId;
    input.closest(".admin-terminal-field, label")?.classList.remove("is-invalid");
  }

  function activeInput(current) {
    const manualVisible = current.manualPanel && !current.manualPanel.hidden &&
      getComputedStyle(current.manualPanel).display !== "none";
    return manualVisible ? current.manualInput : (current.autoInput || current.manualInput);
  }

  function prepareNextCard(current) {
    for (const input of [current.manualInput, current.autoInput]) {
      if (!(input instanceof HTMLInputElement)) continue;
      input.value = "";
      clearInputError(input);
    }
    if (current.submit instanceof HTMLButtonElement) {
      delete current.submit.dataset.adminQolOriginalDisabled;
      current.submit.disabled = false;
      current.submit.removeAttribute("disabled");
      current.submit.removeAttribute("aria-disabled");
    }
    window.requestAnimationFrame(() => activeInput(elements() || current)?.focus({ preventScroll: true }));
  }

  function ensurePlayerIdLine(current) {
    if (!current?.player) return null;
    if (current.playerId?.isConnected) return current.playerId;
    const playerId = document.createElement("small");
    playerId.dataset.adminTerminalLastScanPlayerId = "";
    playerId.className = "admin-terminal-last-scan-player-id";
    current.player.insertAdjacentElement("afterend", playerId);
    return playerId;
  }

  function formatScanTimestamp(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    const attendance = source.attendance || source.data?.attendance;
    const rawTimestamp = attendance?.clockedInAt || attendance?.clocked_in_at;
    const timestamp = new Date(rawTimestamp || Date.now());
    if (Number.isNaN(timestamp.getTime())) return "";

    const requestedTimeZone = text(attendance?.timezone) || "Asia/Seoul";
    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: requestedTimeZone,
    };

    try {
      const parts = new Intl.DateTimeFormat("en-CA", options).formatToParts(timestamp);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day} · ${values.hour}:${values.minute}`;
    } catch (_) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        ...options,
        timeZone: "Asia/Seoul",
      }).formatToParts(timestamp);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day} · ${values.hour}:${values.minute}`;
    }
  }

  function presentPlayerIdentity(payload, fallbackCode) {
    const source = payload && typeof payload === "object" ? payload : {};
    const player = source.player || source.data?.player;
    if (!player || typeof player !== "object") return;
    const displayName = text(player.displayName || player.display_name);
    const playerIdentifier = text(
      player.playerIdentifier || player.player_identifier || player.rosterLabel || player.roster_label || fallbackCode,
    );
    const compactTimestamp = formatScanTimestamp(source);
    if (!displayName) return;

    window.setTimeout(() => {
      const current = elements();
      if (!current?.player) return;
      current.player.textContent = displayName;
      current.player.dataset.adminScannerIdentitySource = "attendance-response";
      const playerId = ensurePlayerIdLine(current);
      if (playerId) {
        playerId.textContent = playerIdentifier ? `Player ID: ${playerIdentifier}` : "Player ID unavailable";
      }
      if (current.time) {
        current.time.textContent = compactTimestamp;
        current.time.classList.add("admin-terminal-last-scan-time-secondary");
        current.time.setAttribute("datetime", text(source.attendance?.clockedInAt || source.data?.attendance?.clockedInAt));
      }
    }, 0);
  }

  function attendanceScanRequest(input, init) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const method = text(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      return method === "POST" && /\/attendance\/(?:scan|scans)$/.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function setReady(options = {}) {
    const current = elements();
    if (!current) return;
    clearJobs(current.consoleElement);
    delete current.consoleElement.dataset.adminQolScannerState;
    current.consoleElement.removeAttribute("aria-busy");
    if (current.state) current.state.textContent = "Ready";
    setPanel(current.autoPanel, "Listening", "Auto-submit is active.");
    setPanel(current.manualPanel, "Manual entry", "Fallback mode");
    prepareNextCard(current);

    if (options.clearResult !== false) {
      if (current.player) {
        current.player.textContent = "—";
        delete current.player.dataset.adminScannerIdentitySource;
      }
      if (current.playerId) current.playerId.textContent = "";
      if (current.time) {
        current.time.textContent = "";
        current.time.removeAttribute("datetime");
      }
      if (current.result) current.result.hidden = true;
      if (current.empty) {
        current.empty.hidden = false;
        const strong = current.empty.querySelector("strong");
        const small = current.empty.querySelector("small");
        if (strong) strong.textContent = "Ready";
        if (small) small.textContent = "Scan a player code. The result appears here.";
      }
    }
  }

  function schedule(state) {
    const current = elements();
    if (!current || !["completed", "error"].includes(state)) return;
    if (jobs.get(current.consoleElement)?.state === state) return;
    clearJobs(current.consoleElement);

    const rearm = window.setTimeout(() => {
      const latest = elements();
      if (!latest || text(latest.consoleElement.dataset.adminQolScannerState).toLowerCase() !== state) return;
      prepareNextCard(latest);
    }, REARM_MS);

    const reset = window.setTimeout(() => {
      const latest = elements();
      if (!latest) return;
      const dataState = text(latest.consoleElement.dataset.adminQolScannerState).toLowerCase();
      const visibleState = text(latest.state?.textContent).toLowerCase();
      if (![state, "armed"].includes(dataState) && ![state, "armed"].includes(visibleState)) return;
      setReady();
    }, state === "completed" ? SUCCESS_RESET_MS : ERROR_RESET_MS);

    jobs.set(current.consoleElement, { state, rearm, reset });
  }

  function reconcile() {
    const current = elements();
    if (!current) return;
    const dataState = text(current.consoleElement.dataset.adminQolScannerState).toLowerCase();
    const visibleState = text(current.state?.textContent).toLowerCase();
    if (dataState === "processing" || visibleState === "scanning") {
      clearJobs(current.consoleElement);
    } else if (dataState === "completed" || visibleState === "completed") {
      schedule("completed");
    } else if (dataState === "error" || visibleState === "error") {
      schedule("error");
    }
  }

  document.addEventListener("input", (event) => {
    const input = event.target instanceof Element
      ? event.target.closest("[data-admin-terminal-manual-scan-input], [data-admin-terminal-auto-scan-input]")
      : null;
    if (!input) return;
    const current = elements();
    const state = text(current?.consoleElement.dataset.adminQolScannerState).toLowerCase();
    if (["completed", "error"].includes(state)) setReady({ clearResult: false });
  }, true);

  window.fetch = async function econovariaScannerIdentityFetch(input, init) {
    const isAttendanceScan = attendanceScanRequest(input, init);
    const current = isAttendanceScan ? elements() : null;
    const fallbackCode = isAttendanceScan ? text(activeInput(current)?.value) : "";
    const response = await delegatedFetch(input, init);
    if (isAttendanceScan && response.ok) {
      response.clone().json()
        .then((payload) => presentPlayerIdentity(payload, fallbackCode))
        .catch(() => {});
    }
    return response;
  };

  new MutationObserver(() => window.requestAnimationFrame(reconcile)).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-admin-qol-scanner-state", "disabled", "aria-disabled"],
  });

  reconcile();
  window.EconovariaScannerAutoRefresh = {
    setReady,
    schedule,
    prepareNextCard,
    presentPlayerIdentity,
    formatScanTimestamp,
  };
})();
