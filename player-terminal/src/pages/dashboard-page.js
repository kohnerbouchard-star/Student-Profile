import { escapeHtml, formatCurrency, formatPercent, toneFromChange } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderMetric, renderStatusPill } from "../components/ui.js";
import { ECONOVARIA_COUNTRY_REGIONS, countryRegionPath } from "../data/map-regions.js";

function renderTicker(items) {
  const safeItems = Array.isArray(items) ? items : [];
  return `<div class="player-terminal-world-ticker player-terminal-ticker-quiet" aria-label="Market ticker">
    <div class="player-terminal-world-ticker-track">
      ${[...safeItems, ...safeItems].map((item) => `<span><strong>${escapeHtml(item.symbol)}</strong><b>${escapeHtml(item.price.toFixed(2))}</b><i class="${toneFromChange(item.change)}">${escapeHtml(formatPercent(item.change))}</i></span>`).join("")}
    </div>
  </div>`;
}

function renderCountryOverlay(countries, playerCountryId) {
  const countryById = new Map((Array.isArray(countries) ? countries : []).map((country) => [String(country.id).toLowerCase(), country]));
  return `<svg class="player-terminal-country-overlay" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid meet" aria-label="Interactive country map" role="group">
    <defs>
      <filter id="playerCountryGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.2" result="blur"></feGaussianBlur>
        <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
      </filter>
    </defs>
    ${ECONOVARIA_COUNTRY_REGIONS.map((region) => {
      const liveCountry = countryById.get(String(region.id).toLowerCase());
      const countryId = liveCountry?.id || region.id;
      const countryName = liveCountry?.name || region.name;
      const tone = liveCountry?.tone || "cyan";
      const isHome = String(countryId) === String(playerCountryId);
      const path = countryRegionPath(region.polygons);
      return `<g class="player-terminal-country-region is-${escapeHtml(tone)}${isHome ? " is-home-country" : ""}" data-player-country="${escapeHtml(countryId)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(countryName)} intelligence">
        <title>${escapeHtml(countryName)}</title>
        <path class="player-terminal-country-hit" d="${path}"></path>
        <path class="player-terminal-country-fill" d="${path}" style="--country-color:${escapeHtml(region.color)}"></path>
        <path class="player-terminal-country-border" d="${path}" style="--country-color:${escapeHtml(region.color)}"></path>
        <g class="player-terminal-country-marker" transform="translate(${Number(region.centroid[0])} ${Number(region.centroid[1])})">
          <circle r="10"></circle><circle r="3.2"></circle>
        </g>
      </g>`;
    }).join("")}
  </svg>`;
}

function actionCard({ step, eyebrow, title, detail, route, iconName, tone = "cyan" }) {
  return `<button class="player-terminal-next-action is-${tone}" type="button" data-route="${route}">
    <span class="player-terminal-action-step">${escapeHtml(step)}</span>
    <span class="player-terminal-action-icon">${icon(iconName)}</span>
    <span><small>${escapeHtml(eyebrow)}</small><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></span>
    ${icon("chevronRight")}
  </button>`;
}

function worldEvent(event) {
  return `<button class="player-terminal-command-event is-${escapeHtml(event.tone)}" type="button" data-player-news-link="${escapeHtml(event.id)}"><i></i><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.region)} · ${escapeHtml(event.impact)}</small></span>${icon("chevronRight")}</button>`;
}

