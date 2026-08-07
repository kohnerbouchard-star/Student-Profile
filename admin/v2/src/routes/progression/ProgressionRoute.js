import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageFrame,
  AdminSkeleton,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { ProgressionCorrectionEditor } from "./ProgressionCorrectionEditor.js";
import {
  filterProgressionCorrections,
  filterProgressionPlayers,
  ProgressionHistoryPanel,
  ProgressionPlayerPanel,
} from "./ProgressionTables.js";

function numberText(value) {
  return Number.isSafeInteger(value) ? value.toLocaleString("en-US") : "Not available";
}
function summaryCard(label, value, note) {
  return createElement("article", {
    className: "progression-v2-summary-card",
    children: [
      createElement("span", { className: "progression-v2-summary-card__label", text: label }),
      createElement("strong", { className: "progression-v2-summary-card__value", text: numberText(value) }),
      createElement("span", { className: "progression-v2-summary-card__note", text: note }),
    ],
  });
}
function loadingPage() {
  return AdminPageFrame({
    eyebrow: "ENGAGEMENT / AUTHORITATIVE REVIEW",
    title: "Progression",
    description: "Review player progression, reputation, achievement counts, and audited correction history.",
    actions: createElement("button", { className: "admin-button admin-button--quiet", attrs: { type: "button", disabled: true }, text: "Loading…" }),
    content: createElement("div", {
      className: "progression-v2-loading",
      children: [
        AdminSkeleton({ label: "Loading progression summary", count: 4, shape: "card" }),
        AdminSkeleton({ label: "Loading progression records", count: 7, shape: "row" }),
      ],
    }),
  });
}
function failedPage(state, onRefresh) {
  return AdminPageFrame({
    eyebrow: "ENGAGEMENT / AUTHORITATIVE REVIEW",
    title: "Progression",
    description: "Review player progression, reputation, achievement counts, and audited correction history.",
    content: AdminErrorState({
      title: "Progression could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: { label: "Retry", onClick: onRefresh },
    }),
  });
}
function emptyPage(onRefresh) {
  const refresh = createElement("button", { className: "admin-button admin-button--quiet", attrs: { type: "button" }, text: "Refresh" });
  refresh.addEventListener("click", onRefresh);
  return AdminPageFrame({
    eyebrow: "ENGAGEMENT / AUTHORITATIVE REVIEW",
    title: "Progression",
    description: "Review player progression, reputation, achievement counts, and audited correction history.",
    actions: refresh,
    content: AdminEmptyState({ title: "No progression records", message: "No player progression or correction history is available for this game yet." }),
  });
}
function filterBar(filters, onFiltersChange) {
  const search = createElement("input", {
    className: "progression-v2-control",
    attrs: { type: "search", value: filters.query, maxlength: "160", placeholder: "Search player, roster, reason…", "aria-label": "Search Progression records" },
  });
  const type = createElement("select", {
    className: "progression-v2-control",
    attrs: { "aria-label": "Filter correction history by type" },
    children: [
      createElement("option", { attrs: { value: "all" }, text: "All correction types" }),
      createElement("option", { attrs: { value: "experience" }, text: "Experience" }),
      createElement("option", { attrs: { value: "reputation" }, text: "Reputation" }),
    ],
  });
  type.value = filters.correctionType;
  const apply = () => onFiltersChange({ query: search.value, correctionType: type.value });
  search.addEventListener("input", apply);
  type.addEventListener("change", apply);
  return createElement("div", {
    className: "progression-v2-filters",
    children: [
      createElement("label", { className: "progression-v2-filter", children: [createElement("span", { text: "Search" }), search] }),
      createElement("label", { className: "progression-v2-filter", children: [createElement("span", { text: "History type" }), type] }),
    ],
  });
}

function mainContent({ state, filters, selectedPlayerId, onFiltersChange, onRefresh, onSelectPlayer, onCorrect }) {
  const model = state.data;
  const root = createElement("div", { className: "progression-v2-route" });
  const body = createElement("div", { className: "progression-v2-content" });
  const refresh = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled: state.status === ADMIN_DATA_STATES.REFRESHING },
    text: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
  });
  refresh.addEventListener("click", onRefresh);
  const page = AdminPageFrame({
    eyebrow: "ENGAGEMENT / AUTHORITATIVE REVIEW",
    title: "Progression",
    description: "Review bounded player progression and reputation, achievement counts, and immutable correction history.",
    actions: refresh,
    content: body,
  });
  const summaries = createElement("section", {
    className: "progression-v2-summary",
    attrs: { "aria-label": "Progression summary" },
    children: [
      summaryCard("Players", model.summary.playerCount, "authoritative records"),
      summaryCard("Highest level", model.summary.highestLevel, "current review set"),
      summaryCard("Achievements", model.summary.totalAchievements, "count only"),
      summaryCard("Corrections", model.summary.correctionCount, "history records"),
    ],
  });

  const dynamic = createElement("div");
  let viewFilters = { ...filters };
  const renderDynamic = () => {
    dynamic._destroyEditor?.();
    dynamic._destroyEditor = null;
    const players = filterProgressionPlayers(model.players, viewFilters);
    const corrections = filterProgressionCorrections(model.corrections, viewFilters);
    const selectedPlayer = model.players.find((player) => player.playerId === selectedPlayerId) || null;
    const playerPanel = ProgressionPlayerPanel({
      players,
      totalCount: model.players.length,
      selectedPlayerId,
      onSelectPlayer,
      error: model.panels.players.error,
    });
    const editor = ProgressionCorrectionEditor({ selectedPlayer, onCorrect });
    const historyPanel = ProgressionHistoryPanel({ corrections, totalCount: model.corrections.length, error: model.panels.corrections.error });
    dynamic.replaceChildren(
      createElement("div", { className: "progression-v2-grid", children: [playerPanel, editor.element] }),
      historyPanel,
    );
    dynamic._destroyEditor = editor.destroy;
  };
  const filtersElement = filterBar(viewFilters, (nextFilters) => {
    viewFilters = { ...viewFilters, ...nextFilters };
    onFiltersChange(viewFilters);
    renderDynamic();
  });
  renderDynamic();
  body.append(summaries, filtersElement, dynamic);
  root.append(page.element);
  const wrapped = state.status === ADMIN_DATA_STATES.STALE
    ? AdminStaleState({
      message: "Showing the last resolved progression data. Refresh before relying on a correction decision.",
      retry: { label: "Refresh", onClick: onRefresh },
      content: root,
    })
    : root;
  return { element: wrapped, destroy() { dynamic._destroyEditor?.(); } };
}

/** Source-owned Admin v2 Progression route. */
export function ProgressionRoute(options = {}) {
  const { state, onRefresh = () => {} } = options;
  if (!state?.hasResolved && state?.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    const page = loadingPage();
    return { element: page.element, destroy() {} };
  }
  if (!state?.hasResolved && state?.status === ADMIN_DATA_STATES.FAILED) {
    const page = failedPage(state, onRefresh);
    return { element: page.element, destroy() {} };
  }
  if (state?.status === ADMIN_DATA_STATES.EMPTY) {
    const page = emptyPage(onRefresh);
    return { element: page.element, destroy() {} };
  }
  return mainContent(options);
}
