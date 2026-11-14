import { escapeHtml, formatCurrency, formatPercent, toneFromChange } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderMetric, renderStatusPill } from "../components/ui.js";
import { renderActivityFeed, renderAttentionStrip } from "../components/player-interior.js";
import { dashboardArrivalGuidance, dashboardResourceLabel } from "./dashboard-readiness.js";
import { ECONOVARIA_COUNTRY_REGIONS, countryRegionPath } from "../data/map-regions.js";

function renderTicker(items) {
  const safeItems = Array.isArray(items) ? items : [];
  return `<div class="player-terminal-world-ticker player-terminal-ticker-quiet" aria-label="Market ticker"><div class="player-terminal-world-ticker-track">${[...safeItems, ...safeItems].map((item) => `<span><strong>${escapeHtml(item.symbol)}</strong><b>${escapeHtml(item.price.toFixed(2))}</b><i class="${toneFromChange(item.change)}">${escapeHtml(formatPercent(item.change))}</i></span>`).join("")}</div></div>`;
}

function renderCountryOverlay(countries, playerCountryId) {
  const countryById = new Map((Array.isArray(countries) ? countries : []).map((country) => [String(country.id).toLowerCase(), country]));
  return `<svg class="player-terminal-country-overlay" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid meet" aria-label="Interactive country map" role="group"><defs><filter id="playerCountryGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" result="blur"></feGaussianBlur><feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter></defs>${ECONOVARIA_COUNTRY_REGIONS.map((region) => {
    const liveCountry = countryById.get(String(region.id).toLowerCase());
    const countryId = liveCountry?.id || region.id;
    const countryName = liveCountry?.name || region.name;
    const tone = liveCountry?.tone || "cyan";
    const isHome = String(countryId) === String(playerCountryId);
    const path = countryRegionPath(region.polygons);
    return `<g class="player-terminal-country-region is-${escapeHtml(tone)}${isHome ? " is-home-country" : ""}" data-player-country="${escapeHtml(countryId)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(countryName)} intelligence"><title>${escapeHtml(countryName)}</title><path class="player-terminal-country-hit" d="${path}"></path><path class="player-terminal-country-fill" d="${path}" style="--country-color:${escapeHtml(region.color)}"></path><path class="player-terminal-country-border" d="${path}" style="--country-color:${escapeHtml(region.color)}"></path><g class="player-terminal-country-marker" transform="translate(${Number(region.centroid[0])} ${Number(region.centroid[1])})"><circle r="10"></circle><circle r="3.2"></circle></g></g>`;
  }).join("")}</svg>`;
}

function actionCard({ step, eyebrow, title, detail, route, iconName, tone = "cyan" }) {
  return `<button class="player-terminal-next-action is-${tone}" type="button" data-route="${route}"><span class="player-terminal-action-step">${escapeHtml(step)}</span><span class="player-terminal-action-icon">${icon(iconName)}</span><span><small>${escapeHtml(eyebrow)}</small><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></span>${icon("chevronRight")}</button>`;
}

function worldEvent(event) {
  return `<button class="player-terminal-command-event is-${escapeHtml(event.tone)}" type="button" data-player-news-link="${escapeHtml(event.id)}"><i></i><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.region)} · ${escapeHtml(event.impact)}</small></span>${icon("chevronRight")}</button>`;
}

function renderMapHud() {
  return `<div class="player-terminal-map-hud" aria-hidden="true"><div class="player-terminal-map-instruction"><strong>SELECT A COUNTRY</strong><small>Open a highlighted border for live intelligence</small></div><div class="player-terminal-map-legend"><span><i class="is-home"></i><b>Home market</b></span><span><i class="is-interactive"></i><b>Country intelligence</b></span></div></div>`;
}