export function renderDashboardPage(data) {
  const { session, dashboard, countries, contracts, banking, messages, portfolio } = data;
  const activeContract = contracts.items.find((item) => item.status === "Active");
  const playerCountry = countries.find((item) => item.id === session.countryId) || countries[0] || { id: session.countryId || "unknown", name: session.countryName || "Unassigned", condition: "Unavailable", policy: "Country intelligence is awaiting the world service.", growth: 0, inflation: 0, stability: 0 };
  const currencyCode = session.currencyCode;
  const allocation = portfolio?.allocation || [];

  return `<section class="player-terminal-page player-terminal-command-page" data-page="dashboard">
    <div class="player-terminal-page-heading player-terminal-command-heading">
      <div><small>PLAYER COMMAND CENTER</small><h2>Good morning, ${escapeHtml(String(session.displayName || "Player").trim().split(/\s+/)[0] || "Player")}</h2><p>Complete the next priority, monitor the economy, and keep your capital working.</p></div>
      <div class="player-terminal-heading-actions">${renderStatusPill(dashboard.marketStatus, "green")}<button class="player-terminal-secondary-button" type="button" data-route="news">${icon("news")} World brief</button></div>
    </div>

    <div class="player-terminal-command-metrics">
      ${renderMetric({ label: "Available cash", value: formatCurrency(banking.checking.available, currencyCode), meta: "Ready to deploy", tone: "green", iconName: "wallet" })}
      ${renderMetric({ label: "Net worth", value: formatCurrency(dashboard.netWorth, currencyCode), meta: `${dashboard.dailyChange >= 0 ? "+" : ""}${dashboard.dailyChange.toFixed(2)}% today`, tone: "cyan", iconName: "portfolio" })}
      ${renderMetric({ label: "Active contracts", value: String(dashboard.contractsActive), meta: `${dashboard.contractsDueSoon} due soon`, tone: "amber", iconName: "contracts" })}
      ${renderMetric({ label: "Unread messages", value: String(messages?.unread || 0), meta: "Player and official channels", tone: "purple", iconName: "messages" })}
    </div>

    <div class="player-terminal-command-layout">
      <section class="player-terminal-panel player-terminal-priority-panel">
        <header class="player-terminal-panel-header"><div><span>NEXT ACTIONS</span><strong>Your core game loop</strong></div><small>Ordered by urgency</small></header>
        <div class="player-terminal-next-actions">
          ${actionCard({ step: "01", eyebrow: activeContract?.due || "No deadline", title: activeContract?.title || "Review available contracts", detail: activeContract ? `${activeContract.progress}% complete · ${activeContract.objective}` : "Select a contract to begin earning capital and XP.", route: "contracts", iconName: "contracts", tone: "amber" })}
          ${actionCard({ step: "02", eyebrow: dashboard.worldEvents[0]?.region || "World", title: dashboard.worldEvents[0]?.title || "Review world intelligence", detail: dashboard.worldEvents[0]?.impact || "Check the events currently moving markets.", route: "news", iconName: "news", tone: "cyan" })}
          ${actionCard({ step: "03", eyebrow: `${messages?.unread || 0} unread`, title: "Check communications", detail: messages?.threads?.find((thread) => thread.unread)?.preview || "No urgent messages. Review official announcements when ready.", route: "messages", iconName: "messages", tone: "purple" })}
        </div>
      </section>

      <section class="player-terminal-panel player-terminal-command-map-panel">
        <header class="player-terminal-panel-header"><div><span>WORLD POSITION</span><strong>${escapeHtml(playerCountry.name)} · ${escapeHtml(playerCountry.condition)}</strong></div><button class="player-terminal-text-button" type="button" data-player-country="${escapeHtml(playerCountry.id)}">Country intelligence ${icon("chevronRight")}</button></header>
        <div class="player-terminal-command-map">
          <img class="player-terminal-world-map" src="./assets/images/econovaria-world-map.png" alt="Map of the nations of Econovaria" />
          <div class="player-terminal-world-vignette" aria-hidden="true"></div>
          ${renderCountryOverlay(countries, session.countryId)}
          <div class="player-terminal-map-instruction" aria-hidden="true">
            <strong>SELECT A COUNTRY</strong><small>Click a highlighted border for intelligence</small>
          </div>
        </div>
      </section>

      <section class="player-terminal-panel player-terminal-command-events">
        <header class="player-terminal-panel-header"><div><span>WORLD SIGNALS</span><strong>Events that may affect you</strong></div><button class="player-terminal-text-button" type="button" data-route="news">All news ${icon("chevronRight")}</button></header>
        <div>${(dashboard.worldEvents || []).length ? dashboard.worldEvents.map(worldEvent).join("") : `<p class="player-terminal-inline-empty">No world signals require attention.</p>`}</div>
      </section>

      <section class="player-terminal-panel player-terminal-finance-snapshot">
        <header class="player-terminal-panel-header"><div><span>FINANCIAL SNAPSHOT</span><strong>${escapeHtml(formatCurrency(dashboard.netWorth, currencyCode))}</strong></div><span class="player-terminal-daily-change ${toneFromChange(dashboard.dailyChange)}">${escapeHtml(formatPercent(dashboard.dailyChange))} today</span></header>
        <div class="player-terminal-wealth-snapshot">
          <div class="player-terminal-wealth-breakdown">
            <button type="button" data-route="banking"><span>${icon("banking")}</span><div><small>Cash & savings</small><strong>${escapeHtml(formatCurrency(dashboard.liquidBalance + dashboard.savingsBalance, currencyCode))}</strong></div></button>
            <button type="button" data-route="portfolio"><span>${icon("portfolio")}</span><div><small>Investments</small><strong>${escapeHtml(formatCurrency(dashboard.portfolioValue, currencyCode))}</strong></div></button>
            <button type="button" data-route="inventory"><span>${icon("inventory")}</span><div><small>Inventory value</small><strong>${escapeHtml(formatCurrency(dashboard.inventoryValue, currencyCode))}</strong></div></button>
          </div>
          <div class="player-terminal-allocation-mini" aria-label="Portfolio allocation">
            ${(allocation.length ? allocation.slice(0, 4) : [{ label: "Cash", percent: 34 }, { label: "Equities", percent: 56 }, { label: "Inventory", percent: 10 }]).map((item) => `<div><span><small>${escapeHtml(item.label || item.name)}</small><strong>${escapeHtml(item.percent ?? item.value)}%</strong></span><i><b style="width:${Math.min(100, Number(item.percent ?? item.value))}%"></b></i></div>`).join("")}
          </div>
        </div>
        <div class="player-terminal-panel-actions"><button class="player-terminal-secondary-button" type="button" data-route="portfolio">${icon("portfolio")} Open portfolio</button><button class="player-terminal-secondary-button" type="button" data-route="market">${icon("market")} Review market</button></div>
      </section>
    </div>

    ${dashboard.marketPulse?.length ? renderTicker(dashboard.marketPulse) : ""}
  </section>`;
}
