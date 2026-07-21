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
      className: `admin-world-button${options.secondary ? " is-secondary" : ""}${options.danger ? " is-danger" : ""}`,
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
    const launcher = node("button", {
      id: LAUNCHER_ID,
      className: "admin-world-launcher",
      text: "World operations",
      type: "button",
      attributes: {
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

  function renderCampaign(data) {
    const campaigns = Array.isArray(data.campaign?.campaigns)
      ? data.campaign.campaigns
      : [];
    const current = campaigns[0] || null;
    const scheduler = data.campaign?.scheduler || {};
    const history = Array.isArray(data.history?.history)
      ? data.history.history
      : [];
    const panel = section(
      "CAMPAIGN CONTROL",
      current ? title(current.current_phase) : "No campaign",
    );
    panel.append(factGrid([
      ["Status", current ? title(current.status) : "Not initialized"],
      ["Revision", current?.revision ?? 0],
      ["Scheduler due", scheduler.due ?? 0],
      ["Active", scheduler.active ?? 0],
      ["Paused", scheduler.paused ?? 0],
      ["Disabled", scheduler.emergencyDisabled ?? 0],
    ]));
    const controls = node("div", { className: "admin-world-controls" });
    if (current) {
      for (const action of ["pause", "resume", "emergency_disable"]) {
        const control = button(
          title(action),
          () => void mutate(
            control,
            "/campaign/control",
            {
              action,
              campaignId: publicId(current),
              correctedPhase: null,
              expectedRevision: Number(current.revision),
              reason:
                `Administrator ${title(action)} from the World operations console.`,
            },
            `${title(action)} committed and audited.`,
          ),
          {
            danger: action === "emergency_disable",
            disabled: action === "pause"
              ? current.status !== "active"
              : action === "resume"
              ? current.status !== "paused"
              : current.status === "emergency_disabled",
          },
        );
        controls.append(control);
      }
      controls.append(button(
        "Manual trigger",
        () => openManualTrigger(current),
        { secondary: true, disabled: current.status !== "active" },
      ));
    }
    controls.append(button("Refresh", () => void refreshConsole(), {
      secondary: true,
    }));
    panel.append(controls);
    panel.append(recordList(
      history,
      (row) => node("article", {}, [
        node("strong", { text: title(row.event_key || row.to_phase) }),
        node("small", { text: text(row.occurred_at || row.created_at, "Current") }),
        node("p", {
          text: text(
            row.reason,
            `${title(row.from_phase)} to ${title(row.to_phase)}`,
          ),
        }),
      ]),
      "No committed campaign history.",
    ));
    return panel;
  }

  function openManualTrigger(campaign) {
    const panel = document.querySelector(`#${ROOT_ID} .admin-world-section`);
    if (!panel || panel.querySelector(".admin-world-inline-form")) return;
    const form = node("form", {
      className: "admin-world-inline-form",
      attributes: { "aria-label": "Manual campaign trigger" },
    });
    const eventInput = node("input", {
      id: "adminWorldManualEventKey",
      attributes: {
        name: "eventKey",
        required: "",
        pattern: "[a-z0-9][a-z0-9._:-]*",
        placeholder: "manual-world-event",
      },
    });
    const phaseSelect = node("select", {
      id: "adminWorldManualNextPhase",
      attributes: { name: "nextPhase" },
    });
    const currentIndex = PHASES.indexOf(campaign.current_phase);
    const candidates = currentIndex >= 0
      ? PHASES.slice(currentIndex + 1, currentIndex + 3)
      : PHASES.slice(1, 3);
    for (const phase of candidates) {
      phaseSelect.append(node("option", { value: phase, text: title(phase) }));
    }
    const submit = node("button", {
      className: "admin-world-button",
      text: "Trigger reviewed notification event",
      type: "submit",
    });
    const eventLabel = node("label", {
      text: "Event key",
      attributes: { for: eventInput.id },
    });
    const phaseLabel = node("label", {
      text: "Next phase",
      attributes: { for: phaseSelect.id },
    });
    form.append(eventLabel, eventInput, phaseLabel, phaseSelect, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      try {
        await api("/campaign/manual-trigger", {
          method: "POST",
          body: {
            campaignId: publicId(campaign),
            completeCampaign: false,
            effects: [{
              effectKind: "notify_players",
              payload: {
                audience: "all_players",
                notificationDefinitionId:
                  "notification.world.manual-update.v1",
              },
            }],
            eventKey: eventInput.value.trim(),
            expectedPhase: campaign.current_phase,
            expectedRevision: Number(campaign.revision),
            nextPhase: phaseSelect.value,
            nextScheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
            prerequisiteEventKeys: [],
            reason: "Administrator initiated a reviewed World event.",
            requestId: requestId("manual.trigger"),
          },
        });
        form.remove();
        await refreshConsole("Manual campaign event committed and audited.");
      } catch (error) {
        announce(error?.message || "Manual trigger failed.", true);
        submit.disabled = false;
      }
    });
    panel.prepend(form);
    eventInput.focus();
  }

  function renderEffects(data) {
    const effects = Array.isArray(data.effects?.effects)
      ? data.effects.effects
      : [];
    const panel = section("DURABLE EFFECTS", "Effect recovery");
    panel.append(factGrid(
      Object.entries(data.effects?.summary || {}).map(([key, value]) => [
        title(key),
        value,
      ]),
    ));
    panel.append(recordList(
      effects,
      (effect) => {
        const article = node("article", {}, [
          node("strong", { text: title(effect.effect_kind) }),
          node("small", {
            text: `${title(effect.status)} · ${text(effect.public_id)}`,
          }),
          node("p", {
            text: text(effect.last_error_code, "No recorded error"),
          }),
        ]);
        if (effect.status === "failed") {
          const recover = button("Recover effect", () => void mutate(
            recover,
            `/campaign/effects/${encodeURIComponent(publicId(effect))}/recover`,
            {
              reason: "Administrator requested bounded effect recovery.",
              requestId: requestId("effect.recovery"),
            },
            "Effect recovery committed and audited.",
          ));
          article.append(recover);
        }
        return article;
      },
      "No effect commands are present.",
    ));
    return panel;
  }

  function renderArrivals(data) {
    const assignments = Array.isArray(data.arrivals?.assignments)
      ? data.arrivals.assignments
      : [];
    const panel = section("ARRIVAL CLASS", "Review and correction");
    panel.append(recordList(
      assignments,
      (assignment) => {
        const article = node("article", {}, [
          node("strong", { text: title(assignment.class_id) }),
          node("small", {
            text:
              `${title(assignment.country_id)} · revision ${text(assignment.revision, "0")}`,
          }),
          node("p", {
            text: text(assignment.override_reason, title(assignment.source)),
          }),
        ]);
        const selectId = `adminWorldClass-${publicId(assignment)}`;
        const label = node("label", {
          text: "Corrected class",
          attributes: { for: selectId },
        });
        const select = node("select", {
          id: selectId,
          attributes: {
            "aria-label": `Correct Arrival Class ${publicId(assignment)}`,
          },
        });
        for (const classId of CLASS_IDS) {
          const option = node("option", {
            value: classId,
            text: title(classId),
          });
          option.selected = classId === assignment.class_id;
          select.append(option);
        }
        const correct = button("Correct class", () => void mutate(
          correct,
          `/arrival-classes/${encodeURIComponent(publicId(assignment))}/correct`,
          {
            classId: select.value,
            expectedRevision: Number(assignment.revision),
            reason:
              "Administrator corrected the session-scoped Arrival Class after review.",
            requestId: requestId("arrival.correction"),
          },
          "Arrival Class correction committed and audited.",
        ), { secondary: true });
        article.append(label, select, correct);
        return article;
      },
      "No Arrival Class assignments.",
    ));
    return panel;
  }

  function renderGeography(data) {
    const runtime = data.geography?.runtime || null;
    const locations = Array.isArray(data.geography?.locations)
      ? data.geography.locations
      : [];
    const routes = Array.isArray(data.geography?.routes)
      ? data.geography.routes
      : [];
    const panel = section(
      "GEOGRAPHY",
      `${locations.length} locations · ${routes.length} routes`,
    );
    panel.append(factGrid([
      ["World revision", runtime?.revision ?? 0],
      ["Pack", runtime?.pack_id],
      ["Version", runtime?.pack_version],
      ["Updated", runtime?.updated_at],
    ]));
    panel.append(recordList(
      routes.slice(0, 100),
      (route) => {
        const article = node("article", {}, [
          node("strong", { text: text(route.public_route_id) }),
          node("small", {
            text:
              `${title(route.mode)} · ${title(route.status)} · ${title(route.reason)}`,
          }),
          node("p", {
            text:
              `${text(route.from_location_id)} → ${text(route.to_location_id)}`,
          }),
        ]);
        const closing = route.status !== "closed";
        const toggle = button(
          closing ? "Close route" : "Reopen route",
          () => void mutate(
            toggle,
            "/routes/state",
            {
              costMultiplierBasisPoints: 10_000,
              durationMultiplierBasisPoints: 10_000,
              expectedRevision: Number(runtime?.revision || 0),
              reason: closing ? "war" : "recovery",
              requestId: requestId("route.state"),
              routeIds: [route.public_route_id],
              status: closing ? "closed" : "open",
            },
            `Route ${closing ? "closure" : "reopening"} committed and audited.`,
          ),
          { secondary: true },
        );
        article.append(toggle);
        return article;
      },
      "No routes are initialized.",
    ));
    return panel;
  }

  function renderTravel(data) {
    const states = Array.isArray(data.travel?.states)
      ? data.travel.states
      : [];
    const journeys = Array.isArray(data.travel?.journeys)
      ? data.travel.journeys
      : [];
    const panel = section(
      "TRAVEL OVERSIGHT",
      `${states.length} players · ${journeys.length} journeys`,
    );
    panel.append(recordList(
      journeys,
      (journey) => node("article", {}, [
        node("strong", {
          text:
            `${text(journey.from_location_id)} → ${text(journey.to_location_id)}`,
        }),
        node("small", {
          text: `${title(journey.status)} · ${text(journey.public_id)}`,
        }),
        node("p", {
          text:
            `${text(journey.currency_code)} ${text(journey.total_cost_minor, "0")} · ${text(journey.total_duration_minutes, "0")} minutes`,
        }),
      ]),
      "No travel journeys have been recorded.",
    ));
    return panel;
  }

  function renderResidency(data) {
    const rows = Array.isArray(data.residency?.residency)
      ? data.residency.residency
      : [];
    const panel = section("RESIDENCY OVERSIGHT", `${rows.length} records`);
    panel.append(recordList(
      rows,
      (row) => node("article", {}, [
        node("strong", { text: title(row.current_country_id) }),
        node("small", {
          text:
            `${text(row.currency_code)} · revision ${text(row.revision, "0")}`,
        }),
        node("p", {
          text: row.pending_country_id
            ? `Pending request: ${title(row.pending_country_id)}`
            : "No pending residency request",
        }),
      ]),
      "No residency records have been initialized.",
    ));
    return panel;
  }

  function renderSnapshot(data) {
    return node("div", { className: "admin-world-grid" }, [
      renderCampaign(data),
      renderEffects(data),
      renderArrivals(data),
      renderGeography(data),
      renderTravel(data),
      renderResidency(data),
    ]);
  }

  document.addEventListener("DOMContentLoaded", scheduleLauncher, { once: true });
  document.addEventListener("econovaria:admin-mounted", scheduleLauncher);
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
    open: () => openConsole(document.getElementById(LAUNCHER_ID)),
    refresh: refreshConsole,
    getSnapshot: () => snapshot,
  });
})();
