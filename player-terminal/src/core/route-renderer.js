import { PLAYER_NAV_GROUPS } from "../components/layout.js";
import { renderDashboardPage } from "../pages/dashboard-page.js";
import { renderNewsPage } from "../pages/news-page.js";
import { renderMarketPage } from "../pages/market-page.js";
import { renderPortfolioPage } from "../pages/portfolio-page.js";
import { renderBusinessWorkspacePage } from "../pages/business-workspace-page.js";
import { renderStorePage } from "../pages/store-page.js";
import { renderMarketplacePage } from "../pages/marketplace-page.js";
import { renderContractsPage } from "../pages/contracts-page.js";
import { renderInventoryPage } from "../pages/inventory-page.js";
import { renderCraftingPage } from "../pages/crafting-page.js";
import { renderBankingPage } from "../pages/banking-page.js";
import { renderLoansPage } from "../pages/loans-page.js";
import { renderMessagesPage } from "../pages/messages-page.js";
import { renderProgressionPage } from "../pages/progression-page.js";
import { renderProfilePage } from "../pages/profile-page.js";
import { renderWorldPage } from "../pages/world-page.js";
import { getWorldRouteViewState } from "../features/world/world-route-view-state.js";

function fallbackWorldModel(data) {
  const countries = Array.isArray(data?.countries) ? data.countries : [];
  if (!countries.length) return null;
  return {
    runtimeAvailable: false,
    countries,
    campaign: null,
    arrival: { required: false },
    travel: { state: null, activeJourney: null },
    residency: null,
    world: null
  };
}

function renderWorldRoutePage(data) {
  const view = getWorldRouteViewState();
  const resourceReady = data?.resourceStatus?.worldRuntime?.state === "ready";
  const liveModel = resourceReady && data?.worldRuntime
    ? { ...data.worldRuntime, runtimeAvailable: true }
    : null;
  const model = view.model || liveModel || fallbackWorldModel(data);
  const unavailable = view.state === "unavailable" && !model;
  const loading = !model && (view.state === "loading" || data?.resourceStatus?.worldRuntime?.state === "loading");
  return renderWorldPage(model, {
    state: unavailable ? "unavailable" : loading ? "loading" : "ready",
    message: view.message,
    quote: view.quote,
    offline: globalThis.navigator?.onLine === false,
    stale: Boolean(view.updatedAt && Date.now() - view.updatedAt > 60_000),
    capabilities: data?.capabilities || { routes: {}, actions: {} }
  });
}

const PAGE_RENDERERS = Object.freeze({
  dashboard: (data, ui, config) => renderDashboardPage(data, ui, config),
  news: renderNewsPage,
  market: renderMarketPage,
  portfolio: renderPortfolioPage,
  business: renderBusinessWorkspacePage,
  store: renderStorePage,
  marketplace: renderMarketplacePage,
  contracts: renderContractsPage,
  inventory: renderInventoryPage,
  crafting: renderCraftingPage,
  banking: renderBankingPage,
  loans: renderLoansPage,
  messages: renderMessagesPage,
  progression: renderProgressionPage,
  world: renderWorldRoutePage,
  profile: (data, _ui, config) => renderProfilePage(data, config)
});

export const ROUTE_TITLES = Object.freeze(Object.fromEntries(
  PLAYER_NAV_GROUPS.flatMap((group) => group.routes.map((item) => [item.route, item.label]))
));

export function renderPlayerRoute({ route, data, ui, config }) {
  const renderer = PAGE_RENDERERS[route] || PAGE_RENDERERS.dashboard;
  return renderer(data, ui, config);
}
