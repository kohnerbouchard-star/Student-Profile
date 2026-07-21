import { escapeHtml, formatCurrency } from "../core/format.js";

function title(value, fallback = "Unavailable") {
  const text = String(value || "").trim();
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function formatMinorCurrency(value, code) {
  return formatCurrency((Number(value) || 0) / 100, code);
}

function statusPill(label, tone = "neutral") {
  return `<span class="player-world-status is-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function emptyState(titleText, detail) {
  return `<div class="player-world-empty" role="status"><strong>${escapeHtml(titleText)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function renderCampaign(campaign) {
  if (!campaign) return emptyState("Campaign context unavailable", "No active campaign is published for this game.");
  const history = Array.isArray(campaign.history) ? campaign.history : [];
  return `<section class="player-world-panel" aria-labelledby="world-campaign-title">
    <header><div><small>LIVE CAMPAIGN</small><h2 id="world-campaign-title">${escapeHtml(title(campaign.phase, "Current campaign"))}</h2></div>${statusPill(title(campaign.status), campaign.status === "active" ? "good" : campaign.status === "paused" ? "warn" : "neutral")}</header>
    <dl class="player-world-facts"><div><dt>Sequence</dt><dd>${escapeHtml(campaign.sequence ?? 0)}</dd></div><div><dt>Local impact</dt><dd>${campaign.currentLocationAffected ? "Affected" : "Not affected"}</dd></div><div><dt>Outcome</dt><dd>${escapeHtml(title(campaign.outcome, "Pending"))}</dd></div></dl>
    <div class="player-world-history" aria-label="Campaign history">${history.length ? history.map((item) => `<article><small>${escapeHtml(item.occurredAt || item.createdAt || "Current")}</small><strong>${escapeHtml(title(item.eventKey || item.toPhase || "Campaign update"))}</strong><p>${escapeHtml(item.summary || item.reason || `${title(item.fromPhase, "Start")} to ${title(item.toPhase, "Current")}`)}</p></article>`).join("") : emptyState("No completed events", "Campaign history will appear after the first committed event.")}</div>
  </section>`;
}

function renderArrival(arrival, capabilities) {
  const assignment = arrival?.assignment;
  if (assignment) {
    const scores = Array.isArray(assignment.scores) ? assignment.scores : [];
    return `<section class="player-world-panel" aria-labelledby="world-arrival-title"><header><div><small>ARRIVAL CLASS</small><h2 id="world-arrival-title">${escapeHtml(title(assignment.classId))}</h2></div>${statusPill(title(assignment.source), "good")}</header><p>${escapeHtml(assignment.explanation || "Your Arrival Class is active for this session.")}</p><dl class="player-world-facts"><div><dt>Country variant</dt><dd>${escapeHtml(title(assignment.countryId))}</dd></div><div><dt>Revision</dt><dd>${escapeHtml(assignment.revision ?? 0)}</dd></div><div><dt>Economic lockouts</dt><dd>None</dd></div></dl>${scores.length ? `<div class="player-world-score-list" aria-label="Arrival Class scoring">${scores.map((score) => `<span><strong>${escapeHtml(title(score.classId))}</strong><small>${escapeHtml(score.total)}</small></span>`).join("")}</div>` : ""}</section>`;
  }
  const questionnaire = arrival?.questionnaire;
  if (!arrival?.required || !questionnaire) return `<section class="player-world-panel" aria-labelledby="world-arrival-title"><header><div><small>ARRIVAL CLASS</small><h2 id="world-arrival-title">Not assigned</h2></div></header>${emptyState("Questionnaire unavailable", "Arrival Class assignment is not required or has not been published.")}</section>`;
  const enabled = capabilities?.actions?.arrivalClassSubmit === true;
  return `<section class="player-world-panel" aria-labelledby="world-arrival-title"><header><div><small>ARRIVAL CLASS</small><h2 id="world-arrival-title">Choose how you begin</h2></div>${statusPill(`Version ${questionnaire.version}`, "neutral")}</header><p>Your answers use nonsensitive preferences and produce an explainable recommendation. No class permanently blocks economic activity.</p><form data-world-form="arrivalClass" ${enabled ? "" : 'aria-disabled="true"'}><div class="player-world-questionnaire">${questionnaire.questions.map((question, questionIndex) => `<fieldset><legend>${escapeHtml(question.prompt)}</legend>${question.options.map((option, optionIndex) => `<label><input type="radio" name="world-answer-${questionIndex}" value="${escapeHtml(option.optionId)}" data-question-id="${escapeHtml(question.questionId)}" ${optionIndex === 0 ? "required" : ""} ${enabled ? "" : "disabled"}><span>${escapeHtml(option.label)}</span></label>`).join("")}</fieldset>`).join("")}</div><button class="player-terminal-primary-button" type="submit" ${enabled ? "" : "disabled"}>Review and confirm class</button><p class="player-world-form-status" data-world-form-status aria-live="polite"></p></form></section>`;
}

function renderLocationAndRoutes(model, quote, capabilities) {
  const travel = model.travel || {};
  const state = travel.state;
  const locations = Array.isArray(model.world?.locations) ? model.world.locations : [];
  const routes = Array.isArray(model.world?.routes) ? model.world.routes : [];
  const activeJourney = travel.activeJourney;
  const canQuote = capabilities?.actions?.travelQuote === true;
  const canExecute = capabilities?.actions?.travelExecute === true;
  const canComplete = capabilities?.actions?.travelComplete === true;
  const destinationOptions = locations.filter((item) => item.publicLocationId !== state?.currentLocationId && item.availability !== "closed");
  return `<section class="player-world-panel player-world-map-panel" aria-labelledby="world-travel-title"><header><div><small>GEOGRAPHY & TRAVEL</small><h2 id="world-travel-title">${escapeHtml(title(state?.currentLocationId, "Location unavailable"))}</h2></div>${statusPill(title(state?.status, "Unavailable"), state?.status === "available" ? "good" : "warn")}</header>
    <dl class="player-world-facts"><div><dt>Current location</dt><dd>${escapeHtml(state?.currentLocationId || "Not assigned")}</dd></div><div><dt>World revision</dt><dd>${escapeHtml(model.world?.revision ?? 0)}</dd></div><div><dt>Arrival</dt><dd>${escapeHtml(state?.arrivalAt || "Not in transit")}</dd></div></dl>
    ${activeJourney ? `<article class="player-world-journey" role="status"><div><small>ACTIVE JOURNEY</small><strong>${escapeHtml(activeJourney.fromLocationId)} → ${escapeHtml(activeJourney.toLocationId)}</strong><p>${escapeHtml(activeJourney.totalDurationMinutes)} minutes · ${escapeHtml(formatMinorCurrency(activeJourney.totalCostMinor, activeJourney.currencyCode))}</p></div><form data-world-form="travelComplete" data-journey-id="${escapeHtml(activeJourney.publicJourneyId)}"><button class="player-terminal-primary-button" type="submit" ${canComplete ? "" : "disabled"}>Complete eligible arrival</button></form></article>` : ""}
    <div class="player-world-travel-grid"><form data-world-form="travelQuote" class="player-world-travel-form"><label>Destination<select name="toLocationId" required ${canQuote ? "" : "disabled"}><option value="">Select an open location</option>${destinationOptions.map((item) => `<option value="${escapeHtml(item.publicLocationId)}">${escapeHtml(title(item.publicLocationId))} · ${escapeHtml(title(item.availability))}</option>`).join("")}</select></label><fieldset><legend>Eligible travel modes</legend>${["land", "sea", "air", "meridian"].map((mode) => `<label><input type="checkbox" name="allowedModes" value="${mode}" ${mode === "land" ? "checked" : ""} ${canQuote ? "" : "disabled"}><span>${escapeHtml(title(mode))}</span></label>`).join("")}</fieldset><button class="player-terminal-primary-button" type="submit" ${canQuote && destinationOptions.length ? "" : "disabled"}>Calculate authoritative quote</button><p class="player-world-form-status" data-world-form-status aria-live="polite"></p></form>
    <div class="player-world-quote" aria-live="polite">${quote ? `<small>AUTHORITATIVE QUOTE</small><strong>${escapeHtml(quote.fromLocationId)} → ${escapeHtml(quote.toLocationId)}</strong><p>${escapeHtml(formatMinorCurrency(quote.totalCostMinor, quote.currencyCode))} · ${escapeHtml(quote.totalDurationMinutes)} minutes</p><ol>${(quote.legs || []).map((leg) => `<li>${escapeHtml(title(leg.mode))}: ${escapeHtml(leg.fromLocationId)} → ${escapeHtml(leg.toLocationId)}</li>`).join("")}</ol><form data-world-form="travelExecute"><input type="hidden" name="quoteId" value="${escapeHtml(quote.publicQuoteId)}"><button class="player-terminal-primary-button" type="submit" ${canExecute ? "" : "disabled"}>Confirm travel</button><p class="player-world-form-status" data-world-form-status aria-live="polite"></p></form>` : emptyState("No active quote", "Select a destination and eligible travel modes. Quotes expire and are revalidated at execution.")}</div></div>
    <details class="player-world-collection"><summary>Locations <span>${escapeHtml(locations.length)}</span></summary><div>${locations.length ? locations.map((item) => `<article><strong>${escapeHtml(title(item.publicLocationId))}</strong><small>${escapeHtml(item.publicLocationId)}</small>${statusPill(title(item.availability), item.availability === "normal" ? "good" : item.availability === "closed" ? "bad" : "warn")}</article>`).join("") : emptyState("No locations", "Canonical locations have not been initialized.")}</div></details>
    <details class="player-world-collection"><summary>Routes <span>${escapeHtml(routes.length)}</span></summary><div>${routes.length ? routes.map((item) => `<article><strong>${escapeHtml(title(item.publicRouteId))}</strong><small>${escapeHtml(item.publicRouteId)}</small>${statusPill(`${title(item.status)} · ${title(item.reason)}`, item.status === "open" ? "good" : item.status === "closed" ? "bad" : "warn")}<p>Cost ×${escapeHtml((Number(item.costMultiplierBasisPoints || 10000) / 10000).toFixed(2))} · Time ×${escapeHtml((Number(item.durationMultiplierBasisPoints || 10000) / 10000).toFixed(2))}</p></article>`).join("") : emptyState("No routes", "Route adjacency has not been initialized.")}</div></details>
  </section>`;
}

function renderResidency(residency, capabilities) {
  if (!residency) return `<section class="player-world-panel" aria-labelledby="world-residency-title"><header><div><small>RESIDENCY</small><h2 id="world-residency-title">Unavailable</h2></div></header>${emptyState("Residency not initialized", "Residency state will appear after onboarding.")}</section>`;
  const eligible = Array.isArray(residency.eligibleCountryIds) ? residency.eligibleCountryIds : [];
  const enabled = capabilities?.actions?.residencyRequest === true;
  return `<section class="player-world-panel" aria-labelledby="world-residency-title"><header><div><small>RESIDENCY</small><h2 id="world-residency-title">${escapeHtml(title(residency.currentCountryId))}</h2></div>${statusPill(residency.pendingCountryId ? "Request pending" : "Current", residency.pendingCountryId ? "warn" : "good")}</header><dl class="player-world-facts"><div><dt>Country</dt><dd>${escapeHtml(residency.currentCountryId)}</dd></div><div><dt>Settlement currency</dt><dd>${escapeHtml(residency.currencyCode)}</dd></div><div><dt>Revision</dt><dd>${escapeHtml(residency.revision)}</dd></div></dl><form data-world-form="residencyRequest"><label>Eligible destination<select name="countryId" required ${enabled ? "" : "disabled"}><option value="">Select country</option>${eligible.map((countryId) => `<option value="${escapeHtml(countryId)}">${escapeHtml(title(countryId))}</option>`).join("")}</select></label><input type="hidden" name="expectedRevision" value="${escapeHtml(residency.revision)}"><button class="player-terminal-primary-button" type="submit" ${enabled && eligible.length && !residency.pendingCountryId ? "" : "disabled"}>Request residency review</button><p class="player-world-form-status" data-world-form-status aria-live="polite">${residency.pendingCountryId ? `Pending: ${escapeHtml(title(residency.pendingCountryId))}` : ""}</p></form></section>`;
}

export function renderWorldPage(model, view = {}) {
  const state = view.state || "ready";
  if (state === "loading") return `<section class="player-terminal-page player-world-page" aria-busy="true"><div class="player-world-loading" role="status" aria-live="polite"><strong>Loading World runtime</strong><span></span><span></span><span></span></div></section>`;
  if (state === "unavailable") return `<section class="player-terminal-page player-world-page"><div class="player-world-error" role="alert"><small>WORLD UNAVAILABLE</small><h1>World and travel could not be loaded</h1><p>${escapeHtml(view.message || "The World service did not return a usable response.")}</p><button class="player-terminal-primary-button" type="button" data-world-action="retry">Retry World</button></div></section>`;
  const runtime = model || { campaign: null, arrival: {}, travel: {}, residency: null, world: null };
  return `<section class="player-terminal-page player-world-page" aria-labelledby="world-page-title"><header class="player-world-hero"><div><small>ECONOVARIA WORLD</small><h1 id="world-page-title">Campaign, geography, and travel</h1><p>Review current conditions before making a committed movement or residency request.</p></div><div>${view.offline ? statusPill("Offline · cached view", "bad") : view.stale ? statusPill("Stale · refresh advised", "warn") : statusPill("Live runtime", "good")}<button type="button" class="player-world-refresh" data-world-action="refresh">Refresh</button></div></header><div class="player-world-layout">${renderCampaign(runtime.campaign)}${renderArrival(runtime.arrival, view.capabilities)}${renderLocationAndRoutes(runtime, view.quote, view.capabilities)}${renderResidency(runtime.residency, view.capabilities)}</div><p class="player-world-page-status" role="status" aria-live="polite">${escapeHtml(view.message || "")}</p></section>`;
}
