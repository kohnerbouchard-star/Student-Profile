(function installCraftingOversightSurface(global) {
  "use strict";
  const GAME_KEY = "econovaria.admin.selected-game.v1";
  const DRAWER_ID = "adminCraftingOversightDrawer";
  const state = { open: false, data: null, loading: false, error: null, success: "", opener: null, controller: null };
  const text = (value) => String(value ?? "").trim();
  const selectedGame = () => { try { return text(sessionStorage.getItem(GAME_KEY)); } catch { return ""; } };
  const activeSection = () => text([...document.querySelectorAll("[data-admin-section]")].find((node) =>
    node.getAttribute("aria-current") === "page" || node.getAttribute("aria-selected") === "true" || node.classList.contains("active") || node.classList.contains("is-active")
  )?.getAttribute("data-admin-section")).toLowerCase();
  const visible = (node) => node instanceof HTMLElement && !node.hidden && getComputedStyle(node).display !== "none" && node.getBoundingClientRect().width > 0;
  const inventoryHeading = () => [...document.querySelectorAll("#adminPreview h1, #adminPreview h2")].find((node) => visible(node) && /inventory/i.test(text(node.textContent))) || null;
  const key = (prefix) => `${prefix}:${crypto.randomUUID?.().replaceAll("-", "") || Date.now()}`.slice(0, 127);
  const create = (tag, className = "", content = "") => { const node = document.createElement(tag); if (className) node.className = className; if (content) node.textContent = content; return node; };

  function mount() {
    const existing = document.querySelector("[data-admin-crafting-oversight-open]");
    const heading = activeSection() === "inventory" ? inventoryHeading() : null;
    if (!heading) { existing?.remove(); if (state.open) close(false); return false; }
    if (existing?.isConnected) return true;
    const button = create("button", "admin-crafting-oversight-launch", "Crafting oversight");
    button.type = "button";
    button.setAttribute("data-admin-crafting-oversight-open", "");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", DRAWER_ID);
    button.addEventListener("click", () => open(button));
    (heading.closest("header") || heading.parentElement || document.getElementById("adminPreview"))?.append(button);
    return button.isConnected;
  }
  function schedule() { [0, 60, 160, 320, 600].forEach((delay) => setTimeout(mount, delay)); }
  function drawer() {
    let node = document.getElementById(DRAWER_ID);
    if (node) return node;
    node = create("section", "admin-crafting-oversight-drawer");
    node.id = DRAWER_ID; node.hidden = true; node.setAttribute("role", "dialog"); node.setAttribute("aria-modal", "true"); node.setAttribute("aria-labelledby", "adminCraftingOversightTitle");
    node.innerHTML = `<div class="admin-crafting-oversight-backdrop" data-crafting-close></div><div class="admin-crafting-oversight-panel" tabindex="-1"><header><div><small>PHYSICAL ECONOMY</small><h2 id="adminCraftingOversightTitle">Crafting oversight</h2><p>Jobs, recovery, supply controls, and immutable outcomes.</p></div><button type="button" data-crafting-close aria-label="Close Crafting oversight">×</button></header><div role="status" aria-live="polite" data-crafting-status></div><main data-crafting-content></main></div>`;
    document.body.append(node);
    node.querySelectorAll("[data-crafting-close]").forEach((button) => button.addEventListener("click", () => close(true)));
    node.addEventListener("keydown", trap);
    return node;
  }
  function trap(event) {
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key !== "Tab") return;
    const focusable = [...drawer().querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter(visible);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function open(opener) { state.open = true; state.opener = opener; drawer().hidden = false; document.documentElement.setAttribute("data-admin-crafting-oversight-open", ""); requestAnimationFrame(() => drawer().querySelector(".admin-crafting-oversight-panel")?.focus()); void load(); }
  function close(restore) { state.open = false; state.controller?.abort(); drawer().hidden = true; document.documentElement.removeAttribute("data-admin-crafting-oversight-open"); if (restore && state.opener?.isConnected) state.opener.focus(); }
  async function load() {
    if (!state.open || state.loading) return;
    state.loading = true; state.error = null; state.controller?.abort(); state.controller = new AbortController(); render();
    try { state.data = await global.AdminCraftingOversightClient.read(selectedGame(), { signal: state.controller.signal }); }
    catch (error) { if (error?.name !== "AbortError") state.error = error; }
    finally { state.loading = false; render(); }
  }
  function jobCard(job) {
    const card = create("article", "admin-crafting-job-card");
    card.innerHTML = `<header><strong>${text(job.recipeKey || job.recipe_key || "Crafting job")}</strong><span>${text(job.status)}</span></header><p>${text(job.jobKey || job.public_id)} · ${text(job.player?.displayName || job.playerName || "Player")}</p><small>Quantity ${Number(job.quantity || 0)} · Quality ${text(job.qualityBand || job.quality_band || "standard")}</small>`;
    if (["failed", "in_progress", "completed"].includes(text(job.status))) {
      const actions = create("div", "admin-crafting-job-actions");
      for (const [label, outcome] of [["Release and fail", "release_and_fail"], ["Requeue", "requeue"]]) {
        const button = create("button", "", label); button.type = "button";
        button.addEventListener("click", () => recover(job, outcome, button)); actions.append(button);
      }
      card.append(actions);
    }
    return card;
  }
  async function recover(job, outcome, button) {
    const reason = prompt("Crafting recovery reason:", "Administrator recovery"); if (!reason) return;
    button.disabled = true; state.success = "";
    try { await global.AdminCraftingOversightClient.recover(selectedGame(), { jobKey: job.jobKey || job.public_id, outcome, reason, idempotencyKey: key(`admin.crafting.${outcome}`) }); state.success = "Crafting recovery committed."; await load(); }
    catch (error) { state.error = error; render(); }
    finally { button.disabled = false; }
  }
  function supplyForm() {
    const form = create("form", "admin-crafting-supply-form");
    form.innerHTML = `<h3>Supply override</h3><label>Item key<input name="itemKey" required pattern="[a-z0-9][a-z0-9_-]{0,63}"></label><label>Scarcity<select name="scarcityBand"><option>available</option><option>abundant</option><option>constrained</option><option>scarce</option><option>unavailable</option></select></label><label>Available quantity<input name="availableQuantity" type="number" min="0"></label><button type="submit">Apply supply state</button>`;
    form.addEventListener("submit", async (event) => { event.preventDefault(); const values = new FormData(form); const button = form.querySelector("button"); button.disabled = true; try { await global.AdminCraftingOversightClient.applySupply(selectedGame(), { itemKey: values.get("itemKey"), scarcityBand: values.get("scarcityBand"), availableQuantity: values.get("availableQuantity"), eventMultiplier: 1, routeMultiplier: 1, idempotencyKey: key("admin.crafting.supply") }); state.success = "Supply state committed."; await load(); } catch (error) { state.error = error; render(); } finally { button.disabled = false; } });
    return form;
  }
  function render() {
    if (!state.open) return;
    const node = drawer(), content = node.querySelector("[data-crafting-content]"), status = node.querySelector("[data-crafting-status]"); content.replaceChildren();
    status.textContent = state.error?.message || state.success || (state.loading ? "Loading Crafting oversight…" : "Crafting oversight is current.");
    const jobs = state.data?.jobs || state.data?.data?.jobs || [];
    if (!jobs.length) { const empty = create("p", "admin-crafting-empty", state.loading ? "Loading jobs…" : "No Crafting jobs match this view."); content.append(empty); }
    else { const grid = create("section", "admin-crafting-job-grid"); jobs.forEach((job) => grid.append(jobCard(job))); content.append(grid); }
    content.append(supplyForm());
  }
  addEventListener("hashchange", schedule); addEventListener("popstate", schedule); document.addEventListener("click", schedule, true); schedule();
  global.AdminCraftingOversightSurface = Object.freeze({ mount, open: () => open(document.activeElement), refresh: load, destroy: () => { close(false); document.getElementById(DRAWER_ID)?.remove(); } });
})(window);
