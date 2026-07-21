import { createProgressionReviewClient } from "./progression-review-client.js";

const ROOT_ID = "adminProgressionReviewRoot";
const MOUNTED_EVENT = "econovaria:admin-route-mounted";
let currentGameId = "";
let client = null;
let state = { loading: false, error: "", players: [] };
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function gameIdFromPage() {
  const preview = document.getElementById("adminPreview");
  for (const value of [
    preview?.dataset?.gameId,
    document.documentElement.dataset.gameId,
    document.body.dataset.gameId,
    window.__ADMIN_ACTIVE_GAME_ID__,
    window.adminRuntime?.activeGame?.id,
    window.__ADMIN_BOOTSTRAP__?.activeGame?.id,
    window.sessionStorage?.getItem?.("econovaria.admin.selected-game.v1")
  ]) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}
function findPlayersSection() {
  return [...document.querySelectorAll("#adminPreview section")].find((section) => /^(players|player management)$/i.test(section.querySelector("h1,h2,h3,[data-page-title]")?.textContent?.trim() || "")) || null;
}
function reputationText(player) {
  return Object.entries(player.reputation || {}).map(([key, value]) => `${key}: ${Number(value) > 0 ? "+" : ""}${Number(value)}`).join(" · ");
}
function playerCard(player) {
  return `<article class="admin-progression-player" data-player-id="${escapeHtml(player.playerId)}">
    <header><div><small>${escapeHtml(player.playerId)}</small><h4>${escapeHtml(player.displayName)}</h4><p>${escapeHtml(player.rosterLabel || "No roster label")}</p></div><span>Level ${escapeHtml(player.level)}</span></header>
    <dl><div><dt>XP</dt><dd>${escapeHtml(player.experience)}</dd></div><div><dt>Skills</dt><dd>${escapeHtml(player.skillCount)}</dd></div><div><dt>Achievements</dt><dd>${escapeHtml(player.achievementCount)}</dd></div><div><dt>Available points</dt><dd>${escapeHtml(player.availableSkillPoints)}</dd></div></dl>
    <p>${escapeHtml(reputationText(player) || "No reputation values yet")}</p>
    <form data-progression-correction>
      <input type="hidden" name="playerId" value="${escapeHtml(player.playerId)}">
      <label><span>Correction</span><select name="correctionType"><option value="experience">Experience</option><option value="reputation">Reputation</option></select></label>
      <label><span>Amount</span><input name="amount" type="number" min="-5000" max="5000" step="1" required></label>
      <label data-reputation-type hidden><span>Reputation type</span><select name="reputationType"><option value="country">Country</option><option value="career">Career</option><option value="story">Story</option><option value="relationship">Relationship</option></select></label>
      <label data-reputation-scope hidden><span>Scope</span><input name="reputationScope" maxlength="80" value="general"></label>
      <label class="admin-progression-wide"><span>Reason</span><input name="reason" minlength="3" maxlength="1000" required></label>
      <button type="submit">Apply audited correction</button>
    </form>
  </article>`;
}
function render(root) {
  root.innerHTML = `<section class="admin-progression-panel" aria-labelledby="adminProgressionTitle">
    <header><div><small>PLAYER DEVELOPMENT</small><h3 id="adminProgressionTitle">Progression review</h3><p>Review bounded progression and apply explicit, immutable corrections.</p></div><button type="button" data-progression-refresh ${state.loading ? "disabled" : ""}>${state.loading ? "Refreshing…" : "Refresh"}</button></header>
    ${state.error ? `<p class="admin-progression-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
    <div class="admin-progression-grid" aria-live="polite">${state.loading && !state.players.length ? "<p>Loading Progression…</p>" : state.players.map(playerCard).join("") || "<p>No active Players are available.</p>"}</div>
  </section>`;
}
async function load(root) {
  if (!client || state.loading) return;
  state = { ...state, loading: true, error: "" };
  render(root);
  try {
    const result = await client.list();
    state = { loading: false, error: "", players: Array.isArray(result?.players) ? result.players : [] };
  } catch (error) {
    state = { ...state, loading: false, error: `${error.message || "Progression could not be loaded."}${error.retryAfterSeconds ? ` Retry in ${error.retryAfterSeconds} seconds.` : ""}` };
  }
  render(root);
}
async function submit(root, form) {
  if (!client || state.loading || !form.reportValidity()) return;
  const data = new FormData(form);
  const correctionType = String(data.get("correctionType") || "experience");
  state = { ...state, loading: true, error: "" };
  render(root);
  try {
    await client.correct(String(data.get("playerId") || ""), {
      correctionType,
      amount: Number(data.get("amount")),
      reputationType: correctionType === "reputation" ? String(data.get("reputationType") || "") : null,
      reputationScope: correctionType === "reputation" ? String(data.get("reputationScope") || "") : null,
      reason: String(data.get("reason") || "").trim()
    });
    state = { ...state, loading: false };
    await load(root);
  } catch (error) {
    state = { ...state, loading: false, error: error.message || "Correction failed." };
    render(root);
  }
}
function wire(root) {
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-progression-refresh]")) void load(root);
  });
  root.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-progression-correction]");
    if (!form) return;
    event.preventDefault();
    void submit(root, form);
  });
  root.addEventListener("change", (event) => {
    if (event.target.name !== "correctionType") return;
    const form = event.target.closest("form");
    const reputation = event.target.value === "reputation";
    form.querySelector("[data-reputation-type]").hidden = !reputation;
    form.querySelector("[data-reputation-scope]").hidden = !reputation;
  });
}
function mount() {
  const gameId = gameIdFromPage();
  const section = findPlayersSection();
  if (!gameId || !section) return false;
  let root = document.getElementById(ROOT_ID);
  if (!root || !section.contains(root)) {
    root?.remove();
    root = document.createElement("div");
    root.id = ROOT_ID;
    section.append(root);
    wire(root);
  }
  if (gameId !== currentGameId) {
    currentGameId = gameId;
    client = createProgressionReviewClient(gameId);
    state = { loading: false, error: "", players: [] };
  }
  render(root);
  if (!state.players.length && !state.loading) void load(root);
  return true;
}
function mounted(event) {
  if (event.target === document.getElementById("adminPreview")) mount();
}
document.addEventListener(MOUNTED_EVENT, mounted);
window.addEventListener("admin:game-changed", mount);
window.addEventListener("hashchange", mount);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
