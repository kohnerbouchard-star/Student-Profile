(function initEconovariaAdminInventoryRedemptionQueue() {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const DRAWER_ID = "adminInventoryRedemptionDrawer";
  const REVIEW_MODAL_ID = "inventory-redemption-review";
  const FILTERS = Object.freeze({ pending: "Pending", all: "History" });
  const ACTION_LABELS = Object.freeze({ approve: "Approve", reject: "Reject", fulfill: "Fulfill" });
  const MOUNT_DELAYS = Object.freeze([0, 60, 160, 320, 600]);

  const state = {
    open: false,
    status: "pending",
    offset: 0,
    limit: 10,
    queue: null,
    loading: false,
    error: null,
    stale: false,
    success: "",
    lastUpdatedAt: 0,
    loadVersion: 0,
    loadController: null,
    opener: null,
    reviewController: null,
    clientPromise: null,
  };

  function text(value) {
    return String(value ?? "").trim();
  }

  function selectedGameId() {
    try {
      return text(window.sessionStorage.getItem(SELECTED_GAME_KEY));
    } catch (_) {
      return "";
    }
  }

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function activeSection() {
    const control = [...document.querySelectorAll("[data-admin-section]")].find((node) => {
      return node.getAttribute("aria-current") === "page" ||
        node.getAttribute("aria-selected") === "true" ||
        node.classList.contains("active") ||
        node.classList.contains("is-active");
    });
    return text(control?.getAttribute("data-admin-section")).toLowerCase();
  }

  function storeHeading() {
    return [...document.querySelectorAll("#adminPreview h1, #adminPreview h2")].find((heading) => {
      const label = text(heading.textContent).toLowerCase();
      return visible(heading) && (label === "store" || label.includes("store management"));
    }) || null;
  }

  function launchButton() {
    return document.querySelector("[data-admin-inventory-redemptions-open]");
  }

  function closeDrawer({ restoreFocus = true } = {}) {
    state.open = false;
    state.loadController?.abort();
    state.loadController = null;
    document.getElementById(DRAWER_ID)?.setAttribute("hidden", "");
    document.documentElement.removeAttribute("data-admin-redemption-drawer-open");
    if (restoreFocus && state.opener instanceof HTMLElement && state.opener.isConnected) {
      window.requestAnimationFrame(() => state.opener.focus({ preventScroll: true }));
    }
  }

  function mountLaunchButton() {
    const existing = launchButton();
    const onStore = activeSection() === "store";
    const heading = onStore ? storeHeading() : null;
    if (!onStore || !heading) {
      existing?.remove();
      if (state.open) closeDrawer({ restoreFocus: false });
      return false;
    }
    if (existing?.isConnected) return true;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-inventory-redemption-launch";
    button.setAttribute("data-admin-inventory-redemptions-open", "");
    button.setAttribute("data-admin-terminal-action", "open-inventory-redemptions");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", DRAWER_ID);
    button.textContent = "Review redemptions";
    button.addEventListener("click", () => openDrawer(button));

    const anchor = heading.closest("header") || heading.parentElement;
    (anchor || document.getElementById("adminPreview"))?.append(button);
    return button.isConnected;
  }

  function scheduleMount() {
    for (const delay of MOUNT_DELAYS) window.setTimeout(mountLaunchButton, delay);
  }

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

  async function queueClient() {
    if (!state.clientPromise) {
      state.clientPromise = import("./inventory-redemption-queue-client.js").then((module) => {
        return module.createAdminInventoryRedemptionQueueClient({ fetchImpl: window.fetch.bind(window) });
      });
    }
    return state.clientPromise;
  }

  async function loadQueue({ refresh = false } = {}) {
    const gameId = selectedGameId();
    state.loadController?.abort();
    const controller = new AbortController();
    const version = ++state.loadVersion;
    state.loadController = controller;
    state.loading = true;
    if (!refresh || !state.queue) state.error = null;
    if (!refresh) state.stale = false;
    renderQueue();

    if (!gameId) {
      state.loading = false;
      state.error = { code: "admin_game_not_selected", message: "Select an active game before reviewing redemptions." };
      renderQueue();
      return;
    }

    try {
      const client = await queueClient();
      const queue = await client.list({
        gameId,
        status: state.status,
        limit: state.limit,
        offset: state.offset,
        signal: controller.signal,
      });
      if (version !== state.loadVersion || controller.signal.aborted) return;
      state.queue = queue;
      state.loading = false;
      state.error = null;
      state.stale = false;
      state.lastUpdatedAt = Date.now();
      if (state.success.endsWith("Refreshing the queue…")) {
        state.success = state.success.replace("Refreshing the queue…", "Queue refreshed.");
      }
      renderQueue();
    } catch (error) {
      if (controller.signal.aborted || version !== state.loadVersion) return;
      state.loading = false;
      state.error = error;
      state.stale = Boolean(state.queue);
      renderQueue();
    }
  }

  function optimisticCommit(redemption) {
    if (!state.queue) return;
    const rows = [...state.queue.redemptions];
    const index = rows.findIndex((row) => row.id === redemption.id);
    if (state.status === "pending" && redemption.status !== "pending") {
      if (index >= 0) rows.splice(index, 1);
    } else if (index >= 0) rows[index] = redemption;
    else rows.unshift(redemption);
    state.queue = Object.freeze({
      ...state.queue,
      redemptions: Object.freeze(rows),
      summary: Object.freeze({
        returned: rows.length,
        pending: rows.filter((row) => row.status === "pending").length,
        approved: rows.filter((row) => row.status === "approved").length,
        rejected: rows.filter((row) => row.status === "rejected").length,
        fulfilled: rows.filter((row) => row.status === "fulfilled").length,
      }),
      pagination: Object.freeze({ ...state.queue.pagination, returned: rows.length }),
    });
  }

  function idempotencyKey(action, requestId) {
    const runtimeCrypto = window.crypto || null;
    const suffix = typeof runtimeCrypto?.randomUUID === "function"
      ? runtimeCrypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `admin-redemption:${action}:${requestId}:${suffix}`.slice(0, 128);
  }

  function closeReviewDialog(reason = "closed") {
    state.reviewController?.close?.(reason);
    state.reviewController = null;
  }

  function openReviewDialog(redemption, action, opener) {
    closeReviewDialog("replaced");
    const backdrop = createElement("div", "admin-inventory-redemption-modal-backdrop");
    backdrop.setAttribute("data-admin-terminal-modal-backdrop", "");
    backdrop.setAttribute("data-modal-id", REVIEW_MODAL_ID);

    const dialog = createElement("section", "admin-inventory-redemption-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", `${REVIEW_MODAL_ID}Title`);
    dialog.innerHTML = `
      <header><div><small>REDEMPTION REVIEW</small><h2 id="${REVIEW_MODAL_ID}Title">${ACTION_LABELS[action]} request</h2></div><button type="button" data-admin-redemption-review-close aria-label="Close review">×</button></header>
      <div class="admin-inventory-redemption-modal__summary"><strong></strong><span></span><small></small></div>
      <form data-admin-redemption-review-form>
        <label><span>${action === "reject" ? "Rejection reason" : "Administrative note"}</span><textarea name="note" rows="4" maxlength="1000" ${action === "reject" ? "required" : ""} placeholder="${action === "reject" ? "Explain why this request cannot be approved" : "Optional note for the audit trail"}"></textarea></label>
        <p data-admin-redemption-review-status role="status" aria-live="polite">Confirm the ${action} action for this request.</p>
        <footer><button type="button" data-admin-redemption-review-cancel>Cancel</button><button type="submit" class="is-${action}">${ACTION_LABELS[action]} request</button></footer>
      </form>`;
    dialog.querySelector(".admin-inventory-redemption-modal__summary strong").textContent = redemption.player.displayName;
    dialog.querySelector(".admin-inventory-redemption-modal__summary span").textContent = `${redemption.quantity} × ${redemption.item.name}`;
    dialog.querySelector(".admin-inventory-redemption-modal__summary small").textContent = redemption.id;
    backdrop.append(dialog);
    document.body.append(backdrop);

    const key = idempotencyKey(action, redemption.id);
    const close = () => closeReviewDialog("cancelled");
    dialog.querySelector("[data-admin-redemption-review-close]")?.addEventListener("click", close);
    dialog.querySelector("[data-admin-redemption-review-cancel]")?.addEventListener("click", close);
    dialog.querySelector("[data-admin-redemption-review-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const reviewNote = text(new FormData(form).get("note"));
      const submit = form.querySelector("button[type='submit']");
      const cancel = form.querySelector("[data-admin-redemption-review-cancel]");
      const status = form.querySelector("[data-admin-redemption-review-status]");
      if (action === "reject" && !reviewNote) {
        status.textContent = "A rejection reason is required.";
        status.setAttribute("data-tone", "error");
        form.querySelector("textarea")?.focus();
        return;
      }
      submit.disabled = true;
      cancel.disabled = true;
      status.textContent = `${ACTION_LABELS[action]} request in progress…`;
      status.setAttribute("data-tone", "neutral");
      try {
        const client = await queueClient();
        const result = await client.review({
          gameId: selectedGameId(),
          requestId: redemption.id,
          action,
          note: reviewNote,
          idempotencyKey: key,
        });
        optimisticCommit(result.redemption);
        state.success = result.outcome === "replayed"
          ? `${ACTION_LABELS[action]} was already committed. The saved result is shown.`
          : `${ACTION_LABELS[action]} completed. Refreshing the queue…`;
        state.error = null;
        state.stale = false;
        closeReviewDialog("committed");
        renderQueue();
        await loadQueue({ refresh: true });
      } catch (error) {
        status.textContent = error?.message || "The redemption action could not be completed.";
        status.setAttribute("data-tone", "error");
        submit.disabled = false;
        cancel.disabled = false;
      }
    });

    const accessibility = window.EconovariaAdminModalAccessibility;
    state.reviewController = accessibility?.activate
      ? accessibility.activate({
          backdrop,
          dialog,
          opener,
          dismissOnBackdrop: false,
          dismissOnEscape: true,
          initialFocus: dialog.querySelector("textarea"),
          onClose: () => backdrop.remove(),
        })
      : {
          close() {
            backdrop.remove();
            opener?.focus?.({ preventScroll: true });
          },
        };
  }

  function openDrawer(opener = null) {
    const drawer = drawerElement();
    state.open = true;
    state.opener = opener instanceof HTMLElement ? opener : document.activeElement;
    drawer.removeAttribute("hidden");
    document.documentElement.setAttribute("data-admin-redemption-drawer-open", "true");
    window.requestAnimationFrame(() => drawer.querySelector("[data-admin-redemption-close]")?.focus({ preventScroll: true }));
    void loadQueue({ refresh: Boolean(state.queue) });
  }

  function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const navigation = target.closest("[data-admin-section]");
    if (navigation) {
      if (text(navigation.getAttribute("data-admin-section")).toLowerCase() !== "store") {
        closeDrawer({ restoreFocus: false });
      }
      scheduleMount();
    }
  }

  function handleDocumentKeydown(event) {
    if (event.key !== "Escape" || state.reviewController || !state.open) return;
    event.preventDefault();
    event.stopPropagation();
    closeDrawer();
  }

  document.addEventListener("click", handleDocumentClick, true);
  document.addEventListener("keydown", handleDocumentKeydown, true);
  window.addEventListener("load", scheduleMount, { once: true });
  scheduleMount();

  window.EconovariaAdminInventoryRedemptionQueue = Object.freeze({
    open: openDrawer,
    close: closeDrawer,
    reload: () => loadQueue({ refresh: true }),
    mount: mountLaunchButton,
    snapshot() {
      return Object.freeze({
        open: state.open,
        status: state.status,
        offset: state.offset,
        loading: state.loading,
        stale: state.stale,
        success: state.success,
        errorCode: text(state.error?.code),
        returned: state.queue?.redemptions?.length || 0,
      });
    },
  });
})();