function renderHomeMarketSummary(country) {
  const growth = Number.isFinite(country.growth) ? country.growth : null;
  const inflation = Number.isFinite(country.inflation) ? `${country.inflation.toFixed(1)}%` : "Unavailable";
  const stability = Number.isFinite(country.stability) ? `${Math.max(0, Math.min(100, Math.round(country.stability)))}/100` : "Unavailable";
  return `<footer class="player-terminal-map-footer" aria-label="Home market summary"><div class="player-terminal-map-home"><span class="player-terminal-map-home-mark">${icon("globe")}</span><div><small>HOME MARKET</small><strong>${escapeHtml(country.name)}</strong><p>${escapeHtml(country.condition)} · ${escapeHtml(country.policy)}</p></div></div><dl class="player-terminal-map-metrics"><div><dt>Growth</dt><dd class="${growth === null ? "" : toneFromChange(growth)}">${escapeHtml(growth === null ? "Unavailable" : formatPercent(growth))}</dd></div><div><dt>Inflation</dt><dd>${escapeHtml(inflation)}</dd></div><div><dt>Stability</dt><dd>${escapeHtml(stability)}</dd></div></dl></footer>`;
}

export function renderDashboardPage(data, ui = {}, config = {}) {
  const { session, dashboard, countries, contracts, banking, messages, portfolio } = data;
  const label = (key) => dashboardResourceLabel(data, key, config.usePreviewData === true);
  const bankingUnavailable = Boolean(label("banking"));
  const contractsUnavailable = Boolean(label("contracts"));
  const messagesUnavailable = Boolean(label("messages"));
  const portfolioUnavailable = Boolean(label("portfolio"));
  const activeContract = contractsUnavailable ? null : contracts.items.find((item) => item.status === "Active");
  const playerCountry = (!label("countries") && countries.find((item) => item.id === session.countryId)) || { id: session.countryId || "unknown", name: session.countryName || "Unassigned", condition: "Unavailable", policy: "Country intelligence is awaiting the world service.", growth: null, inflation: null, stability: null };
  const currencyCode = session.currencyCode;
  const allocation = portfolioUnavailable ? [] : (portfolio?.allocation || []);
  const allocationItems = allocation.length ? allocation.slice(0, 4) : config.usePreviewData ? [{ label: "Cash", percent: 34 }, { label: "Equities", percent: 56 }, { label: "Inventory", percent: 10 }] : [];
  const money = (value, resource = "dashboard") => label(resource) || (Number.isFinite(value) ? formatCurrency(value, currencyCode) : "Unavailable");
  const availableChecking = money(banking.checking.available, "banking");
  const netWorth = money(dashboard.netWorth);
  const dailyChange = label("dashboard") || (Number.isFinite(dashboard.dailyChange) ? `${formatPercent(dashboard.dailyChange)} today` : "Daily change unavailable");
  const activeCount = label("contracts") || String(contracts.items.filter((item) => item.status === "Active").length);
  const dueSoon = contractsUnavailable ? "Contract count unavailable" : `${contracts.items.filter((item) => item.status === "Active" && item.urgency === "high").length} due soon`;
  const worldEvents = label("news") ? [] : (dashboard.worldEvents || []);
  const arrival = dashboardArrivalGuidance(data);
  const unreadMessages = messagesUnavailable ? label("messages") : String(messages?.unread || 0);

  const contractAction = contractsUnavailable
    ? { eyebrow: label("contracts"), title: "Contract details unavailable", detail: "The contracts service could not be reached. Open Contracts to retry." }
    : activeContract
      ? { eyebrow: activeContract.due, title: activeContract.title, detail: `${activeContract.progress}% complete · ${activeContract.objective}` }
      : { eyebrow: "No deadline", title: "Review available contracts", detail: "Select a contract to begin earning capital and XP." };
  const messageAction = messagesUnavailable
    ? { eyebrow: label("messages"), detail: "Communications could not be loaded. Retry from the Messages section." }
    : { eyebrow: `${messages?.unread || 0} unread`, detail: messages?.threads?.find((thread) => thread.unread)?.preview || "No urgent messages. Review official announcements when ready." };

  const attentionItems = [
    arrival ? { badge: arrival.eyebrow, title: arrival.title, detail: arrival.detail, iconName: arrival.iconName, tone: arrival.tone, action: 'data-route="world"' } : null,
    activeContract ? { badge: activeContract.urgency === "high" ? "DUE SOON" : "ACTIVE CONTRACT", title: activeContract.title, detail: `${activeContract.progress}% complete · ${activeContract.due}`, iconName: "contracts", tone: activeContract.urgency === "high" ? "red" : "amber", action: 'data-route="contracts"' } : null,
    !messagesUnavailable && Number(messages?.unread || 0) > 0 ? { badge: `${messages.unread} UNREAD`, title: "New communications", detail: messages?.threads?.find((thread) => thread.unread)?.preview || "Open Messages to review new activity.", iconName: "messages", tone: "purple", action: 'data-route="messages"' } : null,
    worldEvents[0] ? { badge: "WORLD SIGNAL", title: worldEvents[0].title, detail: `${worldEvents[0].region} · ${worldEvents[0].impact}`, iconName: "news", tone: worldEvents[0].tone || "cyan", action: `data-player-news-link="${escapeHtml(worldEvents[0].id)}"` } : null
  ].filter(Boolean);

  const recentActivity = bankingUnavailable ? [] : (banking.transactions || banking.recentTransactions || []).slice(0, 6).map((entry) => ({
    title: entry.title || entry.description || entry.type || "Account activity",
    detail: entry.counterparty || entry.category || entry.note || "",
    time: entry.time || entry.date || entry.createdAt || "",
    value: Number.isFinite(Number(entry.amount)) ? formatCurrency(entry.amount, entry.currencyCode || currencyCode) : "",
    tone: Number(entry.amount) < 0 ? "red" : Number(entry.amount) > 0 ? "green" : "cyan",
    iconName: Number(entry.amount) < 0 ? "chevronRight" : "wallet"
  }));

  return `<section class="player-terminal-page player-terminal-command-page player-terminal-dashboard-page" data-page="dashboard">
    <div class="player-terminal-page-heading player-terminal-command-heading"><div><small>PLAYER COMMAND CENTER</small><h2>Good morning, ${escapeHtml(String(session.displayName || "Player").trim().split(/\s+/)[0] || "Player")}</h2><p>Complete the next priority, monitor the economy, and keep your capital working.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(label("dashboard") || dashboard.marketStatus, label("dashboard") ? "amber" : "green")}<button class="player-terminal-secondary-button" type="button" data-route="news">${icon("news")} World brief</button></div></div>
    ${renderAttentionStrip(attentionItems)}
    <div class="player-terminal-command-metrics" aria-label="Player financial and activity summary">${renderMetric({ label: "Available checking", value: availableChecking, meta: bankingUnavailable ? "Balance not confirmed" : "Checking balance", tone: bankingUnavailable ? "amber" : "green", iconName: "wallet" })}${renderMetric({ label: "Net worth", value: netWorth, meta: dailyChange, tone: "cyan", iconName: "portfolio" })}${renderMetric({ label: "Active contracts", value: activeCount, meta: dueSoon, tone: "amber", iconName: "contracts" })}${renderMetric({ label: "Unread messages", value: unreadMessages, meta: messagesUnavailable ? "Communications unavailable" : "Player and official channels", tone: "purple", iconName: "messages" })}</div>
    <div class="player-terminal-command-layout">
      <section class="player-terminal-panel player-terminal-priority-panel"><header class="player-terminal-panel-header"><div><span>NEXT ACTIONS</span><strong>Your core game loop</strong></div><small>Ordered by urgency</small></header><div class="player-terminal-next-actions">${[
        ...(arrival?.priority ? [arrival] : []),
        { ...contractAction, route: "contracts", iconName: "contracts", tone: "amber" },
        { eyebrow: label("news") || worldEvents[0]?.region || "World", title: worldEvents[0]?.title || "Review world intelligence", detail: label("news") ? "World signals have not been confirmed. Open News to check." : worldEvents[0]?.impact || "Check the events currently moving markets.", route: "news", iconName: "news", tone: "cyan" },
        { ...messageAction, title: "Check communications", route: "messages", iconName: "messages", tone: "purple" }
      ].map((action, index) => actionCard({ ...action, step: String(index + 1).padStart(2, "0") })).join("")}</div></section>
      <section class="player-terminal-panel player-terminal-command-map-panel"><header class="player-terminal-panel-header"><div><span>WORLD POSITION</span><strong>${escapeHtml(playerCountry.name)} · ${escapeHtml(playerCountry.condition)}</strong></div><button class="player-terminal-text-button" type="button" data-player-country="${escapeHtml(playerCountry.id)}">Country intelligence ${icon("chevronRight")}</button></header><div class="player-terminal-command-map"><img class="player-terminal-world-map" src="./assets/images/econovaria-world-map.png" alt="Map of the nations of Econovaria" /><div class="player-terminal-world-vignette" aria-hidden="true"></div>${renderCountryOverlay(countries, session.countryId)}${renderMapHud()}</div>${renderHomeMarketSummary(playerCountry)}</section>
      <section class="player-terminal-panel player-terminal-command-events"><header class="player-terminal-panel-header"><div><span>WORLD SIGNALS</span><strong>Events that may affect you</strong></div><button class="player-terminal-text-button" type="button" data-route="news">All news ${icon("chevronRight")}</button></header><div>${worldEvents.length ? worldEvents.map(worldEvent).join("") : `<p class="player-terminal-inline-empty">${label("news") ? "World signals are not confirmed." : "No world signals require attention."}</p>`}</div></section>
      <section class="player-terminal-panel player-terminal-finance-snapshot"><header class="player-terminal-panel-header"><div><span>FINANCIAL SNAPSHOT</span><strong>${escapeHtml(netWorth)}</strong></div><span class="player-terminal-daily-change ${label("dashboard") || !Number.isFinite(dashboard.dailyChange) ? "" : toneFromChange(dashboard.dailyChange)}">${escapeHtml(dailyChange)}</span></header><div class="player-terminal-wealth-snapshot"><div class="player-terminal-wealth-breakdown"><button type="button" data-route="banking"><span>${icon("banking")}</span><div><small>Checking & savings</small><strong>${escapeHtml(money(Number.isFinite(banking.checking.balance) && Number.isFinite(banking.savings?.balance) ? banking.checking.balance + banking.savings.balance : null, "banking"))}</strong></div></button><button type="button" data-route="portfolio"><span>${icon("portfolio")}</span><div><small>Investments</small><strong>${escapeHtml(money(dashboard.portfolioValue))}</strong></div></button><button type="button" data-route="inventory"><span>${icon("inventory")}</span><div><small>Inventory estimate</small><strong>${escapeHtml(money(dashboard.inventoryValue))}</strong></div></button></div><div class="player-terminal-allocation-mini" aria-label="Portfolio allocation">${allocationItems.length ? allocationItems.map((item) => `<div><span><small>${escapeHtml(item.label || item.name)}</small><strong>${escapeHtml(item.percent ?? item.value)}%</strong></span><i><b style="width:${Math.min(100, Number(item.percent ?? item.value))}%"></b></i></div>`).join("") : `<p class="player-terminal-inline-empty">${portfolioUnavailable ? "Portfolio allocation is unavailable." : "No portfolio allocation yet."}</p>`}</div></div><div class="player-terminal-panel-actions"><button class="player-terminal-secondary-button" type="button" data-route="portfolio">${icon("portfolio")} Open portfolio</button><button class="player-terminal-secondary-button" type="button" data-route="market">${icon("market")} Review market</button></div></section>
      <section class="player-terminal-panel player-terminal-dashboard-activity"><header class="player-terminal-panel-header"><div><span>RECENT ACTIVITY</span><strong>What changed</strong></div><button class="player-terminal-text-button" type="button" data-route="banking">Account history ${icon("chevronRight")}</button></header>${renderActivityFeed(recentActivity, { empty: bankingUnavailable ? "Banking activity is temporarily unavailable." : "No recent account activity." })}</section>
    </div>
    ${!label("market") && dashboard.marketPulse?.length ? renderTicker(dashboard.marketPulse) : ""}
  </section>`;
}
