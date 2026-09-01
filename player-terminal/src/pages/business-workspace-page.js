import { escapeHtml, formatCurrency, formatNumber } from "../core/format.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { renderBusinessPage as renderLegacyBusinessPage } from "./business-page.js";

const STOCKROOM_ORDER = Object.freeze([
  "warehouse",
  "work_in_progress",
  "finished_goods",
  "in_transit",
]);

const STOCKROOM_LABEL = Object.freeze({
  warehouse: "Warehouse",
  work_in_progress: "Work in Progress",
  finished_goods: "Finished Goods",
  in_transit: "In Transit",
});

function resourceReady(data, key) {
  return data?.resourceStatus?.[key]?.state === "ready";
}

function workspaceNavigation() {
  const links = [
    ["overview", "Overview"],
    ["products", "Products / Recipes"],
    ["stockroom", "Stockroom"],
    ["procurement", "Procurement"],
    ["production", "Production"],
    ["workforce", "Workforce"],
    ["sales", "Sales"],
    ["finance", "Finance"],
    ["activity", "Activity"],
  ];
  return `<nav class="player-terminal-panel player-terminal-business-workspace-nav" aria-label="Business workspace">
    <header class="player-terminal-panel-header"><div><span>BUSINESS WORKSPACE</span><strong>Operate from canonical evidence</strong></div>${renderStatusPill("PHASE 12", "cyan")}</header>
    <div class="player-terminal-heading-actions">${links.map(([key, label]) => `<a class="player-terminal-compact-button" href="#business-workspace-${key}" data-business-workspace-link="${escapeHtml(key)}">${escapeHtml(label)}</a>`).join("")}</div>
    <p>Equipment and Ownership / Governance remain read-only roadmap lanes until their existing server authority is explicitly surfaced here. This workspace does not invent replacement state.</p>
  </nav>`;
}

function recipeAvailability(recipe) {
  const availability = recipe?.availability || {};
  if (availability.enabled !== true) return { label: "DISABLED", tone: "red" };
  if (availability.availableInBusinessCountry !== true) return { label: "COUNTRY BLOCKED", tone: "amber" };
  if (availability.availableNow !== true) return { label: "UNAVAILABLE", tone: "amber" };
  return { label: "READY", tone: "green" };
}

function recipesPanel(data) {
  const ready = resourceReady(data, "businessRecipes");
  const snapshot = data.businessRecipes;
  const recipes = ready && Array.isArray(snapshot?.recipes) ? snapshot.recipes : [];
  const content = ready
    ? recipes.length
      ? recipes.map((recipe) => {
        const availability = recipeAvailability(recipe);
        return `<article class="player-terminal-business-product" data-business-recipe="${escapeHtml(recipe.recipeKey || "")}">
          <div><small>${escapeHtml(recipe.category || "recipe")} · tier ${escapeHtml(formatNumber(recipe.tier || 0))}</small><strong>${escapeHtml(recipe.name || "Recipe")}</strong><p>${escapeHtml(recipe.description || "")}</p><p>${escapeHtml(formatNumber(recipe.baseDurationSeconds || 0))} sec base duration · ${escapeHtml(recipe.difficultyProfile || "standard")} · scarcity ${escapeHtml(recipe.availability?.scarcityBand || "normal")}</p></div>
          ${renderStatusPill(availability.label, availability.tone)}
        </article>`;
      }).join("")
      : renderEmptyState({ title: "No Business recipes", detail: "Recipe access is server-owned. Unlock or receive canonical recipe access before production.", iconName: "factory" })
    : renderEmptyState({ title: "Canonical recipes unavailable", detail: "No compatibility recipe data is substituted. Refresh the Business workspace to retry the authoritative read.", iconName: "warning" });

  return `<section id="business-workspace-recipes" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="recipes" aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>CANONICAL RECIPES</span><strong>${ready ? `${escapeHtml(formatNumber(recipes.length))} accessible recipes` : "Authoritative read unavailable"}</strong></div>${renderStatusPill(ready ? "SERVER READ" : "NO FALLBACK", ready ? "green" : "amber")}</header>
    <div>${content}</div>
  </section>`;
}

function stockroomItem(item) {
  const currency = String(item.costCurrencyCode || "").trim().toUpperCase();
  const cost = currency ? formatCurrency(item.averageUnitCost || 0, currency) : "Cost unavailable";
  return `<article class="player-terminal-business-product" data-business-stockroom-item="${escapeHtml(item.itemKey || "")}" data-business-stockroom-location="${escapeHtml(item.locationKey || "")}">
    <div><small>${escapeHtml(item.itemClass || "item")} · ${escapeHtml(item.subtype || "stock")}</small><strong>${escapeHtml(item.name || item.canonicalKey || item.itemKey || "Stock item")}</strong><p>${escapeHtml(formatNumber(item.quantityAvailable || 0, 4))} available · ${escapeHtml(formatNumber(item.quantityReserved || 0, 4))} reserved · ${escapeHtml(formatNumber(item.quantityOwned || 0, 4))} owned</p></div>
    <dl><div><dt>AVG COST</dt><dd>${escapeHtml(cost)}</dd></div><div><dt>VERSION</dt><dd>v${escapeHtml(formatNumber(item.version || 0))}</dd></div></dl>
  </article>`;
}

