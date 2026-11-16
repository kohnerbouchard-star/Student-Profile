(function initEconovariaAdminWorldRuntimeConsole() {
  "use strict";

  const ROOT_ID = "adminWorldRuntimeConsole";
  const LAUNCHER_ID = "adminWorldRuntimeLauncher";
  const STALE_AFTER_MS = 60_000;
  const CLASS_IDS = [
    "analyst",
    "builder",
    "maker",
    "mediator",
    "navigator",
    "operator",
    "steward",
    "trader",
  ];
  const PHASES = [
    "arrival",
    "opportunity",
    "rivalry",
    "shortage",
    "meridian_disruption",
    "open_conflict",
    "adaptation",
    "reconstruction",
    "continued_conflict",
  ];

  let activeRequest = null;
  let snapshot = null;
  let loadedAt = 0;
  let modalHandle = null;
  let staleTimer = 0;

  function selectedGameId() {
    return String(
      window.EconovariaAdminAuth?.getSelectedGameId?.() || "",
    ).trim();
  }

  function text(value, fallback = "Unavailable") {
    const normalized = String(value ?? "").trim();
    return normalized || fallback;
  }

  function title(value, fallback = "Unavailable") {
    return text(value, fallback)
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function requestId(prefix) {
    return `${prefix}.${crypto.randomUUID()}`;
  }

  function node(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = String(options.text);
    if (options.id) element.id = options.id;
    if (options.type) element.type = options.type;
    if (options.value !== undefined) element.value = String(options.value);
    if (options.disabled) element.disabled = true;
    for (const [name, value] of Object.entries(options.attributes || {})) {
      if (value !== null && value !== undefined) {
        element.setAttribute(name, String(value));
      }
    }
    for (const [eventName, listener] of Object.entries(options.events || {})) {
      element.addEventListener(eventName, listener);
    }
    const childList = Array.isArray(children) ? children : [children];
    for (const child of childList) {
      if (child instanceof Node) element.append(child);
      else if (child !== null && child !== undefined) {
        element.append(document.createTextNode(String(child)));
      }
    }
    return element;
  }

  function button(label, onClick, options = {}) {
    return node("button", {
      className:
        `admin-world-button${options.secondary ? " is-secondary" : ""}${options.danger ? " is-danger" : ""}`,
      text: label,
      type: "button",
      disabled: options.disabled,
      attributes: options.attributes,
      events: { click: onClick },
    });
  }

  async function api(path, options = {}) {
    const gameId = selectedGameId();
    if (!gameId) {
      throw new Error("Select a game before opening World operations.");
    }
    const controller = options.controller || new AbortController();
    const response = await fetch(
      `/api/admin/games/${encodeURIComponent(gameId)}/world${path}`,
      {
        method: options.method || "GET",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId("admin.world"),
        },
        body: options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        payload?.error?.message || payload?.message || payload?.code ||
          "World administrator request failed.",
      );
      error.status = response.status;
      error.code = payload?.error?.code || payload?.code ||
        "world_admin_request_failed";
      throw error;
    }
    return payload?.data ?? payload;
  }

  function liveNode() {
    return document.querySelector(`#${ROOT_ID} .admin-world-live`);
  }

  function contentNode() {
    return document.querySelector(
      `#${ROOT_ID} .admin-world-console__content`,
    );
  }

  function announce(message, isError = false) {
    const live = liveNode();
    if (!live) return;
    live.textContent = message;
    live.setAttribute("role", isError ? "alert" : "status");
  }

  function publicId(row) {
    return text(row?.public_id || row?.publicId, "");
  }

  function empty(message) {
    return node("p", {
      className: "admin-world-empty",
      text: message,
      attributes: { role: "status" },
    });
  }

  function section(label, heading) {
    const headingWrap = node("div", {}, [
      node("small", { text: label }),
      node("h3", { text: heading }),
    ]);
    return node("section", { className: "admin-world-section" }, [
      node("header", {}, headingWrap),
    ]);
  }

  function factGrid(entries) {
    const list = node("dl", { className: "admin-world-facts" });
    for (const [label, value] of entries) {
      list.append(node("div", {}, [
        node("dt", { text: label }),
        node("dd", { text: text(value, "0") }),
      ]));
    }
    return list;
  }

  function recordList(rows, renderRecord, emptyMessage) {
    const list = node("div", { className: "admin-world-list" });
    if (!rows.length) list.append(empty(emptyMessage));
    for (const row of rows) list.append(renderRecord(row));
    return list;
  }

  function loadingState() {
    const wrapper = node("div", {
      className: "admin-world-loading",
      attributes: { role: "status", "aria-live": "polite" },
    }, node("strong", { text: "Loading World operations" }));
    for (let index = 0; index < 4; index += 1) {
      wrapper.append(node("span"));
    }
    return wrapper;
  }

  function failureState(message) {
    return node("div", {
      className: "admin-world-error",
      attributes: { role: "alert" },
    }, [
      node("strong", { text: "World operations could not be loaded" }),
      node("p", { text: text(message, "The Admin API is unavailable.") }),
      button("Retry", () => void refreshConsole()),
    ]);
  }

  function createLauncher() {
    if (document.getElementById(LAUNCHER_ID)) return true;
    const mount = document.getElementById("adminPreview");
    if (!mount || mount.hidden) return false;
    const topbar = mount.querySelector(
      ".admin-terminal-top-actions, .admin-terminal-app-topbar, header",
    ) || mount;
    const launcher = node("div", {
      id: LAUNCHER_ID,
      className: "admin-world-launcher",
      text: "World operations",
      attributes: {
        role: "button",
        tabindex: "-1",
        title: "Open World operations (Alt+W)",
        "aria-label": "Open World operations",
        "aria-keyshortcuts": "Alt+W",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
      },
      events: { click: () => openConsole(launcher) },
    });
    topbar.append(launcher);
    return true;
  }

  function scheduleLauncher() {
    createLauncher();
    for (const delay of [250, 1_000, 2_500]) {
      window.setTimeout(createLauncher, delay);
    }
  }

  function closeConsole() {
    activeRequest?.abort?.();
    activeRequest = null;
    if (staleTimer) window.clearInterval(staleTimer);
    staleTimer = 0;
    modalHandle?.close?.("close");
    modalHandle = null;
    document.getElementById(ROOT_ID)
      ?.closest(".admin-world-backdrop")
      ?.remove();
    const launcher = document.getElementById(LAUNCHER_ID);
    launcher?.setAttribute("aria-expanded", "false");
    launcher?.focus?.();
  }

  function openConsole(opener) {
    closeConsole();
    const backdrop = node("div", {
      className: "admin-world-backdrop",
      attributes: { "data-admin-terminal-modal-backdrop": "" },
    });
    const dialog = node("section", {
      id: ROOT_ID,
      className: "admin-world-console",
      attributes: {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "adminWorldRuntimeTitle",
        tabindex: "-1",
      },
    });
    const close = button("Close", closeConsole, { secondary: true });
    const header = node("header", {
      className: "admin-world-console__header",
    }, [
      node("div", {}, [
        node("small", { text: "WORLD AUTHORITY" }),
        node("h2", { id: "adminWorldRuntimeTitle", text: "World operations" }),
      ]),
      close,
    ]);
    const live = node("p", {
      className: "admin-world-live",
      text: "Loading authoritative World state…",
      attributes: { role: "status", "aria-live": "polite" },
    });
    const content = node("div", {
      className: "admin-world-console__content",
      attributes: { "aria-busy": "true" },
    }, loadingState());
    dialog.append(header, live, content);
    backdrop.append(dialog);
    document.body.append(backdrop);
    opener?.setAttribute("aria-expanded", "true");
    modalHandle = window.EconovariaAdminModalAccessibility?.activate?.({
      backdrop,
      dialog,
      opener,
      initialFocus: close,
      dismissOnBackdrop: false,
      dismissOnEscape: true,
      onClose: () => backdrop.remove(),
    }) || null;
    if (!modalHandle) close.focus();
    staleTimer = window.setInterval(() => {
      if (loadedAt && Date.now() - loadedAt > STALE_AFTER_MS) {
        announce("World data is stale. Refresh before a mutation.");
      }
    }, 15_000);
    void refreshConsole();
  }

  async function refreshConsole(announcement = "") {
    const content = contentNode();
    if (!content) return;
    activeRequest?.abort?.();
    const controller = new AbortController();
    activeRequest = controller;
    content.setAttribute("aria-busy", "true");
    content.replaceChildren(loadingState());
    announce(
      announcement ||
        "Loading campaign, geography, travel, and residency state…",
    );
    try {
      const [campaign, history, effects, arrivals, geography, travel, residency] =
        await Promise.all([
          api("/campaign", { controller }),
          api("/campaign/history?limit=100", { controller }),
          api("/campaign/effects?status=all&limit=100", { controller }),
          api("/arrival-classes?limit=100", { controller }),
          api("/geography", { controller }),
          api("/travel?limit=100", { controller }),
          api("/residency?limit=100", { controller }),
        ]);
      if (controller.signal.aborted || !content.isConnected) return;
      snapshot = {
        campaign,
        history,
        effects,
        arrivals,
        geography,
        travel,
        residency,
      };
      loadedAt = Date.now();
      content.removeAttribute("aria-busy");
      content.replaceChildren(renderSnapshot(snapshot));
      announce(announcement || "Authoritative World state loaded.");
    } catch (error) {
      if (controller.signal.aborted || !content.isConnected) return;
      content.removeAttribute("aria-busy");
      content.replaceChildren(failureState(error?.message));
      announce("World operations are unavailable.", true);
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
  }

  async function mutate(buttonNode, path, body, successMessage) {
    const original = buttonNode.textContent;
    buttonNode.disabled = true;
    buttonNode.textContent = "Applying…";
    try {
      await api(path, { method: "POST", body });
      await refreshConsole(successMessage);
    } catch (error) {
      announce(error?.message || "World operation failed.", true);
      buttonNode.disabled = false;
      buttonNode.textContent = original;
    }
  }

  const {
    renderCampaign, openManualTrigger, renderEffects, renderArrivals, renderGeography, renderTravel,
    renderResidency, renderSnapshot,
  } = window.createWorldRuntimePresentation({
    section,
    title,
    factGrid,
    node,
    button,
    mutate,
    publicId,
    refreshConsole,
    recordList,
    text,
    ROOT_ID,
    PHASES,
    api,
    requestId,
    announce,
    CLASS_IDS,
  });

  function handleWorldShortcut(event) {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (String(event.key).toLowerCase() !== "w") return;
    if (document.getElementById(ROOT_ID)) return;
    event.preventDefault();
    const launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher && !createLauncher()) return;
    openConsole(document.getElementById(LAUNCHER_ID));
  }

  document.addEventListener("DOMContentLoaded", scheduleLauncher, { once: true });
  document.addEventListener("econovaria:admin-mounted", scheduleLauncher);
  document.addEventListener("keydown", handleWorldShortcut);
  document.addEventListener("econovaria:admin-game-selected", () => {
    snapshot = null;
    loadedAt = 0;
    if (document.getElementById(ROOT_ID)) {
      void refreshConsole("Selected game changed. Reloading World state.");
    }
  });
  window.addEventListener("online", () => {
    if (document.getElementById(ROOT_ID)) {
      void refreshConsole("Connection restored. Refreshing World state.");
    }
  });
  window.addEventListener("offline", () => {
    announce(
      "Offline. Existing World data remains visible; mutations are unavailable.",
      true,
    );
  });
  scheduleLauncher();

  window.EconovariaAdminWorldRuntime = Object.freeze({
    open: () => {
      if (!document.getElementById(LAUNCHER_ID)) createLauncher();
      openConsole(document.getElementById(LAUNCHER_ID));
    },
    refresh: refreshConsole,
    getSnapshot: () => snapshot,
  });
})();
