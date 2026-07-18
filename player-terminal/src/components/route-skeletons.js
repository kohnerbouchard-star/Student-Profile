const ROUTE_META = Object.freeze({
  dashboard: ["PLAYER COMMAND CENTER", "Dashboard"],
  news: ["WORLD & MARKET INTELLIGENCE", "News Terminal"],
  market: ["CELESTIAL EXCHANGE", "Market Terminal"],
  portfolio: ["WEALTH & PERFORMANCE CENTER", "Portfolio"],
  business: ["PLAYER ENTERPRISE", "Business"],
  contracts: ["MISSION & WORKFLOW CENTER", "Contracts"],
  store: ["PLAYER COMMERCE NETWORK", "Store"],
  marketplace: ["PLAYER COMMERCE", "Marketplace"],
  inventory: ["PLAYER ASSET STORAGE", "Inventory"],
  crafting: ["FABRICATION WORKSHOP", "Crafting"],
  banking: ["PLAYER LEDGER & BANKING", "Banking"],
  loans: ["CREDIT CENTER", "Loans"],
  messages: ["PLAYER COMMUNICATIONS", "Messages"],
  progression: ["PLAYER DEVELOPMENT", "Progression"],
  profile: ["PLAYER ACCOUNT", "Profile & Session"]
});

