import { escapeHtml } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function severityTone(item) {
  if (item.severity === "High") return "red";
  if (item.severity === "Medium") return "amber";
  if (item.tone === "good") return "green";
  if (item.tone === "purple") return "purple";
  return "cyan";
}

function renderNewsRow(item, selectedId) {
  return `<button class="player-terminal-news-row${item.id === selectedId ? " is-selected" : ""}" type="button" data-player-news-select="${escapeHtml(item.id)}">
    <span class="player-terminal-news-signal is-${escapeHtml(severityTone(item))}">${icon("news")}</span>
    <span><small>${escapeHtml(item.category)} · ${escapeHtml(item.time)}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p></span>
    ${renderStatusPill(item.severity, severityTone(item))}
  </button>`;
}

export function renderNewsPage(data, ui) {
  const allItems = Array.isArray(data.news?.items) ? data.news.items : [];
  if (!allItems.length) {
    return `<section class="player-terminal-page player-terminal-news-page" data-page="news"><header class="player-terminal-page-heading"><div><small>WORLD & MARKET INTELLIGENCE</small><h2>News Terminal</h2><p>Track events that can affect prices, contracts, and country conditions.</p></div></header>${renderEmptyState({ title: "No active intelligence", detail: "World and market updates will appear here when the game server publishes them.", iconName: "news" })}</section>`;
  }
  const category = ui.newsCategory || "All";
  const filtered = allItems.filter((item) => category === "All" || item.category === category);
  const selectedId = ui.newsId && filtered.some((item) => item.id === ui.newsId) ? ui.newsId : filtered[0]?.id || data.news.selectedId || allItems[0].id;
  const selected = allItems.find((item) => item.id === selectedId) || allItems[0];
  const countries = selected.countryIds.map((id) => data.countries.find((country) => country.id === id)).filter(Boolean);
  const assets = selected.assetIds.map((id) => data.market.assets.find((asset) => asset.id === id)).filter(Boolean);
  const highImpact = allItems.filter((item) => item.severity === "High").length;

  return `<section class="player-terminal-page player-terminal-news-page" data-page="news">
    <header class="player-terminal-page-heading">
      <div><small>WORLD & MARKET INTELLIGENCE</small><h2>News Terminal</h2><p>Track the small set of events that can directly affect prices, contracts, and country conditions.</p></div>
      <div class="player-terminal-heading-actions">${renderStatusPill(`${allItems.length} LIVE STORIES`, "cyan")}<button class="player-terminal-icon-button" type="button" data-player-action="refresh-data" aria-label="Refresh news">${icon("refresh")}</button></div>
    </header>

    <div class="player-terminal-news-summary">
      <article><small>ACTIVE STORIES</small><strong>${escapeHtml(allItems.length)}</strong><span>Across the simulation</span></article>
      <article><small>HIGH IMPACT</small><strong>${escapeHtml(highImpact)}</strong><span>Requires attention</span></article>
      <article><small>YOUR COUNTRY</small><strong>${escapeHtml(data.session.countryName)}</strong><span>${escapeHtml(allItems.filter((item) => item.countryIds.includes(data.session.countryId)).length)} related stories</span></article>
      <article><small>MARKET STATUS</small><strong>${escapeHtml(data.market.status)}</strong><span>Events can move prices</span></article>
    </div>

    <div class="player-terminal-news-filters" aria-label="News categories">
      ${data.news.categories.map((item) => `<button type="button" class="${item === category ? "active" : ""}" data-player-news-category="${escapeHtml(item)}">${escapeHtml(item)}<small>${allItems.filter((story) => item === "All" || story.category === item).length}</small></button>`).join("")}
    </div>

    <div class="player-terminal-news-layout">
      <section class="player-terminal-panel player-terminal-news-list">
        <header class="player-terminal-panel-header"><div><span>${escapeHtml(category.toUpperCase())} FEED</span><strong>${escapeHtml(filtered.length)} stories</strong></div></header>
        <div>${filtered.length ? filtered.map((item) => renderNewsRow(item, selected.id)).join("") : renderEmptyState({ title: "No stories in this category", detail: "Choose another category or refresh the terminal.", iconName: "news" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-news-detail">
        <header><div><small>${escapeHtml(selected.category)} · ${escapeHtml(selected.time)}</small><h3>${escapeHtml(selected.title)}</h3></div>${renderStatusPill(selected.severity, severityTone(selected))}</header>
        <p class="player-terminal-news-lead">${escapeHtml(selected.summary)}</p>
        <div class="player-terminal-news-analysis"><small>PLAYER ANALYSIS</small><p>${escapeHtml(selected.analysis)}</p></div>
        <div class="player-terminal-news-effects"><small>EXPECTED EFFECTS</small><div>${selected.effects.map((effect) => `<span>${icon("pulse")} ${escapeHtml(effect)}</span>`).join("")}</div></div>
        <div class="player-terminal-news-links">
          <section><small>AFFECTED COUNTRIES</small><div>${countries.map((country) => `<button type="button" data-player-country="${escapeHtml(country.id)}">${icon("globe")}<span>${escapeHtml(country.name)}</span></button>`).join("") || "<span>None listed</span>"}</div></section>
          <section><small>RELATED ASSETS</small><div>${assets.map((asset) => `<button type="button" data-player-market-link="${escapeHtml(asset.id)}">${icon("market")}<span>${escapeHtml(asset.symbol)}</span><b>${escapeHtml(asset.change > 0 ? "+" : "")}${escapeHtml(asset.change.toFixed(2))}%</b></button>`).join("") || "<span>None listed</span>"}</div></section>
        </div>
      </section>
    </div>
  </section>`;
}