function stockroomPanel(data) {
  const ready = resourceReady(data, "businessStockroom");
  const snapshot = data.businessStockroom;
  const locations = ready && Array.isArray(snapshot?.locations) ? snapshot.locations : [];
  const items = ready && Array.isArray(snapshot?.items) ? snapshot.items : [];
  const byLocation = new Map(locations.map((location) => [String(location.locationKey), location]));

  const body = ready
    ? STOCKROOM_ORDER.map((locationKey) => {
      const location = byLocation.get(locationKey) || {
        locationKey,
        label: STOCKROOM_LABEL[locationKey],
        itemCount: 0,
        quantityOwned: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
      };
      const locationItems = items.filter((item) => item.locationKey === locationKey);
      return `<section class="player-terminal-business-stockroom-location" data-business-stockroom-location-summary="${escapeHtml(locationKey)}">
        <header class="player-terminal-panel-header"><div><span>${escapeHtml(location.label || STOCKROOM_LABEL[locationKey])}</span><strong>${escapeHtml(formatNumber(location.quantityAvailable || 0, 4))} available</strong></div><small>${escapeHtml(formatNumber(location.quantityOwned || 0, 4))} owned · ${escapeHtml(formatNumber(location.quantityReserved || 0, 4))} reserved · ${escapeHtml(formatNumber(location.itemCount || 0))} items</small></header>
        <div>${locationItems.length ? locationItems.map(stockroomItem).join("") : renderEmptyState({ title: `No ${STOCKROOM_LABEL[locationKey]} stock`, detail: "Canonical Inventory authority reports no stock at this location.", iconName: "inventory" })}</div>
      </section>`;
    }).join("")
    : renderEmptyState({ title: "Canonical Stockroom unavailable", detail: "The legacy Business inventory summary is not used as Stockroom authority. Refresh to retry the Inventory-backed read.", iconName: "warning" });

  return `<section id="business-workspace-stockroom" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="stockroom" aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>STOCKROOM</span><strong>Warehouse → WIP → Finished Goods → In Transit</strong></div>${renderStatusPill(ready ? "INVENTORY AUTHORITY" : "NO FALLBACK", ready ? "green" : "amber")}</header>
    <div class="player-terminal-business-metrics">
      ${ready ? STOCKROOM_ORDER.map((key) => {
        const location = byLocation.get(key);
        return `<a class="player-terminal-metric" href="#business-stockroom-${escapeHtml(key)}"><small>${escapeHtml(STOCKROOM_LABEL[key])}</small><strong>${escapeHtml(formatNumber(location?.quantityAvailable || 0, 4))}</strong><span>available</span></a>`;
      }).join("") : ""}
    </div>
    ${body}
  </section>`;
}

function anchorLegacySections(html) {
  return html
    .replace(
      '<section class="player-terminal-panel player-terminal-company-overview">',
      '<section id="business-workspace-overview" class="player-terminal-panel player-terminal-company-overview" data-business-workspace-section="overview">',
    )
    .replace(
      '<section class="player-terminal-panel player-terminal-business-treasury"',
      '<section id="business-workspace-finance" class="player-terminal-panel player-terminal-business-treasury" data-business-workspace-section="finance"',
    )
    .replace(
      '<section class="player-terminal-panel player-terminal-business-procurement"',
      '<section id="business-workspace-procurement" class="player-terminal-panel player-terminal-business-procurement" data-business-workspace-section="procurement"',
    )
    .replace(
      '<section class="player-terminal-panel player-terminal-business-actions">',
      '<section id="business-workspace-production" class="player-terminal-panel player-terminal-business-actions" data-business-workspace-section="production">',
    )
    .replace(
      '<section class="player-terminal-panel player-terminal-business-products">\n        <header class="player-terminal-panel-header"><div><span>PRODUCT LINE</span>',
      '<section id="business-workspace-products" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="products">\n        <header class="player-terminal-panel-header"><div><span>PRODUCT LINE</span>',
    )
    .replace(
      '<section class="player-terminal-panel player-terminal-business-products" data-business-store-sales',
      '<section id="business-workspace-sales" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="sales" data-business-store-sales',
    )
    .replace(
      '<section class="player-terminal-panel player-terminal-business-products">\n        <header class="player-terminal-panel-header"><div><span>EMPLOYMENT</span>',
      '<section id="business-workspace-workforce" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="workforce">\n        <header class="player-terminal-panel-header"><div><span>EMPLOYMENT</span>',
    )
    .replace(
      "<span>INPUT INVENTORY</span>",
      "<span>LEGACY INPUT SUMMARY · COMPATIBILITY ONLY</span>",
    );
}

function appendWorkspaceReads(html, panels) {
  const marker = "\n    </div>\n  </section>";
  const index = html.lastIndexOf(marker);
  if (index < 0) return `${html}${panels}`;
  return `${html.slice(0, index)}${panels}${html.slice(index)}`;
}

export function renderBusinessWorkspacePage(data) {
  const legacy = renderLegacyBusinessPage(data);
  if (data?.business?.configured !== true) return legacy;

  let html = anchorLegacySections(legacy);
  html = html.replace(
    '<div class="player-terminal-business-metrics">',
    `${workspaceNavigation()}\n    <div class="player-terminal-business-metrics">`,
  );
  html = appendWorkspaceReads(
    html,
    `\n      ${recipesPanel(data)}\n      ${stockroomPanel(data)}\n      <section id="business-workspace-activity" class="player-terminal-panel player-terminal-business-products" data-business-workspace-section="activity"><header class="player-terminal-panel-header"><div><span>ACTIVITY</span><strong>Immutable operational evidence</strong></div>${renderStatusPill("RECEIPT BACKED", "green")}</header><p>Store-sale activity remains paired one-to-one with committed seller receipts above. Treasury FX and procurement retain their immutable receipt evidence in Finance and Procurement; Phase 12 does not create a browser-authored journal.</p></section>`,
  );
  return html;
}
