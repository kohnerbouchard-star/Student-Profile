(function initAdminOverviewQuickActions() {
  "use strict";

  const OVERVIEW_ACTIONS = Object.freeze([
    "scan-attendance",
    "add-contract",
    "add-player",
  ]);
  const STORE_ACTION = "add-store-item";
  const MAX_BOOT_FRAMES = 240;
  const origins = new WeakMap();
  let bootFrames = 0;
  let queued = false;

  function live(element) {
    return element instanceof HTMLElement &&
      !element.closest("[data-admin-shape-skeleton-stage]") &&
      !element.closest(".admin-shape-surface-overlay");
  }

  function activeSection() {
    const active = [...document.querySelectorAll("[data-admin-section]")].find((element) => {
      return element.getAttribute("aria-current") === "page" ||
        element.getAttribute("aria-selected") === "true" ||
        element.classList.contains("active") ||
        element.classList.contains("is-active");
    });
    return String(active?.getAttribute("data-admin-section") || "Overview");
  }

  function actionButton(action) {
    return [...document.querySelectorAll(`[data-admin-terminal-action="${CSS.escape(action)}"]`)]
      .find((element) => live(element)) || null;
  }

  function rememberOrigin(button) {
    if (!origins.has(button)) {
      origins.set(button, {
        parent: button.parentElement,
        next: button.nextElementSibling,
      });
    }
  }

  function restoreButton(button) {
    const origin = origins.get(button);
    const fallback = document.querySelector(".admin-terminal-top-actions");
    const parent = origin?.parent?.isConnected ? origin.parent : fallback;
    if (!(parent instanceof Element)) return;
    if (origin?.next?.isConnected && origin.next.parentElement === parent) {
      parent.insertBefore(button, origin.next);
    } else {
      parent.append(button);
    }
  }

  function ensureCard(main) {
    let card = main.querySelector(":scope > .admin-overview-quick-actions-card");
    if (card) return card;

    card = document.createElement("section");
    card.className = "admin-terminal-panel admin-overview-quick-actions-card";
    card.setAttribute("aria-labelledby", "adminOverviewQuickActionsTitle");
    card.innerHTML = `
      <header class="admin-terminal-panel-header">
        <div><span>QUICK ACTIONS</span><strong id="adminOverviewQuickActionsTitle">Administrator tools</strong></div>
        <small>Common workflows</small>
      </header>
      <div class="admin-overview-quick-actions-grid" data-admin-overview-quick-actions></div>`;

    const heading = main.querySelector(":scope > .admin-terminal-top, :scope > header");
    if (heading) heading.insertAdjacentElement("afterend", card);
    else main.prepend(card);
    return card;
  }

  function reconcileOverview(main) {
    const card = ensureCard(main);
    const grid = card.querySelector("[data-admin-overview-quick-actions]");
    if (!(grid instanceof HTMLElement)) return;

    for (const action of OVERVIEW_ACTIONS) {
      const button = actionButton(action);
      if (!(button instanceof HTMLButtonElement)) continue;
      rememberOrigin(button);
      button.hidden = false;
      button.removeAttribute("data-admin-overview-hidden");
      grid.append(button);
    }

    const storeButton = actionButton(STORE_ACTION);
    if (storeButton instanceof HTMLButtonElement && !storeButton.closest(".admin-overview-quick-actions-card")) {
      rememberOrigin(storeButton);
      storeButton.hidden = true;
      storeButton.dataset.adminOverviewHidden = "true";
    }
  }

  function reconcileOtherSection(main, section) {
    const card = main.querySelector(":scope > .admin-overview-quick-actions-card");
    card?.querySelectorAll("[data-admin-terminal-action]").forEach((button) => {
      if (button instanceof HTMLButtonElement) restoreButton(button);
    });
    card?.remove();

    document.querySelectorAll('[data-admin-terminal-action="add-store-item"][data-admin-overview-hidden="true"]')
      .forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) return;
        delete button.dataset.adminOverviewHidden;
        button.hidden = section !== "Store";
      });
  }

  function reconcile() {
    queued = false;
    const main = document.querySelector(".admin-terminal-shell-main");
    if (!(main instanceof HTMLElement)) return false;
    const section = activeSection();
    if (section === "Overview") reconcileOverview(main);
    else reconcileOtherSection(main, section);
    return true;
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(reconcile);
    });
  }

  function boot() {
    if (document.querySelector(".admin-terminal-shell-main")) {
      schedule();
      return;
    }
    if (bootFrames >= MAX_BOOT_FRAMES) return;
    bootFrames += 1;
    window.requestAnimationFrame(boot);
  }

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-admin-section]")) {
      schedule();
      window.setTimeout(schedule, 120);
      window.setTimeout(schedule, 360);
    }
  }, true);

  for (const eventName of [
    "econovaria:admin-route-mounted",
    "econovaria:admin-account-surface-ready",
    "econovaria:admin-request-lifecycle",
  ]) {
    document.addEventListener(eventName, schedule);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("load", boot, { once: true });

  window.EconovariaAdminOverviewQuickActions = Object.freeze({ reconcile: schedule });
})();
