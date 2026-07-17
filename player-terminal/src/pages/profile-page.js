import { escapeHtml } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderStatusPill } from "../components/ui.js";

export function renderProfilePage(data, config) {
  const { session } = data;
  const diagnostics = config.developerDiagnostics === true && config.environment === "development";
  return `<section class="player-terminal-page player-terminal-profile-page" data-page="profile">
    <header class="player-terminal-page-heading"><div><small>PLAYER ACCOUNT</small><h2>Profile & Session</h2><p>Review your player identity, country assignment, and current game session.</p></div>${renderStatusPill(config.usePreviewData ? "PREVIEW" : "CONNECTED", config.usePreviewData ? "purple" : "green")}</header>
    <div class="player-terminal-profile-layout">
      <section class="player-terminal-panel player-terminal-profile-identity">
        <span class="player-terminal-profile-avatar">${escapeHtml(session.initials)}</span><div><small>${escapeHtml(session.playerId)}</small><h3>${escapeHtml(session.displayName)}</h3><p>${escapeHtml(session.countryName)} · ${escapeHtml(session.capital)}</p></div>
        <dl><div><dt>GAME</dt><dd>${escapeHtml(session.gameName)}</dd></div><div><dt>GAME CODE</dt><dd>${escapeHtml(session.gameCode)}</dd></div><div><dt>COUNTRY</dt><dd>${escapeHtml(session.countryName)}</dd></div><div><dt>CURRENCY</dt><dd>${escapeHtml(session.currencyName)} · ${escapeHtml(session.currencyCode)}</dd></div></dl>
      </section>
      ${diagnostics ? `<section class="player-terminal-panel player-terminal-api-status">
        <header class="player-terminal-panel-header"><div><span>API ADAPTER</span><strong>Connection configuration</strong></div></header>
        <div class="player-terminal-api-lines"><span><small>BASE URL</small><code>${escapeHtml(config.apiBaseUrl)}</code></span><span><small>TRANSPORT</small><code>${config.usePreviewData ? "PreviewTransport" : "HttpTransport"}</code></span><span><small>WRITE SIMULATION</small><code>${String(config.simulatePreviewWrites)}</code></span><span><small>SESSION HEADER</small><code>x-econovaria-game-session-id</code></span></div>
        <p>Development diagnostics are enabled for this local session.</p>
      </section>` : ""}
      <section class="player-terminal-panel player-terminal-session-actions">
        <header class="player-terminal-panel-header"><div><span>SESSION CONTROL</span><strong>Player terminal</strong></div></header>
        <button class="player-terminal-secondary-button" type="button" data-player-action="refresh-data">${icon("refresh")} Refresh this section</button>
        <button class="player-terminal-danger-button" type="button" data-player-action="logout">${icon("logout")} Sign out</button>
      </section>
    </div>
  </section>`;
}
