import { AdminDataTable, AdminEmptyState, AdminErrorState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function numberText(value) {
  return Number.isSafeInteger(value) ? value.toLocaleString("en-US") : "Not available";
}
function signedNumber(value) {
  if (!Number.isSafeInteger(value)) return "Not available";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US")}`;
}
function dateText(value) {
  const milliseconds = Date.parse(String(value || ""));
  if (!Number.isFinite(milliseconds)) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(milliseconds));
}
function reputationText(reputation) {
  const entries = Object.entries(reputation || {});
  return entries.length ? entries.map(([key, value]) => `${key}: ${signedNumber(value)}`).join(" · ") : "No reputation values";
}
function playerCell(player) {
  return createElement("div", {
    className: "progression-v2-player-cell",
    children: [
      createElement("strong", { text: player.displayName }),
      createElement("span", { text: player.playerId }),
      player.rosterLabel ? createElement("span", { className: "admin-u-muted", text: player.rosterLabel }) : null,
    ],
  });
}
function correctionTypeCell(correction) {
  const label = correction.correctionType === "reputation"
    ? `Reputation · ${correction.reputationType || "type unavailable"}`
    : "Experience";
  return createElement("div", {
    className: "progression-v2-change",
    children: [
      createElement("strong", { text: label }),
      createElement("span", { text: signedNumber(correction.amount) }),
      correction.reputationScope ? createElement("span", { className: "admin-u-muted", text: `Scope: ${correction.reputationScope}` }) : null,
    ],
  });
}
function matchQuery(value, query) {
  return !query || String(value || "").toLocaleLowerCase().includes(query);
}
export function filterProgressionPlayers(players, filters) {
  const query = String(filters.query || "").trim().toLocaleLowerCase();
  return players.filter((player) => matchQuery(player.displayName, query) || matchQuery(player.playerId, query) || matchQuery(player.rosterLabel, query));
}
export function filterProgressionCorrections(corrections, filters) {
  const query = String(filters.query || "").trim().toLocaleLowerCase();
  return corrections.filter((correction) => {
    if (filters.correctionType !== "all" && correction.correctionType !== filters.correctionType) return false;
    return matchQuery(correction.displayName, query)
      || matchQuery(correction.playerId, query)
      || matchQuery(correction.reason, query)
      || matchQuery(correction.reputationScope, query);
  });
}
function panelWarning(title, error) {
  return error ? AdminErrorState({
    title,
    message: error.userMessage,
    requestId: error.requestId,
    retryAfterSeconds: error.retryAfterSeconds,
    compact: true,
  }) : null;
}

export function ProgressionPlayerPanel({ players, totalCount, selectedPlayerId, onSelectPlayer, error }) {
  const table = AdminDataTable({
    caption: "Player progression records",
    rows: players,
    rowKey: (player) => player.rowKey,
    emptyState: AdminEmptyState({
      title: totalCount ? "No matching players" : "No player progression records",
      message: totalCount ? "Try changing the current search." : "No authoritative player progression record is available for this game.",
      compact: true,
    }),
    columns: [
      { key: "player", label: "Player", rowHeader: true, render: (_value, player) => playerCell(player) },
      { key: "level", label: "Level", align: "end", render: (_value, player) => numberText(player.level) },
      { key: "experience", label: "XP", align: "end", render: (_value, player) => numberText(player.experience) },
      { key: "reputation", label: "Reputation", render: (_value, player) => createElement("span", { className: "progression-v2-wrap", text: reputationText(player.reputation) }) },
      { key: "achievementCount", label: "Achievements", align: "end", render: (_value, player) => numberText(player.achievementCount) },
      { key: "skillCount", label: "Skills", align: "end", render: (_value, player) => numberText(player.skillCount) },
      { key: "availableSkillPoints", label: "Available points", align: "end", render: (_value, player) => numberText(player.availableSkillPoints) },
      { key: "action", label: "Review", render: (_value, player) => {
        const button = createElement("button", {
          className: "admin-button admin-button--quiet",
          attrs: { type: "button" },
          text: player.playerId === selectedPlayerId ? "Selected" : "Correct",
        });
        button.addEventListener("click", () => onSelectPlayer(player.playerId));
        return button;
      } },
    ],
  });
  return createElement("section", {
    className: "progression-v2-panel",
    attrs: { "aria-label": "Player progression records" },
    children: [
      createElement("div", { className: "progression-v2-panel__heading", children: [
        createElement("div", { children: [
          createElement("p", { className: "progression-v2-kicker", text: "CURRENT STATE" }),
          createElement("h2", { text: "Player progression" }),
        ] }),
        createElement("span", { className: "progression-v2-count", text: `${players.length} shown` }),
      ] }),
      panelWarning("Player progression is temporarily unavailable", error),
      table.element,
      createElement("p", { className: "progression-v2-panel__note", text: "Achievement detail is not exposed by the current Admin progression contract; only authoritative counts are shown." }),
    ],
  });
}

export function ProgressionHistoryPanel({ corrections, totalCount, error }) {
  const table = AdminDataTable({
    caption: "Audited progression correction history",
    rows: corrections,
    rowKey: (correction) => correction.rowKey,
    emptyState: AdminEmptyState({
      title: totalCount ? "No matching corrections" : "No correction history",
      message: totalCount ? "Try changing the current search or history filter." : "No audited progression corrections have been recorded for this game.",
      compact: true,
    }),
    columns: [
      { key: "player", label: "Player", rowHeader: true, render: (_value, correction) => playerCell(correction) },
      { key: "change", label: "Correction", render: (_value, correction) => correctionTypeCell(correction) },
      { key: "values", label: "Before → after", render: (_value, correction) => `${numberText(correction.beforeValue)} → ${numberText(correction.afterValue)}` },
      { key: "reason", label: "Reason", render: (_value, correction) => createElement("span", { className: "progression-v2-wrap", text: correction.reason || "Reason unavailable" }) },
      { key: "createdAt", label: "Recorded", render: (_value, correction) => dateText(correction.createdAt) },
    ],
  });
  return createElement("section", {
    className: "progression-v2-panel",
    attrs: { "aria-label": "Progression correction history" },
    children: [
      createElement("div", { className: "progression-v2-panel__heading", children: [
        createElement("div", { children: [
          createElement("p", { className: "progression-v2-kicker", text: "IMMUTABLE HISTORY" }),
          createElement("h2", { text: "Correction history" }),
        ] }),
        createElement("span", { className: "progression-v2-count", text: `${corrections.length} shown` }),
      ] }),
      panelWarning("Correction history is temporarily unavailable", error),
      table.element,
    ],
  });
}