function currentRoute() {
  const value = String(globalThis.location?.hash || "").replace(/^#/, "").trim().toLowerCase();
  return value === "world" ? "dashboard" : ROUTE_META[value] ? value : "dashboard";
}

function shape(className = "", attributes = "") {
  return `<span class="player-terminal-skeleton-shape ${className}" aria-hidden="true"${attributes}></span>`;
}

function textLines(count = 2) {
  return `<div class="player-terminal-skeleton-lines" aria-hidden="true">${Array.from({ length: count }, (_, index) => shape(`is-line is-line-${(index % 3) + 1}`)).join("")}</div>`;
}

function heading(route, actions = 1) {
  const [kicker, title] = ROUTE_META[route] || ROUTE_META.dashboard;
  return `<header class="player-terminal-page-heading player-terminal-skeleton-heading">
    <div><small>${kicker}</small><h2>${title}</h2>${textLines(2)}</div>
    <div class="player-terminal-heading-actions" aria-hidden="true">${Array.from({ length: actions }, () => shape("is-control")).join("")}</div>
  </header>`;
}

function panelHeader(label = "LOADING") {
  return `<header class="player-terminal-panel-header player-terminal-skeleton-panel-header"><div><span>${label}</span>${shape("is-heading")}</div>${shape("is-control is-control-small")}</header>`;
}

function metricCards(count, className) {
  return `<div class="${className}">${Array.from({ length: count }, () => `<article class="player-terminal-skeleton-metric player-terminal-skeleton-surface">${shape("is-icon")}${textLines(3)}</article>`).join("")}</div>`;
}

function rows(count, className = "player-terminal-skeleton-row") {
  return `<div class="player-terminal-skeleton-rows">${Array.from({ length: count }, () => `<div class="${className}" aria-hidden="true">${shape("is-avatar")}${textLines(2)}${shape("is-value")}</div>`).join("")}</div>`;
}

function cards(count, wrapperClass, cardClass, options = {}) {
  const image = options.image !== false;
  const action = options.action !== false;
  return `<div class="${wrapperClass}">${Array.from({ length: count }, () => `<article class="${cardClass} player-terminal-skeleton-surface" aria-hidden="true">${image ? shape("is-card-image") : ""}<div class="player-terminal-skeleton-card-copy">${textLines(3)}</div>${action ? `<div class="player-terminal-skeleton-card-action">${shape("is-value")}${shape("is-control")}</div>` : ""}</article>`).join("")}</div>`;
}

function dashboardSkeleton() {
  return `<section class="player-terminal-page player-terminal-command-page player-terminal-route-skeleton" data-page="dashboard" data-skeleton-route="dashboard" aria-busy="true" role="status" aria-label="Loading Dashboard">
    ${heading("dashboard", 2)}
    ${metricCards(4, "player-terminal-command-metrics")}
    <div class="player-terminal-command-layout">
      <section class="player-terminal-panel player-terminal-priority-panel player-terminal-skeleton-surface">${panelHeader("NEXT ACTIONS")}${rows(3, "player-terminal-skeleton-action-row")}</section>
      <section class="player-terminal-panel player-terminal-command-map-panel player-terminal-skeleton-surface">${panelHeader("WORLD POSITION")}<div class="player-terminal-command-map player-terminal-skeleton-map">${shape("is-map")}</div></section>
      <section class="player-terminal-panel player-terminal-command-events player-terminal-skeleton-surface">${panelHeader("WORLD SIGNALS")}${rows(4)}</section>
      <section class="player-terminal-panel player-terminal-finance-snapshot player-terminal-skeleton-surface">${panelHeader("FINANCIAL SNAPSHOT")}<div class="player-terminal-wealth-snapshot">${rows(3)}<div class="player-terminal-allocation-mini">${rows(3, "player-terminal-skeleton-allocation-row")}</div></div><div class="player-terminal-panel-actions" aria-hidden="true">${shape("is-control")}${shape("is-control")}</div></section>
    </div>
    <div class="player-terminal-world-ticker player-terminal-skeleton-ticker" aria-hidden="true">${shape("is-ticker")}</div>
  </section>`;
}

function newsSkeleton() {
  return `<section class="player-terminal-page player-terminal-news-page player-terminal-route-skeleton" data-page="news" data-skeleton-route="news" aria-busy="true" role="status" aria-label="Loading News Terminal">
    ${heading("news", 2)}
    ${metricCards(4, "player-terminal-news-summary")}
    <div class="player-terminal-news-filters player-terminal-skeleton-filter-row" aria-hidden="true">${Array.from({ length: 5 }, () => shape("is-filter")).join("")}</div>
    <div class="player-terminal-news-layout">
      <section class="player-terminal-panel player-terminal-news-list player-terminal-skeleton-surface">${panelHeader("INTELLIGENCE FEED")}${rows(6, "player-terminal-skeleton-news-row")}</section>
      <section class="player-terminal-panel player-terminal-news-detail player-terminal-skeleton-surface">${panelHeader("STORY ANALYSIS")}<div class="player-terminal-skeleton-detail-copy">${shape("is-heading")}${textLines(6)}</div><div class="player-terminal-news-effects">${rows(3)}</div><div class="player-terminal-news-links">${rows(2)}</div></section>
    </div>
  </section>`;
}

function marketSkeleton() {
  return `<section class="player-terminal-page player-terminal-market-page player-terminal-route-skeleton" data-page="market" data-skeleton-route="market" aria-busy="true" role="status" aria-label="Loading Market Terminal">
    ${heading("market", 3)}
    ${metricCards(4, "player-terminal-market-summary")}
    <div class="player-terminal-market-layout">
      <section class="player-terminal-panel player-terminal-asset-browser player-terminal-skeleton-surface">${panelHeader("ASSET DIRECTORY")}<div class="player-terminal-filter-row player-terminal-skeleton-filter-row">${Array.from({ length: 4 }, () => shape("is-filter")).join("")}</div>${rows(7, "player-terminal-skeleton-asset-row")}</section>
      <section class="player-terminal-panel player-terminal-chart-panel player-terminal-skeleton-surface">${panelHeader("ASSET DETAIL")}<div class="player-terminal-chart-toolbar player-terminal-skeleton-filter-row">${Array.from({ length: 5 }, () => shape("is-filter is-filter-small")).join("")}</div><div class="player-terminal-chart-frame player-terminal-skeleton-chart">${shape("is-chart")}</div><div class="player-terminal-asset-facts player-terminal-asset-facts-expanded">${rows(8, "player-terminal-skeleton-fact")}</div><div class="player-terminal-position-strip">${rows(4, "player-terminal-skeleton-fact")}</div></section>
      <section class="player-terminal-panel player-terminal-order-ticket player-terminal-skeleton-surface">${panelHeader("ORDER TICKET")}<div class="player-terminal-skeleton-form">${rows(4, "player-terminal-skeleton-field")}${shape("is-control is-control-wide")}</div></section>
    </div>
  </section>`;
}

function portfolioSkeleton() {
  return `<section class="player-terminal-page player-terminal-portfolio-page player-terminal-route-skeleton" data-page="portfolio" data-skeleton-route="portfolio" aria-busy="true" role="status" aria-label="Loading Portfolio">
    ${heading("portfolio", 2)}
    ${metricCards(4, "player-terminal-portfolio-metrics")}
    <div class="player-terminal-portfolio-layout">
      <section class="player-terminal-panel player-terminal-networth-chart player-terminal-skeleton-surface">${panelHeader("NET-WORTH HISTORY")}<div class="player-terminal-portfolio-chart-frame player-terminal-skeleton-chart">${shape("is-chart")}</div>${cards(4, "player-terminal-allocation-grid", "player-terminal-skeleton-allocation-card", { image: false, action: false })}</section>
      <section class="player-terminal-panel player-terminal-exposure-panel player-terminal-skeleton-surface">${panelHeader("COUNTRY EXPOSURE")}${rows(4)}</section>
      <section class="player-terminal-panel player-terminal-holdings-panel player-terminal-skeleton-surface">${panelHeader("ACTIVE POSITIONS")}<div class="player-terminal-holdings-table">${rows(6, "player-terminal-skeleton-table-row")}</div></section>
    </div>
  </section>`;
}

function storeSkeleton() {
  return `<section class="player-terminal-page player-terminal-store-page player-terminal-route-skeleton" data-page="store" data-skeleton-route="store" aria-busy="true" role="status" aria-label="Loading Store">
    ${heading("store", 1)}
    <div class="player-terminal-store-toolbar"><div class="player-terminal-filter-row player-terminal-skeleton-filter-row">${Array.from({ length: 5 }, () => shape("is-filter")).join("")}</div>${shape("is-search")}</div>
    ${cards(6, "player-terminal-catalog-grid", "player-terminal-store-card")}
  </section>`;
}

function contractsSkeleton() {
  return `<section class="player-terminal-page player-terminal-contracts-page player-terminal-route-skeleton" data-page="contracts" data-skeleton-route="contracts" aria-busy="true" role="status" aria-label="Loading Contracts">
    ${heading("contracts", 1)}
    <div class="player-terminal-contract-tabs player-terminal-skeleton-tabs" aria-hidden="true">${Array.from({ length: 6 }, () => shape("is-tab")).join("")}</div>
    <div class="player-terminal-contract-layout">
      <section class="player-terminal-panel player-terminal-contract-list player-terminal-skeleton-surface">${panelHeader("CONTRACTS")}${rows(6, "player-terminal-skeleton-contract-row")}</section>
      <section class="player-terminal-panel player-terminal-contract-detail player-terminal-skeleton-surface">${panelHeader("CONTRACT DETAIL")}<div class="player-terminal-contract-lifecycle">${Array.from({ length: 5 }, () => shape("is-stage")).join("")}</div>${metricCards(3, "player-terminal-contract-rewards")}<div class="player-terminal-contract-detail-grid">${textLines(8)}${rows(5)}</div><div class="player-terminal-contract-submit player-terminal-skeleton-form">${rows(2, "player-terminal-skeleton-field")}${shape("is-control is-control-wide")}</div></section>
    </div>
  </section>`;
}

function inventorySkeleton() {
  return `<section class="player-terminal-page player-terminal-inventory-page player-terminal-route-skeleton" data-page="inventory" data-skeleton-route="inventory" aria-busy="true" role="status" aria-label="Loading Inventory">
    ${heading("inventory", 1)}
    ${metricCards(3, "player-terminal-command-metrics")}
    <div class="player-terminal-inventory-toolbar"><div class="player-terminal-filter-row player-terminal-skeleton-filter-row">${Array.from({ length: 5 }, () => shape("is-filter")).join("")}</div>${shape("is-control")}</div>
    ${cards(5, "player-terminal-inventory-grid", "player-terminal-inventory-card")}
  </section>`;
}

function bankingSkeleton() {
  return `<section class="player-terminal-page player-terminal-banking-page player-terminal-route-skeleton" data-page="banking" data-skeleton-route="banking" aria-busy="true" role="status" aria-label="Loading Banking">
    ${heading("banking", 1)}
    ${cards(3, "player-terminal-bank-accounts", "player-terminal-bank-card", { image: false, action: false })}
    <div class="player-terminal-bank-layout">
      <section class="player-terminal-panel player-terminal-transfer-panel player-terminal-skeleton-surface">${panelHeader("INTERNAL TRANSFER")}<div class="player-terminal-skeleton-form">${rows(4, "player-terminal-skeleton-field")}${shape("is-control is-control-wide")}</div></section>
      <section class="player-terminal-panel player-terminal-external-transfer-panel player-terminal-skeleton-surface">${panelHeader("PLAYER TRANSFER")}<div class="player-terminal-skeleton-form">${rows(3, "player-terminal-skeleton-field")}${shape("is-control is-control-wide")}</div></section>
      <section class="player-terminal-panel player-terminal-transactions-panel player-terminal-skeleton-surface">${panelHeader("POSTED LEDGER ACTIVITY")}${rows(8, "player-terminal-skeleton-transaction-row")}</section>
    </div>
  </section>`;
}

function messagesSkeleton() {
  return `<section class="player-terminal-page player-terminal-messages-page player-terminal-route-skeleton" data-page="messages" data-skeleton-route="messages" aria-busy="true" role="status" aria-label="Loading Messages">
    ${heading("messages", 1)}
    <div class="player-terminal-messages-layout">
      <section class="player-terminal-panel player-terminal-thread-list player-terminal-skeleton-surface">${panelHeader("CONVERSATIONS")}${rows(7, "player-terminal-skeleton-thread-row")}</section>
      <section class="player-terminal-panel player-terminal-message-thread player-terminal-skeleton-surface">${panelHeader("CONVERSATION")}<div class="player-terminal-message-log">${rows(6, "player-terminal-skeleton-message-row")}</div><div class="player-terminal-message-compose player-terminal-skeleton-form">${shape("is-compose")}${shape("is-control")}</div></section>
    </div>
  </section>`;
}

function marketplaceSkeleton() {
  return `<section class="player-terminal-page player-terminal-marketplace-page player-terminal-route-skeleton" data-page="marketplace" data-skeleton-route="marketplace" aria-busy="true" role="status" aria-label="Loading Marketplace">
    ${heading("marketplace", 1)}
    ${metricCards(4, "player-terminal-marketplace-summary")}
    <div class="player-terminal-filter-row player-terminal-skeleton-filter-row">${Array.from({ length: 5 }, () => shape("is-filter")).join("")}</div>
    <div class="player-terminal-marketplace-layout">
      <section class="player-terminal-panel player-terminal-marketplace-list player-terminal-skeleton-surface">${panelHeader("OPEN LISTINGS")}${rows(5, "player-terminal-skeleton-listing-row")}</section>
      <section class="player-terminal-panel player-terminal-marketplace-detail player-terminal-skeleton-surface">${panelHeader("LISTING REVIEW")}${shape("is-detail-hero")}${textLines(5)}<div class="player-terminal-skeleton-form">${rows(2, "player-terminal-skeleton-field")}${shape("is-control is-control-wide")}</div></section>
      <section class="player-terminal-panel player-terminal-marketplace-create player-terminal-skeleton-surface">${panelHeader("SELL INVENTORY")}${rows(4, "player-terminal-skeleton-field")}</section>
      <section class="player-terminal-panel player-terminal-marketplace-mine player-terminal-skeleton-surface">${panelHeader("YOUR LISTINGS")}${rows(3)}</section>
    </div>
  </section>`;
}

function businessSkeleton() {
  return `<section class="player-terminal-page player-terminal-business-page player-terminal-route-skeleton" data-page="business" data-skeleton-route="business" aria-busy="true" role="status" aria-label="Loading Business">
    ${heading("business", 1)}
    ${metricCards(4, "player-terminal-business-metrics")}
    <div class="player-terminal-business-layout">
      <section class="player-terminal-panel player-terminal-company-overview player-terminal-skeleton-surface">${panelHeader("COMPANY PROFILE")}${shape("is-detail-hero")}${metricCards(4, "player-terminal-company-facts")}${shape("is-progress")}</section>
      <section class="player-terminal-panel player-terminal-business-actions player-terminal-skeleton-surface">${panelHeader("OPERATIONS")}${rows(6, "player-terminal-skeleton-field")}</section>
      <section class="player-terminal-panel player-terminal-business-products player-terminal-skeleton-surface">${panelHeader("PRODUCT LINE")}${rows(4, "player-terminal-skeleton-product-row")}</section>
      <section class="player-terminal-panel player-terminal-business-suppliers player-terminal-skeleton-surface">${panelHeader("SUPPLY NETWORK")}${rows(4)}</section>
    </div>
  </section>`;
}

function craftingSkeleton() {
  return `<section class="player-terminal-page player-terminal-crafting-page player-terminal-route-skeleton" data-page="crafting" data-skeleton-route="crafting" aria-busy="true" role="status" aria-label="Loading Crafting">
    ${heading("crafting", 1)}
    ${metricCards(3, "player-terminal-crafting-summary")}
    <div class="player-terminal-crafting-layout">
      <section class="player-terminal-panel player-terminal-recipe-list player-terminal-skeleton-surface">${panelHeader("RECIPES")}${rows(5, "player-terminal-skeleton-recipe-row")}</section>
      <section class="player-terminal-panel player-terminal-recipe-detail player-terminal-skeleton-surface">${panelHeader("RECIPE REVIEW")}${shape("is-detail-hero")}<div class="player-terminal-recipe-grid">${rows(4)}${rows(3)}</div><div class="player-terminal-skeleton-form">${shape("is-field")}${shape("is-control")}</div></section>
      <section class="player-terminal-panel player-terminal-crafting-queue player-terminal-skeleton-surface">${panelHeader("PRODUCTION QUEUE")}${rows(3)}</section>
    </div>
  </section>`;
}

function loansSkeleton() {
  return `<section class="player-terminal-page player-terminal-loans-page player-terminal-route-skeleton" data-page="loans" data-skeleton-route="loans" aria-busy="true" role="status" aria-label="Loading Loans">
    ${heading("loans", 1)}
    ${metricCards(4, "player-terminal-loan-metrics")}
    <div class="player-terminal-loans-layout">
      <section class="player-terminal-panel player-terminal-loan-offers player-terminal-skeleton-surface">${panelHeader("PRE-QUALIFIED OFFERS")}${rows(4, "player-terminal-skeleton-loan-row")}</section>
      <section class="player-terminal-panel player-terminal-loan-application player-terminal-skeleton-surface">${panelHeader("APPLICATION")}${textLines(4)}${rows(4, "player-terminal-skeleton-field")}</section>
      <section class="player-terminal-panel player-terminal-active-loans player-terminal-skeleton-surface">${panelHeader("ACTIVE FACILITY")}${rows(3)}</section>
      <section class="player-terminal-panel player-terminal-loan-schedule player-terminal-skeleton-surface">${panelHeader("PAYMENT SCHEDULE")}${rows(5, "player-terminal-skeleton-transaction-row")}</section>
    </div>
  </section>`;
}

function progressionSkeleton() {
  return `<section class="player-terminal-page player-terminal-progression-page player-terminal-route-skeleton" data-page="progression" data-skeleton-route="progression" aria-busy="true" role="status" aria-label="Loading Progression">
    ${heading("progression", 1)}
    <section class="player-terminal-progression-hero player-terminal-skeleton-surface">${shape("is-level-orb")}<div>${shape("is-heading")}${textLines(3)}${shape("is-progress")}</div>${metricCards(3, "player-terminal-skeleton-hero-facts")}</section>
    <div class="player-terminal-progression-tabs player-terminal-skeleton-tabs">${Array.from({ length: 4 }, () => shape("is-tab")).join("")}</div>
    <div class="player-terminal-progression-grid"><section class="player-terminal-panel player-terminal-skeleton-surface">${panelHeader("REPUTATION")}${rows(5)}</section><section class="player-terminal-panel player-terminal-skeleton-surface">${panelHeader("NEXT MILESTONES")}${rows(5)}</section></div>
  </section>`;
}

function profileSkeleton() {
  return `<section class="player-terminal-page player-terminal-profile-page player-terminal-route-skeleton" data-page="profile" data-skeleton-route="profile" aria-busy="true" role="status" aria-label="Loading Profile and Session">
    ${heading("profile", 1)}
    <div class="player-terminal-profile-layout">
      <section class="player-terminal-panel player-terminal-profile-identity player-terminal-skeleton-surface">${shape("is-profile-avatar")}<div>${shape("is-heading")}${textLines(3)}</div>${metricCards(4, "player-terminal-skeleton-profile-facts")}</section>
      <section class="player-terminal-panel player-terminal-session-actions player-terminal-skeleton-surface">${panelHeader("SESSION CONTROL")}${shape("is-control is-control-wide")}${shape("is-control is-control-wide")}</section>
    </div>
  </section>`;
}

const RENDERERS = Object.freeze({
  dashboard: dashboardSkeleton,
  news: newsSkeleton,
  market: marketSkeleton,
  portfolio: portfolioSkeleton,
  store: storeSkeleton,
  contracts: contractsSkeleton,
  inventory: inventorySkeleton,
  banking: bankingSkeleton,
  messages: messagesSkeleton,
  marketplace: marketplaceSkeleton,
  business: businessSkeleton,
  crafting: craftingSkeleton,
  loans: loansSkeleton,
  progression: progressionSkeleton,
  profile: profileSkeleton
});

export function renderRouteSkeleton(route = currentRoute()) {
  const normalizedRoute = route === "world" ? "dashboard" : ROUTE_META[route] ? route : "dashboard";
  return RENDERERS[normalizedRoute]();
}

export const PLAYER_SKELETON_ROUTES = Object.freeze(Object.keys(RENDERERS));
