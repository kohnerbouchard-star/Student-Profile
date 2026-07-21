(function installMarketplaceLifecycleSurface(global) {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const DRAWER_ID = "adminMarketplaceLifecycleDrawer";
  const MOUNT_DELAYS = [0, 60, 160, 320, 600];
  const state = {
    open: false,
    tab: "listings",
    data: null,
    loading: false,
    error: null,
    success: "",
    stale: false,
    controller: null,
    opener: null,
  };

  function text(value) { return String(value ?? "").trim(); }
  function selectedGameId() {
    try { return text(sessionStorage.getItem(SELECTED_GAME_KEY)); } catch { return ""; }
  }
  function client() {
    if (!global.AdminMarketplaceLifecycleClient) throw new Error("Marketplace lifecycle client is unavailable.");
    return global.AdminMarketplaceLifecycleClient;
  }
  function activeSection() {
    const control = [...document.querySelectorAll("[data-admin-section]")].find((node) =>
      node.getAttribute("aria-current") === "page" || node.getAttribute("aria-selected") === "true" || node.classList.contains("active") || node.classList.contains("is-active")
    );
    return text(control?.getAttribute("data-admin-section")).toLowerCase();
  }
  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }
  function marketplaceHeading() {
    return [...document.querySelectorAll("#adminPreview h1, #adminPreview h2")].find((heading) => {
      const label = text(heading.textContent).toLowerCase();
      return visible(heading) && (label === "marketplace" || label.includes("marketplace"));
    }) || null;
  }
  function create(tag, className = "", content = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }
  function formatMoney(value, currency) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Unavailable";
    return `${text(currency || "ECO").toUpperCase()} ${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  }
  function formatDate(value) {
    const timestamp = Date.parse(text(value));
    return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp)) : "Unavailable";
  }
  function idempotency(prefix, publicId, version) {
    const entropy = global.crypto?.randomUUID?.().replaceAll("-", "") || `${Date.now()}${Math.random().toString(16).slice(2)}`;
    return `${prefix}:${publicId}:v${version}:${entropy}`.slice(0, 159);
  }
  function statusClass(statusValue) { return `admin-marketplace-status is-${text(statusValue).toLowerCase().replaceAll("_", "-")}`; }
  function status(statusValue) { return create("span", statusClass(statusValue), text(statusValue).replaceAll("_", " ")); }

  function mountLaunchButton() {
    const existing = document.querySelector("[data-admin-marketplace-lifecycle-open]");
    const heading = activeSection() === "marketplace" ? marketplaceHeading() : null;
    if (!heading) {
      existing?.remove();
      if (state.open) closeDrawer({ restoreFocus: false });
      return false;
    }
    if (existing?.isConnected) return true;
    const button = create("button", "admin-marketplace-lifecycle-launch", "Manage lifecycle");
    button.type = "button";
    button.setAttribute("data-admin-marketplace-lifecycle-open", "");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", DRAWER_ID);
    button.addEventListener("click", () => openDrawer(button));
    (heading.closest("header") || heading.parentElement || document.getElementById("adminPreview"))?.append(button);
    return button.isConnected;
  }
  function scheduleMount() { MOUNT_DELAYS.forEach((delay) => setTimeout(mountLaunchButton, delay)); }

  function drawer() {
    let node = document.getElementById(DRAWER_ID);
    if (node) return node;
    node = create("section", "admin-marketplace-drawer");
    node.id = DRAWER_ID;
    node.hidden = true;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-labelledby", "adminMarketplaceDrawerTitle");
    node.innerHTML = `<div class="admin-marketplace-drawer__backdrop" data-admin-marketplace-close></div>
      <div class="admin-marketplace-drawer__panel" tabindex="-1">
        <header><div><small>AUTHORITATIVE MARKETPLACE</small><h2 id="adminMarketplaceDrawerTitle">Lifecycle controls</h2><p>Moderation, policy, disputes, refunds, and immutable audit.</p></div><button type="button" data-admin-marketplace-close aria-label="Close Marketplace lifecycle controls">×</button></header>
        <nav aria-label="Marketplace lifecycle views"><button type="button" data-admin-marketplace-tab="listings">Listings</button><button type="button" data-admin-marketplace-tab="disputes">Disputes</button><button type="button" data-admin-marketplace-tab="policy">Policy</button><button type="button" data-admin-marketplace-tab="audit">Audit</button></nav>
        <div class="admin-marketplace-statusline" role="status" aria-live="polite" data-admin-marketplace-status></div>
        <main data-admin-marketplace-content></main>
      </div>`;
    document.body.append(node);
    node.querySelectorAll("[data-admin-marketplace-close]").forEach((button) => button.addEventListener("click", () => closeDrawer()));
    node.querySelectorAll("[data-admin-marketplace-tab]").forEach((button) => button.addEventListener("click", () => { state.tab = button.dataset.adminMarketplaceTab; render(); }));
    node.addEventListener("keydown", trapFocus);
    return node;
  }
  function trapFocus(event) {
    if (event.key === "Escape") { event.preventDefault(); closeDrawer(); return; }
    if (event.key !== "Tab") return;
    const panel = drawer().querySelector(".admin-marketplace-drawer__panel");
    const focusable = [...panel.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter(visible);
    if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function openDrawer(opener) {
    state.open = true;
    state.opener = opener;
    const node = drawer();
    node.hidden = false;
    document.documentElement.setAttribute("data-admin-marketplace-drawer-open", "");
    requestAnimationFrame(() => node.querySelector(".admin-marketplace-drawer__panel")?.focus({ preventScroll: true }));
    void load({ refresh: true });
  }
  function closeDrawer({ restoreFocus = true } = {}) {
    state.open = false;
    state.controller?.abort();
    state.controller = null;
    const node = document.getElementById(DRAWER_ID);
    if (node) node.hidden = true;
    document.documentElement.removeAttribute("data-admin-marketplace-drawer-open");
    if (restoreFocus && state.opener?.isConnected) requestAnimationFrame(() => state.opener.focus({ preventScroll: true }));
  }

  async function load({ refresh = false } = {}) {
    if (!state.open || state.loading) return;
    const gameId = selectedGameId();
    state.loading = true;
    state.error = null;
    state.stale = false;
    state.controller?.abort();
    state.controller = new AbortController();
    render();
    try {
      state.data = await client().read(gameId, { signal: state.controller.signal, refresh });
      state.success = state.success || "";
    } catch (error) {
      if (error?.name === "AbortError") return;
      state.error = error;
      state.stale = Boolean(state.data);
    } finally {
      state.loading = false;
      render();
    }
  }

  function setStatus() {
    const node = drawer().querySelector("[data-admin-marketplace-status]");
    if (state.success && state.stale) node.textContent = `${state.success} Refresh failed; committed state will appear after retry.`;
    else if (state.success) node.textContent = state.success;
    else if (state.error && !state.data) node.textContent = state.error.message || "Marketplace lifecycle unavailable.";
    else if (state.stale) node.textContent = "Showing saved Marketplace data because refresh failed.";
    else if (state.loading) node.textContent = "Loading Marketplace lifecycle…";
    else node.textContent = "Marketplace lifecycle is current.";
  }
  function detailList(rows) {
    const list = create("dl", "admin-marketplace-details");
    rows.forEach(([label, value]) => { const row = create("div"); row.append(create("dt", "", label), create("dd", "", value)); list.append(row); });
    return list;
  }
  function actionButton(label, action, target, tone = "") {
    const button = create("button", `admin-marketplace-action ${tone}`, label);
    button.type = "button";
    button.addEventListener("click", () => review(target, action, button));
    return button;
  }
  function listingCard(item) {
    const card = create("article", "admin-marketplace-card");
    const head = create("header");
    const title = create("div"); title.append(create("strong", "", item.itemId), create("small", "", `${item.id} · v${item.version}`));
    head.append(title, status(item.status));
    card.append(head, detailList([
      ["Seller", `${item.seller?.displayName || "Player"} · ${item.seller?.id || "Reference unavailable"}`],
      ["Country", item.countryCode], ["Available", `${item.quantityAvailable} of ${item.quantityInitial}`],
      ["Price", formatMoney(item.unitPrice, item.currencyCode)], ["Expires", formatDate(item.expiresAt)],
      ["Moderation", item.moderationReason || "No moderation note"],
    ]));
    const actions = create("div", "admin-marketplace-actions");
    if (["draft", "active"].includes(item.status)) actions.append(actionButton("Hold", "hold", item));
    if (["draft", "moderation_hold"].includes(item.status)) actions.append(actionButton("Approve", "approve", item, "is-approve"));
    if (["draft", "active", "moderation_hold"].includes(item.status)) actions.append(actionButton("Reject", "reject", item, "is-danger"));
    card.append(actions);
    return card;
  }
  function disputeCard(item) {
    const card = create("article", "admin-marketplace-card");
    const head = create("header");
    const title = create("div"); title.append(create("strong", "", item.id), create("small", "", `${item.orderId} · v${item.version}`));
    head.append(title, status(item.status));
    card.append(head, detailList([
      ["Opened by", `${item.openedBy?.displayName || "Player"} · ${item.openedBy?.id || "Reference unavailable"}`],
      ["Opened", formatDate(item.openedAt)], ["Reason", item.reason], ["Resolution", item.resolutionNote || "Pending review"],
    ]));
    if (item.status === "open") {
      const actions = create("div", "admin-marketplace-actions");
      actions.append(actionButton("Refund buyer", "refund", item, "is-danger"), actionButton("Resolve for seller", "resolve-seller", item, "is-approve"), actionButton("Reject dispute", "reject", item));
      card.append(actions);
    }
    return card;
  }
  function renderListings(content) {
    const items = state.data?.listings || [];
    const section = create("section", "admin-marketplace-grid");
    if (!items.length) section.append(empty("No Marketplace listings", "Draft, active, held, sold, cancelled, expired, and rejected listings will appear here."));
    else items.forEach((item) => section.append(listingCard(item)));
    content.append(section);
  }
  function renderDisputes(content) {
    const items = state.data?.disputes || [];
    const section = create("section", "admin-marketplace-grid");
    if (!items.length) section.append(empty("No Marketplace disputes", "Player disputes will appear here for resolution or refund."));
    else items.forEach((item) => section.append(disputeCard(item)));
    content.append(section);
  }
  function renderPolicy(content) {
    const policy = state.data?.policy || {};
    const form = create("form", "admin-marketplace-policy");
    form.innerHTML = `<label><span>Marketplace enabled</span><input name="marketplaceEnabled" type="checkbox" ${policy.marketplaceEnabled !== false ? "checked" : ""}></label>
      <label><span>Cross-country trading</span><input name="crossCountryTradingEnabled" type="checkbox" ${policy.crossCountryTradingEnabled !== false ? "checked" : ""}></label>
      <label><span>Moderation required</span><input name="moderationRequired" type="checkbox" ${policy.moderationRequired ? "checked" : ""}></label>
      <label><span>Disputes enabled</span><input name="disputesEnabled" type="checkbox" ${policy.disputesEnabled !== false ? "checked" : ""}></label>
      <label><span>Fee rate</span><input name="feeRate" type="number" min="0" max="0.25" step="0.000001" value="${Number(policy.feeRate ?? 0.025)}" required></label>
      <label><span>Tax rate</span><input name="taxRate" type="number" min="0" max="0.25" step="0.000001" value="${Number(policy.taxRate ?? 0)}" required></label>
      <label><span>Listing hours</span><input name="listingDurationHours" type="number" min="1" max="720" value="${Number(policy.listingDurationHours ?? 168)}" required></label>
      <label><span>Purchase reservation minutes</span><input name="purchaseReservationMinutes" type="number" min="1" max="60" value="${Number(policy.purchaseReservationMinutes ?? 5)}" required></label>
      <label><span>Dispute window days</span><input name="disputeWindowDays" type="number" min="1" max="30" value="${Number(policy.disputeWindowDays ?? 7)}" required></label>
      <label class="is-wide"><span>Blocked country codes</span><input name="blockedCountryCodes" type="text" value="${(policy.blockedCountryCodes || []).join(", ")}" placeholder="LUMENOR, NORTHREACH"></label>
      <button class="admin-marketplace-action is-approve" type="submit">Save Marketplace policy</button>`;
    form.addEventListener("submit", savePolicy);
    content.append(form);
  }
  function renderAudit(content) {
    const section = create("section", "admin-marketplace-audit");
    const events = state.data?.audit || [];
    const postings = state.data?.postings || [];
    const heading = create("header"); heading.append(create("strong", "", "Immutable audit"), create("small", "", `${events.length} events · ${postings.length} financial postings`));
    section.append(heading);
    if (!events.length) section.append(empty("No Marketplace audit events", "Committed lifecycle events will appear here."));
    else events.forEach((event) => {
      const row = create("article");
      row.append(create("strong", "", event.action.replaceAll("_", " ")), create("span", "", [event.listingId, event.reservationId, event.orderId, event.disputeId].filter(Boolean).join(" · ")), create("small", "", `${event.actorType} · ${formatDate(event.createdAt)}`));
      section.append(row);
    });
    content.append(section);
  }
  function empty(title, description) { const node = create("section", "admin-marketplace-empty"); node.append(create("strong", "", title), create("p", "", description)); return node; }

  function render() {
    if (!state.open) return;
    const node = drawer();
    node.querySelectorAll("[data-admin-marketplace-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.adminMarketplaceTab === state.tab));
    const content = node.querySelector("[data-admin-marketplace-content]");
    content.replaceChildren();
    if (state.loading && !state.data) content.append(empty("Loading Marketplace lifecycle", "Authoritative Marketplace records are being loaded."));
    else if (state.error && !state.data) content.append(empty("Marketplace lifecycle unavailable", state.error.message || "Retry after the Admin service is available."));
    else if (state.tab === "listings") renderListings(content);
    else if (state.tab === "disputes") renderDisputes(content);
    else if (state.tab === "policy") renderPolicy(content);
    else renderAudit(content);
    setStatus();
  }

  async function review(target, action, button) {
    const reason = global.prompt(`Reason for ${action.replaceAll("-", " ")}:`, "Administrator review");
    if (reason === null) return;
    button.disabled = true;
    state.success = "";
    state.error = null;
    try {
      if (target.id.startsWith("lst_")) {
        await client().reviewListing(selectedGameId(), { listingId: target.id, expectedVersion: target.version, action, reason, idempotencyKey: idempotency(`admin.${action}`, target.id, target.version) });
      } else {
        await client().reviewDispute(selectedGameId(), { disputeId: target.id, expectedVersion: target.version, action, reason, idempotencyKey: idempotency(`admin.${action}`, target.id, target.version) });
      }
      state.success = `${action.replaceAll("-", " ")} committed.`;
      try { await load({ refresh: true }); } catch { state.stale = true; }
    } catch (error) {
      state.error = error;
      state.stale = Boolean(state.data);
      render();
    } finally { button.disabled = false; }
  }
  async function savePolicy(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    const values = new FormData(form);
    const blocked = text(values.get("blockedCountryCodes")).split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
    try {
      await client().updatePolicy(selectedGameId(), {
        marketplaceEnabled: values.get("marketplaceEnabled") === "on",
        crossCountryTradingEnabled: values.get("crossCountryTradingEnabled") === "on",
        moderationRequired: values.get("moderationRequired") === "on",
        disputesEnabled: values.get("disputesEnabled") === "on",
        feeRate: Number(values.get("feeRate")), taxRate: Number(values.get("taxRate")),
        listingDurationHours: Number(values.get("listingDurationHours")),
        purchaseReservationMinutes: Number(values.get("purchaseReservationMinutes")),
        disputeWindowDays: Number(values.get("disputeWindowDays")),
        countryFeeOverrides: state.data?.policy?.countryFeeOverrides || {}, blockedCountryCodes: blocked,
      });
      state.success = "Marketplace policy committed.";
      await load({ refresh: true });
    } catch (error) { state.error = error; state.stale = Boolean(state.data); render(); }
    finally { button.disabled = false; }
  }

  global.addEventListener("hashchange", scheduleMount);
  global.addEventListener("popstate", scheduleMount);
  document.addEventListener("click", scheduleMount, true);
  document.addEventListener("econovaria:admin-data-state-changed", scheduleMount);
  document.addEventListener("econovaria:admin-request-lifecycle", scheduleMount);
  scheduleMount();

  global.AdminMarketplaceLifecycleSurface = Object.freeze({ open: () => openDrawer(document.activeElement), refresh: () => load({ refresh: true }), destroy: () => { closeDrawer({ restoreFocus: false }); document.getElementById(DRAWER_ID)?.remove(); } });
})(window);
