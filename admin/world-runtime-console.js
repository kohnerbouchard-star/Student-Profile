(function initEconovariaAdminWorldRuntimeConsole() {
  "use strict";

  const ROOT_ID = "adminWorldRuntimeConsole";
  const LAUNCHER_ID = "adminWorldRuntimeLauncher";
  const CLASSES = ["analyst", "builder", "maker", "mediator", "navigator", "operator", "steward", "trader"];
  let activeRequest = null;
  let snapshot = null;
  let modalHandle = null;

  function selectedGameId() {
    return String(window.EconovariaAdminAuth?.getSelectedGameId?.() || "").trim();
  }

  function text(value, fallback = "Unavailable") {
    const result = String(value ?? "").trim();
    return result || fallback;
  }

  function title(value) {
    return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function element(tag, className = "", content = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== "") node.textContent = content;
    return node;
  }

  function requestId(prefix) {
    return `${prefix}.${crypto.randomUUID()}`;
  }

  async function api(path, options = {}) {
    const gameId = selectedGameId();
    if (!gameId) throw new Error("Select a game before opening World operations.");
    const controller = options.controller || new AbortController();
    const headers = {
      "content-type": "application/json",
      "x-request-id": requestId("admin.world"),
      ...(options.headers || {}),
    };
    const response = await fetch(`/api/admin/games/${encodeURIComponent(gameId)}/world${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || payload?.code || "World administrator request failed.";
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.error?.code || payload?.code || "world_admin_request_failed";
      throw error;
    }
    return payload?.data ?? payload;
  }

  function createLauncher() {
    if (document.getElementById(LAUNCHER_ID)) return;
    const mount = document.getElementById("adminPreview");
    if (!mount || mount.hidden) return;
    const topbar = mount.querySelector(".admin-terminal-top-actions, .admin-terminal-app-topbar, header") || mount;
    const button = element("button", "admin-world-launcher", "World operations");
    button.id = LAUNCHER_ID;
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.addEventListener("click", () => openConsole(button));
    topbar.append(button);
  }

  function closeConsole() {
    activeRequest?.abort?.();
    activeRequest = null;
    modalHandle?.close?.("close");
    modalHandle = null;
    document.getElementById(ROOT_ID)?.closest(".admin-world-backdrop")?.remove();
    document.getElementById(LAUNCHER_ID)?.focus?.();
  }

  function openConsole(opener) {
    closeConsole();
    const backdrop = element("div", "admin-world-backdrop");
    backdrop.setAttribute("data-admin-terminal-modal-backdrop", "");
    const dialog = element("section", "admin-world-console");
    dialog.id = ROOT_ID;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "adminWorldRuntimeTitle");
    dialog.tabIndex = -1;
    const header = element("header", "admin-world-console__header");
    const heading = element("div");
    heading.append(element("small", "", "WORLD AUTHORITY"), element("h2", "", "World operations"));
    heading.querySelector("h2").id = "adminWorldRuntimeTitle";
    const close = element("button", "admin-world-button is-secondary", "Close");
    close.type = "button";
    close.addEventListener("click", closeConsole);
    header.append(heading, close);
    const live = element("p", "admin-world-live", "Loading authoritative World state…");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    const content = element("div", "admin-world-console__content");
    content.setAttribute("aria-busy", "true");
    dialog.append(header, live, content);
    backdrop.append(dialog);
    document.body.append(backdrop);
    modalHandle = window.EconovariaAdminModalAccessibility?.activate?.({
      backdrop, dialog, opener, initialFocus: close, dismissOnBackdrop: false,
      dismissOnEscape: true, onClose: () => backdrop.remove(),
    }) || null;
    if (!modalHandle) close.focus();
    void loadSnapshot(content, live);
  }

  async function loadSnapshot(content, live, announcement = "") {
    activeRequest?.abort?.();
    const controller = new AbortController();
    activeRequest = controller;
    content.setAttribute("aria-busy", "true");
    content.replaceChildren(renderLoading());
    live.textContent = announcement || "Loading campaign, geography, travel, and residency state…";
    try {
      const [campaign, history, effects, arrivals, geography, travel, residency] = await Promise.all([
        api("/campaign", { controller }),
        api("/campaign/history?limit=100", { controller }),
        api("/campaign/effects?status=all&limit=100", { controller }),
        api("/arrival-classes?limit=100", { controller }),
        api("/geography", { controller }),
        api("/travel?limit=100", { controller }),
        api("/residency?limit=100", { controller }),
      ]);
      if (controller.signal.aborted || !content.isConnected) return;
      snapshot = { campaign, history, effects, arrivals, geography, travel, residency, loadedAt: Date.now() };
      content.removeAttribute("aria-busy");
      content.replaceChildren(renderSnapshot(snapshot));
      live.textContent = announcement || "Authoritative World state loaded.";
    } catch (error) {
      if (controller.signal.aborted || !content.isConnected) return;
      content.removeAttribute("aria-busy");
      content.replaceChildren(renderFailure(error?.message));
      live.textContent = "World operations are unavailable.";
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
  }

  function renderLoading() {
    const node = element("div", "admin-world-loading");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.append(element("strong", "", "Loading World operations"));
    for (let index = 0; index < 4; index += 1) node.append(element("span"));
    return node;
  }

  function renderFailure(message) {
    const node = element("div", "admin-world-error");
    node.setAttribute("role", "alert");
    node.append(element("strong", "", "World operations could not be loaded"), element("p", "", text(message, "The Admin API is unavailable.")));
    const retry = element("button", "admin-world-button", "Retry");
    retry.type = "button";
    retry.addEventListener("click", () => {
      const content = document.querySelector(`#${ROOT_ID} .admin-world-console__content`);
      const live = document.querySelector(`#${ROOT_ID} .admin-world-live`);
      if (content && live) void loadSnapshot(content, live);
    });
    node.append(retry);
    return node;
  }

  function section(label, titleText) {
    const node = element("section", "admin-world-section");
    const header = element("header");
    const wrap = element("div");
    wrap.append(element("small", "", label), element("h3", "", titleText));
    header.append(wrap);
    node.append(header);
    return node;
  }

  function factGrid(values) {
    const list = element("dl", "admin-world-facts");
    for (const [label, value] of values) {
      const wrapper = element("div");
      wrapper.append(element("dt", "", label), element("dd", "", text(value, "0")));
      list.append(wrapper);
    }
    return list;
  }

  function empty(message) {
    const node = element("p", "admin-world-empty", message);
    node.setAttribute("role", "status");
    return node;
  }

  function publicId(row) {
    return text(row?.public_id || row?.publicId, "");
  }

  function renderSnapshot(data) {
    const root = element("div", "admin-world-grid");
    root.append(
      renderCampaign(data),
      renderEffects(data),
      renderArrivals(data),
      renderGeography(data),
      renderTravel(data),
      renderResidency(data),
    );
    return root;
  }

  function renderCampaign(data) {
    const campaigns = Array.isArray(data.campaign?.campaigns) ? data.campaign.campaigns : [];
    const current = campaigns[0] || null;
    const scheduler = data.campaign?.scheduler || {};
    const history = Array.isArray(data.history?.history) ? data.history.history : [];
    const node = section("CAMPAIGN CONTROL", current ? title(current.current_phase) : "No campaign");
    node.append(factGrid([
      ["Status", current ? title(current.status) : "Not initialized"],
      ["Revision", current?.revision ?? 0],
      ["Scheduler due", scheduler.due ?? 0],
      ["Active", scheduler.active ?? 0],
      ["Paused", scheduler.paused ?? 0],
      ["Disabled", scheduler.emergencyDisabled ?? 0],
    ]));
    const controls = element("div", "admin-world-controls");
    if (current) {
      for (const action of ["pause", "resume", "emergency_disable"]) {
        const button = element("button", `admin-world-button${action === "emergency_disable" ? " is-danger" : ""}`, title(action));
        button.type = "button";
        button.disabled = action === "pause" ? current.status !== "active" : action === "resume" ? current.status !== "paused" : current.status === "emergency_disabled";
        button.addEventListener("click", () => void controlCampaign(current, action, button));
        controls.append(button);
      }
      const manual = element("button", "admin-world-button is-secondary", "Manual trigger");
      manual.type = "button";
      manual.disabled = current.status !== "active";
      manual.addEventListener("click", () => openManualTrigger(current, manual));
      controls.append(manual);
    }
    const refresh = element("button", "admin-world-button is-secondary", "Refresh");
    refresh.type = "button";
    refresh.addEventListener("click", () => refreshConsole());
    controls.append(refresh);
    node.append(controls);
    const list = element("div", "admin-world-list");
    if (!history.length) list.append(empty("No committed campaign history."));
    for (const row of history) {
      const article = element("article");
      article.append(element("strong", "", title(row.event_key || row.to_phase)), element("small", "", text(row.occurred_at || row.created_at, "Current")), element("p", "", text(row.reason, `${title(row.from_phase)} to ${title(row.to_phase)}`)));
      list.append(article);
    }
    node.append(list);
    return node;
  }

  async function controlCampaign(campaign, action, button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Applying…";
    try {
      await api("/campaign/control", {
        method: "POST",
        body: {
          action,
          campaignId: publicId(campaign),
          correctedPhase: null,
          expectedRevision: Number(campaign.revision),
          reason: `Administrator ${title(action)} from the World operations console.`,
        },
      });
      await refreshConsole(`${title(action)} committed.`);
    } catch (error) {
      announce(error?.message || "Campaign control failed.", true);
    } finally {
      button.textContent = original;
      button.disabled = false;
    }
  }

  function renderEffects(data) {
    const effects = Array.isArray(data.effects?.effects) ? data.effects.effects : [];
    const node = section("DURABLE EFFECTS", "Effect recovery");
    node.append(factGrid(Object.entries(data.effects?.summary || {}).map(([key, value]) => [title(key), value])));
    const list = element("div", "admin-world-list");
    if (!effects.length) list.append(empty("No effect commands are present."));
    for (const effect of effects) {
      const article = element("article");
      article.append(element("strong", "", title(effect.effect_kind)), element("small", "", `${title(effect.status)} · ${text(effect.public_id)}`), element("p", "", text(effect.last_error_code, "No recorded error")));
      if (effect.status === "failed") {
        const recover = element("button", "admin-world-button", "Recover effect");
        recover.type = "button";
        recover.addEventListener("click", () => void recoverEffect(effect, recover));
        article.append(recover);
      }
      list.append(article);
    }
    node.append(list);
    return node;
  }

  async function recoverEffect(effect, button) {
    button.disabled = true;
    try {
      await api(`/campaign/effects/${encodeURIComponent(publicId(effect))}/recover`, {
        method: "POST",
        body: { reason: "Administrator requested bounded effect recovery.", requestId: requestId("effect.recovery") },
      });
      await refreshConsole("Effect recovery committed.");
    } catch (error) {
      announce(error?.message || "Effect recovery failed.", true);
      button.disabled = false;
    }
  }

  function renderArrivals(data) {
    const assignments = Array.isArray(data.arrivals?.assignments) ? data.arrivals.assignments : [];
    const node = section("ARRIVAL CLASS", "Review and correction");
    const list = element("div", "admin-world-list");
    if (!assignments.length) list.append(empty("No Arrival Class assignments."));
    for (const assignment of assignments) {
      const article = element("article");
      article.append(element("strong", "", title(assignment.class_id)), element("small", "", `${title(assignment.country_id)} · revision ${text(assignment.revision, "0")}`), element("p", "", text(assignment.override_reason, title(assignment.source))));
      const select = element("select");
      select.setAttribute("aria-label", `Correct Arrival Class ${publicId(assignment)}`);
      for (const classId of CLASSES) {
        const option = element("option", "", title(classId));
        option.value = classId;
        option.selected = classId === assignment.class_id;
        select.append(option);
      }
      const correct = element("button", "admin-world-button is-secondary", "Correct class");
      correct.type = "button";
      correct.addEventListener("click", () => void correctArrival(assignment, select.value, correct));
      article.append(select, correct);
      list.append(article);
    }
    node.append(list);
    return node;
  }

  async function correctArrival(assignment, classId, button) {
    button.disabled = true;
    try {
      await api(`/arrival-classes/${encodeURIComponent(publicId(assignment))}/correct`, {
        method: "POST",
        body: {
          classId,
          expectedRevision: Number(assignment.revision),
          reason: "Administrator corrected the session-scoped Arrival Class after review.",
          requestId: requestId("arrival.correction"),
        },
      });
      await refreshConsole("Arrival Class correction committed and audited.");
    } catch (error) {
      announce(error?.message || "Arrival Class correction failed.", true);
      button.disabled = false;
    }
  }

  function renderGeography(data) {
    const runtime = data.geography?.runtime || null;
    const locations = Array.isArray(data.geography?.locations) ? data.geography.locations : [];
    const routes = Array.isArray(data.geography?.routes) ? data.geography.routes : [];
    const node = section("GEOGRAPHY", `${locations.length} locations · ${routes.length} routes`);
    node.append(factGrid([["World revision", runtime?.revision ?? 0], ["Pack", runtime?.pack_id], ["Version", runtime?.pack_version], ["Updated", runtime?.updated_at]]));
    const list = element("div", "admin-world-list admin-world-route-list");
    if (!routes.length) list.append(empty("No routes are initialized."));
    for (const route of routes.slice(0, 100)) {
      const article = element("article");
      article.append(element("strong", "", text(route.public_route_id)), element("small", "", `${title(route.mode)} · ${title(route.status)} · ${title(route.reason)}`), element("p", "", `${text(route.from_location_id)} → ${text(route.to_location_id)}`));
      const toggle = element("button", "admin-world-button is-secondary", route.status === "closed" ? "Reopen" : "Close route");
      toggle.type = "button";
      toggle.addEventListener("click", () => void changeRoute(route, runtime, toggle));
      article.append(toggle);
      list.append(article);
    }
    node.append(list);
    return node;
  }

  async function changeRoute(route, runtime, button) {
    button.disabled = true;
    const closing = route.status !== "closed";
    try {
      await api("/routes/state", {
        method: "POST",
        body: {
          costMultiplierBasisPoints: 10000,
          durationMultiplierBasisPoints: 10000,
          expectedRevision: Number(runtime?.revision || 0),
          reason: closing ? "war" : "recovery",
          requestId: requestId("route.state"),
          routeIds: [route.public_route_id],
          status: closing ? "closed" : "open",
        },
      });
      await refreshConsole(`Route ${closing ? "closure" : "reopening"} committed.`);
    } catch (error) {
      announce(error?.message || "Route-state update failed.", true);
      button.disabled = false;
    }
  }

  function renderTravel(data) {
    const states = Array.isArray(data.travel?.states) ? data.travel.states : [];
    const journeys = Array.isArray(data.travel?.journeys) ? data.travel.journeys : [];
    const node = section("TRAVEL OVERSIGHT", `${states.length} players · ${journeys.length} journeys`);
    const list = element("div", "admin-world-list");
    if (!journeys.length) list.append(empty("No travel journeys have been recorded."));
    for (const journey of journeys) {
      const article = element("article");
      article.append(element("strong", "", `${text(journey.from_location_id)} → ${text(journey.to_location_id)}`), element("small", "", `${title(journey.status)} · ${text(journey.public_id)}`), element("p", "", `${text(journey.currency_code)} ${text(journey.total_cost_minor, "0")} · ${text(journey.total_duration_minutes, "0")} minutes`));
      list.append(article);
    }
    node.append(list);
    return node;
  }

  function renderResidency(data) {
    const rows = Array.isArray(data.residency?.residency) ? data.residency.residency : [];
    const node = section("RESIDENCY OVERSIGHT", `${rows.length} records`);
    const list = element("div", "admin-world-list");
    if (!rows.length) list.append(empty("No residency records have been initialized."));
    for (const row of rows) {
      const article = element("article");
      article.append(element("strong", "", title(row.current_country_id)), element("small", "", `${text(row.currency_code)} · revision ${text(row.revision, "0")}`), element("p", "", row.pending_country_id ? `Pending request: ${title(row.pending_country_id)}` : "No pending residency request"));
      list.append(article);
    }
    node.append(list);
    return node;
  }

  function openManualTrigger(campaign, opener) {
    const dialog = document.getElementById(ROOT_ID);
    if (!dialog) return;
    const form = element("form", "admin-world-inline-form");
    form.setAttribute("aria-label", "Manual campaign trigger");
    const event = element("input");
    event.name = "eventKey";
    event.required = true;
    event.pattern = "[a-z0-9][a-z0-9._:-]*";
    event.placeholder = "manual-world-event";
    const phase = element("select");
    phase.name = "nextPhase";
    for (const value of ["opportunity", "rivalry", "shortage", "meridian_disruption", "open_conflict", "adaptation", "reconstruction", "continued_conflict"]) {
      const option = element("option", "", title(value));
      option.value = value;
      phase.append(option);
    }
    const submit = element("button", "admin-world-button", "Trigger reviewed notification event");
    submit.type = "submit";
    form.append(element("label", "", "Event key"), event, element("label", "", "Next phase"), phase, submit);
    form.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      try {
        await api("/campaign/manual-trigger", {
          method: "POST",
          body: {
            campaignId: publicId(campaign),
            completeCampaign: false,
            effects: [{ effectKind: "notify_players", payload: { audience: "all_players", notificationDefinitionId: "notification.world.manual-update.v1" } }],
            eventKey: event.value.trim(),
            expectedPhase: campaign.current_phase,
            expectedRevision: Number(campaign.revision),
            nextPhase: phase.value,
            nextScheduledAt: new Date(Date.now() + 3600000).toISOString(),
            prerequisiteEventKeys: [],
            reason: "Administrator initiated a reviewed World event.",
            requestId: requestId("manual.trigger"),
          },
        });
        form.remove();
        await refreshConsole("Manual campaign event committed.");
      } catch (error) {
        announce(error?.message || "Manual trigger failed.", true);
        submit.disabled = false;
      }
    });
    dialog.querySelector(".admin-world-section")?.prepend(form);
    event.focus();
    opener.setAttribute("aria-expanded", "true");
  }

  function announce(message, error = false) {
    const live = document.querySelector(`#${ROOT_ID} .admin-world-live`);
    if (!live) return;
    live.textContent = message;
    live.setAttribute("role", error ? "alert" : "status");
  }

  async function refreshConsole(announcement = "") {
    const content = document.querySelector(`#${ROOT_ID} .admin-world-console__content`);
    const live = document.querySelector(`#${ROOT_ID} .admin-world-live`);
    if (content && live) await loadSnapshot(content, live, announcement);
  }

  const observer = new MutationObserver(createLauncher);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("econovaria:admin-mounted", createLauncher);
  document.addEventListener("econovaria:admin-game-selected", () => {
    snapshot = null;
    if (document.getElementById(ROOT_ID)) void refreshConsole("Selected game changed. Reloading World state.");
  });
  window.addEventListener("online", () => {
    if (document.getElementById(ROOT_ID)) void refreshConsole("Connection restored. Refreshing World state.");
  });
  window.addEventListener("offline", () => announce("Offline. Existing World data remains visible; mutations are unavailable.", true));
  createLauncher();

  window.EconovariaAdminWorldRuntime = Object.freeze({
    open: () => openConsole(document.getElementById(LAUNCHER_ID)),
    refresh: refreshConsole,
    getSnapshot: () => snapshot,
  });
})();
