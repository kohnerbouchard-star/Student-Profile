const ROUTE_META = Object.freeze({
  dashboard: ["PLAYER COMMAND CENTER", "Dashboard", "Loading dashboard data"],
  news: ["WORLD & MARKET INTELLIGENCE", "News Terminal", "Loading current intelligence"],
  market: ["CELESTIAL EXCHANGE", "Market Terminal", "Loading market data"],
  portfolio: ["WEALTH & PERFORMANCE CENTER", "Portfolio", "Loading portfolio data"],
  business: ["PLAYER ENTERPRISE", "Business", "Loading business data"],
  contracts: ["MISSION & WORKFLOW CENTER", "Contracts", "Loading contract data"],
  store: ["PLAYER COMMERCE NETWORK", "Store", "Loading store inventory"],
  marketplace: ["PLAYER COMMERCE", "Marketplace", "Loading marketplace data"],
  inventory: ["PLAYER ASSET STORAGE", "Inventory", "Loading inventory data"],
  crafting: ["FABRICATION WORKSHOP", "Crafting", "Loading crafting data"],
  banking: ["PLAYER LEDGER & BANKING", "Banking", "Loading banking data"],
  loans: ["CREDIT CENTER", "Loans", "Loading credit data"],
  messages: ["PLAYER COMMUNICATIONS", "Messages", "Loading conversations"],
  progression: ["PLAYER DEVELOPMENT", "Progression", "Loading progression data"],
  profile: ["PLAYER ACCOUNT", "Profile & Session", "Loading profile data"]
});

