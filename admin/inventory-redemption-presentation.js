window.createInventoryRedemptionPresentation = function createInventoryRedemptionPresentation(ownerScope) {
  "use strict";

  const { ACTION_LABELS, openReviewDialog, DRAWER_ID, state, loadQueue, closeDrawer, FILTERS } = ownerScope;


  function formatDate(value) {
    const timestamp = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(timestamp)) return "Unavailable";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  }

  function setStatusMessage(message, tone = "neutral") {
    const node = document.querySelector("[data-admin-redemption-status]");
    if (!node) return;
    node.textContent = message;
    node.setAttribute("data-tone", tone);
  }

  function createElement(tag, className = "", content = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content) element.textContent = content;
    return element;
  }

  function actionButtons(redemption) {
    const container = createElement("div", "admin-inventory-redemption-actions");
    const actions = redemption.status === "pending"
      ? ["approve", "reject"]
      : redemption.status === "approved"
        ? ["fulfill"]
        : [];
    for (const action of actions) {
      const button = createElement("button", `admin-inventory-redemption-action is-${action}`, ACTION_LABELS[action]);
      button.type = "button";
      button.setAttribute("data-admin-redemption-review", action);
      button.setAttribute("data-request-id", redemption.id);
      button.addEventListener("click", () => openReviewDialog(redemption, action, button));
      container.append(button);
    }
    return container;
  }

  function redemptionCard(redemption) {
    const card = createElement("article", "admin-inventory-redemption-card");
    card.setAttribute("data-admin-redemption-request", redemption.id);

    const heading = createElement("div", "admin-inventory-redemption-card__heading");
    const identity = createElement("div");
    identity.append(
      createElement("strong", "", redemption.player.displayName),
      createElement("small", "", [redemption.player.reference, redemption.player.rosterLabel].filter(Boolean).join(" · ") || "Player reference unavailable"),
    );
    heading.append(identity, createElement("span", `admin-inventory-redemption-status is-${redemption.status}`, redemption.status));

    const item = createElement("div", "admin-inventory-redemption-card__item");
    item.append(
      createElement("strong", "", redemption.item.name),
      createElement("span", "", `${redemption.quantity} × ${redemption.item.category}`),
    );

    const details = createElement("dl", "admin-inventory-redemption-card__details");
    const detailRows = [
      ["Requested", formatDate(redemption.requestedAt)],
      ["Request ID", redemption.id],
      ["Player note", redemption.requestNote || "No note provided"],
    ];
    if (redemption.resolutionNote) detailRows.push(["Resolution", redemption.resolutionNote]);
    for (const [label, value] of detailRows) {
      const wrapper = createElement("div");
      wrapper.append(createElement("dt", "", label), createElement("dd", "", value));
      details.append(wrapper);
    }

    card.append(heading, item, details, actionButtons(redemption));
    return card;
  }

  function renderQueue() {
    const drawer = document.getElementById(DRAWER_ID);
    if (!drawer) return;
    const list = drawer.querySelector("[data-admin-redemption-list]");
    const previous = drawer.querySelector("[data-admin-redemption-page='previous']");
    const next = drawer.querySelector("[data-admin-redemption-page='next']");
    const page = drawer.querySelector("[data-admin-redemption-page-label]");
    const refresh = drawer.querySelector("[data-admin-redemption-refresh]");

    drawer.querySelectorAll("[data-admin-redemption-filter]").forEach((button) => {
      const selected = button.getAttribute("data-admin-redemption-filter") === state.status;
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.classList.toggle("is-active", selected);
    });

    const returned = state.queue?.pagination?.returned || 0;
    if (refresh) refresh.disabled = state.loading;
    if (previous) previous.disabled = state.loading || state.offset === 0;
    if (next) next.disabled = state.loading || !state.queue?.pagination?.hasMore;
    if (page) page.textContent = returned ? `Showing ${state.offset + 1}–${state.offset + returned}` : "No requests shown";

    list.replaceChildren();
    if (state.loading && !state.queue) {
      for (let index = 0; index < 3; index += 1) {
        const skeleton = createElement("div", "admin-inventory-redemption-skeleton");
        skeleton.setAttribute("aria-hidden", "true");
        skeleton.append(createElement("i"), createElement("i"), createElement("i"));
        list.append(skeleton);
      }
      setStatusMessage("Loading redemption requests…");
      return;
    }

    if (state.error && !state.queue) {
      const error = createElement("section", "admin-inventory-redemption-state is-error");
      error.setAttribute("role", "alert");
      error.append(
        createElement("strong", "", state.error.code === "inventory_redemption_schema_not_applied" ? "Redemption service unavailable" : "Redemptions could not be loaded"),
        createElement("p", "", state.error.message || "Try again after the Admin service is available."),
      );
      const retry = createElement("button", "admin-inventory-redemption-action", "Retry");
      retry.type = "button";
      retry.addEventListener("click", () => loadQueue({ refresh: true }));
      error.append(retry);
      list.append(error);
      setStatusMessage("Queue unavailable", "error");
      return;
    }

    const redemptions = state.queue?.redemptions || [];
    if (!redemptions.length) {
      const empty = createElement("section", "admin-inventory-redemption-state is-empty");
      empty.append(
        createElement("strong", "", state.status === "pending" ? "No pending requests" : "No redemption history"),
        createElement("p", "", state.status === "pending" ? "New player requests will appear here." : "Reviewed requests will appear after an action is completed."),
      );
      list.append(empty);
    } else {
      for (const redemption of redemptions) list.append(redemptionCard(redemption));
    }

    if (state.success && state.stale) {
      setStatusMessage(`${state.success} Queue refresh failed: ${state.error?.message || "service unavailable"}`, "warning");
    } else if (state.success) {
      setStatusMessage(state.success, "success");
    } else if (state.stale) {
      setStatusMessage(`Showing saved results. Refresh failed: ${state.error?.message || "service unavailable"}`, "warning");
    } else if (state.loading) {
      setStatusMessage("Refreshing redemption requests…");
    } else {
      setStatusMessage(`Updated ${state.lastUpdatedAt ? formatDate(state.lastUpdatedAt) : "just now"}. ${redemptions.length} request${redemptions.length === 1 ? "" : "s"} shown.`);
    }
  }

  function drawerElement() {
    let drawer = document.getElementById(DRAWER_ID);
    if (drawer) return drawer;

    drawer = document.createElement("aside");
    drawer.id = DRAWER_ID;
    drawer.className = "admin-inventory-redemption-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "false");
    drawer.setAttribute("aria-labelledby", `${DRAWER_ID}Title`);
    drawer.setAttribute("hidden", "");
    drawer.innerHTML = `
      <header class="admin-inventory-redemption-drawer__header">
        <div><small>INVENTORY OPERATIONS</small><h2 id="${DRAWER_ID}Title">Redemption review</h2><p>Review player requests and preserve a complete administrative status trail.</p></div>
        <button type="button" class="admin-inventory-redemption-close" data-admin-redemption-close aria-label="Close redemption review">×</button>
      </header>
      <div class="admin-inventory-redemption-toolbar">
        <div role="tablist" aria-label="Redemption request filters">
          <button type="button" role="tab" data-admin-redemption-filter="pending" aria-selected="true">Pending</button>
          <button type="button" role="tab" data-admin-redemption-filter="all" aria-selected="false">History</button>
        </div>
        <button type="button" data-admin-redemption-refresh>Refresh</button>
      </div>
      <div class="admin-inventory-redemption-live" data-admin-redemption-status role="status" aria-live="polite">Ready to load redemption requests.</div>
      <div class="admin-inventory-redemption-list" data-admin-redemption-list></div>
      <footer class="admin-inventory-redemption-pagination">
        <button type="button" data-admin-redemption-page="previous">Previous</button>
        <span data-admin-redemption-page-label>No requests shown</span>
        <button type="button" data-admin-redemption-page="next">Next</button>
      </footer>`;

    drawer.querySelector("[data-admin-redemption-close]")?.addEventListener("click", () => closeDrawer());
    drawer.querySelector("[data-admin-redemption-refresh]")?.addEventListener("click", () => loadQueue({ refresh: true }));
    drawer.querySelectorAll("[data-admin-redemption-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        const status = button.getAttribute("data-admin-redemption-filter");
        if (!FILTERS[status] || status === state.status) return;
        state.status = status;
        state.offset = 0;
        state.queue = null;
        state.error = null;
        state.stale = false;
        state.success = "";
        void loadQueue();
      });
    });
    drawer.querySelector("[data-admin-redemption-page='previous']")?.addEventListener("click", () => {
      state.offset = Math.max(0, state.offset - state.limit);
      state.queue = null;
      state.success = "";
      void loadQueue();
    });
    drawer.querySelector("[data-admin-redemption-page='next']")?.addEventListener("click", () => {
      if (!state.queue?.pagination?.hasMore) return;
      state.offset += state.limit;
      state.queue = null;
      state.success = "";
      void loadQueue();
    });

    document.body.append(drawer);
    return drawer;
  }

  return { formatDate, setStatusMessage, createElement, actionButtons, redemptionCard, renderQueue, drawerElement };
};
