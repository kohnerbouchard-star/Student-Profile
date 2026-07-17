(function initEconovariaPlayerScopeReadiness() {
  "use strict";

  const API_PREFIX = "/api/admin";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const state = {
    capabilities: null,
    redemptions: null,
    loading: false,
    error: ""
  };

  function selectedGameId() {
    return String(
      window.EconovariaAdminAuth?.getSelectedGameId?.() ||
      window.sessionStorage.getItem(SELECTED_GAME_KEY) ||
      ""
    ).trim();
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function statusLabel(value) {
    return String(value || "unknown").replace(/_/g, " ").toUpperCase();
  }

  function statusClass(value) {
    return `is-${String(value || "unknown").replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}`;
  }

  async function readJson(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.error?.message || body?.message ||
        `Administrator request failed (${response.status}).`;
      throw new Error(message);
    }
    return body?.data ?? body;
  }

  async function loadPanel() {
    const gameId = selectedGameId();
    if (!gameId) {
      state.error = "Select a game before opening Player Scope.";
      state.capabilities = null;
      state.redemptions = null;
      render();
      return;
    }

    state.loading = true;
    state.error = "";
    render();

    try {
      const [capabilityResponse, redemptionResponse] = await Promise.all([
        fetch(`${API_PREFIX}/games/${encodeURIComponent(gameId)}/player-capabilities`, {
          headers: { Accept: "application/json" },
          cache: "no-store"
        }),
        fetch(`${API_PREFIX}/games/${encodeURIComponent(gameId)}/inventory/redemptions`, {
          headers: { Accept: "application/json" },
          cache: "no-store"
        })
      ]);
      const [capabilityData, redemptionData] = await Promise.all([
        readJson(capabilityResponse),
        readJson(redemptionResponse)
      ]);
      state.capabilities = capabilityData.playerCapabilities || null;
      state.redemptions = redemptionData || null;
    } catch (error) {
      state.error = error?.message || "Player scope data could not be loaded.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function reviewRedemption(requestId, action, note, button) {
    const gameId = selectedGameId();
    if (!gameId || !requestId) return;
    const previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = action === "fulfill" ? "Fulfilling…" : `${action[0].toUpperCase()}${action.slice(1)}ing…`;

    try {
      const response = await fetch(
        `${API_PREFIX}/games/${encodeURIComponent(gameId)}/inventory/redemptions/${encodeURIComponent(requestId)}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ action, resolutionNote: note })
        }
      );
      await readJson(response);
      await loadPanel();
    } catch (error) {
      state.error = error?.message || "The redemption request could not be updated.";
      render();
    } finally {
      button.disabled = false;
      button.textContent = previousLabel;
    }
  }

  function renderSummary(manifest, queue) {
    const summary = element("section", "econovaria-player-scope-summary");
    const capabilitySummary = manifest?.summary || {};
    const queueSummary = queue?.summary || {};
    const metrics = [
      ["Connected domains", capabilitySummary.connected ?? 0, "connected"],
      ["Read-only domains", capabilitySummary.readOnly ?? 0, "read-only"],
      ["Planned domains", capabilitySummary.planned ?? 0, "planned"],
      ["Open redemptions", (queueSummary.pending ?? 0) + (queueSummary.approved ?? 0), "open"]
    ];
    for (const [label, value, tone] of metrics) {
      const card = element("article", `is-${tone}`);
      card.append(element("small", "", label), element("strong", "", value));
      summary.append(card);
    }
    return summary;
  }

  function renderCapabilities(manifest) {
    const section = element("section", "econovaria-player-scope-section");
    const header = element("header", "econovaria-player-scope-section-head");
    const title = element("div");
    title.append(
      element("small", "", "PLAYER PRODUCT SCOPE"),
      element("h3", "", "Capability readiness")
    );
    header.append(title);
    section.append(header);

    const grid = element("div", "econovaria-player-scope-grid");
    for (const domain of manifest?.domains || []) {
      const card = element("article", `econovaria-player-scope-card ${statusClass(domain.status)}`);
      const cardHeader = element("header");
      const copy = element("div");
      copy.append(
        element("small", "", `PHASE ${domain.implementationPhase}`),
        element("strong", "", domain.label)
      );
      cardHeader.append(copy, element("span", statusClass(domain.status), statusLabel(domain.status)));
      card.append(
        cardHeader,
        element("p", "", domain.summary),
        element("small", "econovaria-player-scope-admin-label", "ADMIN SURFACE"),
        element("p", "econovaria-player-scope-admin-copy", domain.adminSummary)
      );
      const footer = element("footer");
      footer.append(
        element("span", statusClass(domain.adminSurface), statusLabel(domain.adminSurface)),
        element("small", "", `${domain.playerReads?.length || 0} reads · ${domain.playerWrites?.length || 0} writes`)
      );
      card.append(footer);
      grid.append(card);
    }
    section.append(grid);
    return section;
  }

  function actionButton(label, action, request, noteInput) {
    const button = element("button", `econovaria-player-scope-action is-${action}`, label);
    button.type = "button";
    button.addEventListener("click", () => {
      void reviewRedemption(request.id, action, noteInput.value.trim(), button);
    });
    return button;
  }

  function renderRedemptions(queue) {
    const section = element("section", "econovaria-player-scope-section");
    const header = element("header", "econovaria-player-scope-section-head");
    const title = element("div");
    title.append(
      element("small", "", "INVENTORY OPERATIONS"),
      element("h3", "", "Redemption queue")
    );
    const refresh = element("button", "econovaria-player-scope-refresh", "Refresh");
    refresh.type = "button";
    refresh.addEventListener("click", () => void loadPanel());
    header.append(title, refresh);
    section.append(header);

    const requests = Array.isArray(queue?.requests) ? queue.requests : [];
    if (!requests.length) {
      const empty = element("div", "econovaria-player-scope-empty");
      empty.append(
        element("strong", "", "No redemption requests"),
        element("p", "", "Player item-use requests will appear here for review and fulfillment.")
      );
      section.append(empty);
      return section;
    }

    const list = element("div", "econovaria-player-scope-redemptions");
    for (const request of requests) {
      const card = element("article", "econovaria-player-scope-redemption");
      const top = element("header");
      const copy = element("div");
      copy.append(
        element("small", "", request.player?.rosterLabel || request.player?.displayName || "Player"),
        element("strong", "", request.item?.name || "Inventory item"),
        element("p", "", `${request.quantity} requested by ${request.player?.displayName || "Unknown player"}`)
      );
      top.append(copy, element("span", statusClass(request.status), statusLabel(request.status)));
      card.append(top);

      if (request.requestNote) {
        card.append(element("p", "econovaria-player-scope-request-note", request.requestNote));
      }

      const noteLabel = element("label", "econovaria-player-scope-note");
      noteLabel.append(element("span", "", "Resolution note"));
      const noteInput = document.createElement("input");
      noteInput.type = "text";
      noteInput.maxLength = 1000;
      noteInput.placeholder = "Optional note to the player";
      noteInput.value = request.resolutionNote || "";
      noteLabel.append(noteInput);
      card.append(noteLabel);

      const actions = element("footer", "econovaria-player-scope-actions");
      if (request.status === "pending") {
        actions.append(
          actionButton("Approve", "approve", request, noteInput),
          actionButton("Reject", "reject", request, noteInput)
        );
      } else if (request.status === "approved") {
        actions.append(
          actionButton("Fulfill", "fulfill", request, noteInput),
          actionButton("Reject", "reject", request, noteInput)
        );
      } else {
        actions.append(element("small", "", `Updated ${new Date(request.updatedAt).toLocaleString()}`));
      }
      card.append(actions);
      list.append(card);
    }
    section.append(list);
    return section;
  }

  function render() {
    const dialog = document.getElementById("econovariaPlayerScopeDialog");
    const body = dialog?.querySelector("[data-player-scope-body]");
    if (!body) return;
    body.replaceChildren();

    if (state.loading) {
      const loading = element("div", "econovaria-player-scope-loading");
      loading.setAttribute("role", "status");
      loading.append(
        element("strong", "", "Loading player scope"),
        element("p", "", "Reading backend readiness and inventory operations…")
      );
      body.append(loading);
      return;
    }

    if (state.error) {
      const error = element("div", "econovaria-player-scope-error");
      error.setAttribute("role", "alert");
      error.append(
        element("strong", "", "Player scope could not be loaded"),
        element("p", "", state.error)
      );
      const retry = element("button", "econovaria-player-scope-refresh", "Retry");
      retry.type = "button";
      retry.addEventListener("click", () => void loadPanel());
      error.append(retry);
      body.append(error);
      return;
    }

    body.append(
      renderSummary(state.capabilities, state.redemptions),
      renderRedemptions(state.redemptions),
      renderCapabilities(state.capabilities)
    );
  }

  function createInterface() {
    if (document.getElementById("econovariaPlayerScopeLauncher")) return;

    const launcher = element("button", "econovaria-player-scope-launcher", "Player Scope");
    launcher.id = "econovariaPlayerScopeLauncher";
    launcher.type = "button";
    launcher.setAttribute("aria-haspopup", "dialog");

    const dialog = document.createElement("dialog");
    dialog.id = "econovariaPlayerScopeDialog";
    dialog.className = "econovaria-player-scope-dialog";
    dialog.setAttribute("aria-labelledby", "econovariaPlayerScopeTitle");

    const shell = element("div", "econovaria-player-scope-shell");
    const header = element("header", "econovaria-player-scope-header");
    const copy = element("div");
    copy.append(
      element("small", "", "ECONOVARIA OPERATIONS"),
      element("h2", "", "Player scope and readiness")
    );
    copy.querySelector("h2").id = "econovariaPlayerScopeTitle";
    const close = element("button", "econovaria-player-scope-close", "Close");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    header.append(copy, close);

    const body = element("div", "econovaria-player-scope-body");
    body.dataset.playerScopeBody = "true";
    shell.append(header, body);
    dialog.append(shell);

    launcher.addEventListener("click", () => {
      dialog.showModal();
      void loadPanel();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    document.body.append(launcher, dialog);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createInterface, { once: true });
  } else {
    createInterface();
  }

  window.EconovariaPlayerScopeReadiness = Object.freeze({
    open() {
      const dialog = document.getElementById("econovariaPlayerScopeDialog");
      dialog?.showModal();
      return loadPanel();
    },
    refresh: loadPanel
  });
})();