function currentRoute() {
  const value = String(globalThis.location?.hash || "").replace(/^#/, "").trim().toLowerCase();
  return value === "world" ? "dashboard" : ROUTE_META[value] ? value : "dashboard";
}

function shape(className = "") {
  return `<span class="player-terminal-skeleton-shape ${className}" aria-hidden="true"></span>`;
}

function lines(count = 3) {
  return `<div class="player-terminal-skeleton-lines" aria-hidden="true">${Array.from(
    { length: count },
    (_, index) => shape(`is-line is-line-${(index % 3) + 1}`)
  ).join("")}</div>`;
}

function heading(route) {
  const [kicker, title] = ROUTE_META[route] || ROUTE_META.dashboard;
  return `<header class="player-terminal-page-heading">
    <div><small>${kicker}</small><h2>${title}</h2></div>
  </header>`;
}

function panelHeader(label) {
  return `<header class="player-terminal-panel-header player-terminal-skeleton-panel-header">
    <div><span>${label}</span>${shape("is-heading")}</div>
  </header>`;
}

function rows(count = 4, className = "player-terminal-skeleton-row") {
  return `<div class="player-terminal-skeleton-rows" aria-hidden="true">${Array.from(
    { length: count },
    () => `<div class="${className}">${shape("is-avatar")}${lines(2)}${shape("is-value")}</div>`
  ).join("")}</div>`;
}

function metrics(count, className) {
  return `<div class="${className}">${Array.from(
    { length: count },
    () => `<article class="player-terminal-skeleton-metric player-terminal-skeleton-surface" aria-busy="true">${shape("is-icon")}${lines(3)}</article>`
  ).join("")}</div>`;
}

function cards(count, wrapperClass, cardClass) {
  return `<div class="${wrapperClass}">${Array.from(
    { length: count },
    () => `<article class="${cardClass} player-terminal-skeleton-surface" aria-busy="true">${shape("is-card-image")}<div class="player-terminal-skeleton-card-copy">${lines(3)}</div></article>`
  ).join("")}</div>`;
}

function panel(className, label, body, extraClass = "") {
  return `<section class="player-terminal-panel ${className} ${extraClass} player-terminal-skeleton-surface" aria-busy="true" aria-label="Loading ${label}">
    ${panelHeader(label)}
    ${body}
  </section>`;
}

function chart() {
  return `<div class="player-terminal-chart-frame player-terminal-skeleton-chart" aria-hidden="true">${shape("is-chart")}</div>`;
}

function map() {
  return `<div class="player-terminal-command-map player-terminal-skeleton-map" aria-hidden="true">${shape("is-map")}</div>`;
}

function page(route, body) {
  const [, title, loadingLabel] = ROUTE_META[route] || ROUTE_META.dashboard;
  return `<section class="player-terminal-page player-terminal-${route === "dashboard" ? "command" : route}-page player-terminal-route-skeleton" data-page="${route}" data-skeleton-route="${route}" role="status" aria-live="polite" aria-label="${loadingLabel}">
    ${heading(route)}
    ${body}
    <span class="player-terminal-skeleton-status">${loadingLabel} for ${title}.</span>
  </section>`;
}

function dashboardSkeleton() {
  return page("dashboard", `
    ${metrics(4, "player-terminal-command-metrics")}
    <div class="player-terminal-command-layout">
      ${panel("player-terminal-priority-panel", "Next actions", rows(3, "player-terminal-skeleton-action-row"))}
      ${panel("player-terminal-command-map-panel", "World position", map())}
      ${panel("player-terminal-command-events", "World signals", rows(4))}
      ${panel("player-terminal-finance-snapshot", "Financial snapshot", rows(5))}
    </div>`);
}

function newsSkeleton() {
  return page("news", `
    ${metrics(4, "player-terminal-news-summary")}
    <div class="player-terminal-news-layout">
      ${panel("player-terminal-news-list", "Intelligence feed", rows(6, "player-terminal-skeleton-news-row"))}
      ${panel("player-terminal-news-detail", "Story analysis", `${shape("is-detail-hero")}${lines(7)}${rows(3)}`)}
    </div>`);
}

function marketSkeleton() {
  return page("market", `
    ${metrics(4, "player-terminal-market-summary")}
    <div class="player-terminal-market-layout">
      ${panel("player-terminal-asset-browser", "Asset directory", rows(7, "player-terminal-skeleton-asset-row"))}
      ${panel("player-terminal-chart-panel", "Asset detail", `${chart()}${rows(8, "player-terminal-skeleton-fact")}`)}
      ${panel("player-terminal-order-ticket", "Order ticket", `${lines(6)}${rows(2)}`)}
    </div>`);
}

function portfolioSkeleton() {
  return page("portfolio", `
    ${metrics(4, "player-terminal-portfolio-metrics")}
    <div class="player-terminal-portfolio-layout">
      ${panel("player-terminal-networth-chart", "Net-worth history", `${chart()}${rows(4)}`)}
      ${panel("player-terminal-exposure-panel", "Country exposure", rows(4))}
      ${panel("player-terminal-holdings-panel", "Active positions", rows(6, "player-terminal-skeleton-table-row"))}
    </div>`);
}

function storeSkeleton() {
  return page("store", cards(6, "player-terminal-catalog-grid", "player-terminal-store-card"));
}

function contractsSkeleton() {
  return page("contracts", `
    <div class="player-terminal-contract-layout">
      ${panel("player-terminal-contract-list", "Contracts", rows(6, "player-terminal-skeleton-contract-row"))}
      ${panel("player-terminal-contract-detail", "Contract detail", `${lines(8)}${rows(5)}`)}
    </div>`);
}

function inventorySkeleton() {
  return page("inventory", `
    ${metrics(3, "player-terminal-command-metrics")}
    ${cards(5, "player-terminal-inventory-grid", "player-terminal-inventory-card")}`);
}

function bankingSkeleton() {
  return page("banking", `
    ${cards(3, "player-terminal-bank-accounts", "player-terminal-bank-card")}
    <div class="player-terminal-bank-layout">
      ${panel("player-terminal-transfer-panel", "Internal transfer", `${lines(5)}${rows(2)}`)}
      ${panel("player-terminal-external-transfer-panel", "Player transfer", `${lines(4)}${rows(2)}`)}
      ${panel("player-terminal-transactions-panel", "Posted ledger activity", rows(8, "player-terminal-skeleton-transaction-row"))}
    </div>`);
}

function messagesSkeleton() {
  return page("messages", `
    <div class="player-terminal-messages-layout">
      ${panel("player-terminal-thread-list", "Conversations", rows(7, "player-terminal-skeleton-thread-row"))}
      ${panel("player-terminal-message-thread", "Conversation", rows(6, "player-terminal-skeleton-message-row"))}
    </div>`);
}

function marketplaceSkeleton() {
  return page("marketplace", `
    ${metrics(4, "player-terminal-marketplace-summary")}
    <div class="player-terminal-marketplace-layout">
      ${panel("player-terminal-marketplace-list", "Open listings", rows(5, "player-terminal-skeleton-listing-row"))}
      ${panel("player-terminal-marketplace-detail", "Listing review", `${shape("is-detail-hero")}${lines(6)}`)}
      ${panel("player-terminal-marketplace-create", "Sell inventory", lines(7))}
      ${panel("player-terminal-marketplace-mine", "Your listings", rows(3))}
    </div>`);
}

function businessSkeleton() {
  return page("business", `
    ${metrics(4, "player-terminal-business-metrics")}
    <div class="player-terminal-business-layout">
      ${panel("player-terminal-company-overview", "Company profile", `${shape("is-detail-hero")}${lines(6)}`)}
      ${panel("player-terminal-business-actions", "Operations", lines(8))}
      ${panel("player-terminal-business-products", "Product line", rows(4, "player-terminal-skeleton-product-row"))}
      ${panel("player-terminal-business-suppliers", "Supply network", rows(4))}
    </div>`);
}

function craftingSkeleton() {
  return page("crafting", `
    ${metrics(3, "player-terminal-crafting-summary")}
    <div class="player-terminal-crafting-layout">
      ${panel("player-terminal-recipe-list", "Recipes", rows(5, "player-terminal-skeleton-recipe-row"))}
      ${panel("player-terminal-recipe-detail", "Recipe review", `${shape("is-detail-hero")}${lines(7)}`)}
      ${panel("player-terminal-crafting-queue", "Production queue", rows(3))}
    </div>`);
}

function loansSkeleton() {
  return page("loans", `
    ${metrics(4, "player-terminal-loan-metrics")}
    <div class="player-terminal-loans-layout">
      ${panel("player-terminal-loan-offers", "Pre-qualified offers", rows(4, "player-terminal-skeleton-loan-row"))}
      ${panel("player-terminal-loan-application", "Application", lines(8))}
      ${panel("player-terminal-active-loans", "Active facility", rows(3))}
      ${panel("player-terminal-loan-schedule", "Payment schedule", rows(5, "player-terminal-skeleton-transaction-row"))}
    </div>`);
}

function progressionSkeleton() {
  return page("progression", `
    <section class="player-terminal-progression-hero player-terminal-skeleton-surface" aria-busy="true" aria-label="Loading player level">${shape("is-level-orb")}<div>${shape("is-heading")}${lines(4)}</div>${rows(3)}</section>
    <div class="player-terminal-progression-grid">
      ${panel("", "Reputation", rows(5))}
      ${panel("", "Next milestones", rows(5))}
    </div>`);
}

function profileSkeleton() {
  return page("profile", `
    <div class="player-terminal-profile-layout">
      <section class="player-terminal-panel player-terminal-profile-identity player-terminal-skeleton-surface" aria-busy="true" aria-label="Loading player identity">${shape("is-profile-avatar")}<div>${shape("is-heading")}${lines(4)}</div>${rows(4)}</section>
      ${panel("player-terminal-session-actions", "Session information", lines(5))}
    </div>`);
}

export const PLAYER_SKELETON_ROUTES = Object.freeze([
  "dashboard", "news", "market", "portfolio", "store", "contracts", "inventory",
  "banking", "messages", "marketplace", "business", "crafting", "loans",
  "progression", "profile"
]);

export function renderRouteSkeleton(route = currentRoute()) {
  const normalizedRoute = route === "world" ? "dashboard" : ROUTE_META[route] ? route : "dashboard";

  switch (normalizedRoute) {
    case "news": return newsSkeleton();
    case "market": return marketSkeleton();
    case "portfolio": return portfolioSkeleton();
    case "store": return storeSkeleton();
    case "contracts": return contractsSkeleton();
    case "inventory": return inventorySkeleton();
    case "banking": return bankingSkeleton();
    case "messages": return messagesSkeleton();
    case "marketplace": return marketplaceSkeleton();
    case "business": return businessSkeleton();
    case "crafting": return craftingSkeleton();
    case "loans": return loansSkeleton();
    case "progression": return progressionSkeleton();
    case "profile": return profileSkeleton();
    case "dashboard":
    default:
      return dashboardSkeleton();
  }
}
